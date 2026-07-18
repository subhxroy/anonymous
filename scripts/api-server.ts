/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import CryptoJS from 'crypto-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../firebase-applet-config.json');

if (!fs.existsSync(configPath)) {
  console.error('Error: firebase-applet-config.json not found in root.');
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase
const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId || 'encrypted');

const app = express();
app.use(express.json({ limit: '10kb' }));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Helper for generating secure random IDs
function generateRandomId(length = 20): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 1. ZK Encrypt Endpoint
app.post('/api/encrypt', (req, res) => {
  const { message, key } = req.body;
  if (!message || !key) {
    res.status(400).json({ error: 'Missing message or key in request body.' });
    return;
  }
  if (typeof message !== 'string' || message.length > 5000) {
    res.status(400).json({ error: 'Invalid message. Must be a string up to 5000 characters.' });
    return;
  }
  if (typeof key !== 'string' || key.length > 128) {
    res.status(400).json({ error: 'Invalid key. Must be a string up to 128 characters.' });
    return;
  }
  try {
    const ciphertext = CryptoJS.AES.encrypt(message, key).toString();
    res.json({ ciphertext });
  } catch (err: any) {
    res.status(500).json({ error: 'Encryption failed', details: err.message });
  }
});

// 2. ZK Decrypt Endpoint
app.post('/api/decrypt', (req, res) => {
  const { ciphertext, key } = req.body;
  if (!ciphertext || !key) {
    res.status(400).json({ error: 'Missing ciphertext or key in request body.' });
    return;
  }
  if (typeof ciphertext !== 'string' || ciphertext.length > 10000) {
    res.status(400).json({ error: 'Invalid ciphertext. Must be a string up to 10000 characters.' });
    return;
  }
  if (typeof key !== 'string' || key.length > 128) {
    res.status(400).json({ error: 'Invalid key. Must be a string up to 128 characters.' });
    return;
  }
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, key);
    const message = bytes.toString(CryptoJS.enc.Utf8);
    if (!message) {
      res.status(400).json({ error: 'Decryption failed. Bad key or corrupted payload.' });
      return;
    }
    res.json({ message });
  } catch (err: any) {
    res.status(500).json({ error: 'Decryption failed', details: err.message });
  }
});

// 3. Create Secure link programmatic endpoint
app.post('/api/messages/create', async (req, res) => {
  const { message, password, decoyPassword, decoyMessage, duration = 300, holdToReveal = false } = req.body;

  if (!message) {
    res.status(400).json({ error: 'Missing message field.' });
    return;
  }
  if (typeof message !== 'string' || message.length > 5000) {
    res.status(400).json({ error: 'Invalid message. Must be a string up to 5000 characters.' });
    return;
  }
  if (password !== undefined && (typeof password !== 'string' || password.length > 128)) {
    res.status(400).json({ error: 'Invalid password. Must be a string up to 128 characters.' });
    return;
  }
  if (decoyPassword !== undefined && (typeof decoyPassword !== 'string' || decoyPassword.length > 128)) {
    res.status(400).json({ error: 'Invalid decoyPassword. Must be a string up to 128 characters.' });
    return;
  }
  if (decoyMessage !== undefined && (typeof decoyMessage !== 'string' || decoyMessage.length > 5000)) {
    res.status(400).json({ error: 'Invalid decoyMessage. Must be a string up to 5000 characters.' });
    return;
  }
  if (holdToReveal !== undefined && typeof holdToReveal !== 'boolean') {
    res.status(400).json({ error: 'Invalid holdToReveal. Must be a boolean.' });
    return;
  }

  const durationVal = typeof duration === 'number' ? duration : parseInt(duration, 10);
  if (isNaN(durationVal) || durationVal < 10 || durationVal > 86400) {
    res.status(400).json({ error: 'Invalid duration. Must be a number between 10 and 86400 seconds.' });
    return;
  }

  const id = generateRandomId(20);
  const secretKey = generateRandomId(16);
  let encryptionKey = secretKey;
  let isPasswordProtected = false;

  if (password) {
    encryptionKey = secretKey + password;
    isPasswordProtected = true;
  }

  try {
    const encryptedText = CryptoJS.AES.encrypt(message, encryptionKey).toString();

    let hasDecoy = false;
    let decoyPayload = '';

    if (decoyPassword && decoyMessage) {
      decoyPayload = CryptoJS.AES.encrypt(decoyMessage, secretKey + decoyPassword).toString();
      hasDecoy = true;
    }

    const payload: any = {
      content: encryptedText,
      createdAt: serverTimestamp(),
      duration: durationVal,
      holdToReveal,
      isPasswordProtected,
      hasDecoy,
      status: 'active'
    };

    if (hasDecoy) {
      payload.decoyPayload = decoyPayload;
    }

    const docRef = doc(db, 'messages', id);
    await setDoc(docRef, payload);

    const baseAppUrl = process.env.ANONYM_BASE_URL || 'https://end-to-end-v2.netlify.app';
    const secureUrl = `${baseAppUrl}/m/${id}#${secretKey}`;

    res.json({
      id,
      secretKey,
      secureUrl,
      duration: durationVal,
      isPasswordProtected,
      hasDecoy
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create secure link', details: err.message });
  }
});

// Status check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'anonym-api-server', time: new Date() });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\x1b[32m✔ Anonym Developer REST API server active on http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[36mEndpoints:\x1b[0m`);
  console.log(`  - \x1b[1mPOST\x1b[0m http://localhost:${PORT}/api/encrypt`);
  console.log(`  - \x1b[1mPOST\x1b[0m http://localhost:${PORT}/api/decrypt`);
  console.log(`  - \x1b[1mPOST\x1b[0m http://localhost:${PORT}/api/messages/create`);
});
