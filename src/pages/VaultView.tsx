import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ShieldAlert, Lock, Key, Flame, Timer, Shield, ExternalLink, ChevronDown, Copy, Check, Link2, FileText, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CryptoJS from 'crypto-js';
import ThemeToggle from '../components/ThemeToggle';

interface VaultItem {
  id: string;
  type: 'note' | 'link';
  content: string;
}

export default function VaultView() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [items, setItems] = useState<VaultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'destroyed' | 'expired' | 'generic'>('generic');
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [initialDuration, setInitialDuration] = useState<number>(300);
  const [isOneTimeOpen, setIsOneTimeOpen] = useState(true);
  const [createdAt, setCreatedAt] = useState<number | null>(null);

  // Password Verification States
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [tempCachedData, setTempCachedData] = useState<any>(null);

  // Copy status per item
  const [copiedItemIds, setCopiedItemIds] = useState<{ [key: string]: boolean }>({});

  // Security Focus States
  const [isBlurred, setIsBlurred] = useState(false);
  const [isSecurityReady, setIsSecurityReady] = useState(false);

  /* ── Get Security Tier ──────────────────────── */
  const getSecurityTier = () => {
    if (isPasswordProtected && initialDuration <= 60) return { label: 'Maximum', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/20' };
    if (isPasswordProtected || initialDuration <= 60) return { label: 'High', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20' };
    return { label: 'Standard', color: 'text-zinc-600 dark:text-zinc-400', bg: 'bg-zinc-100 dark:bg-zinc-800/50' };
  };

  /* ── Copy handler for notes ─────────────────── */
  const handleCopyNote = async (itemId: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItemIds(prev => ({ ...prev, [itemId]: true }));
      setTimeout(() => {
        setCopiedItemIds(prev => ({ ...prev, [itemId]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  /* ── Helper to format domains ────────────────── */
  const getDomain = (url: string) => {
    try {
      const cleanUrl = url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
      return new URL(cleanUrl).hostname.replace('www.', '');
    } catch {
      return 'external link';
    }
  };

  const getSafeLink = (url: string) => {
    const trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    return `https://${trimmed}`;
  };

  /* ── Fetch and decrypt vault ────────────────── */
  useEffect(() => {
    const fetchVault = async () => {
      if (!id) return;
      try {
        const secretKey = location.hash.substring(1);
        if (!secretKey) {
          setErrorType('generic');
          setError('Decryption key is missing from the URL.');
          setIsLoading(false);
          return;
        }

        const docRef = doc(db, 'vaults', id);
        const docSnap = await getDoc(docRef);

        let fetchedItems: VaultItem[] = [];
        let expiresAt = null;
        let dbCreatedAt = null;
        let dbDuration = 300;
        let dbOneTime = true;
        let dbPasswordProtected = false;

        // 1. Check if cached in sessionStorage
        const cached = sessionStorage.getItem(`vault_${id}`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            fetchedItems = parsed.items;
            expiresAt = parsed.expiresAt;
            dbCreatedAt = parsed.createdAt;
            dbDuration = parsed.duration;
            dbOneTime = parsed.oneTimeOpen;
            dbPasswordProtected = parsed.isPasswordProtected;

            setCreatedAt(dbCreatedAt);
            setInitialDuration(dbDuration);
            setIsOneTimeOpen(dbOneTime);
            setIsPasswordProtected(dbPasswordProtected);
            setIsPasswordVerified(true);
            setItems(fetchedItems);

            const remaining = Math.floor((expiresAt - Date.now()) / 1000);
            if (remaining > 0) {
              setTimeLeft(remaining);
            } else {
              setErrorType('expired');
              setError('This vault has expired and been permanently destroyed.');
              sessionStorage.removeItem(`vault_${id}`);
            }
            setIsLoading(false);
            return;
          } catch {
            sessionStorage.removeItem(`vault_${id}`);
          }
        }

        // 2. Fetch from DB if not cached
        if (docSnap.exists()) {
          const data = docSnap.data();
          dbDuration = data.duration || 300;
          dbOneTime = data.oneTimeOpen !== false;
          dbPasswordProtected = !!data.isPasswordProtected;
          dbCreatedAt = data.createdAt ? data.createdAt.toMillis() : Date.now();

          setCreatedAt(dbCreatedAt);
          setInitialDuration(dbDuration);
          setIsOneTimeOpen(dbOneTime);
          setIsPasswordProtected(dbPasswordProtected);

          if (data.status === 'burned') {
            setErrorType('destroyed');
            setError('This vault was opened and permanently burned.');
            setIsLoading(false);
            return;
          }

          expiresAt = dbCreatedAt + dbDuration * 1000;
          const remaining = Math.floor((expiresAt - Date.now()) / 1000);

          if (remaining <= 0) {
            setErrorType('expired');
            setError('This vault has expired and been permanently destroyed.');
            deleteDoc(docRef).catch(() => {});
            setIsLoading(false);
            return;
          }

          // If password protected, wait for user input
          if (dbPasswordProtected) {
            setTempCachedData({
              rawItems: data.items,
              duration: dbDuration,
              secretKey,
              oneTimeOpen: dbOneTime,
              createdAt: dbCreatedAt
            });
            setIsPasswordModalOpen(true);
            setIsLoading(false);
            return;
          }

          // Otherwise, decrypt directly using the hash key
          try {
            const decKey = secretKey;
            fetchedItems = data.items.map((item: any, idx: number) => {
              const bytes = CryptoJS.AES.decrypt(item.content, decKey);
              const content = bytes.toString(CryptoJS.enc.Utf8);
              if (!content) throw new Error('Decryption failed');
              return {
                id: item.id || `item_${idx}`,
                type: item.type,
                content
              };
            });

            setItems(fetchedItems);
            setTimeLeft(remaining);

            // Save in cache
            sessionStorage.setItem(`vault_${id}`, JSON.stringify({
              items: fetchedItems,
              expiresAt,
              createdAt: dbCreatedAt,
              duration: dbDuration,
              oneTimeOpen: dbOneTime,
              isPasswordProtected: false
            }));

            // Handle one-time read destruction
            if (dbOneTime) {
              await updateDoc(docRef, { status: 'burned', openedAt: Date.now(), items: [] });
            }
          } catch (decErr) {
            setErrorType('generic');
            setError('Decryption failed. The secret key is invalid.');
          }
        } else {
          setErrorType('destroyed');
          setError('This vault does not exist or has been incinerated.');
        }
      } catch (err) {
        console.error(err);
        setErrorType('generic');
        setError('Failed to securely retrieve the vault.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchVault();
  }, [id, location.hash]);

  /* ── Password Submission ────────────────────── */
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !tempCachedData) return;
    setPasswordError(null);

    const { rawItems, duration, secretKey, oneTimeOpen, createdAt: dbCreated } = tempCachedData;
    const encryptionKey = secretKey + password;

    try {
      const decrypted: VaultItem[] = rawItems.map((item: any, idx: number) => {
        const bytes = CryptoJS.AES.decrypt(item.content, encryptionKey);
        const content = bytes.toString(CryptoJS.enc.Utf8);
        if (!content) throw new Error('Password mismatch');
        return {
          id: item.id || `item_${idx}`,
          type: item.type,
          content
        };
      });

      const expiresAt = dbCreated + duration * 1000;
      const remaining = Math.floor((expiresAt - Date.now()) / 1000);

      if (remaining <= 0) {
        setErrorType('expired');
        setError('This vault has expired and been permanently destroyed.');
        setIsPasswordModalOpen(false);
        const docRef = doc(db, 'vaults', id);
        deleteDoc(docRef).catch(() => {});
        return;
      }

      setItems(decrypted);
      setTimeLeft(remaining);
      setIsPasswordVerified(true);
      setIsPasswordModalOpen(false);

      // Save in cache
      sessionStorage.setItem(`vault_${id}`, JSON.stringify({
        items: decrypted,
        expiresAt,
        createdAt: dbCreated,
        duration,
        oneTimeOpen,
        isPasswordProtected: true
      }));

      // Handle one-time read destruction
      if (oneTimeOpen) {
        const docRef = doc(db, 'vaults', id);
        await updateDoc(docRef, { status: 'burned', openedAt: Date.now(), items: [] });
      }
    } catch {
      setPasswordError('Invalid password. Decryption failed.');
    }
  };

  /* ── Expiry / Countdown Timer ────────────────── */
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      setItems([]);
      setErrorType('expired');
      setError('Vault expired. Content has self-destructed.');
      if (id) {
        sessionStorage.removeItem(`vault_${id}`);
        const docRef = doc(db, 'vaults', id);
        deleteDoc(docRef).catch(() => {});
      }
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft, id]);

  /* ── Security Focus Delay ───────────────────── */
  useEffect(() => {
    if (!isLoading) {
      const t = setTimeout(() => setIsSecurityReady(true), 1500);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  /* ── Anti-Capture logic (Window Blur) ────────── */
  const forceBurnOnCapture = async () => {
    if (!id || !isSecurityReady) return;
    setItems([]);
    setErrorType('generic');
    setError('Security Violation: Vault permanently incinerated due to focus loss or window change.');
    sessionStorage.removeItem(`vault_${id}`);
    const docRef = doc(db, 'vaults', id);
    deleteDoc(docRef).catch(() => {});
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlurred(true);
        forceBurnOnCapture();
      }
    };
    const handleWindowBlur = () => {
      setIsBlurred(true);
      forceBurnOnCapture();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);

    // Disable printscreen key / cut / copy / paste / right click on text
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        (e.ctrlKey && e.key === 'p') ||
        (e.metaKey && e.key === 'p')
      ) {
        e.preventDefault();
        forceBurnOnCapture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const preventContext = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', preventContext);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', preventContext);
    };
  }, [id, isSecurityReady]);

  /* ── Formats time string ────────────────────── */
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleManualBurn = async () => {
    if (!id) return;
    if (confirm('Permanently destroy this vault and all its items right now?')) {
      try {
        setItems([]);
        setErrorType('destroyed');
        setError('This vault has been manually incinerated and destroyed.');
        sessionStorage.removeItem(`vault_${id}`);
        const docRef = doc(db, 'vaults', id);
        await deleteDoc(docRef);
      } catch (err) {
        console.error('Failed to incinerate: ', err);
      }
    }
  };

  const secTier = getSecurityTier();

  return (
    <div className={`min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900/30 transition-colors duration-200 antialiased relative overflow-x-hidden ${isBlurred ? 'blur-2xl select-none pointer-events-none' : ''}`}>
      {/* Background radial effects */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full bg-radial from-indigo-500/8 dark:from-indigo-500/5 to-transparent blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-violet-500/6 dark:from-violet-500/4 to-transparent blur-[80px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40 dark:opacity-20" />
      </div>

      {/* Header */}
      <header className="flex justify-between items-center px-4 sm:px-8 py-3 sm:py-4 w-full max-w-3xl mx-auto shrink-0 relative z-10">
        <Link to="/" className="flex items-center gap-2.5 group cursor-pointer">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-95 transition-transform">
            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <span className="font-bold text-sm sm:text-base tracking-tight text-zinc-900 dark:text-zinc-100">Anonym</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-12 w-full max-w-2xl mx-auto relative z-10">
        <div className="w-full relative">
          <AnimatePresence mode="wait">
            {/* ── LOADING STATE ────────────────── */}
            {isLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center gap-4 text-center py-12"
              >
                <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                <div className="text-xs uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-bold font-mono">
                  Decrypting Secure Vault...
                </div>
              </motion.div>
            )}

            {/* ── PASSWORD PROTECTION MODAL ────── */}
            {!isLoading && isPasswordModalOpen && (
              <motion.div
                key="password-form"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-md mx-auto glass-card rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-xl overflow-hidden p-6 sm:p-8"
              >
                <div className="flex flex-col items-center text-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 rounded-2xl flex items-center justify-center shadow-inner">
                    <Key className="w-5.5 h-5.5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Decryption Key Required</h2>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 max-w-[280px]">
                      This secure vault is protected with an additional password.
                    </p>
                  </div>

                  <form onSubmit={handlePasswordSubmit} className="w-full mt-4 space-y-4">
                    <div className="relative">
                      <input
                        type="password"
                        placeholder="Enter Vault Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4.5 py-3 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 text-center font-mono placeholder:font-sans"
                        autoFocus
                      />
                    </div>
                    {passwordError && (
                      <div className="text-[11px] text-rose-500 font-semibold flex items-center justify-center gap-1.5 bg-rose-50 dark:bg-rose-950/20 py-2 px-3 rounded-xl">
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {passwordError}
                      </div>
                    )}
                    <button
                      type="submit"
                      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold uppercase tracking-widest shadow-md transition-colors btn-premium cursor-pointer flex items-center justify-center gap-2"
                    >
                      Verify & Unlock Vault <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {/* ── ERROR STATE ─────────────────── */}
            {!isLoading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="w-full max-w-md mx-auto text-center glass-card border border-zinc-200/50 dark:border-zinc-800/50 rounded-3xl p-6 sm:p-8 shadow-xl"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-rose-50 dark:bg-rose-950/20 text-rose-500">
                    <Flame className="w-5.5 h-5.5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wide">
                      {errorType === 'expired' ? 'Vault Expired' : errorType === 'destroyed' ? 'Vault Destroyed' : 'Access Restricted'}
                    </h2>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 max-w-[260px] mx-auto leading-relaxed">
                      {error}
                    </p>
                  </div>
                  <Link
                    to="/"
                    className="mt-4 px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-[10px] font-bold uppercase tracking-widest rounded-full shadow-md transition-colors cursor-pointer"
                  >
                    Go Back Home
                  </Link>
                </div>
              </motion.div>
            )}

            {/* ── DECRYPTED VAULT ITEMS ───────── */}
            {!isLoading && !error && items.length > 0 && (
              <motion.div
                key="vault-content"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full space-y-6"
              >
                {/* Meta details & security status bar */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 glass-card p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800/40">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4.5 h-4.5 text-indigo-500" />
                    <div>
                      <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Security Profile</div>
                      <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {isPasswordProtected ? 'Encrypted + Password Protected' : 'E2E Hash Encrypted'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    {timeLeft !== null && (
                      <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-rose-500" />
                        <div>
                          <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider">Self Destruct In</div>
                          <div className="text-xs font-mono font-bold text-rose-500">{formatTime(timeLeft)}</div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <div className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest ${secTier.bg} ${secTier.color}`}>
                        {secTier.label} Tier
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items container */}
                <div className="space-y-4">
                  {items.map((item, idx) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="glass-card border border-zinc-100 dark:border-zinc-800/40 rounded-2xl p-4 sm:p-5 shadow-sm vault-item relative group overflow-hidden"
                    >
                      {item.type === 'note' ? (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 dark:text-indigo-400 text-[9px] font-bold uppercase tracking-widest">
                              <FileText className="w-3 h-3" /> Secure Note
                            </span>
                            <button
                              onClick={() => handleCopyNote(item.id, item.content)}
                              className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                              title="Copy to clipboard"
                            >
                              {copiedItemIds[item.id] ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed font-mono whitespace-pre-wrap select-all pr-2">
                            {item.content}
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/20 text-violet-500 dark:text-violet-400 flex items-center justify-center shrink-0">
                              <Link2 className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0">
                              <span className="px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/20 text-violet-500 dark:text-violet-400 text-[8px] font-extrabold uppercase tracking-widest mb-1 inline-block">
                                Safe Link
                              </span>
                              <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate pr-2">
                                {getDomain(item.content)}
                              </div>
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[240px] sm:max-w-[320px]">
                                {item.content}
                              </div>
                            </div>
                          </div>
                          <a
                            href={getSafeLink(item.content)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-black dark:hover:bg-white transition-colors shrink-0 shadow-sm cursor-pointer"
                          >
                            Go <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Vault configuration warning badge */}
                {isOneTimeOpen && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-2xl text-[10px] text-rose-500 font-bold uppercase tracking-wider justify-center">
                    <Flame className="w-4 h-4 animate-pulse" />
                    One-time open active. This content is destroyed and cannot be accessed again.
                  </div>
                )}

                {/* Operations */}
                <div className="flex items-center justify-between pt-4 gap-4">
                  <button
                    onClick={() => navigate('/')}
                    className="px-5 py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-[10px] text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-widest rounded-xl transition-colors cursor-pointer"
                  >
                    Go Back Home
                  </button>

                  <button
                    onClick={handleManualBurn}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Flame className="w-3.5 h-3.5" /> Burn Vault
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Rotating Background Confidential Watermark */}
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center select-none overflow-hidden opacity-[0.02] dark:opacity-[0.008]">
        <div className="text-[8vw] font-bold text-zinc-900 dark:text-zinc-100 rotate-[-30deg] whitespace-nowrap">
          VAULT SECURE · DO NOT REVEAL · ANONYM
        </div>
      </div>

      {/* Screen capture alert footer */}
      <footer className="w-full max-w-3xl mx-auto px-4 sm:px-8 pb-8 pt-4 border-t border-zinc-200/50 dark:border-zinc-800/50 mt-6 text-[10px] text-zinc-400 dark:text-zinc-500 flex flex-col md:flex-row items-center justify-between gap-4 font-medium uppercase tracking-wider shrink-0 select-none relative z-10">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3 h-3" />
          <span>Screen Capture Protection Active</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Privacy</Link>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Terms</Link>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <span className="font-mono tracking-normal normal-case">© {new Date().getFullYear()} Anonym</span>
        </div>
      </footer>
    </div>
  );
}
