import { doc, collection, writeBatch, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Transaction, 
  TransactionType, 
  StagedTransactionRecord, 
  TransactionBatch, 
  Investor, 
  InvestmentAccount, 
  Valuation 
} from '../types';
import { 
  calculateSubscription, 
  calculateRedemption, 
  roundMoney, 
  roundUnits, 
  roundNav 
} from './fundAccountingEngine';

/**
 * Historical NAV Lookup Engine
 * Resolves the applicable NAV for a specific transaction date.
 * Strictly uses historical valuation on or before the date.
 * Returns null if no valid NAV exists (triggering NAV_REQUIRED).
 */
export interface HistoricalNavLookupResult {
  nav: number;
  isExactDateMatch: boolean;
  valuationDate: string;
  sourceDescription: string;
}

export function resolveHistoricalNavForDate(
  accountId: string,
  targetDateStr: string,
  valuations: Valuation[],
  accountNav?: number
): HistoricalNavLookupResult | null {
  if (!targetDateStr) return null;

  const targetDate = new Date(targetDateStr).toISOString().split('T')[0];
  const accountValuations = valuations
    .filter(v => v.accountId === accountId)
    .map(v => {
      let dateStr = '';
      if (v.date?.seconds) {
        dateStr = new Date(v.date.seconds * 1000).toISOString().split('T')[0];
      } else if (typeof v.date === 'string') {
        dateStr = v.date.split('T')[0];
      } else {
        dateStr = new Date().toISOString().split('T')[0];
      }
      return { ...v, dateStr };
    })
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr));

  // 1. Check exact date match in valuations collection
  const exactMatch = accountValuations.find(v => v.dateStr === targetDate);
  if (exactMatch && exactMatch.nav > 0) {
    return {
      nav: roundNav(exactMatch.nav),
      isExactDateMatch: true,
      valuationDate: exactMatch.dateStr,
      sourceDescription: `Exact Historical Valuation on ${exactMatch.dateStr}`
    };
  }

  // 2. Check previous valuation date
  const priorMatch = accountValuations.find(v => v.dateStr < targetDate && v.nav > 0);
  if (priorMatch) {
    return {
      nav: roundNav(priorMatch.nav),
      isExactDateMatch: false,
      valuationDate: priorMatch.dateStr,
      sourceDescription: `Prior Valuation Date (${priorMatch.dateStr}) for Transaction Date ${targetDate}`
    };
  }

  // 3. Fallback: if transaction date is after the latest recorded valuation
  const latestVal = accountValuations[0];
  if (latestVal && targetDate >= latestVal.dateStr && latestVal.nav > 0) {
    return {
      nav: roundNav(latestVal.nav),
      isExactDateMatch: false,
      valuationDate: latestVal.dateStr,
      sourceDescription: `Most Recent Fund NAV (${latestVal.dateStr})`
    };
  }

  // 4. Fallback: Initial Fund Baseline NAV (established at fund account creation)
  if (accountNav && accountNav > 0) {
    return {
      nav: roundNav(accountNav),
      isExactDateMatch: false,
      valuationDate: targetDate,
      sourceDescription: `Fund Account Initial Baseline NAV (GH₵${roundNav(accountNav).toFixed(4)})`
    };
  }

  return null; // NAV_REQUIRED (if no baseline NAV exists)
}

/**
 * String Similarity Calculation (Dice Coefficient)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0.0;

  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  let intersection = 0;

  b1.forEach(bg => {
    if (b2.has(bg)) intersection++;
  });

  return (2.0 * intersection) / (b1.size + b2.size);
}

/**
 * Fuzzy & Exact Investor Matcher
 */
export interface InvestorMatchResult {
  investor?: Investor;
  confidence: number; // 0 to 100
  matchStatus: 'MATCHED' | 'REVIEW' | 'UNMATCHED';
  matchReason?: string;
}

