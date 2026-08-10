import { 
  resolveHistoricalNavForDate, 
  resolveInvestorForTransaction, 
  normaliseTransactionType, 
  parseAndNormaliseDate, 
  detectDuplicateTransaction, 
  analyseAndStageBatch,
  calculateStringSimilarity 
} from '../transactionProcessingEngine';
import { InvestmentAccount, Investor, Valuation, Transaction } from '../../types';
import { reconcileFundState } from '../fundAccountingEngine';

function runTransactionEngineTestSuite() {
  console.log("=================================================");
  console.log("  RUNNING TRANSACTION ENGINE AUTOMATED TEST SUITE ");
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

  // Sample Mock Data
  const mockValuations: Valuation[] = [
    { id: 'v1', accountId: 'acc1', date: { seconds: new Date('2026-04-20').getTime() / 1000 }, nav: 0.1000, aum: 100000 },
    { id: 'v2', accountId: 'acc1', date: { seconds: new Date('2026-04-24').getTime() / 1000 }, nav: 0.1000, aum: 100000 },
    { id: 'v3', accountId: 'acc1', date: { seconds: new Date('2026-04-25').getTime() / 1000 }, nav: 0.1050, aum: 105000 },
    { id: 'v4', accountId: 'acc1', date: { seconds: new Date('2026-04-30').getTime() / 1000 }, nav: 0.1200, aum: 120000 }
  ];

  const mockInvestors: Investor[] = [
    { id: 'inv1', investorId: 'INV-001', uid: 'u1', accountId: 'acc1', name: 'Joshua K. Mensah', email: 'joshua@fund.com', phone: '0244123456', unitsOwned: 10000, totalInvestment: 1000, currentValue: 1200 },
    { id: 'inv2', investorId: 'INV-002', uid: 'u2', accountId: 'acc1', name: 'Fiakpo Divine', email: 'divine@fund.com', phone: '0244654321', unitsOwned: 5000, totalInvestment: 500, currentValue: 600 },
    { id: 'inv3', investorId: 'INV-003', uid: 'u3', accountId: 'acc1', name: 'Peter Yaw Adu-Amoah', email: 'peter@fund.com', phone: '0244999888', unitsOwned: 2000, totalInvestment: 200, currentValue: 240 }
  ];

  const mockTransactions: Transaction[] = [
    { id: 'tx1', investorId: 'inv1', accountId: 'acc1', type: 'Subscription', units: 500, pricePerUnit: 0.1000, totalAmount: 50, timestamp: '2026-04-24T10:00:00Z' }
  ];

  const mockAccount: InvestmentAccount = {
    id: 'acc1',
    name: 'Omni Growth Fund',
    ticker: 'OGF',
    description: 'Test Fund',
    aum: 2040,
    nav: 0.1200,
    totalUnits: 17000,
    cashBalance: 2040,
    lastValuationDate: '2026-04-30',
    createdAt: '2026-01-01'
  };

  // --- TEST 1: Historical NAV Lookup on Exact Date ---
  console.log("--- Test 1: Historical NAV Lookup (Exact Date) ---");
  const navLookup1 = resolveHistoricalNavForDate('acc1', '2026-04-24', mockValuations, 0.1200);
  assert(navLookup1 !== null && navLookup1.nav === 0.1000, "Historical NAV on 24-Apr-2026 = 0.1000", `Got ${navLookup1?.nav}`);
  assert(navLookup1?.isExactDateMatch === true, "Exact date match flag is true");

  // --- TEST 2: Historical NAV Lookup on Changing NAV ---
  console.log("\n--- Test 2: Historical NAV Lookup on Changing NAV ---");
  const navLookup2 = resolveHistoricalNavForDate('acc1', '2026-04-25', mockValuations, 0.1200);
  assert(navLookup2 !== null && navLookup2.nav === 0.1050, "Historical NAV on 25-Apr-2026 = 0.1050", `Got ${navLookup2?.nav}`);

  // --- TEST 3: Historical NAV Lookup on Weekend / Intervening Date ---
  console.log("\n--- Test 3: Historical NAV Lookup on Intervening Date ---");
  const navLookup3 = resolveHistoricalNavForDate('acc1', '2026-04-26', mockValuations, 0.1200);
  assert(navLookup3 !== null && navLookup3.nav === 0.1050, "Intervening Date (26-Apr) uses Prior Valuation NAV 0.1050", `Got ${navLookup3?.nav}`);

  // --- TEST 4: Missing NAV Lookup (NAV_REQUIRED) ---
  console.log("\n--- Test 4: Missing Historical NAV (NAV_REQUIRED) ---");
  const navLookup4 = resolveHistoricalNavForDate('acc1', '2026-01-01', mockValuations);
  assert(navLookup4 === null, "Date preceding all valuations returns null (NAV_REQUIRED)");

  // --- TEST 5: Investor Matching — Exact ID Match ---
  console.log("\n--- Test 5: Investor Matching (Exact ID Match) ---");
  const match1 = resolveInvestorForTransaction('INV-001', mockInvestors, 'acc1');
  assert(match1.matchStatus === 'MATCHED' && match1.investor?.id === 'inv1', "Exact Investor ID Match", `Got ${match1.investor?.name}`);
  assert(match1.confidence === 100, "Confidence is 100%");

  // --- TEST 6: Investor Matching — Normalised Name Match ---
  console.log("\n--- Test 6: Investor Matching (Normalised / Fuzzy Match) ---");
  const match2 = resolveInvestorForTransaction('Joshua Kwei Mensah', mockInvestors, 'acc1');
  assert(match2.matchStatus === 'MATCHED' || match2.matchStatus === 'REVIEW', "Fuzzy Name Match resolved for Joshua Kwei Mensah", `Got ${match2.investor?.name} (${match2.confidence}%)`);
  assert(match2.investor?.id === 'inv1', "Matched correct investor profile 'inv1'");

  // --- TEST 7: Investor Matching — Unknown Investor ---
  console.log("\n--- Test 7: Investor Matching (Unknown Investor) ---");
  const match3 = resolveInvestorForTransaction('Nonexistent Investor', mockInvestors, 'acc1');
  assert(match3.matchStatus === 'UNMATCHED', "Unknown investor flags UNMATCHED");

  // --- TEST 8: Duplicate Transaction Detection ---
  console.log("\n--- Test 8: Duplicate Transaction Detection ---");
  const isDup = detectDuplicateTransaction(
    { investorId: 'inv1', date: '2026-04-24', amount: 50, type: 'Subscription' },
    mockTransactions
  );
  assert(isDup === true, "Identical (investor, date, amount, type) detected as duplicate");

  const isNotDup = detectDuplicateTransaction(
    { investorId: 'inv1', date: '2026-04-24', amount: 75, type: 'Subscription' },
    mockTransactions
  );
  assert(isNotDup === false, "Different amount (75 vs 50) is not marked duplicate");

  // --- TEST 9: Stage 1 Bulk Batch Staging Engine ---
  console.log("\n--- Test 9: Two-Stage Bulk Batch Analysis Engine ---");
  const rawCSVRows = [
    { Date: '2026-04-24', Investor: 'Joshua Kwei Mensah', Type: 'Contribution', Amount: '50.00' },
    { Date: '2026-04-24', Investor: 'Fiakpo Divine', Type: 'Contribution', Amount: '220.00' },
    { Date: '2026-04-25', Investor: 'Peter Yaw Adu-Amoah', Type: 'Contribution', Amount: '20.00' }
  ];

  const batch = analyseAndStageBatch(
    rawCSVRows,
    'test_contributions.csv',
    'acc1',
    mockInvestors,
    mockTransactions,
    mockValuations,
    0.1200
  );

  assert(batch.totalRows === 3, "Batch total rows = 3", `Got ${batch.totalRows}`);
  assert(batch.stagedRecords.length === 3, "Staged records count = 3");
  assert(batch.stagedRecords[0].applicableNav === 0.1000, "Row 1 uses 24-Apr NAV of 0.1000", `Got ${batch.stagedRecords[0].applicableNav}`);
  assert(batch.stagedRecords[0].calculatedUnits === 500, "Row 1 calculated units = 500 (50 / 0.1000)", `Got ${batch.stagedRecords[0].calculatedUnits}`);
  assert(batch.stagedRecords[2].applicableNav === 0.1050, "Row 3 uses 25-Apr NAV of 0.1050", `Got ${batch.stagedRecords[2].applicableNav}`);
  assert(batch.stagedRecords[2].calculatedUnits === 190.4762, "Row 3 calculated units = 190.4762 (20 / 0.1050)", `Got ${batch.stagedRecords[2].calculatedUnits}`);

  // --- TEST 10: Unit Balance Reconciliation Check ---
  console.log("\n--- Test 10: Fund Unit Reconciliation Check ---");
  const recon = reconcileFundState(mockAccount, [], mockInvestors);
  // Total investor units: 10,000 + 5,000 + 2,000 = 17,000. Account totalUnits = 17,000.
  assert(recon.isBalanced === true, "Reconciliation balances cleanly when total units match (17,000 units)");

  const imbalancedAccount = { ...mockAccount, totalUnits: 18000 };
  const reconBad = reconcileFundState(imbalancedAccount, [], mockInvestors);
  assert(reconBad.isBalanced === false, "Reconciliation flags discrepancy when total units mismatch (18,000 vs 17,000)");

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED           `);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTransactionEngineTestSuite();
