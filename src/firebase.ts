import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Validate configuration parameters
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const configObj = firebaseConfig as Record<string, string>;
const missingKeys = requiredKeys.filter(key => !configObj[key]);

if (missingKeys.length > 0) {
  console.error(
    `[Firebase Config Validation] Warning: Missing properties in firebase-applet-config.json:\n` +
    missingKeys.map(k => `  - ${k}`).join('\n') +
    `\nPlease verify that your configuration contains all required keys.`
  );
}

const app = initializeApp(firebaseConfig);
const databaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app); // CRITICAL: The app will break without this line
export const auth = getAuth(app);
export const storage = getStorage(app);
