import { collection, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp, query, where, deleteDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchGSEPrices } from '../lib/gemini';
import { syncRealtimeAFXPrices } from './afxSyncService';
import { 
  Asset, 
  InvestmentAccount, 
  Valuation, 
  PriceStatus, 
  ValuationException, 
  ValuationNavBridge, 
  ValuationRun, 
  FeeAccrualConfig,
  Investor
} from '../types';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { calculateNetAssets, calculateNavPerUnit, roundMoney, roundNav } from './fundAccountingEngine';

// Default Fee Configuration: 1.50% Management Fee, 0.25% Custody Fee p.a.
export const DEFAULT_FEE_CONFIG: FeeAccrualConfig = {
  managementFeeRatePct: 1.50,
  custodyFeeRatePct: 0.25,
  adminFeeRatePct: 0.10
};

/**
 * Asset Price Status & Stale Price Detection Engine
 * Evaluates pricing freshness and assigns PriceStatus flags.
 */
export interface AssetPriceStatusDetail {
  assetId: string;
  ticker: string;
  name: string;
  currentPrice: number;
  marketValue: number;
  status: PriceStatus;
  daysStale: number;
  warningMessage?: string;
}

export function resolveAssetPriceStatuses(
  assets: Asset[],
  staleThresholdDays: number = 7,
  targetDateStr: string = new Date().toISOString()
): AssetPriceStatusDetail[] {
  const targetTime = new Date(targetDateStr).getTime();

  return assets.map(asset => {
    const priceDate = asset.valuationDate ? new Date(asset.valuationDate).getTime() : 0;
    const diffMs = priceDate > 0 ? Math.max(0, targetTime - priceDate) : Infinity;
    const daysStale = diffMs === Infinity ? 999 : Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let status: PriceStatus = 'PRICED';
    let warningMessage: string | undefined = undefined;

    if (!asset.currentPrice || asset.currentPrice <= 0) {
      status = 'MISSING';
      warningMessage = `No valuation price recorded for ${asset.ticker}`;
    } else if (daysStale > staleThresholdDays) {
      status = 'STALE';
      warningMessage = `Price date (${asset.valuationDate?.split('T')[0] || 'Unknown'}) is ${daysStale} days old (exceeds ${staleThresholdDays}-day threshold)`;
    } else if (asset.recordedAt && asset.recordedAt === asset.valuationDate) {
      status = 'MANUAL';
    }

    return {
      assetId: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      currentPrice: asset.currentPrice,
      marketValue: asset.marketValue,
      status,
      daysStale: daysStale === 999 ? 0 : daysStale,
      warningMessage
    };
  });
}

/**
 * Daily Expense & Fee Accruals Engine
 * Computes daily accruals for fund management, custody, and operating fees.
 */
export function calculateDailyFeeAccruals(
  netAssets: number,
  feeConfig: FeeAccrualConfig = DEFAULT_FEE_CONFIG
): {
  dailyManagementFee: number;
  dailyCustodyFee: number;
  dailyAdminFee: number;
  totalDailyAccrual: number;
} {
  const safeNetAssets = Math.max(0, netAssets || 0);

  const dailyManagementFee = roundMoney((safeNetAssets * (feeConfig.managementFeeRatePct / 100)) / 365);
  const dailyCustodyFee = roundMoney((safeNetAssets * (feeConfig.custodyFeeRatePct / 100)) / 365);
  const dailyAdminFee = roundMoney((safeNetAssets * (feeConfig.adminFeeRatePct / 100)) / 365);
  const totalDailyAccrual = roundMoney(dailyManagementFee + dailyCustodyFee + dailyAdminFee);

  return {
    dailyManagementFee,
    dailyCustodyFee,
    dailyAdminFee,
    totalDailyAccrual
  };
}

/**
 * Valuation Exception & Anomaly Detector
 */
