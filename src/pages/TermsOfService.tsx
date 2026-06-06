import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import ThemeToggle from '../components/ThemeToggle';

export default function TermsOfService() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Anonym - Terms of Service";
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-200 antialiased">
      <header className="flex justify-between items-center px-4 sm:px-8 py-2.5 sm:py-4 w-full max-w-3xl mx-auto shrink-0">
        <h1 className="font-bold text-base sm:text-xl tracking-tighter uppercase flex items-center gap-1.5 cursor-pointer" onClick={() => navigate('/')}>
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
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Terms of Service</h2>
              <p className="text-xs text-zinc-400 dark:text-zinc-555 mt-1 uppercase tracking-widest font-mono">Last Updated: June 6, 2026</p>
            </div>

            <div className="space-y-4 text-sm text-zinc-650 dark:text-zinc-350 leading-relaxed max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">1. Acceptance of Terms</h3>
              <p>
                By accessing and using Anonym, you agree to comply with and be bound by these Terms of Service. If you do not agree, you must immediately cease usage of our secure messaging platform.
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">2. Acceptable Use</h3>
              <p>
                You agree to use Anonym only for lawful purposes. You are prohibited from sending content that is illegal, defamatory, abusive, harmful, or designed to disrupt systems. Since all content is fully encrypted and unreadable by us, users are individually and solely responsible for all messages sent.
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">3. Platform Ephemerality and Storage</h3>
              <p>
                Anonym is an ephemeral sharing platform. We provide no guarantees of message persistence, backups, or storage. Messages are permanently deleted upon first view or timer expiration. Once deleted, they are unrecoverable.
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">4. Security Disclaimer</h3>
              <p>
                While Anonym engages client-side cryptography, window focus hiding, dynamic visibility blur, and copy/print restrictions (the "Screenshot Guard"), we cannot guarantee absolute protection against operating system-level capturing tools, virtual machines, custom web scraping setups, browser automation libraries (e.g., Puppeteer, Selenium), or physical photography (e.g., taking a picture of the monitor with a phone). All security measures run within the browser sandbox and operate under its inherent limitations. Users must exercise appropriate discretion when viewing highly sensitive content.
              </p>

              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-base mt-2">5. Limitation of Liability</h3>
              <p>
                Anonym is provided "as is" without any express or implied warranties. In no event shall we be liable for any lost data, communication failure, or consequential damages arising from the use of our services.
              </p>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="px-4 sm:px-8 pb-4 sm:pb-6 w-full max-w-3xl mx-auto text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-555 flex justify-center tracking-widest shrink-0 font-medium uppercase">
        &copy; {new Date().getFullYear()} Anonym Secure &bull; Zero Trace Communication
      </footer>
    </div>
  );
}
