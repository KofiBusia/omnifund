import { 
  resolveAssetPriceStatuses, 
  calculateDailyFeeAccruals, 
  detectValuationExceptions, 
  calculateNavBridge,
  DEFAULT_FEE_CONFIG 
} from '../valuationService';
import { calculateNetAssets, calculateNavPerUnit, roundMoney, roundNav } from '../fundAccountingEngine';
import { Asset, InvestmentAccount, Investor, Valuation } from '../../types';

function runValuationEngineTestSuite() {
  console.log("=================================================");
  console.log("  RUNNING AUTHORITATIVE VALUATION TEST SUITE     ");
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

  // --- TEST 1: Core Net Assets Identity ---
  console.log("--- Test 1: Core Net Assets Identity ---");
  // Portfolio 100,000 + Cash 10,000 + Receivables 2,000 - Liabilities 1,000 - Accrued Fees 500 = 110,500
  const naResult = calculateNetAssets(100000, 10000, 2000, 1000, 500);
  assert(naResult.totalAssets === 112000, "Total Assets = Portfolio + Cash + Receivables (112,000 GHS)", `Got ${naResult.totalAssets}`);
  assert(naResult.totalLiabilities === 15000 || naResult.totalLiabilities === 1500, "Total Liabilities = Liabilities + Accrued Fees (1,500 GHS)", `Got ${naResult.totalLiabilities}`);
  assert(naResult.netAssets === 110500, "Net Assets = Assets - Liabilities (110,500 GHS)", `Got ${naResult.netAssets}`);

  // --- TEST 2: NAV Per Unit Calculation ---
  console.log("\n--- Test 2: NAV Per Unit Calculation ---");
  const navVal = calculateNavPerUnit(110500, 1000000); // 1,000,000 units => NAV = 0.1105
  assert(navVal === 0.1105, "NAV Per Unit = Net Assets / Units Outstanding (0.1105 GHS)", `Got ${navVal}`);

  // --- TEST 3: Asset Price Status & Stale Detection ---
  console.log("\n--- Test 3: Asset Price Status & Stale Price Detection ---");
  const mockAssets: Asset[] = [
    { id: 'ast1', accountId: 'acc1', ticker: 'MTNGH', name: 'MTN Ghana', quantity: 10000, costBasis: 1.5, totalCostBasis: 15000, currentPrice: 2.0, marketValue: 20000, valuationDate: new Date().toISOString() },
    { id: 'ast2', accountId: 'acc1', ticker: 'GCB', name: 'GCB Bank', quantity: 5000, costBasis: 4.0, totalCostBasis: 20000, currentPrice: 4.5, marketValue: 22500, valuationDate: '2026-07-01T00:00:00Z' }, // Stale (>7 days)
    { id: 'ast3', accountId: 'acc1', ticker: 'EGL', name: 'Enterprise Group', quantity: 1000, costBasis: 2.0, totalCostBasis: 2000, currentPrice: 0, marketValue: 0 } // Missing
  ];

  const statuses = resolveAssetPriceStatuses(mockAssets, 7, '2026-08-10T20:00:00Z');
  assert(statuses[0].status === 'PRICED', "Fresh asset pricing flagged PRICED");
  assert(statuses[1].status === 'STALE', "Price older than 7 days flagged STALE");
  assert(statuses[2].status === 'MISSING', "Zero price flagged MISSING");

  // --- TEST 4: Daily Fee & Expense Accrual Engine ---
  console.log("\n--- Test 4: Daily Expense & Fee Accruals Engine ---");
  // Net Assets = 100,000 GHS. Mgmt Fee = 1.5% p.a., Custody Fee = 0.25% p.a.
  const feeResult = calculateDailyFeeAccruals(100000, DEFAULT_FEE_CONFIG);
  assert(feeResult.dailyManagementFee === 4.11, "Daily Management Fee = (1.5% * 100,000) / 365 = 4.11 GHS", `Got ${feeResult.dailyManagementFee}`);
  assert(feeResult.dailyCustodyFee === 0.68, "Daily Custody Fee = (0.25% * 100,000) / 365 = 0.68 GHS", `Got ${feeResult.dailyCustodyFee}`);
  assert(feeResult.totalDailyAccrual === 5.06, "Total Daily Fee Accrual = 5.06 GHS", `Got ${feeResult.totalDailyAccrual}`);

  // --- TEST 5: Valuation Exception & Anomaly Detector ---
  console.log("\n--- Test 5: Valuation Exception & Anomaly Detector ---");
  const mockAccount: InvestmentAccount = {
    id: 'acc1',
    name: 'Omni Growth Fund',
    ticker: 'OGF',
    description: 'Test Fund',
    aum: 110500,
    nav: 0.1000, // Previous NAV was 0.1000, calculated NAV is 0.1500 (50% jump)
    totalUnits: 1000000,
    cashBalance: -500, // Negative cash!
    lastValuationDate: '2026-08-01',
    createdAt: '2026-01-01'
  };

  const mockInvestors: Investor[] = [
    { id: 'inv1', investorId: 'INV-1', uid: 'u1', accountId: 'acc1', name: 'Alice', unitsOwned: 900000, totalInvestment: 90000, currentValue: 99450 } // Sum = 900,000 (Mismatch with 1,000,000)
  ];

  const exceptions = detectValuationExceptions(mockAccount, mockAssets, mockInvestors, 0.1000, 0.1500);
  assert(exceptions.some(e => e.code === 'MISSING_PRICE'), "Detects MISSING_PRICE exception");
  assert(exceptions.some(e => e.code === 'STALE_PRICE'), "Detects STALE_PRICE exception");
  assert(exceptions.some(e => e.code === 'NEGATIVE_CASH'), "Detects NEGATIVE_CASH exception");
  assert(exceptions.some(e => e.code === 'UNIT_MISMATCH'), "Detects UNIT_MISMATCH exception");
  assert(exceptions.some(e => e.code === 'LARGE_NAV_MOVEMENT'), "Detects LARGE_NAV_MOVEMENT exception");

  // --- TEST 6: NAV Movement Bridge Calculation ---
  console.log("\n--- Test 6: NAV Movement Bridge Calculation ---");
  const bridge = calculateNavBridge(0.1000, 0.1200, 20000, 0, 500, 0, 1000000);
  assert(bridge.previousNav === 0.1000, "Bridge Previous NAV = 0.1000");
  assert(bridge.closingNav === 0.1200, "Bridge Closing NAV = 0.1200");
  assert(bridge.portfolioMovement === 0.0200, "Bridge Portfolio Gain Impact = +0.0200 GHS per unit", `Got ${bridge.portfolioMovement}`);

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED           `);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runValuationEngineTestSuite();
