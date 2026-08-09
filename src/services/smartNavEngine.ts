import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Asset, AssetValuation, InvestmentAccount, Transaction, Valuation } from '../types';
import { safeDate, safeISODate, safeFormatDate, safeTimestamp } from '../lib/utils';

export interface SmartNavResult {
  nav: number;
  totalAum: number;
  totalUnits: number;
  assetBreakdown: Array<{
    ticker: string;
    name: string;
    quantity: number;
    priceAtDate: number;
    marketValueAtDate: number;
    source: string;
  }>;
  valuationSource: string;
  confidence: 'high' | 'medium' | 'fallback';
  asOfDate: string;
}

/**
 * Smartly evaluates an account's portfolio assets, historical valuation records, and investor units 
 * as of a specific date to compute the exact historical NAV (Price Per Unit).
 */
export async function calculateSmartNavForDate(
  accountId: string,
  targetDateInput: string | Date,
  options?: {
    account?: InvestmentAccount | null;
    assets?: Asset[];
    transactions?: Transaction[];
    valuations?: Valuation[];
  }
): Promise<SmartNavResult> {
  const targetIso = safeISODate(targetDateInput) || new Date().toISOString().split('T')[0];
  const targetDateObj = safeDate(targetDateInput) || new Date();
  targetDateObj.setHours(23, 59, 59, 999);
  const targetTimestamp = targetDateObj.getTime();

  // 1. Fetch or use provided assets
  let assets = options?.assets;
  if (!assets) {
    try {
      const snap = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accountId)));
      assets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
    } catch (e) {
      console.warn('Error querying portfolio for smart NAV calculation:', e);
      assets = [];
    }
  } else {
    assets = assets.filter(a => a.accountId === accountId);
  }

  // 2. Fetch or use provided valuations
  let valuations = options?.valuations;
  if (!valuations) {
    try {
      const snap = await getDocs(query(collection(db, 'valuations'), where('accountId', '==', accountId)));
      valuations = snap.docs.map(d => ({ id: d.id, ...d.data() } as Valuation));
    } catch (e) {
      console.warn('Error querying valuations for smart NAV calculation:', e);
      valuations = [];
    }
  } else {
    valuations = valuations.filter(v => v.accountId === accountId);
  }

  // 3. Fetch or use provided transactions
  let transactions = options?.transactions;
  if (!transactions) {
    try {
      const snap = await getDocs(query(collection(db, 'transactions'), where('accountId', '==', accountId)));
      transactions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
    } catch (e) {
      console.warn('Error querying transactions for smart NAV calculation:', e);
      transactions = [];
    }
  } else {
    transactions = transactions.filter(t => t.accountId === accountId);
  }

  // 4. Fetch asset valuation historical logs if possible
  let assetValuations: AssetValuation[] = [];
  try {
    const snap = await getDocs(query(collection(db, 'asset_valuations'), where('accountId', '==', accountId)));
    assetValuations = snap.docs.map(d => ({ id: d.id, ...d.data() } as AssetValuation));
  } catch {
    assetValuations = [];
  }

  // 5. Calculate Total Investor Units outstanding as of target date
  const txsUpToDate = transactions.filter(t => {
    const tTime = safeTimestamp(t.timestamp);
    return tTime > 0 && tTime <= targetTimestamp;
  });

  const totalUnitsAtDate = txsUpToDate.reduce((sum, t) => {
    if (t.type === 'BUY') return sum + (Number(t.units) || 0);
    if (t.type === 'SELL') return sum - (Number(t.units) || 0);
    return sum;
  }, 0);

  // 6. Evaluate Portfolio Asset Values as of target date
  const assetBreakdown: SmartNavResult['assetBreakdown'] = [];
  let totalPortfolioValueAtDate = 0;

  for (const asset of assets) {
    // Check asset acquisition date if available
    const acquiredTime = asset.recordedAt ? safeTimestamp(asset.recordedAt) : 0;
    if (acquiredTime > targetTimestamp) {
      // Asset was acquired AFTER the target date -> 0 value at target date
      continue;
    }

    // Look for closest historical asset valuation log on or before target date
    const historicalLogs = assetValuations
      .filter(av => av.assetId === asset.id || av.ticker === asset.ticker)
      .filter(av => safeTimestamp(av.timestamp) <= targetTimestamp)
      .sort((a, b) => safeTimestamp(b.timestamp) - safeTimestamp(a.timestamp));

    let priceAtDate = asset.currentPrice || asset.costBasis || 1.0;
    let priceSource = 'Current Price';

    if (historicalLogs.length > 0) {
      priceAtDate = historicalLogs[0].price;
      priceSource = `Asset Price Log (${safeFormatDate(historicalLogs[0].timestamp)})`;
    } else if (asset.costBasis && asset.costBasis > 0) {
      priceAtDate = asset.costBasis;
      priceSource = 'Cost Basis';
    }

    const marketValueAtDate = (asset.quantity || 0) * priceAtDate;
    totalPortfolioValueAtDate += marketValueAtDate;

    assetBreakdown.push({
      ticker: asset.ticker,
      name: asset.name,
      quantity: asset.quantity,
      priceAtDate,
      marketValueAtDate,
      source: priceSource
    });
  }

  // 7. Find nearest Valuation Log as of target date
  const sortedValuations = [...valuations]
    .filter(v => safeTimestamp(v.date) <= targetTimestamp)
    .sort((a, b) => safeTimestamp(b.date) - safeTimestamp(a.date));

  const closestValuationLog = sortedValuations[0] || null;

  // 8. Reconcile NAV & Portfolio
  let computedNav = 1.0000;
  let totalAum = 0;
  let valuationSource = '';
  let confidence: SmartNavResult['confidence'] = 'fallback';

  if (totalPortfolioValueAtDate > 0 && totalUnitsAtDate > 0) {
    // Method A: Direct Portfolio Assets Valuation / Investor Units Outstanding
    computedNav = totalPortfolioValueAtDate / totalUnitsAtDate;
    totalAum = totalPortfolioValueAtDate;
    valuationSource = `Portfolio Asset Reconstruction (${assetBreakdown.length} assets, GH₵${totalAum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AUM / ${totalUnitsAtDate.toLocaleString()} units)`;
    confidence = 'high';
  } else if (closestValuationLog && closestValuationLog.nav > 0) {
    // Method B: Closest Valuation Log Entry on or before target date
    computedNav = closestValuationLog.nav;
    totalAum = closestValuationLog.aum || (totalUnitsAtDate * computedNav);
    valuationSource = `Historical Account Valuation Log (${safeFormatDate(closestValuationLog.date)})`;
    confidence = 'medium';
  } else if (options?.account?.nav) {
    // Method C: Account Default NAV
    computedNav = options.account.nav;
    totalAum = options.account.aum || 0;
    valuationSource = `Account Baseline NAV (GH₵${computedNav.toFixed(4)})`;
    confidence = 'fallback';
  } else {
    computedNav = 1.0000;
    valuationSource = `Default Base NAV (GH₵1.0000)`;
    confidence = 'fallback';
  }

  return {
    nav: Number(computedNav.toFixed(4)),
    totalAum: Number(totalAum.toFixed(2)),
    totalUnits: Math.max(0, totalUnitsAtDate),
    assetBreakdown,
    valuationSource,
    confidence,
    asOfDate: targetIso
  };
}