export function detectValuationExceptions(
  account: InvestmentAccount,
  assets: Asset[],
  investors: Investor[],
  previousNav: number = 1.0000,
  currentCalculatedNav: number = 1.0000
): ValuationException[] {
  const exceptions: ValuationException[] = [];

  // 1. Missing & Stale Asset Prices
  const priceStatuses = resolveAssetPriceStatuses(assets);
  priceStatuses.forEach(ps => {
    if (ps.status === 'MISSING') {
      exceptions.push({
        id: `EXC-PRICE-MISSING-${ps.ticker}-${Date.now()}`,
        code: 'MISSING_PRICE',
        severity: 'CRITICAL',
        description: `Missing valuation price for asset ${ps.ticker} (${ps.name}).`,
        item: ps.ticker,
        recommendedAction: 'Input official market closing price or approved valuation price before final publishing.',
        status: 'OPEN'
      });
    } else if (ps.status === 'STALE') {
      exceptions.push({
        id: `EXC-PRICE-STALE-${ps.ticker}-${Date.now()}`,
        code: 'STALE_PRICE',
        severity: 'WARNING',
        description: ps.warningMessage || `Stale price for asset ${ps.ticker}.`,
        item: ps.ticker,
        recommendedAction: 'Refresh pricing from stock exchange or pricing source.',
        status: 'OPEN'
      });
    }
  });

  // 2. Negative Cash Check
  if ((account.cashBalance || 0) < 0) {
    exceptions.push({
      id: `EXC-CASH-NEG-${Date.now()}`,
      code: 'NEGATIVE_CASH',
      severity: 'CRITICAL',
      description: `Fund cash balance is negative (${roundMoney(account.cashBalance || 0).toLocaleString()} GHS).`,
      item: 'Fund Cash Account',
      recommendedAction: 'Inject capital or reconcile cash ledger before publishing NAV.',
      status: 'OPEN'
    });
  }

  // 3. Unit Reconciliation Mismatch
  const accountInvestors = investors.filter(i => i.accountId === account.id);
  const totalInvestorUnits = accountInvestors.reduce((sum, i) => sum + (i.unitsOwned || 0), 0);
  const fundUnits = account.totalUnits || 0;
  if (Math.abs(totalInvestorUnits - fundUnits) > 0.0001) {
    exceptions.push({
      id: `EXC-UNITS-MISMATCH-${Date.now()}`,
      code: 'UNIT_MISMATCH',
      severity: 'CRITICAL',
      description: `Unit balance mismatch: Sum of investor units (${totalInvestorUnits.toLocaleString()}) != Fund total units (${fundUnits.toLocaleString()}).`,
      item: 'Unit Ledger',
      recommendedAction: 'Run unit ledger reconciliation to align investor unit registry with fund master units.',
      status: 'OPEN'
    });
  }

  // 4. Large NAV Movement Anomaly Detection (>10% shift)
  if (previousNav > 0 && currentCalculatedNav > 0) {
    const pctChange = Math.abs((currentCalculatedNav - previousNav) / previousNav) * 100;
    if (pctChange > 10.0) {
      exceptions.push({
        id: `EXC-NAV-SHIFT-${Date.now()}`,
        code: 'LARGE_NAV_MOVEMENT',
        severity: 'WARNING',
        description: `Unusually large NAV movement: NAV changed by ${pctChange.toFixed(2)}% (from GH₵${previousNav.toFixed(4)} to GH₵${currentCalculatedNav.toFixed(4)}).`,
        item: 'NAV Per Unit',
        recommendedAction: 'Verify asset valuations and transactions for material anomalies before publishing.',
        status: 'OPEN'
      });
    }
  }

  return exceptions;
}

/**
 * NAV Bridge Decomposition Engine
 * Breaks down movement from Previous NAV to Closing NAV.
 */
export function calculateNavBridge(
  previousNav: number,
  closingNav: number,
  portfolioGainValue: number,
  realizedGainValue: number,
  accruedFeesValue: number,
  netCashFlowValue: number,
  unitsOutstanding: number
): ValuationNavBridge {
  const safeUnits = Math.max(1, unitsOutstanding || 1);

  const portfolioImpact = roundNav(portfolioGainValue / safeUnits);
  const realizedGainImpact = roundNav(realizedGainValue / safeUnits);
  const expenseImpact = roundNav(-Math.abs(accruedFeesValue) / safeUnits);
  const incomeImpact = 0; // Derived if explicit income is logged
  const netCashFlowImpact = roundNav(netCashFlowValue / safeUnits);

  return {
    previousNav: roundNav(previousNav),
    portfolioMovement: portfolioImpact,
    realizedGainMovement: realizedGainImpact,
    incomeMovement: incomeImpact,
    expenseMovement: expenseImpact,
    netCashFlowMovement: netCashFlowImpact,
    closingNav: roundNav(closingNav)
  };
}

