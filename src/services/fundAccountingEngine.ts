import { InvestmentAccount, Investor, Asset, Transaction } from '../types';

export interface FundAccountingState {
  portfolioValue: number;
  cashBalance: number;
  receivables: number;
  liabilities: number;
  accruedFees: number;
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  totalUnits: number;
  navPerUnit: number;
}

export interface SubscriptionResult {
  unitsIssued: number;
  grossAmount: number;
  navPerUnit: number;
  newUnitsOwned: number;
  newTotalInvestment: number;
  newCurrentValue: number;
}

export interface RedemptionResult {
  unitsRedeemed: number;
  navPerUnit: number;
  grossProceeds: number;
  costBasisReduction: number;
  realizedGainLoss: number;
  remainingUnitsOwned: number;
  remainingTotalInvestment: number;
  remainingCurrentValue: number;
}

export interface AssetDisposalResult {
  quantitySold: number;
  salePrice: number;
  saleProceeds: number;
  costBasisOfSold: number;
  realizedGainLoss: number;
  remainingQuantity: number;
  remainingMarketValue: number;
}

export interface FundReconciliation {
  isBalanced: boolean;
  totalInvestorUnits: number;
  fundTotalUnits: number;
  unitsDifference: number;
  calculatedNetAssets: number;
  reportedAum: number;
  aumDifference: number;
  calculatedNav: number;
  reportedNav: number;
  navDifference: number;
  discrepancies: string[];
}

// Precision Rounding Helpers
export const roundMoney = (val: number): number => {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
};

