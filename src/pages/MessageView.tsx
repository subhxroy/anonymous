import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, deleteObject } from 'firebase/storage';
import { ShieldAlert, Lock, Key, Flame, Timer, Shield, Paperclip, ExternalLink, ChevronDown, Hand } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CryptoJS from 'crypto-js';
import ThemeToggle from '../components/ThemeToggle';

export default function MessageView() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'destroyed' | 'revoked' | 'expired' | 'generic'>('generic');
  const [isLoading, setIsLoading] = useState(true);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSecurityReady, setIsSecurityReady] = useState(false);
  const [initialDuration, setInitialDuration] = useState<number>(60);

  // Hold to Reveal
  const [isHoldToReveal, setIsHoldToReveal] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Password
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [tempCachedData, setTempCachedData] = useState<any>(null);
  const [isDecoySession, setIsDecoySession] = useState(false);
  const [isBurning, setIsBurning] = useState(false);

  // Attachments
  const [attachmentMeta, setAttachmentMeta] = useState<any>(null);
  const [decryptedFileUrl, setDecryptedFileUrl] = useState<string | null>(null);
  const [decryptedFileName, setDecryptedFileName] = useState<string | null>(null);
  const [isDownloadingFile, setIsDownloadingFile] = useState(false);
  const [attachmentRevealed, setAttachmentRevealed] = useState(false);

  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /* ── Scroll helpers ─────────────────────────── */
  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setShowScrollIndicator(el.scrollHeight > el.clientHeight && el.scrollHeight - el.scrollTop > el.clientHeight + 15);
  };

  const scrollToBottom = () => scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });

  /* ── Security tier ──────────────────────────── */
  const getSecurityTier = () => {
    if (isPasswordProtected && initialDuration <= 10) return { label: 'Maximum', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/20' };
    if (isPasswordProtected || initialDuration <= 10) return { label: 'High', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20' };
    return { label: 'Standard', color: 'text-zinc-600 dark:text-zinc-400', bg: 'bg-zinc-100 dark:bg-zinc-800/50' };
  };

  /* ── Attachment viewer (new tab secure) ─────── */
  const openAttachmentInNewTab = () => {
    if (!decryptedFileUrl) return;
    try {
      const newWindow = window.open('', '_blank');
      if (!newWindow) { window.location.href = decryptedFileUrl; return; }
      const isImage = attachmentMeta?.type?.startsWith('image/');
      const isVideo = attachmentMeta?.type?.startsWith('video/');
      const isAudio = attachmentMeta?.type?.startsWith('audio/');
      newWindow.document.write(`<!DOCTYPE html>
<html><head><title>Anonym - Secure Attachment</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;padding:0;background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;}
  .container{width:100%;height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;}
  img,video{max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);user-select:none;-webkit-user-select:none;}
  audio{width:90%;max-width:400px;}
  .card{background:#18181b;border:1px solid #27272a;padding:2.5rem;border-radius:20px;text-align:center;max-width:400px;}
  .btn{display:inline-block;margin-top:1.5rem;background:#6366f1;color:#fff;padding:.75rem 1.5rem;border-radius:9999px;text-decoration:none;font-weight:600;font-size:.875rem;}
</style>
<script>document.addEventListener('contextmenu',e=>e.preventDefault());</script>
</head><body><div class="container">
${isImage ? `<img src="${decryptedFileUrl}" alt="Secure Attachment" oncontextmenu="event.preventDefault();" />`
  : isVideo ? `<video src="${decryptedFileUrl}" controls autoplay style="max-width:100%;max-height:100%;border-radius:12px;" />`
  : isAudio ? `<audio src="${decryptedFileUrl}" controls autoplay />`
  : `<div class="card"><h2>Secure Document</h2><p>${decryptedFileName}</p><a href="${decryptedFileUrl}" download="${decryptedFileName || 'file'}" class="btn">Download Securely</a></div>`}
</div></body></html>`);
      newWindow.document.close();
    } catch { window.open(decryptedFileUrl, '_blank'); }
  };

  /* ── Scroll effect ──────────────────────────── */
  useEffect(() => {
    if (isRevealed && content) {
      checkScroll();
      const t = setTimeout(checkScroll, 100);
      window.addEventListener('resize', checkScroll);
      return () => { clearTimeout(t); window.removeEventListener('resize', checkScroll); };
    }
  }, [isRevealed, content, decryptedFileUrl]);

  /* ── Attachment decryption ──────────────────── */
  const loadAndDecryptAttachment = async (meta: any, key: string) => {
    if (!meta?.url || decryptedFileUrl) return;
    setIsDownloadingFile(true);
    try {
      const response = await fetch(meta.url);
      const ciphertext = await response.text();
      const bytes = CryptoJS.AES.decrypt(ciphertext, key);
      const decryptedDataUrl = bytes.toString(CryptoJS.enc.Utf8);
      if (!decryptedDataUrl) throw new Error('Decryption failed');
      let fileName = 'file';
      if (meta.name) {
        try { const nb = CryptoJS.AES.decrypt(meta.name, key); fileName = nb.toString(CryptoJS.enc.Utf8) || 'file'; } catch {}
      }
      setDecryptedFileUrl(decryptedDataUrl);
      setDecryptedFileName(fileName);
    } catch (err) {
      console.error('Attachment decryption failed:', err);
    } finally {
      setIsDownloadingFile(false);
    }
  };

  /* ── Fetch & decrypt message ────────────────── */
  useEffect(() => {
    const fetchMessage = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'messages', id);
        const docSnap = await getDoc(docRef);
        let fetchedContent = null;
        let expiresAt = null;

        if (docSnap.exists()) {
          const data = docSnap.data();
          const secretKey = location.hash.substring(1);

          let attachment = null;
          if (data.hasAttachment) {
            attachment = { url: data.attachmentUrl, name: data.attachmentName, type: data.attachmentType, size: data.attachmentSize };
            setAttachmentMeta(attachment);
          }

          setInitialDuration(data.duration || 60);
          setIsHoldToReveal(data.holdToReveal || false);

          if (data.status === 'read' || !data.content) {
            const cached = sessionStorage.getItem(`msg_${id}`);
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                fetchedContent = parsed.content;
                expiresAt = parsed.expiresAt;
                if (parsed.duration) setInitialDuration(parsed.duration);
                if (parsed.attachment) setAttachmentMeta(parsed.attachment);
                if (parsed.holdToReveal) setIsHoldToReveal(parsed.holdToReveal);
                if (parsed.isDecoySession) setIsDecoySession(true);
              } catch { fetchedContent = cached; expiresAt = Date.now() + 60000; }
            } else {
              setErrorType('destroyed');
              setError('This message has been read and permanently destroyed.');
              setIsLoading(false); return;
            }
          } else {
            setIsPasswordProtected(data.isPasswordProtected || false);

            if (data.isPasswordProtected) {
              setTempCachedData({ 
                content: data.content, 
                duration: data.duration || 60, 
                secretKey, 
                attachment, 
                holdToReveal: data.holdToReveal || false,
                decoyPayload: data.decoy || '',
                hasDecoy: !!data.hasDecoy
              });
              setIsPasswordModalOpen(true);
              setIsLoading(false);
              return;
            }

            if (secretKey) {
              try {
                const bytes = CryptoJS.AES.decrypt(data.content, secretKey);
                fetchedContent = bytes.toString(CryptoJS.enc.Utf8);
                if (!fetchedContent) throw new Error();
              } catch { setErrorType('generic'); setError('Decryption failed. The secret key is invalid.'); }
            } else {
              setErrorType('generic'); setError('Decryption key is missing from the URL.');
            }

            const duration = data.duration || 60;
            expiresAt = Date.now() + duration * 1000;
            if (fetchedContent) {
              sessionStorage.setItem(`msg_${id}`, JSON.stringify({ content: fetchedContent, expiresAt, attachment, duration, holdToReveal: data.holdToReveal || false }));
              await updateDoc(docRef, { content: '', status: 'read', openedAt: Date.now() });
            }
          }
        } else {
          const cached = sessionStorage.getItem(`msg_${id}`);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              fetchedContent = parsed.content;
              expiresAt = parsed.expiresAt;
              if (parsed.attachment) setAttachmentMeta(parsed.attachment);
              if (parsed.holdToReveal) setIsHoldToReveal(parsed.holdToReveal);
              if (parsed.isDecoySession) setIsDecoySession(true);
            } catch { fetchedContent = cached; expiresAt = Date.now() + 60000; }
          }
        }

        if (fetchedContent && expiresAt) {
          const remaining = Math.floor((expiresAt - Date.now()) / 1000);
          if (remaining > 0) { setContent(fetchedContent); setTimeLeft(remaining); }
          else { setErrorType('expired'); setError('This message has expired and been permanently destroyed.'); sessionStorage.removeItem(`msg_${id}`); }
        } else if (!error) {
          setErrorType('destroyed'); setError('This message has been read and permanently destroyed, or never existed.');
        }
      } catch (err) {
        setErrorType('generic'); setError('Failed to securely retrieve the message.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchMessage();
  }, [id]);

  /* ── Password submit ────────────────────────── */
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !tempCachedData) return;
    setPasswordError(null);
    const { content: encryptedText, duration, secretKey, attachment, holdToReveal: htr, decoyPayload, hasDecoy } = tempCachedData;
    const encryptionKey = secretKey + password;
    
    let decryptedText = '';
    let decryptedDecoyText = '';
    let isDecoy = false;

    try {
      // 1. Try real decryption
      try {
        const bytes = CryptoJS.AES.decrypt(encryptedText, encryptionKey);
        decryptedText = bytes.toString(CryptoJS.enc.Utf8);
      } catch {}

      // 2. Try decoy decryption if real failed and decoy exists
      if (!decryptedText && hasDecoy && decoyPayload) {
        try {
          const decoyBytes = CryptoJS.AES.decrypt(decoyPayload, encryptionKey);
          decryptedDecoyText = decoyBytes.toString(CryptoJS.enc.Utf8);
          if (decryptedDecoyText) {
            isDecoy = true;
          }
        } catch {}
      }

      const finalDecryptedText = decryptedText || decryptedDecoyText;
      if (!finalDecryptedText) {
        setPasswordError('Invalid password. Decryption failed.');
        return;
      }

      const expiresAt = Date.now() + duration * 1000;
      sessionStorage.setItem(`msg_${id}`, JSON.stringify({ 
        content: finalDecryptedText, 
        expiresAt, 
        attachment: isDecoy ? null : attachment, 
        duration, 
        holdToReveal: htr,
        isDecoySession: isDecoy
      }));

      if (isDecoy) {
        setIsDecoySession(true);
        setAttachmentMeta(null);
      } else {
        setIsDecoySession(false);
        if (attachment) {
          setAttachmentMeta(attachment);
          loadAndDecryptAttachment(attachment, encryptionKey);
        }
      }

      setContent(finalDecryptedText);
      setTimeLeft(duration);
      setInitialDuration(duration);
      setIsHoldToReveal(htr || false);
      setIsPasswordVerified(true);
      setIsPasswordModalOpen(false);

      const docRef = doc(db, 'messages', id);
      await updateDoc(docRef, { content: '', status: 'read', openedAt: Date.now() });
    } catch (err) {
      setPasswordError('Invalid password. Decryption failed.');
    }
  };

  /* ── Timer ──────────────────────────────────── */
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      setIsBurning(true);
      const burnTimeout = setTimeout(() => {
        setContent(null); 
        setErrorType('expired'); 
        setError('This whisper no longer exists.');
        setIsRevealed(false);
        setIsBurning(false);
        if (id) {
          sessionStorage.removeItem(`msg_${id}`);
          deleteDoc(doc(db, 'messages', id)).catch(console.error);
          deleteObject(ref(storage, `attachments/${id}`)).catch(() => {});
        }
      }, 800);
      return () => clearTimeout(burnTimeout);
    }
    const timerId = setInterval(() => setTimeLeft(prev => prev !== null ? prev - 1 : null), 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, id]);

  /* ── Security ready delay ───────────────────── */
  useEffect(() => {
    if (!isLoading) {
      const t = setTimeout(() => setIsSecurityReady(true), 1500);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  /* ── Screenshot / blur report ───────────────── */
  const reportScreenshot = async () => {
    if (!id || !isSecurityReady) return;
    try {
      await updateDoc(doc(db, 'messages', id), { screenshotDetected: true, status: 'read', content: '' });
    } catch {}
    setContent(null);
    setErrorType('generic');
    setError('Security Violation: Message permanently incinerated due to screen capture or window focus loss.');
    setIsRevealed(false);
    if (id) {
      sessionStorage.removeItem(`msg_${id}`);
      deleteObject(ref(storage, `attachments/${id}`)).catch(() => {});
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => { if (document.hidden) { setIsBlurred(true); setIsRevealed(false); reportScreenshot(); } };
    const handleWindowBlur = () => { setIsBlurred(true); setIsRevealed(false); reportScreenshot(); };
    const handleKeyDown = (e: KeyboardEvent) => {
      // Intercept standard screenshots, prints, copy keys, and devtools
      if (
        e.key === 'PrintScreen' ||
        (e.metaKey && e.shiftKey) ||
        (e.ctrlKey && e.key === 'p') ||
        (e.metaKey && e.key === 's') ||
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
        (e.metaKey && e.altKey && (e.key === 'i' || e.key === 'j' || e.key === 'c' || e.key === 'I' || e.key === 'J' || e.key === 'C'))
      ) {
        e.preventDefault();
        setIsBlurred(true); setIsRevealed(false); reportScreenshot();
      }
    };
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      setIsBlurred(true); setIsRevealed(false); reportScreenshot();
    };

    const handleBeforePrint = () => {
      setIsBlurred(true); setIsRevealed(false); reportScreenshot();
    };

    const handleMouseLeave = () => {
      setIsBlurred(true); setIsRevealed(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCopy);
    window.addEventListener('beforeprint', handleBeforePrint);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCopy);
      window.removeEventListener('beforeprint', handleBeforePrint);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [id, isSecurityReady]);

  useEffect(() => { document.title = 'Anonym — View Secure Message'; }, []);

  /* ── Reveal handler ─────────────────────────── */
  const handleReveal = () => {
    setIsRevealed(true);
    if (attachmentMeta && (!isPasswordProtected || isPasswordVerified)) {
      const secretKey = location.hash.substring(1);
      loadAndDecryptAttachment(attachmentMeta, secretKey + password);
    }
  };

  /* ── Hold to reveal handlers ────────────────── */
  const handleHoldStart = useCallback(() => {
    if (!isRevealed) return;
    setIsHolding(true);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  }, [isRevealed]);

  const handleHoldEnd = useCallback(() => {
    setIsHolding(false);
  }, []);

  /* ── Loading screen ─────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center space-y-5">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-zinc-200 dark:border-zinc-800 rounded-full" />
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
        </div>
        <p className="text-zinc-400 dark:text-zinc-500 text-[10px] uppercase tracking-widest font-bold animate-pulse">Decrypting</p>
      </div>
    );
  }

  /* ── Error/Destroyed screen ─────────────────── */
  if (error || (!content && !isPasswordProtected)) {
    const icons = {
      destroyed: Flame,
      revoked: ShieldAlert,
      expired: Timer,
      generic: ShieldAlert,
    };
    const IconComp = icons[errorType];
    const iconColors = {
      destroyed: 'text-rose-500 bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40',
      revoked: 'text-amber-500 bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40',
      expired: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700',
      generic: 'text-rose-500 bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/40',
    };
    const titles = {
      destroyed: 'Incinerated',
      revoked: 'Revoked',
      expired: 'Expired',
      generic: 'Unavailable',
    };
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center font-sans px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-zinc-900 w-full max-w-md p-10 sm:p-12 rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.05)] dark:shadow-black/25 border border-zinc-100 dark:border-zinc-800 text-center space-y-6"
        >
          <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center border ${iconColors[errorType]}`}>
            <IconComp className="w-10 h-10" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">{titles[errorType]}</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">{error}</p>
          </div>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full hover:bg-black dark:hover:bg-white transition-colors text-xs font-semibold uppercase tracking-wider">
            Return Home
          </Link>
        </motion.div>
      </div>
    );
  }

  /* ── Main view ──────────────────────────────── */
  return (
    <div
      className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans select-none overflow-hidden transition-colors duration-200 relative"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-indigo-500/8 dark:from-indigo-500/4 to-transparent blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-violet-500/6 dark:from-violet-500/3 to-transparent blur-[80px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 dark:opacity-15" />
      </div>

      {/* Header */}
      <header className="flex justify-between items-center px-6 lg:px-12 py-5 w-full max-w-5xl mx-auto z-10 relative">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl flex items-center justify-center shadow-sm">
            <Key className="w-4 h-4" />
          </div>
          <span className="font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Anonym</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-[10px] tracking-widest uppercase text-zinc-500 dark:text-zinc-400 flex items-center gap-2 font-semibold">
            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
            <span className="hidden sm:inline">Burn After Reading</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Password Modal */}
      <AnimatePresence>
        {isPasswordProtected && !isPasswordVerified && isPasswordModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-zinc-950/60 dark:bg-black/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-[28px] border border-zinc-200/60 dark:border-zinc-800 p-8 sm:p-10 max-w-md w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}>
              <div className="space-y-6 text-center">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl flex items-center justify-center mx-auto">
                  <Shield className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-xl tracking-tight">Enter Password</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">This whisper is encrypted with a password. Enter it to decrypt.</p>
                </div>
                <form onSubmit={handlePasswordSubmit} className="space-y-3">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-400 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                    autoFocus required />
                  {passwordError && <p className="text-rose-600 dark:text-rose-400 text-xs font-bold">{passwordError}</p>}
                  <button type="submit"
                    className="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-[0.98] shadow-md cursor-pointer">
                    Decrypt Whisper
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Security lock blur overlay */}
      <AnimatePresence>
        {isBlurred && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-zinc-50/80 dark:bg-zinc-950/85 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 p-8 sm:p-12 rounded-[32px] shadow-2xl border border-zinc-200 dark:border-zinc-800 text-center max-w-sm w-full relative overflow-hidden">
              <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#f4f4f5_10px,#f4f4f5_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#18181b_10px,#18181b_20px)] opacity-30" />
              <div className="relative z-10">
                <div className="w-20 h-20 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100 dark:border-amber-900/40">
                  <ShieldAlert className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight mb-3">Security Lock</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed">Screen capture or focus loss detected. Content hidden.</p>
                <button id="btn-resecure-session" onClick={() => setIsBlurred(false)}
                  className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium py-4 rounded-full hover:bg-black dark:hover:bg-white transition-colors active:scale-[0.98] cursor-pointer">
                  Resecure Session & Resume
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main */}
      <main className="flex-1 flex justify-center items-center px-4 sm:px-6 lg:px-12 pb-16 w-full max-w-5xl mx-auto relative z-10">
        <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl min-h-[480px] p-6 lg:p-14 rounded-[28px] sm:rounded-[36px] shadow-[0_8px_40px_rgba(0,0,0,0.05)] dark:shadow-black/20 border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between">

          {/* Card header */}
          <div className="flex justify-between items-end mb-8 border-b border-zinc-100 dark:border-zinc-800 pb-5 shrink-0">
            <div>
              <div className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] font-bold mb-1.5">Origin</div>
              <div className="text-zinc-800 dark:text-zinc-200 font-semibold tracking-tight">Anonymous Sender</div>
            </div>
            <div className="flex items-end gap-5 sm:gap-8 text-right">
              {timeLeft !== null && (
                <div>
                  <div className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] font-bold mb-1.5">Destructs In</div>
                  <div className={`font-mono font-bold flex items-center justify-end gap-1.5 text-base ${timeLeft <= 10 ? 'text-rose-600 animate-pulse' : 'text-amber-600 dark:text-amber-400'}`}>
                    <Timer className="w-4 h-4" />
                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              )}
              <div className="hidden sm:block">
                <div className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] font-bold mb-1.5">Security</div>
                <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${getSecurityTier().bg} ${getSecurityTier().color}`}>
                  <Shield className="w-3 h-3" />{getSecurityTier().label}
                </div>
              </div>
              <div>
                <div className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] font-bold mb-1.5">Status</div>
                <div className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5 text-sm">
                  <Flame className="w-3.5 h-3.5" /> Volatile
                </div>
              </div>
            </div>
          </div>

          {/* Message area */}
          <div className="relative flex-1 flex items-center justify-center w-full my-4">

            {/* Hold-to-reveal badge */}
            {isRevealed && isHoldToReveal && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/30 px-3 py-1.5 rounded-full text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider select-none">
                <Hand className="w-3.5 h-3.5" />
                {isHolding ? 'Holding — Release to hide' : 'Hold to reveal message'}
              </div>
            )}

            {/* Pre-reveal overlay */}
            <AnimatePresence>
              {!isRevealed && (
                <motion.div
                  key="reveal-btn-container"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, filter: 'blur(8px)', scale: 1.02 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 space-y-5 z-20 bg-white dark:bg-zinc-900 text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-sm">
                    <Shield className="w-8 h-8 text-zinc-600 dark:text-zinc-300" />
                  </div>
                  <div className="space-y-2 max-w-sm">
                    <h3 className="text-lg font-bold tracking-tight">One-Time Secure Message</h3>
                    {isHoldToReveal && (
                      <div className="flex items-center justify-center gap-1.5 text-violet-600 dark:text-violet-400 text-xs font-bold uppercase tracking-wider">
                        <Hand className="w-3.5 h-3.5" /> Hold to Reveal Mode
                      </div>
                    )}
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      {isHoldToReveal
                        ? 'This message uses Hold-to-Reveal. You must hold the button to view it — release to hide.'
                        : 'This message can be read only once. The content will be permanently deleted when the timer expires.'}
                    </p>
                  </div>
                  <button
                    id="btn-reveal-message"
                    onClick={handleReveal}
                    disabled={isPasswordProtected && !isPasswordVerified}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-black dark:hover:bg-white transition-all active:scale-[0.98] shadow-md cursor-pointer disabled:opacity-40"
                  >
                    Click to Continue
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Message content */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center overflow-hidden z-10 px-4"
              animate={{ 
                opacity: isBurning ? 0 : (isRevealed ? 1 : 0), 
                filter: isBurning ? 'blur(24px)' : (isRevealed ? 'blur(0px)' : 'blur(20px)'), 
                scale: isBurning ? 0.9 : (isRevealed ? 1 : 0.95) 
              }}
              transition={{ 
                duration: isBurning ? 0.8 : 0.35, 
                ease: isBurning ? 'easeInOut' : 'easeOut' 
              }}
            >
              <div
                ref={scrollContainerRef}
                onScroll={checkScroll}
                className="relative w-full max-h-full overflow-y-auto custom-scrollbar flex flex-col items-center touch-pan-y"
              >
                {/* Moving stripes protection */}
                {isRevealed && (
                  <div className="absolute inset-0 moving-stripes pointer-events-none z-20 mix-blend-overlay" />
                )}

                <div className="w-full flex flex-col items-center my-auto py-8">

                  {/* Hold-to-reveal wrapper */}
                  {content && isRevealed && (
                    isHoldToReveal && (!isPasswordProtected || isPasswordVerified) ? (
                      <div
                        className="relative w-full flex flex-col items-center"
                        onMouseDown={handleHoldStart}
                        onMouseUp={handleHoldEnd}
                        onMouseLeave={handleHoldEnd}
                        onTouchStart={handleHoldStart}
                        onTouchEnd={handleHoldEnd}
                      >
                        <div className={`hold-to-view-content ${isHolding ? 'revealed' : ''} cursor-pointer select-none w-full text-center`}>
                          <p className="text-2xl sm:text-3xl lg:text-4xl leading-relaxed tracking-tight text-zinc-900 dark:text-zinc-100 font-normal whitespace-pre-wrap text-center mix-blend-multiply dark:mix-blend-screen pb-6">
                            {content}
                          </p>
                        </div>
                        {!isHolding && (
                          <div className="mt-4 text-[10px] text-zinc-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
                            <Hand className="w-3.5 h-3.5" /> Hold to read
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-2xl sm:text-3xl lg:text-4xl leading-relaxed tracking-tight text-zinc-900 dark:text-zinc-100 font-normal whitespace-pre-wrap text-center mix-blend-multiply dark:mix-blend-screen pb-6 select-none">
                        {content}
                      </p>
                    )
                  )}

                  {/* Attachment viewer */}
                  {isRevealed && attachmentMeta && !isDecoySession && (
                    <div className="mt-6 flex flex-col items-center w-full z-10 relative">
                      {isDownloadingFile ? (
                        <div className="flex flex-col items-center gap-2 py-4">
                          <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                          <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">Decrypting Attachment...</span>
                        </div>
                      ) : decryptedFileUrl ? (
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/60 rounded-2xl overflow-hidden w-full max-w-sm">
                          {/* Blur preview for images */}
                          {attachmentMeta.type?.startsWith('image/') && (
                            <div className="relative">
                              <img
                                src={decryptedFileUrl}
                                alt="Secure Attachment"
                                className={`w-full h-40 object-cover attachment-blur-preview ${attachmentRevealed ? 'unblurred' : ''}`}
                                onContextMenu={(e) => e.preventDefault()}
                                draggable={false}
                              />
                              {!attachmentRevealed && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20">
                                  <button onClick={() => setAttachmentRevealed(true)}
                                    className="px-4 py-2 bg-white/90 backdrop-blur-sm text-zinc-900 rounded-full text-[10px] font-bold uppercase tracking-wider cursor-pointer shadow-lg">
                                    Reveal Attachment
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="p-4 flex flex-col items-center gap-3">
                            <Paperclip className="w-6 h-6 text-zinc-400" />
                            <div className="text-center">
                              <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]">{decryptedFileName}</div>
                              <div className="text-[10px] text-zinc-400 font-mono">({(attachmentMeta.size / (1024 * 1024)).toFixed(2)} MB)</div>
                            </div>
                            <button onClick={openAttachmentInNewTab}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full hover:bg-black dark:hover:bg-white transition-colors text-[10px] font-bold uppercase tracking-widest shadow-md cursor-pointer">
                              <ExternalLink className="w-3.5 h-3.5" /> View Securely
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Failed to decrypt attachment.</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Scroll indicator */}
              <AnimatePresence>
                {isRevealed && showScrollIndicator && (
                  <motion.div initial={{ opacity: 0, y: 10, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 10, x: '-50%' }}
                    onClick={scrollToBottom}
                    className="absolute bottom-4 left-1/2 z-30 bg-zinc-900/95 dark:bg-zinc-100/95 backdrop-blur-sm text-white dark:text-zinc-900 text-[11px] font-semibold py-2 px-4 rounded-full shadow-lg flex items-center gap-1.5 cursor-pointer">
                    <span>Scroll to read more</span>
                    <motion.div animate={{ y: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                      <ChevronDown className="w-4 h-4" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Watermark */}
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center select-none overflow-hidden opacity-[0.025] dark:opacity-[0.01]">
        <div className="text-[8vw] font-bold text-zinc-900 dark:text-zinc-100 rotate-[-30deg] whitespace-nowrap">
          CONFIDENTIAL · DO NOT CAPTURE · ANONYM
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto px-6 lg:px-12 pb-10 pt-5 border-t border-zinc-200/50 dark:border-zinc-800/50 mt-6 text-[10px] text-zinc-400 dark:text-zinc-500 flex flex-col md:flex-row items-center justify-between gap-4 font-medium uppercase tracking-wider shrink-0 select-none relative z-10">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3 h-3" />
          <span>Screenshot Guard Active</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Privacy</Link>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Terms</Link>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <span className="font-mono tracking-normal normal-case">© {new Date().getFullYear()} Anonym · Made by SUBH ROY</span>
        </div>
      </footer>
    </div>
  );
}
