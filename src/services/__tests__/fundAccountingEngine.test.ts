import { 
  calculateNetAssets, 
  calculateNavPerUnit, 
  calculateSubscription, 
  calculateRedemption, 
  calculateAssetDisposal, 
  reconcileFundState,
  roundMoney,
  roundUnits,
  roundNav
} from '../fundAccountingEngine';
import { InvestmentAccount, Investor, Asset } from '../../types';

function runTestSuite() {
  console.log("=================================================");
  console.log("  RUNNING GLOBAL FUND ACCOUNTING TEST SUITE       ");
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

  // --- SCENARIO A: Initial Subscription ---
  console.log("--- Scenario A: Initial Subscription ---");
  const subA = calculateSubscription(1000, 0.10, 0, 0);
  assert(subA.unitsIssued === 10000, "Scenario A - Units Issued (10,000 units)", `Got ${subA.unitsIssued}`);
  assert(subA.newTotalInvestment === 1000, "Scenario A - Total Investment (GH₵1,000)", `Got ${subA.newTotalInvestment}`);
  assert(subA.newCurrentValue === 1000, "Scenario A - Current Value (GH₵1,000)", `Got ${subA.newCurrentValue}`);

  // --- SCENARIO B: Portfolio Appreciation ---
  console.log("\n--- Scenario B: Portfolio Appreciation ---");
  const netAssetsB1 = calculateNetAssets(100000, 10000, 0, 0, 0); // 110,000 Net Assets
  const navB1 = calculateNavPerUnit(netAssetsB1.netAssets, 1000000); // 1,000,000 units => NAV = 0.1100
  assert(navB1 === 0.1100, "Scenario B - NAV Rises from 0.10 to 0.11", `Got ${navB1}`);

  const netAssetsB2 = calculateNetAssets(110000, 10000, 0, 0, 0); // 10% portfolio appreciation (120,000 Net Assets)
  const navB2 = calculateNavPerUnit(netAssetsB2.netAssets, 1000000); // NAV = 0.1200
  assert(navB2 === 0.1200, "Scenario B - NAV Appreciation to 0.1200", `Got ${navB2}`);

  const investorValueB2 = roundMoney(10000 * navB2); // 10,000 units * 0.12 = GH₵1,200
  assert(investorValueB2 === 1200, "Scenario B - Investor Value Increases to GH₵1,200", `Got ${investorValueB2}`);
  assert(subA.newUnitsOwned === 10000, "Scenario B - Investor Units Remain Unchanged (10,000)", `Got ${subA.newUnitsOwned}`);

  // --- SCENARIO C: Additional Subscription after Performance ---
  console.log("\n--- Scenario C: Additional Subscription at Higher NAV ---");
  const subC = calculateSubscription(600, navB2, subA.newUnitsOwned, subA.newTotalInvestment); // 600 GH₵ @ 0.12 NAV
  assert(subC.unitsIssued === 5000, "Scenario C - Units Issued at 0.12 NAV (5,000 units)", `Got ${subC.unitsIssued}`);
  assert(subC.newUnitsOwned === 15000, "Scenario C - Total Units Owned (15,000 units)", `Got ${subC.newUnitsOwned}`);
  assert(subC.newTotalInvestment === 1600, "Scenario C - Total Investment (GH₵1,600)", `Got ${subC.newTotalInvestment}`);
  assert(subC.newCurrentValue === 1800, "Scenario C - Total Current Value (GH₵1,800)", `Got ${subC.newCurrentValue}`);

  // --- SCENARIO D: Partial Redemption ---
  console.log("\n--- Scenario D: Partial Redemption & Pro-Rata Cost Basis ---");
  // Investor owns 15,000 units, total investment GH₵1,600. Redeems 5,000 units @ 0.12 NAV.
  const redD = calculateRedemption(5000, 15000, 1600, 0.12);
  assert(redD.grossProceeds === 600, "Scenario D - Gross Proceeds (GH₵600)", `Got ${redD.grossProceeds}`);
  assert(redD.costBasisReduction === 533.33, "Scenario D - Pro-rata Cost Basis Reduction (GH₵533.33)", `Got ${redD.costBasisReduction}`);
  assert(redD.realizedGainLoss === 66.67, "Scenario D - Realized Gain (GH₵66.67)", `Got ${redD.realizedGainLoss}`);
  assert(redD.remainingUnitsOwned === 10000, "Scenario D - Remaining Units (10,000)", `Got ${redD.remainingUnitsOwned}`);
  assert(redD.remainingTotalInvestment === 1066.67, "Scenario D - Remaining Cost Basis (GH₵1,066.67)", `Got ${redD.remainingTotalInvestment}`);

  // --- SCENARIO E: Investment Purchase ---
  console.log("\n--- Scenario E: Investment Purchase ---");
  const cashInitial = 50000;
  const purchaseCost = 20000;
  const cashPostPurchase = cashInitial - purchaseCost;
  const portfolioPostPurchase = purchaseCost;
  const netAssetsE = calculateNetAssets(portfolioPostPurchase, cashPostPurchase, 0, 0, 0);
  assert(netAssetsE.netAssets === 50000, "Scenario E - Net Assets Unchanged on Asset Purchase (GH₵50,000)", `Got ${netAssetsE.netAssets}`);

  // --- SCENARIO F: Investment Sale at Profit ---
  console.log("\n--- Scenario F: Investment Sale at Profit ---");
  // Purchased 1,000 shares @ GH₵20 (Cost: GH₵20,000). Sold 500 shares @ GH₵25.
  const disposalF = calculateAssetDisposal(500, 25, 1000, 20);
  assert(disposalF.saleProceeds === 12500, "Scenario F - Sale Proceeds (GH₵12,500)", `Got ${disposalF.saleProceeds}`);
  assert(disposalF.costBasisOfSold === 10000, "Scenario F - Cost Basis Sold (GH₵10,000)", `Got ${disposalF.costBasisOfSold}`);
  assert(disposalF.realizedGainLoss === 2500, "Scenario F - Realized Profit (GH₵2,500)", `Got ${disposalF.realizedGainLoss}`);
  assert(disposalF.remainingQuantity === 500, "Scenario F - Remaining Shares (500)", `Got ${disposalF.remainingQuantity}`);

  // --- SCENARIO G: Investment Sale at Loss ---
  console.log("\n--- Scenario G: Investment Sale at Loss ---");
  // Sold 500 shares @ GH₵15 (Cost: GH₵20 per share).
  const disposalG = calculateAssetDisposal(500, 15, 500, 20);
  assert(disposalG.saleProceeds === 7500, "Scenario G - Sale Proceeds (GH₵7,500)", `Got ${disposalG.saleProceeds}`);
  assert(disposalG.realizedGainLoss === -2500, "Scenario G - Realized Loss (-GH₵2,500)", `Got ${disposalG.realizedGainLoss}`);

  // --- SCENARIO H: Fund Expense & Liabilities ---
  console.log("\n--- Scenario H: Fund Expense & Liabilities Impact ---");
  // Portfolio 100,000, Cash 10,000, Liabilities 5,000 => Net Assets = 105,000
  const netAssetsH = calculateNetAssets(100000, 10000, 0, 5000, 0);
  assert(netAssetsH.netAssets === 105000, "Scenario H - Net Assets = Assets - Liabilities (GH₵105,000)", `Got ${netAssetsH.netAssets}`);
  const navH = calculateNavPerUnit(netAssetsH.netAssets, 100000); // 100,000 units => NAV = 1.0500
  assert(navH === 1.0500, "Scenario H - NAV Per Unit with Liabilities (1.0500)", `Got ${navH}`);

  // --- SCENARIO I: Dividend Income ---
  console.log("\n--- Scenario I: Dividend Income Recognition ---");
  const cashWithDividend = 10000 + 3000; // Received GH₵3,000 dividend
  const netAssetsI = calculateNetAssets(100000, cashWithDividend, 0, 5000, 0);
  assert(netAssetsI.netAssets === 108000, "Scenario I - Net Assets Increases by Dividend (GH₵108,000)", `Got ${netAssetsI.netAssets}`);
  const navI = calculateNavPerUnit(netAssetsI.netAssets, 100000);
  assert(navI === 1.0800, "Scenario I - NAV Per Unit Rises to 1.0800", `Got ${navI}`);

  // --- SCENARIO J: Unit & Fund Reconciliation ---
  console.log("\n--- Scenario J: Fund Reconciliation ---");
  const testAccount: InvestmentAccount = {
    id: 'acc1',
    name: 'Omni Growth Fund',
    ticker: 'OGF',
    description: 'Test Fund',
    aum: 108000,
    nav: 1.0800,
    totalUnits: 100000,
    cashBalance: 13000,
    liabilities: 5000,
    lastValuationDate: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const testAssets: Asset[] = [
    {
      id: 'ast1',
      accountId: 'acc1',
      ticker: 'MTNGH',
      name: 'MTN Ghana',
      quantity: 50000,
      costBasis: 1.5,
      totalCostBasis: 75000,
      currentPrice: 2.0,
      marketValue: 100000
    }
  ];

  const testInvestors: Investor[] = [
    { id: 'inv1', investorId: 'INV-1', uid: 'u1', accountId: 'acc1', name: 'Alice', unitsOwned: 60000, totalInvestment: 60000, currentValue: 64800 },
    { id: 'inv2', investorId: 'INV-2', uid: 'u2', accountId: 'acc1', name: 'Bob', unitsOwned: 40000, totalInvestment: 40000, currentValue: 43200 }
  ];

  const reconJ = reconcileFundState(testAccount, testAssets, testInvestors);
  assert(reconJ.isBalanced === true, "Scenario J - Fund Reconciles Cleanly", `Discrepancies: ${reconJ.discrepancies.join(', ')}`);
  assert(reconJ.totalInvestorUnits === 100000, "Scenario J - Investor Units Sum = 100,000", `Got ${reconJ.totalInvestorUnits}`);

  // --- SCENARIO L: Zero & Edge Cases ---
  console.log("\n--- Scenario L: Zero & Edge Cases ---");
  const navZero = calculateNavPerUnit(0, 0, 1.0000);
  assert(navZero === 1.0000, "Scenario L - Zero Units Fallback NAV = 1.0000", `Got ${navZero}`);

  let redemptionErrorCaught = false;
  try {
    calculateRedemption(200, 100, 1000, 1.0);
  } catch (e: any) {
    redemptionErrorCaught = true;
  }
  assert(redemptionErrorCaught === true, "Scenario L - Redemption Exceeding Holdings Throws Exception");

  console.log("\n=================================================");
  console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED           `);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();
