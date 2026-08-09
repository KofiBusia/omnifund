import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  getDoc, 
  deleteDoc, 
  updateDoc, 
  increment,
  runTransaction,
  where,
  query
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function main() {
  console.log('Fetching transactions from Firestore...');
  const txSnapshot = await getDocs(collection(db, 'transactions'));
  console.log(`Total transactions in database: ${txSnapshot.size}`);

  const targetDateStr = '2025-07-21';
  const targetUSDateStr = '07/21/2025';

  const matchesToDelete: any[] = [];

  txSnapshot.docs.forEach(docSnap => {
    const data = docSnap.data();
    const id = docSnap.id;
    const rawTimestamp = data.timestamp;

    let isMatch = false;

    if (typeof rawTimestamp === 'string') {
      if (rawTimestamp.includes('2025-07-21') || rawTimestamp.includes('07/21/2025')) {
        isMatch = true;
      } else {
        const d = new Date(rawTimestamp);
        if (!isNaN(d.getTime())) {
          // Check YYYY-MM-DD
          const isoDate = d.toISOString().split('T')[0];
          // Also check local date YYYY-MM-DD
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const localDate = `${year}-${month}-${day}`;

          if (isoDate === '2025-07-21' || localDate === '2025-07-21') {
            isMatch = true;
          }
        }
      }
    } else if (rawTimestamp && typeof rawTimestamp === 'object' && rawTimestamp.seconds) {
      const d = new Date(rawTimestamp.seconds * 1000);
      const isoDate = d.toISOString().split('T')[0];
      if (isoDate === '2025-07-21') {
        isMatch = true;
      }
    }

    if (isMatch) {
      matchesToDelete.push({ id, ...data });
    }
  });

  console.log(`Found ${matchesToDelete.length} transactions on 07/21/2025:`);
  matchesToDelete.forEach(t => {
    console.log(` - ID: ${t.id} | Type: ${t.type} | Investor: ${t.investorId} | Account: ${t.accountId} | Amount: ${t.totalAmount} | Units: ${t.units} | Date: ${t.timestamp}`);
  });

  if (matchesToDelete.length === 0) {
    console.log('No transactions found matching 07/21/2025.');
    process.exit(0);
  }

  const affectedAccountIds = new Set<string>();

  for (const t of matchesToDelete) {
    console.log(`Deleting transaction ${t.id}...`);

    const accountRef = t.accountId ? doc(db, 'accounts', t.accountId) : null;
    const investorRef = t.investorId ? doc(db, 'investors', t.investorId) : null;
    const transRef = doc(db, 'transactions', t.id);

    try {
      await runTransaction(db, async (dbTx) => {
        let unitsDelta = 0;
        let amountDelta = 0;

        if (t.type === 'BUY') {
          unitsDelta = -(t.units || 0);
          amountDelta = -(t.totalAmount || 0);
        } else if (t.type === 'SELL') {
          unitsDelta = +(t.units || 0);
          amountDelta = +(t.totalAmount || 0);
        }

        if (accountRef) {
          const accSnap = await dbTx.get(accountRef);
          if (accSnap.exists()) {
            dbTx.update(accountRef, {
              totalUnits: increment(unitsDelta),
              cashBalance: increment(amountDelta)
            });
          }
        }

        if (investorRef) {
          const invSnap = await dbTx.get(investorRef);
          if (invSnap.exists()) {
            dbTx.update(investorRef, {
              unitsOwned: increment(unitsDelta),
              totalInvestment: increment(amountDelta)
            });
          }
        }

        dbTx.delete(transRef);
      });

      if (t.accountId) {
        affectedAccountIds.add(t.accountId);
      }
      console.log(`Successfully deleted transaction ${t.id}`);
    } catch (err) {
      console.error(`Failed to delete transaction ${t.id}:`, err);
    }
  }

  // Recalculate account valuations
  for (const accId of affectedAccountIds) {
    console.log(`Recalculating valuation for account ${accId}...`);
    try {
      const accountRef = doc(db, 'accounts', accId);
      const accountSnap = await getDoc(accountRef);
      if (accountSnap.exists()) {
        const accData = accountSnap.data();
        const assetsSnapshot = await getDocs(query(collection(db, 'portfolio'), where('accountId', '==', accId)));
        const allAssets = assetsSnapshot.docs.map(d => d.data());
        const totalHoldingsValue = allAssets.reduce((sum, a) => sum + (a.marketValue || 0), 0);
        const totalMarketValue = totalHoldingsValue + (accData.cashBalance || 0);
        const calculatedNAV = accData.totalUnits > 0 ? totalMarketValue / accData.totalUnits : (accData.nav || 1.0);

        await updateDoc(accountRef, {
          aum: totalMarketValue,
          nav: calculatedNAV
        });
        console.log(`Account ${accId} updated: AUM=${totalMarketValue}, NAV=${calculatedNAV}, totalUnits=${accData.totalUnits}`);
      }
    } catch (err) {
      console.error(`Error recalculating valuation for account ${accId}:`, err);
    }
  }

  console.log('Finished deleting all 07/21/2025 transactions.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error in script:', err);
  process.exit(1);
});
