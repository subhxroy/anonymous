import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import ThemeToggle from '../components/ThemeToggle';

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Anonym - Privacy Policy";
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-200 antialiased">
      <header className="flex justify-between items-center px-4 sm:px-8 py-2.5 sm:py-4 w-full max-w-3xl mx-auto shrink-0">
        <h1 className="font-bold text-base sm:text-xl tracking-tighter uppercase flex items-center gap-1.5 cursor-pointer animate-pulse" onClick={() => navigate('/')}>
          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg flex items-center justify-center">
            <Shield className="w-3 h-3 sm:w-4 sm:h-4" />
          </div>
          Anonym
        </h1>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex flex-col justify-center items-center px-4 sm:px-6 pb-8 w-full max-w-3xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-white dark:bg-zinc-900 w-full rounded-[24px] sm:rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] dark:shadow-black/20 border border-zinc-100 dark:border-zinc-800/80 p-6 sm:p-10 relative overflow-hidden"
        >
          <div className="absolute inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.01]" style={{ backgroundImage: 'radial-gradient(#000 1px,transparent 1px)', backgroundSize: '16px 16px' }}></div>
          
          <div className="relative z-10 space-y-6">
            <button 
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </button>

            <div className="border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Privacy Policy</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 uppercase tracking-widest font-mono">Last Updated: June 6, 2026</p>
            </div>

            <div className="space-y-4 text-sm text-zinc-650 dark:text-zinc-350 leading-relaxed max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">1. Our Commitment to Zero Knowledge</h3>
              <p>
                Anonym is built from the ground up on the principle of ephemeral communication. We operate on a zero-knowledge data design: we do not store, read, or monetize your secure whispers or chats. 
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">2. Data Encryption</h3>
              <p>
                All message contents and file attachments are encrypted client-side in your browser using AES-256 before being sent to Firestore. The decryption key is generated in your browser and appended to the link URL hash (e.g., <code>#secret-key</code>). This hash is never sent to our servers. Without this key, the encrypted content stored in our database is mathematically impossible to read.
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">3. Ephemeral Storage</h3>
              <p>
                Messages are permanently destroyed ("burned") immediately after their first retrieval by the recipient, or upon the expiration of their self-destruct timer (whichever occurs first). Chat rooms are active sessions that permanently self-destruct after 10 minutes of complete room inactivity.
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">4. Log Files and Metadata</h3>
              <p>
                We do not collect IP addresses, device identifiers, browser fingerprint profiles, or tracking cookies. No personal data registration is required to use Anonym.
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">5. Updates and Changes</h3>
              <p>
                We may update this policy to reflect security upgrades. Continued use of Anonym implies acceptance of zero-knowledge privacy protocols.
              </p>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="px-4 sm:px-8 pb-4 sm:pb-6 w-full max-w-3xl mx-auto text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 flex justify-center tracking-widest shrink-0 font-medium uppercase">
        &copy; {new Date().getFullYear()} Anonym Secure &bull; Zero Trace Communication
      </footer>
    </div>
  );
}
