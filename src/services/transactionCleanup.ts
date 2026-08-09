import { doc, deleteDoc, runTransaction, increment, getDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, Investor, InvestmentAccount, Asset } from '../types';
import { safeISODate, safeDate } from '../lib/utils';

export interface DeleteDateResult {
  count: number;
  deletedIds: string[];
  affectedAccountIds: string[];
}

export const isJuly21Transaction = (t: Transaction | any): boolean => {
  if (!t || !t.timestamp) return false;
  
  const raw = String(t.timestamp);
  if (raw.includes('2025-07-21') || raw.includes('07/21/2025')) {
    return true;
  }

  const iso = safeISODate(t.timestamp);
  if (iso === '2025-07-21') return true;

  const d = safeDate(t.timestamp);
  if (d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    if (`${year}-${month}-${day}` === '2025-07-21') return true;
  }

  return false;
};

export const deleteJuly21Transactions = async (
  localTransactions: Transaction[] = [],
  localInvestors: Investor[] = [],
  localAccounts: InvestmentAccount[] = []
): Promise<DeleteDateResult> => {
  const result: DeleteDateResult = {
    count: 0,
    deletedIds: [],
    affectedAccountIds: []
  };

  // 1. Fetch fresh transactions directly from Firestore to ensure no missing state
  let firestoreTxs: Transaction[] = [];
  try {
    const snap = await getDocs(collection(db, 'transactions'));
    firestoreTxs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
  } catch (err) {
    console.warn('Could not fetch directly from Firestore transactions, falling back to local array:', err);
    firestoreTxs = localTransactions;
  }

  // Combine local and Firestore transactions by ID
  const txMap = new Map<string, Transaction>();
  localTransactions.forEach(t => { if (t?.id) txMap.set(t.id, t); });
  firestoreTxs.forEach(t => { if (t?.id) txMap.set(t.id, t); });

  const targetTxs = Array.from(txMap.values()).filter(isJuly21Transaction);

  if (targetTxs.length === 0) {
    return result;
  }

  const affectedAccountsSet = new Set<string>();

  for (const t of targetTxs) {
    const units = Number(t.units) || 0;
    const amount = Number(t.totalAmount) || Number((t as any).amount) || 0;

    let unitsDelta = 0;
    let amountDelta = 0;

    if (t.type === 'BUY') {
      unitsDelta = -units;
      amountDelta = -amount;
    } else {
      unitsDelta = units;
      amountDelta = amount;
    }

    try {
      await runTransaction(db, async (dbTx) => {
        const transRef = doc(db, 'transactions', t.id);
        const accountRef = t.accountId ? doc(db, 'accounts', t.accountId) : null;
        const investorRef = t.investorId ? doc(db, 'investors', t.investorId) : null;

        // Perform all reads first as required by Firestore transactions
        const accountSnap = accountRef ? await dbTx.get(accountRef) : null;
        const investorSnap = investorRef ? await dbTx.get(investorRef) : null;

        if (accountRef && accountSnap && accountSnap.exists()) {
          dbTx.update(accountRef, {
            totalUnits: increment(unitsDelta),
            cashBalance: increment(amountDelta)
          });
        }

        if (investorRef && investorSnap && investorSnap.exists()) {
          dbTx.update(investorRef, {
            unitsOwned: increment(unitsDelta),
            totalInvestment: increment(amountDelta)
          });
        }

        dbTx.delete(transRef);
      });

      result.deletedIds.push(t.id);
      result.count++;
      if (t.accountId) {
        affectedAccountsSet.add(t.accountId);
      }
    } catch (err) {
      console.error(`Transaction delete failed for ${t.id}, attempting direct deletion fallback:`, err);
      try {
        await deleteDoc(doc(db, 'transactions', t.id));
        result.deletedIds.push(t.id);
        result.count++;
        if (t.accountId) affectedAccountsSet.add(t.accountId);
      } catch (fallbackErr) {
        console.error(`Fallback deletion failed for ${t.id}:`, fallbackErr);
      }
    }
  }

  // 2. Recalculate AUM and NAV for all affected accounts
  for (const accId of affectedAccountsSet) {
    try {
      const accountRef = doc(db, 'accounts', accId);
      const accountSnap = await getDoc(accountRef);
      if (accountSnap.exists()) {
        const accData = accountSnap.data();
        const currentCash = Number(accData.cashBalance) || 0;
        const currentUnits = Math.max(0, Number(accData.totalUnits) || 0);

        const assetsSnapshot = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accId)));
        const allAssets = assetsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
        const totalHoldingsValue = allAssets.reduce((sum, a) => sum + (Number(a.marketValue) || 0), 0);
        const totalMarketValue = totalHoldingsValue + currentCash;
        const calculatedNAV = currentUnits > 0 ? totalMarketValue / currentUnits : (Number(accData.nav) || 1.0);

        await updateDoc(accountRef, {
          aum: totalMarketValue,
          nav: calculatedNAV,
          totalUnits: currentUnits
        });
      }
    } catch (err) {
      console.error(`Error recalculating valuation for account ${accId}:`, err);
    }
  }

  result.affectedAccountIds = Array.from(affectedAccountsSet);
  return result;
};
