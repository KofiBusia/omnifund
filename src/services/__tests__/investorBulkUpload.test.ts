import { 
  analyseInvestorBulkCsv, 
  extractRowField, 
  downloadInvestorCsvTemplate 
} from '../investorBulkUploadService';
import { Investor, InvestmentAccount, Valuation } from '../../types';

function runInvestorBulkUploadTestSuite() {
  console.log("=================================================");
  console.log("  RUNNING INVESTOR BULK UPLOAD TEST SUITE        ");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // --- Mock Test Setup ---
  const mockAccounts: InvestmentAccount[] = [{
    id: 'acc1',
    name: 'Omni Growth Fund',
    ticker: 'OGF',
    description: 'Omni Growth Fund Scheme',
    nav: 0.1250,
    totalUnits: 100000,
    cashBalance: 12500,
    aum: 12500,
    lastValuationDate: '2026-04-24',
    createdAt: '2026-01-01'
  }];

  const mockExistingInvestors: Investor[] = [{
    id: 'inv1',
    investorId: 'INV-000101',
    uid: 'u1',
    accountId: 'acc1',
    name: 'Kwame Mensah',
    email: 'kwame.mensah@example.com',
    phone: '+233240001122',
    unitsOwned: 5000,
    totalInvestment: 500,
    currentValue: 625,
    kycStatus: 'verified'
  }];

  const mockValuations: Valuation[] = [{
    id: 'val1',
    accountId: 'acc1',
    date: '2026-04-24T00:00:00.000Z',
    nav: 0.1250,
    aum: 12500
  }];

  // --- TEST 1: Flexible Header Normalization ---
  console.log("--- Test 1: Flexible Header Normalization ---");
  const testRow = {
    'Member Name': 'Abena Osei',
    'E-mail': 'abena.osei@example.com',
    'Investment Amount': '1,000.00',
    'Txn Date': '2026-04-24'
  };

  const extractedName = extractRowField(testRow, ['Full Name', 'Name', 'Member Name']);
  const extractedEmail = extractRowField(testRow, ['Email', 'E-mail', 'Email Address']);
  const extractedAmount = extractRowField(testRow, ['Amount', 'Investment Amount']);
  const extractedDate = extractRowField(testRow, ['Transaction Date', 'Txn Date']);

  assert(extractedName === 'Abena Osei', "Normalises 'Member Name' to 'Abena Osei'");
  assert(extractedEmail === 'abena.osei@example.com', "Normalises 'E-mail' to 'abena.osei@example.com'");
  assert(extractedAmount === '1,000.00', "Normalises 'Investment Amount' to '1,000.00'");
  assert(extractedDate === '2026-04-24', "Normalises 'Txn Date' to '2026-04-24'");

  // --- TEST 2: Mode A (Investor Master Data Import) ---
  console.log("\n--- Test 2: Mode A (Investor Master Data Import) ---");
  const masterRawRows = [
    {
      'Investor ID': 'INV-000102',
      'Full Name': 'Abena Osei',
      'Email': 'abena.osei@example.com',
      'Phone': '+233200003344',
      'Address': 'Kumasi Ghana',
      'KYC Status': 'verified'
    },
    {
      'Full Name': 'Kofi Holdings Ltd',
      'Email': 'info@kofiholdings.com',
      'Phone': '+233302005566',
      'KYC Status': 'pending'
    }
  ];

  const batchMaster = analyseInvestorBulkCsv(
    masterRawRows,
    'master_import.csv',
    'MASTER_ONLY',
    'acc1',
    mockExistingInvestors,
    mockAccounts,
    mockValuations
  );

  assert(batchMaster.importMode === 'MASTER_ONLY', "Batch import mode is MASTER_ONLY");
  assert(batchMaster.totalRows === 2, "Analyzes 2 master rows");
  assert(batchMaster.validRows === 2, "Both master rows are valid (READY)");
  assert(batchMaster.totalSubscriptionAmount === 0, "Master import creates 0 subscription amount");
  assert(batchMaster.stagedRows[0].investorId === 'INV-000102', "Preserves provided Investor ID");
  assert(batchMaster.stagedRows[1].investorId === undefined, "Omits ID for auto-generation on commit");

  // --- TEST 3: Mode B (Master + Initial Investment Import & NAV Calculation) ---
  console.log("\n--- Test 3: Mode B (Master + Financial Investment Import) ---");
  const financialRawRows = [
    {
      'Investor ID': 'INV-000102',
      'Full Name': 'Abena Osei',
      'Email': 'abena.osei@example.com',
      'Transaction Date': '2026-04-24',
      'Amount (GHS)': '1000.00'
    }
  ];

  const batchFinancial = analyseInvestorBulkCsv(
    financialRawRows,
    'financial_import.csv',
    'MASTER_AND_INVESTMENT',
    'acc1',
    mockExistingInvestors,
    mockAccounts,
    mockValuations
  );

  assert(batchFinancial.importMode === 'MASTER_AND_INVESTMENT', "Batch import mode is MASTER_AND_INVESTMENT");
  assert(batchFinancial.totalSubscriptionAmount === 1000, "Total subscription amount is GH₵1,000");
  assert(batchFinancial.stagedRows[0].applicableNav === 0.1250, "Resolves historical NAV of GH₵0.1250 for 2026-04-24");
  assert(batchFinancial.stagedRows[0].calculatedUnits === 8000, "Calculates units = 1000 / 0.125 = 8,000 units");

  // --- TEST 4: Unit Discrepancy Inspection ---
  console.log("\n--- Test 4: Unit Discrepancy Inspection ---");
  const discrepancyRawRows = [
    {
      'Investor ID': 'INV-000102',
      'Full Name': 'Abena Osei',
      'Email': 'abena.osei@example.com',
      'Transaction Date': '2026-04-24',
      'Amount (GHS)': '1000.00',
      'Imported Units (Optional)': '8100.0000' // Migration unit differs from 8,000
    }
  ];

  const batchDiscrepancy = analyseInvestorBulkCsv(
    discrepancyRawRows,
    'discrepancy_import.csv',
    'MASTER_AND_INVESTMENT',
    'acc1',
    mockExistingInvestors,
    mockAccounts,
    mockValuations
  );

  assert(batchDiscrepancy.hasDiscrepancies === true, "Batch flags hasDiscrepancies = true");
  assert(batchDiscrepancy.stagedRows[0].hasUnitDiscrepancy === true, "Row flags unit discrepancy");
  assert(batchDiscrepancy.stagedRows[0].status === 'WARNING', "Row status is set to WARNING for admin inspection");
  assert(batchDiscrepancy.stagedRows[0].unitDiscrepancyDelta === 100, "Calculates unit delta = |8100 - 8000| = 100 units");

  // --- TEST 5: Duplicate Investor Matching ---
  console.log("\n--- Test 5: Duplicate Investor Matching ---");
  const existingRawRows = [
    {
      'Investor ID': 'INV-000101', // Existing investor ID
      'Full Name': 'Kwame Mensah',
      'Email': 'kwame.mensah@example.com'
    }
  ];

  const batchDuplicate = analyseInvestorBulkCsv(
    existingRawRows,
    'existing_import.csv',
    'MASTER_ONLY',
    'acc1',
    mockExistingInvestors,
    mockAccounts,
    mockValuations
  );

  assert(batchDuplicate.stagedRows[0].matchStatus === 'EXISTING', "Detects existing investor profile match");
  assert(batchDuplicate.stagedRows[0].matchedInvestorId === 'inv1', "Matches existing investor ID 'inv1'");

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED           `);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runInvestorBulkUploadTestSuite();