export const roundUnits = (val: number): number => {
  if (isNaN(val) || !isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
};

export const roundNav = (val: number): number => {
  if (isNaN(val) || !isFinite(val)) return 1.0000;
  return Math.round((val + Number.EPSILON) * 10000) / 10000;
};

/**
 * Calculates Net Assets = Total Assets (Portfolio Value + Cash + Receivables) - Total Liabilities (Payables + Accrued Fees)
 */
export function calculateNetAssets(
  portfolioValue: number,
  cashBalance: number,
  receivables: number = 0,
  liabilities: number = 0,
  accruedFees: number = 0
): { totalAssets: number; totalLiabilities: number; netAssets: number } {
  const safePortfolio = Math.max(0, portfolioValue || 0);
  const safeCash = cashBalance || 0;
  const safeReceivables = Math.max(0, receivables || 0);
  const safeLiabilities = Math.max(0, liabilities || 0);
  const safeAccruedFees = Math.max(0, accruedFees || 0);

  const totalAssets = roundMoney(safePortfolio + safeCash + safeReceivables);
  const totalLiabilities = roundMoney(safeLiabilities + safeAccruedFees);
  const netAssets = roundMoney(totalAssets - totalLiabilities);

  return { totalAssets, totalLiabilities, netAssets };
}

/**
 * Calculates NAV Per Unit = Net Assets / Units Outstanding
 */
export function calculateNavPerUnit(
  netAssets: number,
  totalUnits: number,
  fallbackNav: number = 1.0000
): number {
  const safeUnits = Math.max(0, totalUnits || 0);
  if (safeUnits <= 0) {
    return roundNav(fallbackNav || 1.0000);
  }
  return roundNav(netAssets / safeUnits);
}

/**
 * Processes an investor subscription (BUY)
 */
export function calculateSubscription(
  subscriptionAmount: number,
  applicableNav: number,
  currentUnitsOwned: number = 0,
  currentTotalInvestment: number = 0
): SubscriptionResult {
  const safeAmount = Math.max(0, subscriptionAmount || 0);
  const nav = roundNav(applicableNav > 0 ? applicableNav : 1.0000);
  
  const unitsIssued = roundUnits(safeAmount / nav);
  const newUnitsOwned = roundUnits(currentUnitsOwned + unitsIssued);
  const newTotalInvestment = roundMoney(currentTotalInvestment + safeAmount);
  const newCurrentValue = roundMoney(newUnitsOwned * nav);

  return {
    unitsIssued,
    grossAmount: safeAmount,
    navPerUnit: nav,
    newUnitsOwned,
    newTotalInvestment,
    newCurrentValue
  };
}

/**
 * Processes an investor redemption (SELL) with pro-rata cost-basis reduction
 */
export function calculateRedemption(
  unitsToRedeem: number,
  currentUnitsOwned: number,
  currentTotalInvestment: number,
  applicableNav: number
): RedemptionResult {
  const safeUnitsToRedeem = Math.max(0, unitsToRedeem || 0);
  const safeUnitsOwned = Math.max(0, currentUnitsOwned || 0);
  const safeTotalInvestment = Math.max(0, currentTotalInvestment || 0);
  const nav = roundNav(applicableNav > 0 ? applicableNav : 1.0000);

  if (safeUnitsToRedeem > safeUnitsOwned && safeUnitsOwned > 0) {
    throw new Error(`Cannot redeem ${safeUnitsToRedeem} units; investor only owns ${safeUnitsOwned} units.`);
  }

  const grossProceeds = roundMoney(safeUnitsToRedeem * nav);
  
  // Pro-rata cost basis reduction calculation
  let costBasisReduction = 0;
  if (safeUnitsOwned > 0) {
    const fractionRedeemed = Math.min(1, safeUnitsToRedeem / safeUnitsOwned);
    costBasisReduction = roundMoney(safeTotalInvestment * fractionRedeemed);
  }

  const realizedGainLoss = roundMoney(grossProceeds - costBasisReduction);
  const remainingUnitsOwned = roundUnits(Math.max(0, safeUnitsOwned - safeUnitsToRedeem));
  const remainingTotalInvestment = roundMoney(Math.max(0, safeTotalInvestment - costBasisReduction));
  const remainingCurrentValue = roundMoney(remainingUnitsOwned * nav);

  return {
    unitsRedeemed: safeUnitsToRedeem,
    navPerUnit: nav,
    grossProceeds,
    costBasisReduction,
    realizedGainLoss,
    remainingUnitsOwned,
    remainingTotalInvestment,
    remainingCurrentValue
  };
}

/**
 * Processes a portfolio asset disposal (SELL share/bond)
 */
export function calculateAssetDisposal(
  quantitySold: number,
  salePrice: number,
  currentQuantity: number,
  costBasisPerShare: number
): AssetDisposalResult {
  const safeQuantitySold = Math.max(0, quantitySold || 0);
  const safeCurrentQuantity = Math.max(0, currentQuantity || 0);
  const safeSalePrice = Math.max(0, salePrice || 0);
  const safeCostBasis = Math.max(0, costBasisPerShare || 0);

  if (safeQuantitySold > safeCurrentQuantity) {
    throw new Error(`Cannot sell ${safeQuantitySold} shares; fund only holds ${safeCurrentQuantity} shares.`);
  }

  const saleProceeds = roundMoney(safeQuantitySold * safeSalePrice);
  const costBasisOfSold = roundMoney(safeQuantitySold * safeCostBasis);
  const realizedGainLoss = roundMoney(saleProceeds - costBasisOfSold);
  const remainingQuantity = roundUnits(Math.max(0, safeCurrentQuantity - safeQuantitySold));
  const remainingMarketValue = roundMoney(remainingQuantity * safeSalePrice);

  return {
    quantitySold: safeQuantitySold,
    salePrice: safeSalePrice,
    saleProceeds,
    costBasisOfSold,
    realizedGainLoss,
    remainingQuantity,
    remainingMarketValue
  };
}

/**
 * Reconciles the state of a fund against portfolio holdings and investor balances
 */
export function reconcileFundState(
  account: InvestmentAccount,
  assets: Asset[],
  investors: Investor[]
): FundReconciliation {
  const accountAssets = assets.filter(a => a.accountId === account.id);
  const accountInvestors = investors.filter(i => i.accountId === account.id);

  // 1. Calculate Portfolio Value
  const portfolioValue = accountAssets.reduce((sum, a) => sum + (a.marketValue || 0), 0);

  // 2. Compute Net Assets
  const { netAssets } = calculateNetAssets(
    portfolioValue,
    account.cashBalance || 0,
    account.receivables || 0,
    account.liabilities || 0,
    account.accruedFees || 0
  );

  // 3. Sum Investor Units
  const totalInvestorUnits = roundUnits(
    accountInvestors.reduce((sum, i) => sum + (i.unitsOwned || 0), 0)
  );

  const fundTotalUnits = roundUnits(account.totalUnits || 0);
  const unitsDifference = roundUnits(totalInvestorUnits - fundTotalUnits);

  // 4. Compute NAV
  const effectiveUnits = totalInvestorUnits > 0 ? totalInvestorUnits : fundTotalUnits;
  const calculatedNav = calculateNavPerUnit(netAssets, effectiveUnits, account.nav || 1.0000);
  const reportedNav = roundNav(account.nav || 1.0000);
  const navDifference = roundNav(calculatedNav - reportedNav);

  const reportedAum = roundMoney(account.aum || 0);
  const aumDifference = roundMoney(netAssets - reportedAum);

  const discrepancies: string[] = [];

  if (Math.abs(unitsDifference) > 0.0001) {
    discrepancies.push(
      `Unit Mismatch: Sum of investor units (${totalInvestorUnits}) != Fund total units (${fundTotalUnits}) [Diff: ${unitsDifference}]`
    );
  }

  if (Math.abs(navDifference) > 0.0001) {
    discrepancies.push(
      `NAV Mismatch: Calculated NAV (${calculatedNav.toFixed(4)}) != Published NAV (${reportedNav.toFixed(4)}) [Diff: ${navDifference.toFixed(4)}]`
    );
  }

  if (Math.abs(aumDifference) > 0.01) {
    discrepancies.push(
      `Net Assets Mismatch: Calculated Net Assets (GH₵${netAssets.toLocaleString()}) != Reported AUM (GH₵${reportedAum.toLocaleString()})`
    );
  }

  const isBalanced = discrepancies.length === 0;

  return {
    isBalanced,
    totalInvestorUnits,
    fundTotalUnits,
    unitsDifference,
    calculatedNetAssets: netAssets,
    reportedAum,
    aumDifference,
    calculatedNav,
    reportedNav,
    navDifference,
    discrepancies
  };
}
