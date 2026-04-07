import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchGSEPrices } from '../lib/gemini';
import { Asset, InvestmentAccount } from '../types';
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
        
        await updateDoc(doc(db, 'portfolio', asset.id), {
          currentPrice: newPrice,
          marketValue: newMarketValue
        });

        if (asset.accountId) {
          accountTotals[asset.accountId] = (accountTotals[asset.accountId] || 0) + newMarketValue;
        }
      }
    }

    // 6. Update accounts
    for (const account of accounts) {
      const totalHoldingsValue = accountTotals[account.id] || 0;
      const totalMarketValue = totalHoldingsValue + (account.cashBalance || 0);
      const calculatedNAV = account.totalUnits > 0 ? totalMarketValue / account.totalUnits : account.nav;

      await updateDoc(doc(db, 'accounts', account.id), {
        aum: totalMarketValue,
        nav: calculatedNAV,
        lastValuationDate: new Date().toISOString()
      });

      // 7. Log valuation
      await addDoc(collection(db, 'valuations'), {
        accountId: account.id,
        date: serverTimestamp(),
        nav: calculatedNAV,
        aum: totalMarketValue,
        notes: 'Automated Real-time Valuation'
      });
    }

    console.log("Global valuation completed successfully.");
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'global_valuation');
  }
};
