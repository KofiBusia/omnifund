import { doc, collection, runTransaction, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Investor, 
  InvestmentAccount, 
  Valuation, 
  InvestorImportMode, 
  StagedInvestorRow, 
  StagedInvestorBatch,
  StagedTransactionRecord,
  TransactionBatch 
} from '../types';
import { 
  resolveHistoricalNavForDate, 
  resolveInvestorForTransaction, 
  parseAndNormaliseDate, 
  detectDuplicateTransaction,
  postTransactionBatch 
} from './transactionProcessingEngine';
import { roundMoney, roundUnits } from './fundAccountingEngine';
import { approveInvestorAndEnablePortal, resendPortalInvitation } from './investorProvisioningService';

/**
 * 1. CSV Template Downloads
 * Generates pure CSV data templates with standard headers and sample demonstration records.
 */
export function downloadInvestorCsvTemplate(mode: InvestorImportMode = 'MASTER_AND_INVESTMENT'): void {
  let headers: string[] = [];
  let sampleRows: string[][] = [];
  let filename = '';

  if (mode === 'MASTER_ONLY') {
    filename = 'OmniFund_Investor_Master_Template_v1.0.csv';
    headers = [
      'Investor ID',
      'Investor Type',
      'Full Name',
      'First Name',
      'Middle Name',
      'Last Name',
      'Email',
      'Phone',
      'Address',
      'Date of Birth',
      'ID Type',
      'ID Number',
      'KYC Status'
    ];
    sampleRows = [
      ['INV-000101', 'Individual', 'Kwame Mensah', 'Kwame', '', 'Mensah', 'kwame.mensah@example.com', '+233240001122', 'Accra Ghana', '1985-06-15', 'Ghana Card', 'GHA-123456789-0', 'verified'],
      ['INV-000102', 'Individual', 'Abena Osei', 'Abena', '', 'Osei', 'abena.osei@example.com', '+233200003344', 'Kumasi Ghana', '1990-11-20', 'Passport', 'G1234567', 'verified'],
      ['INV-000103', 'Corporate', 'Kofi Holdings Ltd', 'Kofi', '', 'Holdings', 'info@kofiholdings.com', '+233302005566', 'Airport City Accra', '', 'Business Reg', 'CS-98765432', 'verified']
    ];
  } else {
    filename = 'OmniFund_Investor_Financial_Template_v1.0.csv';
    headers = [
      'Full Name',
      'Email',
      'Date',
      'Amount',
      'Transaction Type',
      'Fund Ticker'
    ];
    sampleRows = [
      ['Kwame Mensah', 'kwame.mensah@example.com', '2026-04-24', '1000.00', 'Subscription', 'OGEF'],
      ['Abena Osei', 'abena.osei@example.com', '2026-04-24', '500.00', 'Subscription', 'OGEF'],
      ['Kofi Holdings Ltd', 'info@kofiholdings.com', '2026-04-24', '5000.00', 'Subscription', 'OGEF']
    ];
  }

  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 2. Flexible Header Extraction & Alias Normalisation
 */
export function extractRowField(row: Record<string, any>, aliases: string[]): string {
  if (!row || typeof row !== 'object') return '';

  const normalizedKeysMap = new Map<string, string>();
  for (const key of Object.keys(row)) {
    const cleanKey = key.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanKey && !normalizedKeysMap.has(cleanKey)) {
      normalizedKeysMap.set(cleanKey, key);
    }
  }

  for (const alias of aliases) {
    const cleanAlias = alias.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedKeysMap.has(cleanAlias)) {
      const originalKey = normalizedKeysMap.get(cleanAlias)!;
      const val = row[originalKey];
      if (val !== undefined && val !== null) {
        return String(val).trim();
      }
    }
  }
  return '';
}

/**
 * 3. Stage 1: File Analysis & Staging Engine
 */
