/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import CryptoJS from 'crypto-js';

// Resolve directory and load firebase config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../firebase-applet-config.json');

if (!fs.existsSync(configPath)) {
  console.error('\x1b[31mError: firebase-applet-config.json not found. Run CLI in workspace root.\x1b[0m');
  process.exit(1);
}

const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || 'meatdae2nd');

// Helpers for reading user input safely
function askQuestion(query: string, hideInput = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const stdin = process.stdin as any;
    if (hideInput && typeof stdin.setRawMode === 'function') {
      // Custom handler to hide password inputs
      process.stdout.write(query);
      stdin.resume();
      stdin.setRawMode(true);
      let charAccumulator = '';
      
      const charListener = (char: Buffer) => {
        const key = char.toString();
        if (key === '\n' || key === '\r' || key === '\u000d') {
          stdin.setRawMode(false);
          stdin.removeListener('data', charListener);
          process.stdout.write('\n');
          rl.close();
          resolve(charAccumulator);
        } else if (key === '\u0003') { // Ctrl+C
          stdin.setRawMode(false);
          stdin.removeListener('data', charListener);
          process.stdout.write('\n');
          rl.close();
          process.exit(130);
        } else if (char[0] === 127 || char[0] === 8) { // Backspace
          if (charAccumulator.length > 0) {
            charAccumulator = charAccumulator.slice(0, -1);
            readline.moveCursor(process.stdout, -1, 0);
            readline.clearLine(process.stdout, 1);
          }
        } else {
          charAccumulator += key;
          process.stdout.write('*');
        }
      };
      stdin.on('data', charListener);
    } else {
      rl.question(query, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

// Generate URL-safe random string
function randomId(length = 20): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Parse custom command line flags
function getArgValue(flags: string[]): string | null {
  for (const flag of flags) {
    const idx = process.argv.indexOf(flag);
    if (idx !== -1 && idx + 1 < process.argv.length) {
      return process.argv[idx + 1];
    }
  }
  return null;
}

function hasArg(flags: string[]): boolean {
  return flags.some(flag => process.argv.includes(flag));
}

// Main Commands
async function handleCreate() {
  const contentIdx = process.argv.indexOf('create') + 1;
  let content = process.argv[contentIdx];
  if (!content || content.startsWith('-')) {
    content = await askQuestion('\x1b[36mEnter secure message content:\x1b[0m ');
  }

  if (!content) {
    console.error('\x1b[31mError: Message content cannot be empty.\x1b[0m');
    process.exit(1);
  }

  // Read options
  const password = getArgValue(['-p', '--password']);
  const decoyInput = getArgValue(['-d', '--decoy']); // Format: password:decoyMessage
  const timeStr = getArgValue(['-t', '--time']) || '300';
  const duration = parseInt(timeStr, 10);
  const holdToReveal = hasArg(['-htr', '--hold-to-reveal']);

  // Set up keys
  const id = randomId(20);
  const secretKey = randomId(16);
  let encryptionKey = secretKey;
  let hasPassword = false;

  if (password) {
    encryptionKey = secretKey + password;
    hasPassword = true;
  }

  console.log('\n\x1b[35m[Encrypting Client-Side]...\x1b[0m');
  const encryptedText = CryptoJS.AES.encrypt(content, encryptionKey).toString();

  // Handle decoy cover
  let hasDecoy = false;
  let decoyPayload = '';
  if (decoyInput) {
    const splitIdx = decoyInput.indexOf(':');
    if (splitIdx === -1) {
      console.error('\x1b[31mError: Decoy option must be in format password:decoyMessage\x1b[0m');
      process.exit(1);
    }
    const decoyPassword = decoyInput.substring(0, splitIdx);
    const decoyMsg = decoyInput.substring(splitIdx + 1);
    
    decoyPayload = CryptoJS.AES.encrypt(decoyMsg, secretKey + decoyPassword).toString();
    hasDecoy = true;
  }

  const payload: any = {
    content: encryptedText,
    createdAt: new Date().toISOString(), // Mock server timestamp ISO format
    duration,
    holdToReveal,
    isPasswordProtected: hasPassword,
    hasDecoy,
    status: 'active'
  };

  if (hasDecoy) {
    payload.decoyPayload = decoyPayload;
  }

  console.log('\x1b[35m[Uploading securely to Firestore database: ' + firebaseConfig.firestoreDatabaseId + ']...\x1b[0m');

  try {
    // Write directly using JS Web SDK
    // Firestore rules require createdAt timestamp. For security rules Request.Time matching,
    // in Node environment write transforms or direct iso strings can be verified.
    // Note: rules require data.createdAt == request.time.
    // To satisfy "data.createdAt == request.time" in Firestore Web SDK, we must use a true Firebase ServerTimestamp!
    // Since we're using ES modules Web SDK in Node:
    const { serverTimestamp } = await import('firebase/firestore');
    payload.createdAt = serverTimestamp();

    const docRef = doc(db, 'messages', id);
    await setDoc(docRef, payload);

    const baseAppUrl = 'https://end-to-end-v2.netlify.app';
    const secureLink = `${baseAppUrl}/m/${id}#${secretKey}`;

    console.log('\n\x1b[32m✔ Secure Link Created Successfully!\x1b[0m');
    console.log(`\x1b[36mURL:\x1b[0m \x1b[4m${secureLink}\x1b[0m`);
    console.log(`\x1b[33mDuration:\x1b[0m ${duration}s | \x1b[33mPassword:\x1b[0m ${hasPassword ? 'Yes' : 'No'} | \x1b[33mDecoy:\x1b[0m ${hasDecoy ? 'Yes' : 'No'}\n`);
  } catch (err: any) {
    console.error('\x1b[31mUpload Failed:\x1b[0m', err.message || err);
  }
}

async function handleRead() {
  const urlIdx = process.argv.indexOf('read') + 1;
  const url = process.argv[urlIdx];
  if (!url) {
    console.error('\x1b[31mUsage: anonym-cli read <url>\x1b[0m');
    process.exit(1);
  }

  // Parse ID and key
  let id = '';
  let secretKey = '';
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    id = parts[parts.length - 1];
    secretKey = parsed.hash.substring(1);
  } catch {
    // Fallback if they just passed id#key
    const split = url.split('#');
    secretKey = split[1] || '';
    const idParts = split[0].split('/');
    id = idParts[idParts.length - 1];
  }

  if (!id || !secretKey) {
    console.error('\x1b[31mError: Invalid secure link URL format.\x1b[0m');
    process.exit(1);
  }

  console.log(`\n\x1b[35m[Fetching Message: ${id}]...\x1b[0m`);
  const docRef = doc(db, 'messages', id);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    console.error('\x1b[31mError: Message has self-destructed or does not exist.\x1b[0m');
    process.exit(1);
  }

  const data = snap.data();
  if (data.status === 'read' || !data.content) {
    console.error('\x1b[31mError: Message has already been read and destroyed.\x1b[0m');
    process.exit(1);
  }

  let finalKey = secretKey;
  let enteredPassword = '';

  if (data.isPasswordProtected) {
    enteredPassword = await askQuestion('\x1b[33mEnter decryption password:\x1b[0m ', true);
    finalKey = secretKey + enteredPassword;
  }

  console.log('\x1b[35m[Decrypting payload]...\x1b[0m');
  
  let decryptedText = '';
  let isDecoy = false;

  try {
    // 1. Try real decryption
    try {
      const bytes = CryptoJS.AES.decrypt(data.content, finalKey);
      decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    } catch {}

    // 2. Try decoy decryption if real failed
    if (!decryptedText && data.hasDecoy && data.decoyPayload) {
      try {
        const decoyBytes = CryptoJS.AES.decrypt(data.decoyPayload, secretKey + enteredPassword);
        decryptedText = decoyBytes.toString(CryptoJS.enc.Utf8);
        if (decryptedText) {
          isDecoy = true;
        }
      } catch {}
    }

    if (!decryptedText) {
      console.error('\x1b[31mError: Decryption failed. Invalid password.\x1b[0m');
      process.exit(1);
    }

    // Incinerate/burn
    console.log('\x1b[31m[Incinerating / Burning message from database]...\x1b[0m');
    await updateDoc(docRef, { content: '', status: 'read', openedAt: Date.now() });

    console.log('\n\x1b[32m✔ Message Unlocked & Burned from Server:\x1b[0m');
    if (isDecoy) {
      console.log('\x1b[33m[DECOY SESSION ACTIVATED]\x1b[0m');
    }
    console.log('----------------------------------------');
    console.log(decryptedText);
    console.log('----------------------------------------\n');
  } catch (err: any) {
    console.error('\x1b[31mDecryption failed:\x1b[0m', err.message || err);
  }
}

async function handleLocalVault(action: 'create' | 'decrypt') {
  if (action === 'create') {
    const fileIdx = process.argv.indexOf('vault-create') + 1;
    const filePath = process.argv[fileIdx];
    if (!filePath) {
      console.error('\x1b[31mUsage: anonym-cli vault-create <file-path-to-encrypt>\x1b[0m');
      process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
      console.error(`\x1b[31mError: File not found at ${filePath}\x1b[0m`);
      process.exit(1);
    }

    const passphrase = await askQuestion('\x1b[33mEnter encryption passphrase:\x1b[0m ', true);
    if (!passphrase) {
      console.error('\x1b[31mError: Passphrase cannot be empty.\x1b[0m');
      process.exit(1);
    }

    console.log('\x1b[35m[Encrypting local file content]...\x1b[0m');
    const fileData = fs.readFileSync(filePath);
    const base64Str = fileData.toString('base64');
    const encrypted = CryptoJS.AES.encrypt(base64Str, passphrase).toString();

    const resultPayload = {
      type: 'anonym-vault',
      version: '1.0',
      fileName: path.basename(filePath),
      encryptedData: encrypted
    };

    const outPath = filePath + '.anonym';
    fs.writeFileSync(outPath, JSON.stringify(resultPayload, null, 2));

    console.log(`\n\x1b[32m✔ Local Vault File Created: \x1b[4m${outPath}\x1b[0m\n`);
  } else {
    const fileIdx = process.argv.indexOf('vault-decrypt') + 1;
    const filePath = process.argv[fileIdx];
    if (!filePath) {
      console.error('\x1b[31mUsage: anonym-cli vault-decrypt <anonym-vault-file>\x1b[0m');
      process.exit(1);
    }

    if (!fs.existsSync(filePath)) {
      console.error(`\x1b[31mError: Vault file not found at ${filePath}\x1b[0m`);
      process.exit(1);
    }

    const passphrase = await askQuestion('\x1b[33mEnter decryption passphrase:\x1b[0m ', true);
    if (!passphrase) {
      console.error('\x1b[31mError: Passphrase cannot be empty.\x1b[0m');
      process.exit(1);
    }

    console.log('\x1b[35m[Decrypting vault archive]...\x1b[0m');
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (rawData.type !== 'anonym-vault') {
      console.error('\x1b[31mError: Invalid file format. Not an anonym-vault file.\x1b[0m');
      process.exit(1);
    }

    try {
      const bytes = CryptoJS.AES.decrypt(rawData.encryptedData, passphrase);
      const base64Str = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!base64Str) {
        console.error('\x1b[31mError: Decryption failed. Incorrect passphrase.\x1b[0m');
        process.exit(1);
      }

      const fileBuffer = Buffer.from(base64Str, 'base64');
      const outDir = path.dirname(filePath);
      const outPath = path.join(outDir, 'decrypted_' + rawData.fileName);

      fs.writeFileSync(outPath, fileBuffer);
      console.log(`\n\x1b[32m✔ File Restored Successfully: \x1b[4m${outPath}\x1b[0m\n`);
    } catch {
      console.error('\x1b[31mError: Decryption failed. Incorrect passphrase or corrupted file.\x1b[0m');
    }
  }
}