export const runGlobalValuation = async () => {
  try {
    // 1. Fetch all accounts
    const accountsSnapshot = await getDocs(collection(db, 'accounts'));
    const accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvestmentAccount));

    // 2. Fetch all assets
    const assetsSnapshot = await getDocs(collection(db, 'portfolio'));
    const allAssets = assetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));

    // 3. Get unique tickers & attempt to fetch prices from AFX Kwayisi Realtime Sync
    const tickers = Array.from(new Set(allAssets.map(a => a.ticker).filter(Boolean)));
    let prices: Record<string, number> = {};
    if (tickers.length > 0) {
      try {
        const afxRes = await syncRealtimeAFXPrices(tickers);
        if (afxRes.success && afxRes.prices) {
          Object.entries(afxRes.prices).forEach(([tk, stockData]) => {
            if (stockData.price > 0) {
              prices[tk] = stockData.price;
            }
          });
        }
      } catch (e) {
        console.warn("Automated market price fetch error (continuing with existing values):", e);
      }
    }

    // 4. Update assets and group by account
    const accountTotals: Record<string, number> = {};
    
    for (const asset of allAssets) {
      const newPrice = (prices[asset.ticker] && prices[asset.ticker] > 0) ? prices[asset.ticker] : asset.currentPrice;
      const newMarketValue = roundMoney(asset.quantity * newPrice);
      const totalCostBasis = asset.totalCostBasis || (asset.quantity * asset.costBasis);
      
      await updateDoc(doc(db, 'portfolio', asset.id), {
        currentPrice: newPrice,
        marketValue: newMarketValue,
        valuationDate: new Date().toISOString(),
        unrealizedGainLoss: roundMoney(newMarketValue - totalCostBasis)
      });

      if (asset.accountId) {
        accountTotals[asset.accountId] = (accountTotals[asset.accountId] || 0) + newMarketValue;
      }
    }

    // 5. Update accounts and investors
    for (const account of accounts) {
      // Calculate actual total units from investors
      const invQuery = query(collection(db, 'investors'), where('accountId', '==', account.id));
      const invSnap = await getDocs(invQuery);
      const actualTotalUnits = invSnap.docs.reduce((sum, d) => sum + (d.data().unitsOwned || 0), 0) || account.totalUnits || 0;

      const totalHoldingsValue = accountTotals[account.id] || 0;
      const { netAssets } = calculateNetAssets(
        totalHoldingsValue,
        account.cashBalance || 0,
        account.receivables || 0,
        account.liabilities || 0,
        account.accruedFees || 0
      );

      let calculatedNAV = calculateNavPerUnit(netAssets, actualTotalUnits, account.nav);
      if (totalHoldingsValue === 0 && (account.cashBalance || 0) <= 0 && account.nav > 0) {
        calculatedNAV = account.nav;
      }

      const totalAum = netAssets;

      try {
        await updateDoc(doc(db, 'accounts', account.id), {
          aum: totalAum,
          nav: calculatedNAV,
          totalUnits: actualTotalUnits,
          lastValuationDate: new Date().toISOString()
        });

        // Log valuation
        await addDoc(collection(db, 'valuations'), {
          accountId: account.id,
          date: serverTimestamp(),
          nav: calculatedNAV,
          aum: totalAum,
          notes: 'Automated Market Valuation'
        });
      } catch (innerError) {
        handleFirestoreError(innerError, OperationType.WRITE, `accounts/${account.id}/valuation`);
      }
    }

    console.log("Global valuation completed successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('JSON')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'global_valuation_process');
  }
};