export function analyseInvestorBulkCsv(
  rawRows: any[],
  filename: string,
  mode: InvestorImportMode,
  targetAccountId: string,
  existingInvestors: Investor[],
  accounts: InvestmentAccount[],
  valuations: Valuation[]
): StagedInvestorBatch {
  const batchId = `BATCH-INV-${new Date().toISOString().split('T')[0]}-${Math.floor(1000 + Math.random() * 9000)}`;
  const stagedRows: StagedInvestorRow[] = [];

  let validRowsCount = 0;
  let warningRowsCount = 0;
  let duplicateRowsCount = 0;
  let errorRowsCount = 0;
  let totalSubscriptionAmount = 0;
  let totalCalculatedUnits = 0;
  let hasDiscrepancies = false;

  const targetAccount = accounts.find(a => a.id === targetAccountId) || accounts[0];

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 1;

    // Master Field Extraction with Aliases
    const rawInvestorId = extractRowField(row, ['Investor ID', 'ID', 'Member ID', 'Client ID', 'Code']);
    const rawInvestorType = extractRowField(row, ['Investor Type', 'Type', 'Category']);
    const rawFullName = extractRowField(row, ['Full Name', 'Name', 'Investor Name', 'Member Name', 'Client Name']);
    const firstName = extractRowField(row, ['First Name', 'Given Name']);
    const lastName = extractRowField(row, ['Last Name', 'Surname']);
    const rawEmail = extractRowField(row, ['Email', 'Email Address', 'Contact Email', 'E-mail']);
    const phone = extractRowField(row, ['Phone', 'Mobile', 'Telephone', 'Contact Phone']);
    const address = extractRowField(row, ['Address', 'Location', 'Residence']);
    const dob = extractRowField(row, ['Date of Birth', 'DOB', 'Birth Date']);
    const idType = extractRowField(row, ['ID Type', 'Identification Type']);
    const idNumber = extractRowField(row, ['ID Number', 'Identification Number', 'Ghana Card']);
    const rawKyc = extractRowField(row, ['KYC Status', 'KYC', 'Status']).toLowerCase();

    const fullName = rawFullName || `${firstName} ${lastName}`.trim() || `Investor #${rowNumber}`;
    const email = rawEmail.toLowerCase();
    const kycStatus = (['verified', 'pending', 'rejected'].includes(rawKyc) ? rawKyc : 'verified') as 'verified' | 'pending' | 'rejected';

    // Investor Matching Hierarchy (ID -> Email -> Phone -> Name)
    let matchedInvestor: Investor | undefined = undefined;
    let matchConfidence = 0;
    let matchStatus: StagedInvestorRow['matchStatus'] = 'NEW';
    let matchReason = 'New Investor Profile to be Created';

    if (rawInvestorId) {
      const matchById = existingInvestors.find(i => i.investorId.toLowerCase() === rawInvestorId.toLowerCase());
      if (matchById) {
        matchedInvestor = matchById;
        matchConfidence = 100;
        matchStatus = 'EXISTING';
        matchReason = `Matched by Investor ID (${matchById.investorId})`;
      }
    }

    if (!matchedInvestor && email) {
      const matchByEmail = existingInvestors.find(i => i.email?.toLowerCase() === email);
      if (matchByEmail) {
        matchedInvestor = matchByEmail;
        matchConfidence = 100;
        matchStatus = 'EXISTING';
        matchReason = `Matched by Email (${matchByEmail.email})`;
      }
    }

    if (!matchedInvestor && phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 8) {
        const matchByPhone = existingInvestors.find(i => i.phone?.replace(/[^0-9]/g, '') === cleanPhone);
        if (matchByPhone) {
          matchedInvestor = matchByPhone;
          matchConfidence = 95;
          matchStatus = 'EXISTING';
          matchReason = `Matched by Phone Number (${matchByPhone.phone})`;
        }
      }
    }

    if (!matchedInvestor && fullName) {
      const resolveName = resolveInvestorForTransaction(fullName, existingInvestors, targetAccountId);
      if (resolveName.investor) {
        matchedInvestor = resolveName.investor;
        matchConfidence = resolveName.confidence;
        matchStatus = resolveName.matchStatus === 'MATCHED' ? 'EXISTING' : 'POSSIBLE_DUPLICATE';
        matchReason = resolveName.matchReason;
      }
    }

    let status: StagedInvestorRow['status'] = 'READY';
    let warningOrError = '';

    // Validate Required Master Data
    if (!fullName || fullName === `Investor #${rowNumber}`) {
      status = 'ERROR';
      warningOrError = 'Full Name is required';
    } else if (email && !email.includes('@')) {
      status = 'ERROR';
      warningOrError = 'Invalid email address format';
    }

    // Financial & Unit Processing (Extracted for both MASTER_ONLY and MASTER_AND_INVESTMENT modes)
    let fundTicker = extractRowField(row, ['Fund Ticker', 'Fund', 'Ticker', 'Fund Code', 'Code', 'Scheme']);
    let rowTargetAccount = targetAccount;
    if (fundTicker) {
      // Normalize ticker: strip underscores, spaces, dashes, lowercase for fuzzy matching
      const normTicker = fundTicker.toUpperCase().replace(/[_\s-]/g, '');
      const matchedAcc = accounts.find(a => {
        const normA = (a.ticker || '').toUpperCase().replace(/[_\s-]/g, '');
        const normCode = (a.code || '').toUpperCase().replace(/[_\s-]/g, '');
        const normName = (a.name || '').toUpperCase().replace(/[_\s-]/g, '');
        return normA === normTicker || normCode === normTicker || normName.includes(normTicker) || normTicker.includes(normA);
      });
      if (matchedAcc) {
        rowTargetAccount = matchedAcc;
      }
    }

    let accountType = extractRowField(row, ['Account Type', 'Share Class']) || 'Growth';
    const rawTxDate = extractRowField(row, ['Transaction Date', 'Date', 'Txn Date', 'Effective Date', 'Inception Date', 'Registration Date', 'Joining Date', 'Value Date']);
    const rawTxType = extractRowField(row, ['Transaction Type', 'Type', 'Action', 'Txn Type']);
    const rawAmountVal = extractRowField(row, ['Amount', 'Amount (GHS)', 'Contribution', 'Deposit', 'Subscription Amount', 'Investment Amount', 'Total Investment', 'Value', 'Market Value', 'Initial Capital', 'Capital', 'Balance (GHS)', 'Financial Balance']);
    const rawUnitsVal = extractRowField(row, ['Imported Units (Optional)', 'Imported Units', 'Units', 'Units Owned', 'Unit Balance', 'Total Units', 'Shares', 'Share Count', 'Initial Units', 'Holding Units', 'Units Held', 'Share Balance']);

    let transactionDate = parseAndNormaliseDate(rawTxDate) || new Date().toISOString().split('T')[0];
    let transactionType: StagedInvestorRow['transactionType'] = (rawTxType?.toLowerCase().includes('red') || rawTxType?.toLowerCase().includes('sell')) ? 'Redemption' : 'Subscription';
    
    let parsedAmount = Number(String(rawAmountVal || 0).replace(/[^0-9.-]+/g, ''));
    let parsedUnits = rawUnitsVal ? Number(String(rawUnitsVal).replace(/[^0-9.-]+/g, '')) : undefined;

    const accId = rowTargetAccount?.id || targetAccount?.id || 'acc1';
    const navLookup = resolveHistoricalNavForDate(accId, transactionDate, valuations, rowTargetAccount?.nav || targetAccount?.nav || 1.0000);
    let applicableNav: number | undefined = navLookup?.nav || rowTargetAccount?.nav || targetAccount?.nav || 1.0000;

    // Smart unit/amount inter-derivation
    if ((isNaN(parsedAmount) || parsedAmount <= 0) && parsedUnits !== undefined && !isNaN(parsedUnits) && parsedUnits > 0) {
      parsedAmount = roundMoney(parsedUnits * (applicableNav || 1.0000));
    }
    if ((parsedUnits === undefined || isNaN(parsedUnits) || parsedUnits <= 0) && parsedAmount > 0) {
      parsedUnits = roundUnits(parsedAmount / (applicableNav || 1.0000));
    }

    let amount = parsedAmount > 0 ? parsedAmount : 0;
    let importedUnits: number | undefined = (parsedUnits && parsedUnits > 0) ? parsedUnits : undefined;
    let calculatedUnits: number | undefined = (amount > 0 && applicableNav > 0) ? roundUnits(amount / applicableNav) : importedUnits;
    let currency = 'GHS';
    let unitDiscrepancyDelta = 0;
    let hasUnitDiscrepancy = false;

    if (mode === 'MASTER_AND_INVESTMENT' && status !== 'ERROR') {
      if (amount <= 0 && (!importedUnits || importedUnits <= 0)) {
        status = 'ERROR';
        warningOrError = 'Either investment amount or units owned must be provided as a positive number';
      } else {
        totalSubscriptionAmount += amount;
        totalCalculatedUnits += (calculatedUnits || importedUnits || 0);

        // Unit Discrepancy Inspection
        if (importedUnits !== undefined && calculatedUnits !== undefined && importedUnits > 0 && calculatedUnits > 0) {
          unitDiscrepancyDelta = Math.abs(importedUnits - calculatedUnits);
          if (unitDiscrepancyDelta > 0.0001) {
            hasUnitDiscrepancy = true;
            hasDiscrepancies = true;
            status = 'WARNING';
            warningOrError = `Unit Discrepancy: Imported (${importedUnits.toFixed(4)}) vs Calculated (${calculatedUnits.toFixed(4)}) at NAV GH₵${applicableNav.toFixed(4)}`;
          }
        }
      }
    }

    if (matchStatus === 'POSSIBLE_DUPLICATE' && status === 'READY') {
      status = 'WARNING';
      warningOrError = matchReason || 'Potential duplicate investor profile matched';
    }

    if (status === 'ERROR') errorRowsCount++;
    else if (status === 'WARNING' || (status as string) === 'NAV_REQUIRED') warningRowsCount++;
    else if ((status as string) === 'DUPLICATE') duplicateRowsCount++;
    else validRowsCount++;

    stagedRows.push({
      rowNumber,
      rawRecord: row,
      investorId: rawInvestorId || undefined,
      investorType: (rawInvestorType === 'Corporate' ? 'Corporate' : 'Individual') as any,
      fullName,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: email || undefined,
      phone: phone || undefined,
      address: address || undefined,
      dob: dob || undefined,
      idType: idType || undefined,
      idNumber: idNumber || undefined,
      kycStatus,
      matchedInvestorId: matchedInvestor?.id,
      matchedInvestorName: matchedInvestor?.name,
      matchConfidence,
      matchStatus,
      matchReason,
      fundTicker: fundTicker || rowTargetAccount?.ticker || targetAccount?.ticker,
      targetAccountId: rowTargetAccount?.id || targetAccount?.id,
      accountType,
      transactionDate: transactionDate || undefined,
      transactionType,
      amount: amount > 0 ? amount : undefined,
      currency,
      applicableNav,
      calculatedUnits,
      importedUnits,
      unitDiscrepancyDelta: hasUnitDiscrepancy ? unitDiscrepancyDelta : 0,
      hasUnitDiscrepancy,
      discrepancyAction: 'USE_CALCULATED',
      status,
      warningOrError: warningOrError || undefined
    });
  });

  return {
    batchId,
    filename,
    uploadedBy: 'Fund Administrator',
    uploadedAt: new Date().toISOString(),
    templateVersion: '1.0',
    importMode: mode,
    targetAccountId: targetAccount?.id,
    totalRows: rawRows.length,
    validRows: validRowsCount,
    warningRows: warningRowsCount,
    duplicateRows: duplicateRowsCount,
    errorRows: errorRowsCount,
    totalSubscriptionAmount: roundMoney(totalSubscriptionAmount),
    totalCalculatedUnits: roundUnits(totalCalculatedUnits),
    hasDiscrepancies,
    stagedRows
  };
}