// Router
async function main() {
  console.log('\x1b[1m\x1b[35m=== ANONYM TERMINAL CLI v1.0 ===\x1b[0m');
  
  if (process.argv.includes('create')) {
    await handleCreate();
  } else if (process.argv.includes('read')) {
    await handleRead();
  } else if (process.argv.includes('vault-create')) {
    await handleLocalVault('create');
  } else if (process.argv.includes('vault-decrypt')) {
    await handleLocalVault('decrypt');
  } else {
    console.log(`
Usage:
  npx tsx scripts/anonym-cli.ts <command> [options]

Commands:
  \x1b[36mcreate "<msg>"\x1b[0m   Encrypts and uploads a message to Firestore. Outputs secure link.
  \x1b[36mread <url>\x1b[0m       Downloads, decrypts, and prints message. Burns message instantly.
  \x1b[36mvault-create <f>\x1b[0m Encrypts local file locally to <file>.anonym (Serverless).
  \x1b[36mvault-decrypt <f>\x1b[0m Decrypts local <file>.anonym and restores original file.

Options:
  -p, --password <pwd>      Password-protect secure links.
  -d, --decoy <pwd>:<msg>   Enable decoy password protection with cover message.
  -t, --time <seconds>      Duration in seconds before message expires (Default 300).
  -htr, --hold-to-reveal    Enable hold-to-reveal mode in browser.
    `);
  }
  process.exit(0);
}

main().catch(err => {
  console.error('\x1b[31mFatal CLI error:\x1b[0m', err);
  process.exit(1);
});