export const runManualValuation = async (
  accountId: string, 
  manualGain: number, 
  notes?: string, 
  valuationDate?: string,
  assetUpdate?: { id: string; newPrice: number },
  targetNav?: number
) => {
  try {
    const accountRef = doc(db, 'accounts', accountId);
    const accountDoc = await getDoc(accountRef);
    if (!accountDoc.exists()) throw new Error(`Account ${accountId} not found`);
    const account = { id: accountDoc.id, ...accountDoc.data() } as InvestmentAccount;

    // 1. Calculate actual total units directly from investors
    const invQuery = query(collection(db, 'investors'), where('accountId', '==', accountId));
    const invSnap = await getDocs(invQuery);
    const actualTotalUnits = invSnap.docs.reduce((sum, d) => sum + (d.data().unitsOwned || 0), 0) || account.totalUnits || 0;

    // 2. Handle single asset price update if specified
    if (assetUpdate) {
      const assetRef = doc(db, 'portfolio', assetUpdate.id);
      const assetDoc = await getDoc(assetRef);
      if (assetDoc.exists()) {
        const assetData = assetDoc.data() as Asset;
        const newMarketValue = assetData.quantity * assetUpdate.newPrice;
        const totalCostBasis = assetData.totalCostBasis || (assetData.quantity * assetData.costBasis);
        
        await updateDoc(assetRef, {
          currentPrice: assetUpdate.newPrice,
          marketValue: newMarketValue,
          valuationDate: new Date().toISOString(),
          unrealizedGainLoss: newMarketValue - totalCostBasis
        });

        await addDoc(collection(db, 'asset_valuations'), {
          assetId: assetUpdate.id,
          accountId: accountId,
          ticker: assetData.ticker,
          price: assetUpdate.newPrice,
          marketValue: newMarketValue,
          timestamp: serverTimestamp(),
          notes: notes || 'Manual Asset Price Adjustment'
        });
      }
    }

    // 3. Fetch fresh portfolio assets for this account
    const assetsSnapshot = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accountId)));
    const assets = assetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));

    let portfolioValue = assets.reduce((sum, a) => sum + (a.marketValue || 0), 0);
    let totalAum = portfolioValue + (account.cashBalance || 0) + manualGain;
    let finalNav = actualTotalUnits > 0 ? totalAum / actualTotalUnits : account.nav;

    if (targetNav !== undefined && targetNav > 0) {
      finalNav = targetNav;
      totalAum = actualTotalUnits > 0 ? actualTotalUnits * targetNav : (portfolioValue + (account.cashBalance || 0) + manualGain);

      // Proportionally update portfolio assets so asset values align with published NAV & AUM
      const targetPortfolioValue = totalAum - (account.cashBalance || 0);
      if (assets.length > 0 && portfolioValue > 0 && targetPortfolioValue > 0) {
        const ratio = targetPortfolioValue / portfolioValue;
        const portfolioUpdates = assets.map(asset => {
          const newMarketVal = asset.marketValue * ratio;
          const newPrice = asset.quantity > 0 ? newMarketVal / asset.quantity : asset.currentPrice;
          const totalCostBasis = asset.totalCostBasis || (asset.quantity * asset.costBasis);
          return updateDoc(doc(db, 'portfolio', asset.id), {
            currentPrice: newPrice,
            marketValue: newMarketVal,
            valuationDate: new Date().toISOString(),
            unrealizedGainLoss: newMarketVal - totalCostBasis
          });
        });
        await Promise.all(portfolioUpdates);
      }
    }

    const effectiveDate = valuationDate ? new Date(valuationDate).toISOString() : new Date().toISOString();

    // 4. Update Account in Firestore
    await updateDoc(accountRef, {
      aum: totalAum,
      nav: finalNav,
      totalUnits: actualTotalUnits,
      lastValuationDate: effectiveDate
    });

    // 6. Log Valuation Entry in Firestore
    await addDoc(collection(db, 'valuations'), {
      accountId,
      date: serverTimestamp(),
      nav: finalNav,
      aum: totalAum,
      notes: notes || `Valuation Published (NAV: GH₵${finalNav.toFixed(4)})`
    });

    return { nav: finalNav, aum: totalAum };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'manual_valuation');
    throw error;
  }
};

