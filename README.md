# Anonym — Ephemeral Secure Messaging & Stealth Chat

**Live Demo**: [https://end-to-end-v2.netlify.app/](https://end-to-end-v2.netlify.app/)

Anonym is a premium, zero-knowledge web application designed for secure, volatile, and untraceable communication. It allows users to send one-time secure messages (whispers) with password protection and encrypted attachments, or create live stealth chat rooms that automatically implode after inactivity.

---

## 🔒 Security & Cryptographic Architecture

Anonym operates on a strict **Zero-Knowledge** model. The server hosting the database never has access to the plaintext of your messages or decrypted attachments.

### 1. Client-Side AES-256 Cryptography
* Before any message or file attachment is transmitted, it is encrypted locally in the sender's browser using the Advanced Encryption Standard (AES-256) via `crypto-js`.
* **The Secret Key**: A unique, cryptographically secure random key is generated locally. It is appended to the message link as a URL fragment identifier (hash):
  `https://anonym.secure/m/<message-id>#<secret-key>`
* **Zero-Server Trace**: Because the key is in the URL hash component (`#`), it is **never transmitted to the server** during HTTP requests (as per RFC 3986). Decryption happens exclusively in the recipient's browser.

### 2. Dual-Layer Password Protection
* Senders can optionally lock the message with an additional password.
* When active, the decryption key is derived by combining the random URL secret key and the user's password (`secretKey + password`), requiring the recipient to input the password before the browser can decrypt the message.

### 3. Immediate Database Burn (One-Time Read)
* The moment a message document is fetched from the database, its encrypted Firestore payload is immediately overwritten with an empty string, and its status is marked as `read`.
* The message content resides only in the recipient's transient browser memory for the duration of the viewing session. If the page is refreshed or closed, the message is permanently gone and cannot be retrieved again.

### 4. Active Anti-Capture Protocols
* **Focus Loss Concealment**: If the recipient switches tabs, minimizes the window, or loses focus, the message content is instantly hidden behind a security shield.
* **Screenshot & Print Prevention**: Listeners intercept visibility changes and print keys (`PrintScreen`, `Ctrl+P`, `Meta+S`, `Cmd+Shift+3/4`) to blur the screen and hide the message, immediately writing a screenshot detection flag back to the sender's database document.
* **Right-Click Restriction**: Context menus are disabled to prevent easy inspect-element and image saving.

---

## ✨ Features

* **One-Time Messages (Whispers)**:
  * Self-destruct timers (10s, 30s, 1m, 5m).
  * Password locking.
  * Encrypted file attachments (up to 5MB) decrypted in-browser and opened in a secure new tab wrapper.
* **Live Stealth Chat**:
  * Real-time chat rooms powered by E2E encrypted Firestore streams.
  * Custom room codes or random E2E IDs.
  * Automatic room incineration after 10 minutes of complete inactivity.
* **Read Status Notification**: Senders can monitor if a generated link is still waiting or has been opened/destroyed in real time.
* **Modern Dark/Light Themes**: Dynamic dark mode support with tailored HSL zinc palettes and smooth micro-animations.

---

## 🛠️ Technology Stack

* **Core**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
* **Build Tool**: [Vite 6](https://vitejs.dev/)
* **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
* **Database & Storage**: [Firebase Firestore](https://firebase.google.com/docs/firestore) & [Firebase Storage](https://firebase.google.com/docs/storage)
* **Encryption**: [CryptoJS](https://www.npmjs.com/package/crypto-js)
* **Icons**: [Lucide React](https://lucide.dev/)
* **Animations**: [Motion (Framer Motion v12)](https://motion.dev/)

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [npm](https://www.npmjs.com/) or another package manager (yarn, pnpm)

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd anonym
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables. Create a `.env` file in the root directory (using `.env.example` as a template) and add your Firebase credentials:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

### Running Locally
To launch the development server on `localhost:3000`:
```bash
npm run dev
```

### Production Build
To build the application for deployment:
```bash
npm run build
```
The output bundle will be generated in the `dist` directory, ready to be deployed to static hosting providers like Netlify, Vercel, or Firebase Hosting.

---

## 📁 Project Structure

```
├── public/                # Static public assets
├── src/
│   ├── components/        # Reusable components (e.g. ThemeToggle)
│   ├── pages/
│   │   ├── Home.tsx       # Main page: message encryption & chat creation
│   │   ├── MessageView.tsx# Message decryption, countdown, & attachments
│   │   ├── ChatView.tsx   # E2E encrypted live chat rooms
│   │   ├── PrivacyPolicy.tsx# Zero-knowledge privacy policy page
│   │   └── TermsOfService.tsx# User terms of service
│   ├── firebase.ts        # Firebase initialization & configurations
│   ├── App.tsx            # Routing configurations (React Router)
│   ├── main.tsx           # React entrypoint
│   └── index.css          # Tailwind CSS styles and animation systems
├── package.json           # Scripts and dependency configurations
└── tsconfig.json          # TypeScript configurations
```

---

## 📜 License
Distributed under the Apache-2.0 License. See `LICENSE` for more information.