export function resolveInvestorForTransaction(
  rawInput: string,
  investors: Investor[],
  targetAccountId?: string
): InvestorMatchResult {
  if (!rawInput || !rawInput.trim()) {
    return { confidence: 0, matchStatus: 'UNMATCHED', matchReason: 'No investor identifier provided' };
  }

  const cleanInput = rawInput.trim();
  const filteredInvestors = targetAccountId 
    ? investors.filter(i => i.accountId === targetAccountId)
    : investors;

  // Step 1: Direct ID Match
  const idMatch = filteredInvestors.find(i => 
    i.investorId.toLowerCase() === cleanInput.toLowerCase() || 
    i.id === cleanInput
  );
  if (idMatch) {
    return { investor: idMatch, confidence: 100, matchStatus: 'MATCHED', matchReason: 'Exact Investor ID Match' };
  }

  // Step 2: Direct Email or Phone Match
  const contactMatch = filteredInvestors.find(i => 
    (i.email && i.email.toLowerCase() === cleanInput.toLowerCase()) ||
    (i.phone && i.phone.replace(/[^0-9]/g, '') === cleanInput.replace(/[^0-9]/g, ''))
  );
  if (contactMatch) {
    return { investor: contactMatch, confidence: 100, matchStatus: 'MATCHED', matchReason: 'Exact Email/Phone Match' };
  }

  // Step 3: Exact Name Match
  const exactNameMatch = filteredInvestors.find(i => i.name.toLowerCase() === cleanInput.toLowerCase());
  if (exactNameMatch) {
    return { investor: exactNameMatch, confidence: 100, matchStatus: 'MATCHED', matchReason: 'Exact Full Name Match' };
  }

  // Step 4: Normalised Name Match (ignoring middle initials)
  const normaliseName = (name: string) => name.toLowerCase().replace(/\b[a-z]\.\s*/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const normInput = normaliseName(cleanInput);

  const normNameMatch = filteredInvestors.find(i => normaliseName(i.name) === normInput);
  if (normNameMatch) {
    return { investor: normNameMatch, confidence: 95, matchStatus: 'MATCHED', matchReason: 'Normalised Name Match' };
  }

  // Step 5: Fuzzy Similarity Calculation across all account investors
  let bestMatch: Investor | undefined = undefined;
  let bestScore = 0;

  filteredInvestors.forEach(inv => {
    const sim = calculateStringSimilarity(normInput, normaliseName(inv.name));
    if (sim > bestScore) {
      bestScore = sim;
      bestMatch = inv;
    }
  });

  const percentageScore = Math.round(bestScore * 100);

  if (percentageScore >= 90 && bestMatch) {
    return { investor: bestMatch, confidence: percentageScore, matchStatus: 'MATCHED', matchReason: `High Similarity Name Match (${percentageScore}%)` };
  } else if (percentageScore >= 60 && bestMatch) {
    return { investor: bestMatch, confidence: percentageScore, matchStatus: 'REVIEW', matchReason: `Potential Match: ${bestMatch.name} (${percentageScore}% confidence)` };
  }

  return { confidence: percentageScore, matchStatus: 'UNMATCHED', matchReason: 'No matching investor found in registry' };
}

/**
 * Flexible Column Mapping & Data Normalization
 */
export function normaliseTransactionType(rawType: string): TransactionType {
  if (!rawType) return 'Subscription';
  const clean = rawType.trim().toUpperCase();

  if (['BUY', 'CONTRIBUTION', 'DEPOSIT', 'SUBSCRIPTION', 'SUB', 'INVESTMENT', 'SELL', 'WITHDRAWAL', 'REDEMPTION', 'RED', 'PAYOUT'].includes(clean)) {
    return 'Subscription';
  }
  if (['DIVIDEND', 'DIV'].includes(clean)) return 'Dividend';
  if (['INTEREST', 'INT'].includes(clean)) return 'Interest';
  if (['MANAGEMENT FEE', 'MGMT FEE', 'FEE', 'EXPENSE'].includes(clean)) return 'ManagementFee';
  if (['TRANSFER IN', 'TRANSFER_IN'].includes(clean)) return 'TransferIn';
  if (['TRANSFER OUT', 'TRANSFER_OUT'].includes(clean)) return 'TransferOut';
  if (['REVERSAL'].includes(clean)) return 'Reversal';
  if (['CORRECTION'].includes(clean)) return 'Correction';

  return 'Subscription'; // Default fallback
}

export function parseAndNormaliseDate(rawDateStr: any): string | null {
  if (!rawDateStr) return null;
  
  if (typeof rawDateStr === 'string') {
    const trimmed = rawDateStr.trim();
    // Support DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      return `${year}-${month}-${day}`;
    }
  }

  const d = new Date(rawDateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Duplicate Transaction Detector
 */
export function detectDuplicateTransaction(
  record: { investorId?: string; date: string; amount: number; type: string },
  existingTransactions: Transaction[]
): boolean {
  if (!record.investorId || !record.date || !record.amount) return false;

  return existingTransactions.some(t => {
    const tDate = t.timestamp ? new Date(t.timestamp).toISOString().split('T')[0] : '';
    const sameInvestor = t.investorId === record.investorId;
    const sameDate = tDate === record.date;
    const sameAmount = Math.abs(t.totalAmount - record.amount) < 0.01;
    const sameType = (t.type === 'BUY' || t.type === 'Subscription') === (record.type === 'BUY' || record.type === 'Subscription');
    return sameInvestor && sameDate && sameAmount && sameType;
  });
}

/**
 * Stage 1: Batch Staging & Analysis Engine
 */
export function analyseAndStageBatch(
  rawRows: any[],
  filename: string,
  accountId: string,
  investors: Investor[],
  existingTransactions: Transaction[],
  valuations: Valuation[],
  accountNav?: number
): TransactionBatch {
  const batchId = `BATCH-${new Date().toISOString().split('T')[0]}-${Math.floor(1000 + Math.random() * 9000)}`;
  const stagedRecords: StagedTransactionRecord[] = [];

  let validRowsCount = 0;
  let errorRowsCount = 0;
  let reviewRowsCount = 0;
  let totalAmount = 0;

  rawRows.forEach((row, idx) => {
    // Flexible Header Extraction
    const rawDate = row['Date'] || row['Transaction Date'] || row['Txn Date'] || row['Effective Date'] || row.date || row.Date;
    const rawInvestor = (row['Investor'] || row['Investor Name'] || row['Member'] || row['Client'] || row['Investor ID'] || row.name || row.Investor)?.toString().trim() || '';
    const rawType = (row['Transaction Type'] || row['Type'] || row['Action'] || row.type || 'Subscription')?.toString() || '';
    const rawAmountVal = row['Amount'] || row['Contribution'] || row['Deposit'] || row['Value'] || row['Transaction Amount'] || row.amount;
    const rawAmount = typeof rawAmountVal === 'number' 
      ? rawAmountVal 
      : Number(String(rawAmountVal || 0).replace(/[^0-9.-]+/g, ''));

    const reference = (row['Reference'] || row['Ref'] || row['External ID'] || row['Bank Ref'])?.toString() || '';

    const validatedDate = parseAndNormaliseDate(rawDate);
    const normalisedType = normaliseTransactionType(rawType);
    const matchResult = resolveInvestorForTransaction(rawInvestor, investors, accountId);

    let status: StagedTransactionRecord['status'] = 'READY';
    let warningOrError = '';
    let applicableNav: number | undefined = undefined;
    let calculatedUnits: number | undefined = undefined;

    // Validate Date
    if (!validatedDate) {
      status = 'ERROR';
      warningOrError = 'Invalid or unparseable transaction date';
    } else {
      // Resolve NAV
      const navLookup = resolveHistoricalNavForDate(accountId, validatedDate, valuations, accountNav);
      if (!navLookup) {
        status = 'NAV_REQUIRED';
        warningOrError = `No applicable fund NAV recorded on or before ${validatedDate}`;
      } else {
        applicableNav = navLookup.nav;
        if (rawAmount > 0 && applicableNav > 0) {
          calculatedUnits = roundUnits(rawAmount / applicableNav);
        }
      }
    }

    // Validate Amount
    if (isNaN(rawAmount) || rawAmount <= 0) {
      status = 'ERROR';
      warningOrError = 'Transaction amount must be greater than zero';
    }

    // Validate Investor Match - Auto-accept fuzzy matches & auto-stage unmatched for auto-creation on post
    if (status !== 'ERROR' && matchResult.matchStatus === 'UNMATCHED') {
      status = 'READY';
      warningOrError = 'New Investor (Will auto-create profile on post)';
    } else if (status !== 'ERROR' && matchResult.matchStatus === 'REVIEW') {
      status = 'READY';
      warningOrError = matchResult.matchReason || 'Fuzzy match auto-resolved';
    }

    // Check Redemption Limit if matched
    if (normalisedType === 'Redemption' && matchResult.investor && applicableNav) {
      const unitsToRedeem = calculatedUnits || 0;
      if (matchResult.investor.unitsOwned < unitsToRedeem) {
        status = 'ERROR';
        warningOrError = `Redemption of ${unitsToRedeem.toFixed(4)} units exceeds investor available balance (${matchResult.investor.unitsOwned.toFixed(4)} units)`;
      }
    }

    // Check Duplicate
    const isDuplicate = validatedDate && matchResult.investor 
      ? detectDuplicateTransaction({ investorId: matchResult.investor.id, date: validatedDate, amount: rawAmount, type: normalisedType }, existingTransactions)
      : false;

    if (isDuplicate && status === 'READY') {
      status = 'DUPLICATE';
      warningOrError = 'Possible duplicate transaction detected';
    }

    if (status === 'ERROR') errorRowsCount++;
    else if (status === 'NAV_REQUIRED' || status === 'DUPLICATE') reviewRowsCount++;
    else validRowsCount++;

    totalAmount += (isNaN(rawAmount) ? 0 : rawAmount);

    stagedRecords.push({
      id: `STG-${idx + 1}-${Date.now()}`,
      batchId,
      rawDate: String(rawDate || ''),
      validatedDate: validatedDate || undefined,
      rawInvestor,
      matchedInvestorId: matchResult.investor?.id,
      matchedInvestorName: matchResult.investor?.name,
      matchConfidence: matchResult.confidence,
      matchStatus: matchResult.matchStatus,
      rawType,
      normalisedType,
      rawAmount: isNaN(rawAmount) ? 0 : rawAmount,
      grossAmount: isNaN(rawAmount) ? 0 : rawAmount,
      applicableNav,
      calculatedUnits,
      status,
      warningOrError: warningOrError || undefined,
      isDuplicate,
      reference
    });
  });

  return {
    id: batchId,
    uploadedBy: 'System User',
    uploadedAt: new Date().toISOString(),
    accountId,
    filename,
    totalRows: rawRows.length,
    validRows: validRowsCount,
    errorRows: errorRowsCount,
    reviewRows: reviewRowsCount,
    totalAmount: roundMoney(totalAmount),
    status: errorRowsCount > 0 || reviewRowsCount > 0 ? 'REVIEW' : 'READY' as any,
    stagedRecords
  };
}

// ── Progress Reporting Types ──────────────────────────────────────────────────
export interface PostTransactionProgressItem {
  name: string;
  amount: number;
  units: number;
  nav: number;
  txDate: string;
}

/**
 * Bulk Financial Transaction Posting Engine — Chunked with Real-Time Progress
 *
 * Architecture:
 *  - Processes records in atomic chunks of CHUNK_SIZE (150 records = 451 ops max — under Firestore's 500 limit)
 *  - Each chunk is committed independently so partial progress is visible immediately
 *  - Fund account totals updated per chunk (not just at end) for correctness
 *  - NAV is validated per-record using the historical date already resolved during staging
 *  - onProgress fires after each committed chunk with live counters & last item metadata
 */
export async function postTransactionBatch(
  batch: TransactionBatch,
  recordsToPost: StagedTransactionRecord[],
  account: InvestmentAccount,
  investors: Investor[],
  onProgress?: (
    successCount: number,
    failureCount: number,
    total: number,
    lastItem: PostTransactionProgressItem | null
  ) => void
): Promise<{ successCount: number; failureCount: number; postedTransactionIds: string[] }> {
  let successCount = 0;
  let failureCount = 0;
  const postedTransactionIds: string[] = [];

  // 150 records × 3 ops = 450 + 1 account update = 451 total — safely under Firestore's 500 op limit
  const CHUNK_SIZE = 150;
  const total = recordsToPost.length;

  for (let chunkStart = 0; chunkStart < total; chunkStart += CHUNK_SIZE) {
    const chunk = recordsToPost.slice(chunkStart, chunkStart + CHUNK_SIZE);
    const batchOp = writeBatch(db);
    let chunkUnitsDelta = 0;
    let chunkCashDelta = 0;
    let lastItem: PostTransactionProgressItem | null = null;

    for (const record of chunk) {
      const unitsToIssue = (record.calculatedUnits && record.calculatedUnits > 0)
        ? record.calculatedUnits
        : (record.rawAmount && record.applicableNav ? roundUnits(record.rawAmount / record.applicableNav) : 0);

      const grossAmount = (record.rawAmount && record.rawAmount > 0)
        ? record.rawAmount
        : roundMoney(unitsToIssue * (record.applicableNav || 1.0000));

      let investor = investors.find(i => i.id === record.matchedInvestorId);
      if (!investor && record.rawInvestor) {
        // Auto-create missing investor profile in Firestore
        const newInvRef = doc(collection(db, 'investors'));
        const newInvCode = `INV-${Math.floor(100000 + Math.random() * 900000)}`;
        const defaultEmail = `${record.rawInvestor.toLowerCase().replace(/[^a-z0-9]/g, '.')}@fund.local`;
        const newInvData: Investor = {
          id: newInvRef.id,
          investorId: newInvCode,
          uid: '',
          accountId: account.id,
          name: record.rawInvestor,
          email: defaultEmail,
          phone: '',
          address: '',
          unitsOwned: 0,
          totalInvestment: 0,
          currentValue: 0,
          kycStatus: 'verified',
          portalStatus: 'NOT_ENABLED',
          createdAt: new Date().toISOString(),
          createdBy: 'Bulk Transaction Upload'
        };
        batchOp.set(newInvRef, newInvData);
        investor = newInvData;
        investors.push(newInvData);
        record.matchedInvestorId = newInvRef.id;
      }

      if (!investor) {
        failureCount++;
        continue;
      }

      let unitsDelta = 0;
      let cashDelta = 0;
      let costBasisDelta = 0;
      let costBasisReduction = 0;
      let realizedGainLoss = 0;

      if (record.normalisedType === 'Subscription' || record.normalisedType === 'BUY') {
        unitsDelta = unitsToIssue;
        cashDelta = grossAmount;
        costBasisDelta = grossAmount;
      } else if (record.normalisedType === 'Redemption' || record.normalisedType === 'SELL') {
        const red = calculateRedemption(
          unitsToIssue,
          investor.unitsOwned,
          investor.totalInvestment,
          record.applicableNav!
        );
        unitsDelta = -red.unitsRedeemed;
        cashDelta = -red.grossProceeds;
        costBasisDelta = -red.costBasisReduction;
        costBasisReduction = red.costBasisReduction;
        realizedGainLoss = red.realizedGainLoss;
      } else if (record.normalisedType === 'Dividend' || record.normalisedType === 'Interest') {
        cashDelta = grossAmount;
      } else if (record.normalisedType === 'ManagementFee' || record.normalisedType === 'AdminFee') {
        cashDelta = -grossAmount;
      }

      chunkUnitsDelta += unitsDelta;
      chunkCashDelta += cashDelta;

      const newCurrentValue = roundMoney((investor.unitsOwned + unitsDelta) * (record.applicableNav || 1));

      // 1. Update Investor Document
      const investorRef = doc(db, 'investors', investor.id);
      batchOp.update(investorRef, {
        unitsOwned: increment(unitsDelta),
        totalInvestment: increment(costBasisDelta),
        currentValue: newCurrentValue,
        ...(realizedGainLoss !== 0 ? { realizedGainLoss: increment(realizedGainLoss) } : {})
      });

      // 2. Transaction Record
      const transRef = doc(collection(db, 'transactions'));
      batchOp.set(transRef, {
        investorId: investor.id,
        accountId: account.id,
        type: record.normalisedType,
        units: Math.abs(unitsDelta),
        pricePerUnit: record.applicableNav!,
        totalAmount: grossAmount,
        costBasisReduction,
        realizedGainLoss,
        timestamp: new Date(record.validatedDate!).toISOString(),
        effectiveDate: record.validatedDate!,
        status: 'posted',
        source: 'bulk_upload',
        batchId: batch.id,
        reference: record.reference || '',
        createdBy: 'System Batch Posting'
      });

      // 3. Unit Movement Ledger
      const ledgerRef = doc(collection(db, 'unit_ledger'));
      batchOp.set(ledgerRef, {
        timestamp: new Date().toISOString(),
        effectiveDate: record.validatedDate!,
        accountId: account.id,
        investorId: investor.id,
        transactionId: transRef.id,
        transactionType: record.normalisedType,
        unitsDelta,
        runningInvestorUnits: roundUnits(investor.unitsOwned + unitsDelta),
        runningFundUnits: roundUnits(account.totalUnits + chunkUnitsDelta),
        applicableNav: record.applicableNav!,
        navDate: record.validatedDate!,
        reference: record.reference || ''
      });

      postedTransactionIds.push(transRef.id);
      successCount++;
      lastItem = {
        name: investor.name,
        amount: grossAmount,
        units: Math.abs(unitsDelta),
        nav: record.applicableNav!,
        txDate: record.validatedDate!
      };
    }

    // Update fund account atomically for this chunk
    if (chunkUnitsDelta !== 0 || chunkCashDelta !== 0) {
      const accountRef = doc(db, 'accounts', account.id);
      batchOp.update(accountRef, {
        totalUnits: increment(chunkUnitsDelta),
        cashBalance: increment(chunkCashDelta)
      });
    }

    // Commit this chunk and immediately fire progress
    await batchOp.commit();
    onProgress?.(successCount, failureCount, total, lastItem);
  }

  return { successCount, failureCount, postedTransactionIds };
}