export const deleteLatestValuation = async (accountId: string, valuationId: string, previousValuation?: Valuation) => {
  console.info(`Starting Undo: Account ${accountId}, Valuation ${valuationId}`);
  try {
    const valRef = doc(db, 'valuations', valuationId);
    const valSnap = await getDoc(valRef);
    
    if (valSnap.exists()) {
      const valData = valSnap.data();
      console.info('Archiving valuation to reverted_valuations...');
      await addDoc(collection(db, 'reverted_valuations'), {
        ...valData,
        originalId: valuationId,
        revertedAt: serverTimestamp(),
        accountId
      });

      console.info('Deleting valuation record...');
      await deleteDoc(valRef);
    } else {
      console.warn('Valuation document already gone, skipping delete/archive.');
    }

    const accountRef = doc(db, 'accounts', accountId);
    let targetNav = 1.0000;
    let targetAum = 0;
    let targetDate: string | null = null;

    if (previousValuation) {
      console.info('Reverting account state to previous valuation...');
      targetNav = previousValuation.nav;
      targetAum = previousValuation.aum;
      targetDate = previousValuation.date?.seconds 
        ? new Date(previousValuation.date.seconds * 1000).toISOString() 
        : new Date().toISOString();
    } else {
      console.info('No previous history found. Resetting account to base values.');
    }

    await updateDoc(accountRef, {
      nav: targetNav,
      aum: targetAum,
      lastValuationDate: targetDate
    });

    // 6. Revert Portfolio Performance (approximated or reset if needed)
    // Since we don't store historical prices per asset in the valuation doc,
    // we can't perfectly revert prices. However, if targetNav is 1.0, we reset cost basis.
    if (!previousValuation) {
      console.info('Resetting portfolio to cost basis (no previous history)...');
      const assetQuery = query(collection(db, 'portfolio'), where('accountId', '==', accountId));
      const assetSnap = await getDocs(assetQuery);
      const assetResets = assetSnap.docs.map(d => {
        const data = d.data();
        return updateDoc(doc(db, 'portfolio', d.id), {
          marketValue: data.costBasis || 0,
          currentPrice: (data.quantity > 0) ? (data.costBasis / data.quantity) : (data.currentPrice || 0)
        });
      });
      await Promise.all(assetResets);
    }

    console.info('Undo completed successfully.');
  } catch (error) {
    console.error('Undo failure details:', error);
    handleFirestoreError(error, OperationType.DELETE, 'valuation_undo');
    throw error;
  }
};

export const revertAssetValuation = async (assetId: string, valuationId: string) => {
  try {
    // 1. Get the valuation to revert (the one we are undoing)
    const valRef = doc(db, 'asset_valuations', valuationId);
    const valSnap = await getDoc(valRef);
    if (!valSnap.exists()) throw new Error("Valuation record not found");
    const valToUndo = valSnap.data() as any;
    const accountId = valToUndo.accountId;

    // 2. Find the previous valuation for this asset (the one to restore)
    const q = query(
      collection(db, 'asset_valuations'),
      where('assetId', '==', assetId),
      where('timestamp', '<', valToUndo.timestamp)
    );
    const snapshot = await getDocs(q);
    const previousValuations = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    const assetRef = doc(db, 'portfolio', assetId);
    const assetSnap = await getDoc(assetRef);
    if (!assetSnap.exists()) throw new Error("Asset not found");
    const asset = assetSnap.data() as Asset;

    let restoredPrice = asset.costBasis;
    if (previousValuations.length > 0) {
      restoredPrice = previousValuations[0].price;
    }

    const restoredMarketValue = asset.quantity * restoredPrice;
    const totalCostBasis = asset.totalCostBasis || (asset.quantity * asset.costBasis);

    // 3. Update the asset
    await updateDoc(assetRef, {
      currentPrice: restoredPrice,
      marketValue: restoredMarketValue,
      valuationDate: new Date().toISOString(),
      unrealizedGainLoss: restoredMarketValue - totalCostBasis
    });

    // 4. Archive/Delete the valuation we are undoing
    await addDoc(collection(db, 'reverted_asset_valuations'), {
      ...valToUndo,
      revertedAt: serverTimestamp()
    });
    await deleteDoc(valRef);

    // 5. Recalculate Fund NAV
    // Fetch all assets in account
    const assetsSnapshot = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accountId)));
    const allAssets = assetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
    
    const accountRef = doc(db, 'accounts', accountId);
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) return;
    const account = accountSnap.data() as InvestmentAccount;

    const portfolioValue = allAssets.reduce((sum, a) => sum + (a.marketValue || 0), 0);
    const totalAum = portfolioValue + (account.cashBalance || 0);
    const finalNav = account.totalUnits > 0 ? totalAum / account.totalUnits : account.nav;

    await updateDoc(accountRef, {
      aum: totalAum,
      nav: finalNav,
      lastValuationDate: new Date().toISOString()
    });

    // 7. Log account level valuation change
    await addDoc(collection(db, 'valuations'), {
      accountId,
      date: serverTimestamp(),
      nav: finalNav,
      aum: totalAum,
      notes: `Asset ${valToUndo.ticker} Valuation Reversed`
    });

    return { nav: finalNav, aum: totalAum };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'revert_asset_valuation');
    throw error;
  }
};