/**
 * 4. Stage 2: Controlled Batch Commitment Engine
 * Handles BOTH new investor creation AND transactions for existing investors.
 * When an investor already exists, only the transaction/unit update is applied.
 */
export async function commitInvestorBulkBatch(
  batch: StagedInvestorBatch,
  rowsToCommit: StagedInvestorRow[],
  targetAccount: InvestmentAccount,
  existingInvestors: Investor[],
  enablePortalAccess: boolean = false
): Promise<{ 
  createdInvestorsCount: number; 
  postedTransactionsCount: number; 
  failedRowsCount: number; 
  postedTransactionIds: string[];
  portalInvitationsSent: number;
}> {
  let createdInvestorsCount = 0;
  let postedTransactionsCount = 0;
  let failedRowsCount = 0;
  let portalInvitationsSent = 0;
  const postedTransactionIds: string[] = [];

  // Map from rowNumber -> the resolved Investor object (either new or existing)
  const resolvedInvestorsMap = new Map<number, Investor>();
  const newInvestorsToSet: { ref: any; data: Investor }[] = [];

  // PHASE 1: Resolve each row to either an EXISTING investor or a NEW investor
  for (const row of rowsToCommit) {
    if (row.status === 'ERROR') {
      failedRowsCount++;
      continue;
    }

    try {
      let activeInvestor: Investor | undefined = undefined;

      // First: check if row already matched an existing investor
      if (row.matchedInvestorId) {
        activeInvestor = existingInvestors.find(i => i.id === row.matchedInvestorId);
      }

      // Second: try harder to find a match by email, phone or name
      if (!activeInvestor && row.email) {
        activeInvestor = existingInvestors.find(i => 
          i.email && i.email.toLowerCase() === row.email!.toLowerCase()
        );
      }
      if (!activeInvestor && row.phone) {
        const cleanPhone = row.phone.replace(/[^0-9]/g, '');
        if (cleanPhone.length >= 8) {
          activeInvestor = existingInvestors.find(i =>
            i.phone && i.phone.replace(/[^0-9]/g, '') === cleanPhone
          );
        }
      }
      if (!activeInvestor && row.fullName) {
        activeInvestor = existingInvestors.find(i =>
          i.name.toLowerCase().trim() === row.fullName.toLowerCase().trim()
        );
      }

      if (!activeInvestor) {
        // Create a NEW investor document (no financial data yet — Phase 2 handles that)
        const newInvCode = row.investorId || `INV-${String(Math.floor(100000 + Math.random() * 900000))}`;
        const newInvRef = doc(collection(db, 'investors'));

        const newInvData: Investor = {
          id: newInvRef.id,
          investorId: newInvCode,
          uid: '',
          accountId: row.targetAccountId || targetAccount.id,
          name: row.fullName,
          email: row.email || '',
          phone: row.phone || '',
          address: row.address || '',
          // Start at 0 — Phase 2 will increment these via Firestore increment()
          unitsOwned: 0,
          totalInvestment: 0,
          currentValue: 0,
          kycStatus: (row.kycStatus === 'rejected' ? 'rejected' : row.kycStatus === 'pending' ? 'pending' : 'verified'),
          portalStatus: 'NOT_ENABLED',
          createdAt: new Date().toISOString(),
          createdBy: 'Bulk Investor Import'
        };

        newInvestorsToSet.push({ ref: newInvRef, data: newInvData });
        activeInvestor = newInvData;
        createdInvestorsCount++;
      }

      resolvedInvestorsMap.set(row.rowNumber, activeInvestor);
    } catch (err) {
      console.error(`Failed to resolve investor for row ${row.rowNumber}:`, err);
      failedRowsCount++;
    }
  }

  // Commit Phase 1 new investor docs in write batches (max 400 per batch)
  if (newInvestorsToSet.length > 0) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < newInvestorsToSet.length; i += BATCH_SIZE) {
      const chunk = newInvestorsToSet.slice(i, i + BATCH_SIZE);
      const batchOp = writeBatch(db);
      chunk.forEach(item => batchOp.set(item.ref, item.data));
      await batchOp.commit();
    }
  }

  // PHASE 2: Post financial transactions for ALL rows (new AND existing investors)
  // importMode check: MASTER_AND_INVESTMENT processes subscriptions;
  // MASTER_ONLY with amount data also processes (smart fallback)
  const hasFinancialData = rowsToCommit.some(r => (r.amount && r.amount > 0) || (r.calculatedUnits && r.calculatedUnits > 0) || (r.importedUnits && r.importedUnits > 0));

  if (batch.importMode === 'MASTER_AND_INVESTMENT' || hasFinancialData) {
    const recordsToPost: StagedTransactionRecord[] = [];

    rowsToCommit.forEach(row => {
      if (row.status === 'ERROR') return;

      const inv = resolvedInvestorsMap.get(row.rowNumber);
      if (!inv) return; // Skip rows that failed investor resolution

      // Determine units to use (prefer ACCEPT_IMPORTED if discrepancy action set, else calculated)
      const unitsToUse = (row.discrepancyAction === 'ACCEPT_IMPORTED' && row.importedUnits && row.importedUnits > 0)
        ? row.importedUnits
        : (row.calculatedUnits && row.calculatedUnits > 0
            ? row.calculatedUnits
            : (row.importedUnits && row.importedUnits > 0
                ? row.importedUnits
                : (row.amount && row.applicableNav && row.applicableNav > 0
                    ? roundUnits(row.amount / row.applicableNav)
                    : 0)));

      const amountToUse = (row.amount && row.amount > 0)
        ? row.amount
        : (unitsToUse > 0 && row.applicableNav && row.applicableNav > 0
            ? roundMoney(unitsToUse * row.applicableNav)
            : 0);

      // Must have EITHER units OR amount to proceed
      if (unitsToUse <= 0 && amountToUse <= 0) return;

      // Must have a valid NAV — default to 1.0000 if fund has no NAV set
      const nav = (row.applicableNav && row.applicableNav > 0) ? row.applicableNav : (targetAccount.nav || 1.0000);
      const validDate = row.transactionDate || new Date().toISOString().split('T')[0];
      const txType = row.transactionType || 'Subscription';

      recordsToPost.push({
        id: `STG-INV-${row.rowNumber}-${Date.now()}`,
        batchId: batch.batchId,
        rawDate: validDate,
        validatedDate: validDate,
        rawInvestor: row.fullName,
        matchedInvestorId: inv.id,
        matchedInvestorName: inv.name,
        matchConfidence: 100,
        matchStatus: 'MATCHED',
        rawType: txType,
        normalisedType: txType,
        rawAmount: amountToUse,
        grossAmount: amountToUse,
        applicableNav: nav,
        calculatedUnits: unitsToUse > 0 ? unitsToUse : roundUnits(amountToUse / nav),
        status: 'READY',
        reference: `Import Batch ${batch.batchId} Row #${row.rowNumber}`
      });
    });

    if (recordsToPost.length > 0) {
      // CRITICAL: Pass ALL resolved investors (both new and existing) to postTransactionBatch
      // so it can find each investor by matchedInvestorId
      const allInvestorsForPosting = Array.from(resolvedInvestorsMap.values());

      const postResult = await postTransactionBatch(
        {
          id: batch.batchId,
          uploadedBy: batch.uploadedBy,
          uploadedAt: batch.uploadedAt,
          accountId: targetAccount.id,
          filename: batch.filename,
          totalRows: recordsToPost.length,
          validRows: recordsToPost.length,
          errorRows: 0,
          reviewRows: 0,
          totalAmount: batch.totalSubscriptionAmount,
          status: 'APPROVED' as any,
          stagedRecords: recordsToPost
        },
        recordsToPost,
        targetAccount,
        allInvestorsForPosting
      );

      postedTransactionsCount = postResult.successCount;
      postedTransactionIds.push(...postResult.postedTransactionIds);
    }
  }

  // PHASE 3: Portal Provisioning (Non-blocking Parallel)
  if (enablePortalAccess) {
    const invList = Array.from(resolvedInvestorsMap.values()).filter(i => i.email && i.email.includes('@'));
    const provPromises = invList.map(inv => approveInvestorAndEnablePortal(inv.id, 'Bulk Import Auto-Provision').catch(err => {
      console.warn(`Portal provisioning failed for ${inv.email}:`, err);
      return null;
    }));
    const results = await Promise.allSettled(provPromises);
    portalInvitationsSent = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.investor).length;
  }

  return {
    createdInvestorsCount,
    postedTransactionsCount,
    failedRowsCount,
    postedTransactionIds,
    portalInvitationsSent
  };
}
