import { collection, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp, query, where, deleteDoc, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchGSEPrices } from '../lib/gemini';
import { Asset, InvestmentAccount, Valuation } from '../types';
import { handleFirestoreError, OperationType } from '../lib/utils';

export const runGlobalValuation = async () => {
  try {
    // 1. Fetch all accounts
    const accountsSnapshot = await getDocs(collection(db, 'accounts'));
    const accounts = accountsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InvestmentAccount));

    // 2. Fetch all assets
    const assetsSnapshot = await getDocs(collection(db, 'portfolio'));
    const allAssets = assetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));

    // 3. Get unique tickers
    const tickers = Array.from(new Set(allAssets.map(a => a.ticker)));
    if (tickers.length === 0) return;

    // 4. Fetch latest prices
    const prices = await fetchGSEPrices(tickers);
    if (!prices) return;

    // 5. Update assets and group by account
    const accountTotals: Record<string, number> = {};
    
    for (const asset of allAssets) {
      if (prices[asset.ticker]) {
        const newPrice = prices[asset.ticker];
        const newMarketValue = asset.quantity * newPrice;
        const totalCostBasis = asset.totalCostBasis || (asset.quantity * asset.costBasis);
        
        await updateDoc(doc(db, 'portfolio', asset.id), {
          currentPrice: newPrice,
          marketValue: newMarketValue,
          unrealizedGainLoss: newMarketValue - totalCostBasis
        });

        if (asset.accountId) {
          accountTotals[asset.accountId] = (accountTotals[asset.accountId] || 0) + newMarketValue;
        }
      }
    }

    // 6. Update accounts and investors
    for (const account of accounts) {
      const totalHoldingsValue = accountTotals[account.id] || 0;
      const totalMarketValue = totalHoldingsValue + (account.cashBalance || 0);
      const calculatedNAV = account.totalUnits > 0 ? totalMarketValue / account.totalUnits : account.nav;

      try {
        await updateDoc(doc(db, 'accounts', account.id), {
          aum: totalMarketValue,
          nav: calculatedNAV,
          lastValuationDate: new Date().toISOString()
        });

        // Update all investors for this account
        const invQuery = query(collection(db, 'investors'), where('accountId', '==', account.id));
        const invSnap = await getDocs(invQuery);
        const invUpdates = invSnap.docs.map(d => {
          const invData = d.data();
          return updateDoc(doc(db, 'investors', d.id), {
            currentValue: (invData.unitsOwned || 0) * calculatedNAV
          });
        });
        await Promise.all(invUpdates);

        // 7. Log valuation
        await addDoc(collection(db, 'valuations'), {
          accountId: account.id,
          date: serverTimestamp(),
          nav: calculatedNAV,
          aum: totalMarketValue,
          notes: 'Automated Real-time Valuation'
        });
      } catch (innerError) {
        handleFirestoreError(innerError, OperationType.WRITE, `accounts/${account.id}/valuation`);
      }
    }

    console.log("Global valuation completed successfully.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('JSON')) {
      throw error; // Re-throw if already formatted
    }
    handleFirestoreError(error, OperationType.WRITE, 'global_valuation_process');
  }
};

export const runManualValuation = async (
  accountId: string, 
  manualGain: number, 
  notes?: string, 
  valuationDate?: string,
  assetUpdate?: { id: string; newPrice: number }
) => {
  try {
    const accountRef = doc(db, 'accounts', accountId);
    
    // 1. Handle optional asset price update
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
          unrealizedGainLoss: newMarketValue - totalCostBasis
        });
      }
    }

    // 2. Fetch fresh assets (after potential update)
    const assetsSnapshot = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accountId)));
    const assets = assetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
    
    const accountDoc = await getDoc(accountRef);
    if (!accountDoc.exists()) return;
    const account = { id: accountDoc.id, ...accountDoc.data() } as InvestmentAccount;

    const portfolioValue = assets.reduce((sum, a) => sum + (a.marketValue || 0), 0);
    const totalAum = portfolioValue + (account.cashBalance || 0) + manualGain;
    const finalNav = account.totalUnits > 0 ? totalAum / account.totalUnits : account.nav;

    const effectiveDate = valuationDate ? new Date(valuationDate).toISOString() : new Date().toISOString();

    await updateDoc(accountRef, {
      aum: totalAum,
      nav: finalNav,
      lastValuationDate: effectiveDate
    });

    // Update Investors
    const invQuery = query(collection(db, 'investors'), where('accountId', '==', accountId));
    const invSnap = await getDocs(invQuery);
    const investorUpdates = invSnap.docs.map(d => {
      const invData = d.data();
      return updateDoc(doc(db, 'investors', d.id), {
        currentValue: (invData.unitsOwned || 0) * finalNav
      });
    });
    await Promise.all(investorUpdates);

    await addDoc(collection(db, 'valuations'), {
      accountId,
      date: valuationDate ? new Date(valuationDate) : serverTimestamp(),
      nav: finalNav,
      aum: totalAum,
      notes: notes || `Manual Valuation (Gain Adjusted: ${manualGain})`
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

    // 5. Revert Investors Performance
    console.info('Reverting investor balances to target NAV:', targetNav);
    const invQuery = query(collection(db, 'investors'), where('accountId', '==', accountId));
    const invSnap = await getDocs(invQuery);
    const investorUpdates = invSnap.docs.map(d => {
      const data = d.data();
      return updateDoc(doc(db, 'investors', d.id), {
        currentValue: (data.unitsOwned || 0) * targetNav
      });
    });
    await Promise.all(investorUpdates);

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

    // Sync Investors
    const invQuery = query(collection(db, 'investors'), where('accountId', '==', accountId));
    const invSnap = await getDocs(invQuery);
    const invRedoUpdates = invSnap.docs.map(d => {
      const invData = d.data();
      return updateDoc(doc(db, 'investors', d.id), {
        currentValue: (invData.unitsOwned || 0) * latestReverted.nav
      });
    });
    await Promise.all(invRedoUpdates);

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