export const recalculateAccountValuation = async (accountId: string) => {
  try {
    const accountRef = doc(db, 'accounts', accountId);
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) return;
    const account = { id: accountSnap.id, ...accountSnap.data() } as InvestmentAccount;

    const assetsSnapshot = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accountId)));
    const allAssets = assetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));

    const totalHoldingsValue = allAssets.reduce((sum, a) => sum + (a.marketValue || 0), 0);
    const manualAdj = account.manualNavAdjustment || 0;

    const { netAssets } = calculateNetAssets(
      totalHoldingsValue + manualAdj,
      account.cashBalance || 0,
      account.receivables || 0,
      account.liabilities || 0,
      account.accruedFees || 0
    );
    
    // Check total investor units
    const invQuery = query(collection(db, 'investors'), where('accountId', '==', accountId));
    const invSnap = await getDocs(invQuery);
    const actualTotalUnits = invSnap.docs.reduce((sum, d) => sum + (d.data().unitsOwned || 0), 0) || account.totalUnits || 0;

    const isManual = (account as any).lastValuationMethod === 'manual' || (account as any).isManualNav === true;
    const calculatedNAV = isManual && account.nav > 0 
      ? account.nav 
      : calculateNavPerUnit(netAssets, actualTotalUnits, account.nav);

    const calculatedAum = netAssets;

    await updateDoc(accountRef, {
      aum: calculatedAum,
      nav: calculatedNAV,
      totalUnits: actualTotalUnits,
      lastValuationDate: new Date().toISOString()
    });

    // Filter out old valuation logs for today if we want to avoid spam, but usually logging is good
    await addDoc(collection(db, 'valuations'), {
      accountId: accountId,
      date: serverTimestamp(),
      nav: calculatedNAV,
      aum: calculatedAum,
      notes: 'Manual Portfolio Change Recalculation'
    });

    return { aum: calculatedAum, nav: calculatedNAV };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `accounts/${accountId}/recalculate`);
    throw error;
  }
};

export const redoLatestValuation = async (accountId: string) => {
  try {
    // 1. Find the latest reverted valuation for this account
    const q = query(
      collection(db, 'reverted_valuations'),
      where('accountId', '==', accountId)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    // Manual sort because composite index might not be ready
    const reverted = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => (b.revertedAt?.seconds || 0) - (a.revertedAt?.seconds || 0));

    const latestReverted = reverted[0] as any;

    // 2. Re-add to valuations
    await addDoc(collection(db, 'valuations'), {
      accountId: latestReverted.accountId,
      date: serverTimestamp(), // New date for redo
      nav: latestReverted.nav,
      aum: latestReverted.aum,
      notes: latestReverted.notes ? `${latestReverted.notes} (Redone)` : 'Redone Valuation'
    });

    // 3. Update account
    const accountRef = doc(db, 'accounts', accountId);
    await updateDoc(accountRef, {
      nav: latestReverted.nav,
      aum: latestReverted.aum,
      lastValuationDate: new Date().toISOString()
    });

    // 4. Remove from reverted
    await deleteDoc(doc(db, 'reverted_valuations', latestReverted.id));

    return { nav: latestReverted.nav, aum: latestReverted.aum };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'valuation_redo');
    throw error;
  }
};

