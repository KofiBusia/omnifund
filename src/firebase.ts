import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '@/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

async function testConnection() {
  try {
    // Only test if we have a valid config
    if (firebaseConfig.projectId && firebaseConfig.projectId !== 'your-project-id') {
      await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
      console.error("CRITICAL: Firestore is unreachable. Please check if Firebase is correctly set up for this project or if you've reached your quota.");
    }
  }
}

testConnection();

export default app;
