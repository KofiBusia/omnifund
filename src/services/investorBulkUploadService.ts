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
export function downloadInvestorCsvTemplate(mode: InvestorImportMode = 'MASTER_ONLY'): void {
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
      'Investor ID',
      'Investor Type',
      'Full Name',
      'Email',
      'Phone',
      'Fund Ticker',
      'Account Type',
      'Transaction Date',
      'Transaction Type',
      'Amount (GHS)',
      'Currency',
      'Imported Units (Optional)'
    ];
    sampleRows = [
      ['INV-000101', 'Individual', 'Kwame Mensah', 'kwame.mensah@example.com', '+233240001122', 'OGF', 'Growth', '2026-04-24', 'Subscription', '1000.00', 'GHS', '8000.0000'],
      ['INV-000102', 'Individual', 'Abena Osei', 'abena.osei@example.com', '+233200003344', 'OGF', 'Growth', '2026-04-24', 'Subscription', '500.00', 'GHS', '4000.0000'],
      ['INV-000103', 'Corporate', 'Kofi Holdings Ltd', 'info@kofiholdings.com', '+233302005566', 'OBF', 'Balanced', '2026-04-24', 'Subscription', '5000.00', 'GHS', '50000.0000']
    ];
  }

  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
  for (const alias of aliases) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === alias.trim().toLowerCase()) {
        const val = row[key];
        if (val !== undefined && val !== null) {
          return String(val).trim();
        }
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
    let fundTicker = extractRowField(row, ['Fund Ticker', 'Fund', 'Ticker', 'Scheme']);
    let accountType = extractRowField(row, ['Account Type', 'Share Class']) || 'Growth';
    const rawTxDate = extractRowField(row, ['Transaction Date', 'Date', 'Txn Date', 'Effective Date', 'Inception Date', 'Registration Date', 'Joining Date', 'Value Date']);
    const rawTxType = extractRowField(row, ['Transaction Type', 'Type', 'Action']);
    const rawAmountVal = extractRowField(row, ['Amount (GHS)', 'Amount', 'Contribution', 'Deposit', 'Subscription Amount', 'Investment Amount', 'Total Investment', 'Value', 'Market Value', 'Initial Capital', 'Capital', 'Balance (GHS)', 'Financial Balance']);
    const rawUnitsVal = extractRowField(row, ['Imported Units (Optional)', 'Imported Units', 'Units', 'Units Owned', 'Unit Balance', 'Total Units', 'Shares', 'Share Count', 'Initial Units', 'Holding Units', 'Units Held', 'Share Balance']);

    let transactionDate = parseAndNormaliseDate(rawTxDate) || new Date().toISOString().split('T')[0];
    let transactionType: StagedInvestorRow['transactionType'] = (rawTxType?.toLowerCase().includes('red') || rawTxType?.toLowerCase().includes('sell')) ? 'Redemption' : 'Subscription';
    
    let parsedAmount = Number(String(rawAmountVal || 0).replace(/[^0-9.-]+/g, ''));
    let parsedUnits = rawUnitsVal ? Number(String(rawUnitsVal).replace(/[^0-9.-]+/g, '')) : undefined;

    const accId = targetAccount?.id || 'acc1';
    const navLookup = resolveHistoricalNavForDate(accId, transactionDate, valuations, targetAccount?.nav || 1.0000);
    let applicableNav: number | undefined = navLookup?.nav || targetAccount?.nav || 1.0000;

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
      fundTicker: fundTicker || targetAccount?.ticker,
      targetAccountId: targetAccount?.id,
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
 * 4. Stage 2: Controlled Sequential Batch Commitment Engine
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

  const createdOrMatchedInvestorsMap = new Map<number, Investor>();

  // PHASE 1: Master Investor Creation & Account Linkage
  for (const row of rowsToCommit) {
    if (row.status === 'ERROR') {
      failedRowsCount++;
      continue;
    }

    try {
      let activeInvestor: Investor | undefined = undefined;

      if (row.matchedInvestorId) {
        activeInvestor = existingInvestors.find(i => i.id === row.matchedInvestorId);
      }

      if (!activeInvestor) {
        // Generate database-safe unique Investor ID if missing
        const newInvCode = row.investorId || `INV-${String(Math.floor(100000 + Math.random() * 900000))}`;
        const newInvRef = doc(collection(db, 'investors'));

        const initialUnits = row.importedUnits || row.calculatedUnits || (row.amount && row.applicableNav ? roundUnits(row.amount / row.applicableNav) : 0);
        const initialInvAmt = row.amount || (initialUnits && row.applicableNav ? roundMoney(initialUnits * row.applicableNav) : 0);

        const newInvData: Investor = {
          id: newInvRef.id,
          investorId: newInvCode,
          uid: '',
          accountId: targetAccount.id,
          name: row.fullName,
          email: row.email || '',
          phone: row.phone || '',
          address: row.address || '',
          unitsOwned: batch.importMode === 'MASTER_ONLY' ? initialUnits : 0,
          totalInvestment: batch.importMode === 'MASTER_ONLY' ? initialInvAmt : 0,
          currentValue: batch.importMode === 'MASTER_ONLY' ? roundMoney(initialUnits * (row.applicableNav || targetAccount.nav || 1)) : 0,
          kycStatus: (row.kycStatus === 'rejected' ? 'rejected' : row.kycStatus === 'pending' ? 'pending' : 'verified'),
          portalStatus: 'NOT_ENABLED',
          createdAt: new Date().toISOString(),
          createdBy: 'Bulk Investor Import'
        };

        await runTransaction(db, async (dbTx) => {
          dbTx.set(newInvRef, newInvData);
        });

        activeInvestor = newInvData;
        createdInvestorsCount++;
      }

      createdOrMatchedInvestorsMap.set(row.rowNumber, activeInvestor);
    } catch (err) {
      console.error(`Failed to create investor master record for row ${row.rowNumber}:`, err);
      failedRowsCount++;
    }
  }

  // PHASE 2: Financial Investment Subscriptions via Authoritative Transaction Engine
  if (batch.importMode === 'MASTER_AND_INVESTMENT') {
    const recordsToPost: StagedTransactionRecord[] = [];

    rowsToCommit.forEach(row => {
      const inv = createdOrMatchedInvestorsMap.get(row.rowNumber);
      if (!inv || !row.transactionDate || !row.applicableNav || !row.amount || row.amount <= 0) {
        return;
      }

      // Determine units to issue based on admin discrepancy choice
      const unitsToUse = (row.discrepancyAction === 'ACCEPT_IMPORTED' && row.importedUnits && row.importedUnits > 0)
        ? row.importedUnits
        : row.calculatedUnits || roundUnits(row.amount / row.applicableNav);

      recordsToPost.push({
        id: `STG-INV-${row.rowNumber}-${Date.now()}`,
        batchId: batch.batchId,
        rawDate: row.transactionDate,
        validatedDate: row.transactionDate,
        rawInvestor: row.fullName,
        matchedInvestorId: inv.id,
        matchedInvestorName: inv.name,
        matchConfidence: 100,
        matchStatus: 'MATCHED',
        rawType: 'Subscription',
        normalisedType: 'Subscription',
        rawAmount: row.amount,
        grossAmount: row.amount,
        applicableNav: row.applicableNav,
        calculatedUnits: unitsToUse,
        status: 'READY',
        reference: `Import Batch ${batch.batchId} Row #${row.rowNumber}`
      });
    });

    if (recordsToPost.length > 0) {
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
        Array.from(createdOrMatchedInvestorsMap.values())
      );

      postedTransactionsCount = postResult.successCount;
      postedTransactionIds.push(...postResult.postedTransactionIds);
    }
  }

  // PHASE 3: Portal Provisioning & Activation Links (Non-blocking)
  if (enablePortalAccess) {
    for (const [_, inv] of createdOrMatchedInvestorsMap.entries()) {
      if (inv.email && inv.email.includes('@')) {
        try {
          const provRes = await approveInvestorAndEnablePortal(inv.id, 'Bulk Import Auto-Provision');
          if (provRes.investor) {
            portalInvitationsSent++;
          }
        } catch (emailErr) {
          console.warn(`Portal provisioning email failed for ${inv.email} (Financial transaction preserved):`, emailErr);
        }
      }
    }
  }

  return {
    createdInvestorsCount,
    postedTransactionsCount,
    failedRowsCount,
    postedTransactionIds,
    portalInvitationsSent
  };
}