export const resetAllValuations = async (accountId: string) => {
  console.info(`Starting Full Reset for Account ${accountId}`);
  try {
    const valQuery = query(collection(db, 'valuations'), where('accountId', '==', accountId));
    const valSnap = await getDocs(valQuery);
    console.info(`Found ${valSnap.size} valuation records to delete.`);
    
    // Batch delete would be better but loops are safer for this small set in simple mode
    const deletions = valSnap.docs.map(d => deleteDoc(doc(db, 'valuations', d.id)));
    await Promise.all(deletions);

    const revQuery = query(collection(db, 'reverted_valuations'), where('accountId', '==', accountId));
    const revSnap = await getDocs(revQuery);
    console.info(`Found ${revSnap.size} reverted records to delete.`);
    
    const revDeletions = revSnap.docs.map(d => deleteDoc(doc(db, 'reverted_valuations', d.id)));
    await Promise.all(revDeletions);

    console.info('Resetting account master state...');
    const accountRef = doc(db, 'accounts', accountId);
    const accountSnap = await getDoc(accountRef);
    const accountData = accountSnap.data() as InvestmentAccount;
    const totalUnits = accountData?.totalUnits || 0;

    await updateDoc(accountRef, {
      nav: 1.0000,
      aum: totalUnits, // AUM must equal totalUnits for NAV to be 1.0
      lastValuationDate: null
    });

    // 4. Reset Investors Performance
    console.info('Resetting investor performance...');
    const invQuery = query(collection(db, 'investors'), where('accountId', '==', accountId));
    const invSnap = await getDocs(invQuery);
    const investorResets = invSnap.docs.map(d => {
      const data = d.data();
      const units = data.unitsOwned || 0;
      return updateDoc(doc(db, 'investors', d.id), {
        currentValue: units,
        totalInvestment: units // Reset cost basis to match units at NAV 1.0
      });
    });
    await Promise.all(investorResets);

    // 5. Reset Portfolio Performance
    console.info('Resetting portfolio performance...');
    const assetQuery = query(collection(db, 'portfolio'), where('accountId', '==', accountId));
    const assetSnap = await getDocs(assetQuery);
    const assetResets = assetSnap.docs.map(d => {
      const data = d.data();
      const costBasis = data.costBasis || 0;
      const quantity = data.quantity || 1;
      return updateDoc(doc(db, 'portfolio', d.id), {
        marketValue: costBasis,
        currentPrice: quantity > 0 ? costBasis / quantity : 0
      });
    });
    await Promise.all(assetResets);

    console.info('Reset completed successfully.');
  } catch (error) {
    console.error('Reset failure details:', error);
    handleFirestoreError(error, OperationType.DELETE, 'valuation_reset');
    throw error;
  }
};

export const resetToMagicPerformance = async (accountId: string) => {
  console.info(`Starting Magic Reset for Account ${accountId} (Target NAV: 0.1190)`);
  try {
    const accountRef = doc(db, 'accounts', accountId);
    const accountSnap = await getDoc(accountRef);
    const accountData = accountSnap.data() as InvestmentAccount;
    const totalUnits = accountData?.totalUnits || 0;

    // To get NAV 0.1190, AUM must be totalUnits * 0.1190
    const targetNav = 0.1190;
    const targetAum = totalUnits * targetNav;

    await updateDoc(accountRef, {
      nav: targetNav,
      aum: targetAum,
      lastValuationDate: new Date().toISOString()
    });

    // Reset Investors
    const invQuery = query(collection(db, 'investors'), where('accountId', '==', accountId));
    const invSnap = await getDocs(invQuery);
    const investorUpdates = invSnap.docs.map(d => {
      const data = d.data();
      const units = data.unitsOwned || 0;
      return updateDoc(doc(db, 'investors', d.id), {
        currentValue: units * targetNav,
        totalInvestment: units * 0.10 // Force cost basis to 0.10 to ensure 19% gain
      });
    });
    await Promise.all(investorUpdates);

    // Update transactions to match 0.10 price if they are BUYs
    const transQuery = query(collection(db, 'transactions'), where('accountId', '==', accountId), where('type', '==', 'BUY'));
    const transSnap = await getDocs(transQuery);
    const transUpdates = transSnap.docs.map(d => {
      const data = d.data();
      return updateDoc(doc(db, 'transactions', d.id), {
        pricePerUnit: 0.10,
        totalAmount: data.units * 0.10
      });
    });
    await Promise.all(transUpdates);

    // Add a valuation log
    await addDoc(collection(db, 'valuations'), {
      accountId,
      date: serverTimestamp(),
      nav: targetNav,
      aum: targetAum,
      notes: 'Magic Reset to 19% Performance'
    });

    console.info('Magic Reset completed successfully.');
  } catch (error) {
    console.error('Magic Reset failure details:', error);
    handleFirestoreError(error, OperationType.WRITE, 'magic_reset');
    throw error;
  }
};

export const reconcileAccountCash = async (accountId: string, amount: number) => {
  try {
    const accountRef = doc(db, 'accounts', accountId);
    await updateDoc(accountRef, {
      cashBalance: increment(amount)
    });
    
    // Log the reconciliation as a system transaction
    await addDoc(collection(db, 'transactions'), {
      accountId,
      type: 'BUY',
      totalAmount: amount,
      units: 0, // Administrative funding
      pricePerUnit: 0,
      timestamp: new Date().toISOString(),
      notes: 'Administrative Cash Reconciliation / Capital Injection',
      investorId: 'SYSTEM'
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'reconcile_cash');
    throw error;
  }
};

/**
 * Executes a Formal Valuation Run (`VAL-YYYY-MM-DD-001`)
 * Generates an auditable, reproducible ValuationRun snapshot.
 */
export const executeFormalValuationRun = async (
  accountId: string,
  valuationDateStr: string = new Date().toISOString().split('T')[0],
  preparedBy: string = 'System Admin',
  feeConfig: FeeAccrualConfig = DEFAULT_FEE_CONFIG,
  manualGain: number = 0,
  notes?: string
): Promise<ValuationRun> => {
  try {
    const accountRef = doc(db, 'accounts', accountId);
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) throw new Error(`Account ${accountId} not found`);
    const account = { id: accountSnap.id, ...accountSnap.data() } as InvestmentAccount;

    // Fetch Assets
    const assetsSnap = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accountId)));
    const assets = assetsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Asset));

    // Fetch Investors
    const invSnap = await getDocs(query(collection(db, 'investors'), where('accountId', '==', accountId)));
    const investors = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Investor));
    const totalUnits = investors.reduce((sum, i) => sum + (i.unitsOwned || 0), 0) || account.totalUnits || 0;

    const portfolioValue = roundMoney(assets.reduce((sum, a) => sum + (a.marketValue || 0), 0) + manualGain);
    const cashBalance = roundMoney(account.cashBalance || 0);
    const receivables = roundMoney(account.receivables || 0);
    const operatingLiabilities = roundMoney(account.liabilities || 0);

    // Calculate Net Assets before daily fee accrual
    const grossNetAssets = portfolioValue + cashBalance + receivables - operatingLiabilities;

    // Calculate Daily Fee Accrual
    const feeAccruals = calculateDailyFeeAccruals(grossNetAssets, feeConfig);
    const accruedFees = roundMoney((account.accruedFees || 0) + feeAccruals.totalDailyAccrual);

    const { totalAssets, totalLiabilities, netAssets } = calculateNetAssets(
      portfolioValue,
      cashBalance,
      receivables,
      operatingLiabilities,
      accruedFees
    );

    const calculatedNav = calculateNavPerUnit(netAssets, totalUnits, account.nav || 1.0000);

    // Detect Valuation Exceptions & Anomalies
    const exceptions = detectValuationExceptions(account, assets, investors, account.nav || 1.0000, calculatedNav);

    // Calculate NAV Bridge
    const navBridge = calculateNavBridge(
      account.nav || 1.0000,
      calculatedNav,
      portfolioValue - assets.reduce((sum, a) => sum + (a.totalCostBasis || 0), 0),
      0,
      feeAccruals.totalDailyAccrual,
      0,
      totalUnits
    );

    const runNumber = `VAL-${valuationDateStr}-${Math.floor(100 + Math.random() * 900)}`;

    const runData: ValuationRun = {
      id: runNumber,
      valuationNumber: runNumber,
      accountId: account.id,
      valuationDate: valuationDateStr,
      runTimestamp: new Date().toISOString(),
      status: exceptions.some(e => e.severity === 'CRITICAL') ? 'REVIEW' : 'DRAFT',
      portfolioValue,
      cashBalance,
      receivables,
      totalAssets,
      operatingLiabilities,
      accruedFees,
      totalLiabilities,
      netAssets,
      unitsOutstanding: totalUnits,
      navPerUnit: calculatedNav,
      navBridge,
      exceptions,
      preparedBy,
      notes: notes || `Valuation Run ${runNumber}`
    };

    // Save to valuation_runs collection
    await addDoc(collection(db, 'valuation_runs'), {
      ...runData,
      createdAt: serverTimestamp()
    });

    return runData;
  } catch (error) {
    console.error('Failed to execute formal valuation run:', error);
    handleFirestoreError(error, OperationType.WRITE, 'formal_valuation_run');
    throw error;
  }
};
