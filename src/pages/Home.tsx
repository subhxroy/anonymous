import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Send, Copy, Check, Shield, ShieldAlert, ArrowRight, Lock, Eye, EyeOff, MessageSquare, KeyRound, Flame, Paperclip, X, Vault, Trash2, ChevronRight, Plus, Link2, MousePointerClick } from 'lucide-react';
import { ref, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate, Link } from 'react-router-dom';
import CryptoJS from 'crypto-js';
import ThemeToggle from '../components/ThemeToggle';

/* ── Utilities ──────────────────────────────── */
const copyToClipboard = async (text: string): Promise<boolean> => {
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
  }
  return fallbackCopy(text);
};

const fallbackCopy = (text: string): boolean => {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;background:transparent;opacity:0;';
  document.body.appendChild(ta);
  ta.focus(); ta.select(); ta.setSelectionRange(0, 999999);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
  return ok;
};

const getRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (secs < 10) return 'Just now';
  if (secs < 60) return `${secs}s ago`;
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
};

const parseInviteText = (input: string): { roomCode: string; e2eKey: string | null } => {
  const trimmed = input.trim();
  const urlRegex = /\/c\/([a-zA-Z0-9_\-]+)(?:#([a-zA-Z0-9_\-]+))?/;
  const match = trimmed.match(urlRegex);
  if (match) return { roomCode: match[1], e2eKey: match[2] || null };
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex !== -1) {
    const roomCode = trimmed.substring(0, hashIndex).replace(/[^a-zA-Z0-9_\-]/g, '');
    const e2eKey = trimmed.substring(hashIndex + 1).replace(/[^a-zA-Z0-9_\-]/g, '');
    return { roomCode, e2eKey: e2eKey || null };
  }
  return { roomCode: trimmed.replace(/[^a-zA-Z0-9_\-]/g, ''), e2eKey: null };
};

/* ── How It Works Steps ─────────────────────── */
const PRIVACY_STEPS = [
  { icon: Lock, label: 'Encrypt', desc: 'AES-256 in your browser' },
  { icon: Link2, label: 'Secret Link', desc: 'Key stays in URL hash' },
  { icon: MousePointerClick, label: 'Open Once', desc: 'One view only' },
  { icon: Flame, label: 'Destroyed', desc: 'Gone forever' },
];

/* ── Component ──────────────────────────────── */
export default function Home() {
  const [mode, setMode] = useState<'message' | 'chat' | 'vault'>('message');
  const [content, setContent] = useState('');
  const [chatCode, setChatCode] = useState('');
  const [pastedE2EKey, setPastedE2EKey] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [messageId, setMessageId] = useState('');
  const [messageStatus, setMessageStatus] = useState<'unread' | 'read'>('unread');

  // Message Settings
  const [expiryDuration, setExpiryDuration] = useState<number>(60);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [decoyMessage, setDecoyMessage] = useState('');
  const [holdToReveal, setHoldToReveal] = useState(false);
  const [useCustomAlias, setUseCustomAlias] = useState(false);
  const [customAlias, setCustomAlias] = useState('');

  // Chat Settings
  const [useCustomRoomCode, setUseCustomRoomCode] = useState(false);
  const [customRoomCode, setCustomRoomCode] = useState('');

  // Vault Settings
  const [vaultItems, setVaultItems] = useState<{ id: string; type: 'note' | 'link'; content: string }[]>([]);
  const [vaultItemInput, setVaultItemInput] = useState('');
  const [vaultItemType, setVaultItemType] = useState<'note' | 'link'>('note');
  const [vaultPassword, setVaultPassword] = useState('');
  const [vaultUsePassword, setVaultUsePassword] = useState(false);
  const [vaultExpiry, setVaultExpiry] = useState<number>(300);
  const [vaultOneTime, setVaultOneTime] = useState(true);
  const [vaultLink, setVaultLink] = useState('');
  const [vaultCopied, setVaultCopied] = useState(false);
  const [isCreatingVault, setIsCreatingVault] = useState(false);

  // Attachment
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // History
  const [history, setHistory] = useState<Array<{
    id: string; link: string; createdAt: number;
    status: 'unread' | 'read' | 'revoked'; screenshotDetected?: boolean;
  }>>(() => {
    const saved = localStorage.getItem('anonym_history');
    return saved ? JSON.parse(saved) : [];
  });

  // Modal
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean; type: 'alert' | 'confirm'; title: string; message: string; onConfirm?: () => void;
  }>({ isOpen: false, type: 'alert', title: '', message: '' });

  const navigate = useNavigate();

  const showToast = (message: string, type: 'success' | 'warning' | 'info' = 'success') => setToast({ message, type });
  const triggerAlert = (title: string, message: string) => setModalConfig({ isOpen: true, type: 'alert', title, message });
  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => setModalConfig({ isOpen: true, type: 'confirm', title, message, onConfirm });

  const getSecurityTier = () => {
    if (usePassword && expiryDuration <= 10) return { label: 'Maximum', color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-950/20' };
    if (usePassword || expiryDuration <= 10) return { label: 'High', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-950/20' };
    return { label: 'Standard', color: 'text-zinc-600 dark:text-zinc-400', bg: 'bg-zinc-100 dark:bg-zinc-800/50' };
  };

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }
  }, [toast]);

  // Persist history
  useEffect(() => { localStorage.setItem('anonym_history', JSON.stringify(history)); }, [history]);

  // Listen to history item status
  useEffect(() => {
    if (history.length === 0) return;
    const unsubs = history
      .filter(item => item.status === 'unread')
      .map(item => {
        const docRef = doc(db, 'messages', item.id);
        return onSnapshot(docRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setHistory(prev => prev.map(h => h.id === item.id
              ? { ...h, status: data.status || 'unread', screenshotDetected: data.screenshotDetected || false }
              : h
            ));
            if (data.screenshotDetected) {
              const alertKey = `alerted_ss_${item.id}`;
              if (!sessionStorage.getItem(alertKey)) {
                sessionStorage.setItem(alertKey, 'true');
                if (!document.hidden) triggerAlert('Security Violation', 'The recipient attempted to take a screenshot of your message!');
              }
            }
          } else {
            setHistory(prev => prev.map(h => h.id === item.id ? { ...h, status: 'read' } : h));
          }
        }, () => {
          setHistory(prev => prev.map(h => h.id === item.id ? { ...h, status: 'read' } : h));
        });
      });
    return () => unsubs.forEach(u => u());
  }, [history.length]);

  // Page title
  useEffect(() => { document.title = 'Anonym — Private conversations. Gone forever.'; }, []);

  // Current message status subscription
  useEffect(() => {
    if (!messageId) return;
    const unsub = onSnapshot(doc(db, 'messages', messageId), (snap) => {
      if (!snap.exists() || snap.data()?.status === 'read') setMessageStatus('read');
    }, () => setMessageStatus('read'));
    return () => unsub();
  }, [messageId]);

  // Notification on read
  useEffect(() => {
    if (messageStatus === 'read' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Message Read', { body: 'Your secure message has been opened and permanently destroyed.' });
    }
  }, [messageStatus]);

  const requestNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  };

  /* ── Submit Whisper ─────────────────────────── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    requestNotificationPermission();
    setIsSubmitting(true);

    try {
      const secretKey = CryptoJS.lib.WordArray.random(32).toString();
      const encryptionKey = secretKey + (usePassword ? password : '');
      const encryptedContent = CryptoJS.AES.encrypt(content, encryptionKey).toString();

      // Validate custom alias if set
      let docId: string | undefined;
      if (useCustomAlias && customAlias.trim()) {
        const aliasClean = customAlias.trim();
        if (!aliasClean.match(/^[a-zA-Z0-9\-]{4,30}$/)) {
          triggerAlert('Invalid Alias', 'Alias must be 4–30 alphanumeric characters or hyphens.');
          setIsSubmitting(false); return;
        }
        const existing = await getDoc(doc(db, 'messages', aliasClean));
        if (existing.exists()) {
          triggerAlert('Alias Taken', 'This alias is already in use. Please choose a different one or use a random ID.');
          setIsSubmitting(false); return;
        }
        docId = aliasClean;
      }

      const basePayload = {
        content: encryptedContent,
        createdAt: serverTimestamp(),
        status: 'unread',
        screenshotDetected: false,
        duration: expiryDuration,
        isPasswordProtected: usePassword,
        holdToReveal: holdToReveal,
        hasAttachment: false,
        decoy: usePassword && decoyMessage.trim() ? CryptoJS.AES.encrypt(decoyMessage.trim(), secretKey).toString() : '',
      };

      let docRef;
      if (selectedFile) {
        if (selectedFile.size > 5 * 1024 * 1024) {
          triggerAlert('File Too Large', 'Maximum file attachment size is 5MB.');
          setIsSubmitting(false); return;
        }
        const fileDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
        const encryptedFile = CryptoJS.AES.encrypt(fileDataUrl, encryptionKey).toString();
        const payload = {
          ...basePayload,
          hasAttachment: true,
          attachmentType: selectedFile.type,
          attachmentSize: selectedFile.size,
          attachmentName: CryptoJS.AES.encrypt(selectedFile.name, encryptionKey).toString(),
        };
        if (docId) {
          const docRefCustom = doc(db, 'messages', docId);
          await import('firebase/firestore').then(({ setDoc }) => setDoc(docRefCustom, payload));
          docRef = docRefCustom;
        } else {
          docRef = await addDoc(collection(db, 'messages'), payload);
        }
        const fileRef = ref(storage, `attachments/${docRef.id}`);
        await uploadString(fileRef, encryptedFile, 'raw');
        const attachmentUrl = await getDownloadURL(fileRef);
        await updateDoc(doc(db, 'messages', docRef.id), { attachmentUrl });
      } else {
        if (docId) {
          const docRefCustom = doc(db, 'messages', docId);
          await import('firebase/firestore').then(({ setDoc }) => setDoc(docRefCustom, basePayload));
          docRef = docRefCustom;
        } else {
          docRef = await addDoc(collection(db, 'messages'), basePayload);
        }
      }

      const generatedLink = `${window.location.origin}/m/${docRef.id}#${secretKey}`;
      setShareLink(generatedLink);
      setMessageId(docRef.id);
      setMessageStatus('unread');
      setHistory(prev => [{ id: docRef!.id, link: generatedLink, createdAt: Date.now(), status: 'unread' }, ...prev]);
    } catch (err) {
      console.error(err);
      triggerAlert('Error', 'Failed to securely generate the message link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Revoke Message ─────────────────────────── */
  const handleRevoke = async (id: string) => {
    triggerConfirm('Revoke Message', 'Permanently destroy this message before it is read?', async () => {
      try {
        await deleteDoc(doc(db, 'messages', id));
        const fileRef = ref(storage, `attachments/${id}`);
        deleteObject(fileRef).catch(() => {});
        setHistory(prev => prev.map(h => h.id === id ? { ...h, status: 'revoked' } : h));
        showToast('Message revoked and destroyed.', 'warning');
      } catch (err) {
        triggerAlert('Error', 'Failed to revoke message.');
      }
    });
  };

  /* ── Copy & Reset ───────────────────────────── */
  const handleCopy = async () => {
    await copyToClipboard(shareLink);
    setCopied(true);
    showToast('Secure link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setShareLink(''); setContent(''); setCopied(false); setMessageId('');
    setMessageStatus('unread'); setPassword(''); setDecoyMessage('');
    setUsePassword(false); setSelectedFile(null); setHoldToReveal(false);
    setUseCustomAlias(false); setCustomAlias('');
  };

  /* ── Chat ───────────────────────────────────── */
  const handlePasteAndGo = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const { roomCode, e2eKey } = parseInviteText(text);
      if (roomCode.length >= 4) {
        setChatCode(roomCode);
        setIsCheckingRoom(true);
        const snap = await getDoc(doc(db, 'rooms', roomCode));
        if (snap.exists()) {
          if (e2eKey) { sessionStorage.setItem(`chat_key_${roomCode}`, e2eKey); navigate(`/c/${roomCode}#${e2eKey}`); }
          else navigate(`/c/${roomCode}`);
        } else { triggerAlert('Room Not Found', 'This stealth chat room does not exist or has been incinerated.'); }
        setIsCheckingRoom(false);
      } else { triggerAlert('Invalid Code', 'The clipboard content does not contain a valid room code.'); }
    } catch { triggerAlert('Clipboard Failed', 'Please paste the room code manually.'); }
  };

  const handleChatCodeChange = (val: string) => {
    if (val.includes('/c/') || val.includes('#')) {
      const { roomCode, e2eKey } = parseInviteText(val);
      setChatCode(roomCode);
      if (e2eKey) { sessionStorage.setItem(`chat_key_${roomCode}`, e2eKey); setPastedE2EKey(e2eKey); }
    } else { setChatCode(val.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20)); }
  };

  const handleCreateChat = async () => {
    let code = '';
    if (useCustomRoomCode) {
      const trimmed = customRoomCode.trim();
      if (!trimmed.match(/^[a-zA-Z0-9_\-]{4,20}$/)) {
        triggerAlert('Invalid Code', 'Room codes must be 4–20 alphanumeric characters, dashes, or underscores.');
        return;
      }
      code = trimmed;
      setIsCheckingRoom(true);
      try {
        const snap = await getDoc(doc(db, 'rooms', code));
        if (snap.exists()) { triggerAlert('Code Taken', 'This room code is already active. Try a different one.'); setIsCheckingRoom(false); return; }
      } catch { triggerAlert('Error', 'Failed to check room status.'); setIsCheckingRoom(false); return; }
      setIsCheckingRoom(false);
    } else {
      code = Math.floor(10000000 + Math.random() * 90000000).toString();
    }
    const e2eKey = CryptoJS.lib.WordArray.random(16).toString();
    navigate(`/c/${code}#${e2eKey}`);
  };

  const handleJoinChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = chatCode.trim();
    if (trimmedCode.length >= 4) {
      setIsCheckingRoom(true);
      try {
        const snap = await getDoc(doc(db, 'rooms', trimmedCode));
        if (snap.exists()) {
          const finalKey = pastedE2EKey || sessionStorage.getItem(`chat_key_${trimmedCode}`);
          if (finalKey) { sessionStorage.setItem(`chat_key_${trimmedCode}`, finalKey); navigate(`/c/${trimmedCode}#${finalKey}`); }
          else navigate(`/c/${trimmedCode}`);
        } else { triggerAlert('Room Not Found', 'This stealth chat room does not exist or has been incinerated.'); }
      } catch { triggerAlert('Error', 'Failed to check chat room status.'); }
      finally { setIsCheckingRoom(false); }
    }
  };

  /* ── Vault ──────────────────────────────────── */
  const addVaultItem = () => {
    if (!vaultItemInput.trim()) return;
    setVaultItems(prev => [...prev, { id: crypto.randomUUID(), type: vaultItemType, content: vaultItemInput.trim() }]);
    setVaultItemInput('');
  };

  const handleCreateVault = async () => {
    if (vaultItems.length === 0) { triggerAlert('Empty Vault', 'Add at least one item to your vault.'); return; }
    setIsCreatingVault(true);
    try {
      const secretKey = CryptoJS.lib.WordArray.random(32).toString();
      const encKey = secretKey + (vaultUsePassword ? vaultPassword : '');
      const encryptedItems = vaultItems.map(item => ({
        type: item.type,
        content: CryptoJS.AES.encrypt(item.content, encKey).toString(),
      }));
      const { setDoc, doc: firestoreDoc } = await import('firebase/firestore');
      const vaultId = CryptoJS.lib.WordArray.random(16).toString().slice(0, 20);
      await setDoc(firestoreDoc(db, 'vaults', vaultId), {
        items: encryptedItems,
        createdAt: serverTimestamp(),
        status: 'open',
        duration: vaultExpiry,
        isPasswordProtected: vaultUsePassword,
        oneTimeOpen: vaultOneTime,
        itemCount: vaultItems.length,
      });
      const link = `${window.location.origin}/v/${vaultId}#${secretKey}`;
      setVaultLink(link);
    } catch (err) {
      console.error(err);
      triggerAlert('Error', 'Failed to create vault.');
    } finally {
      setIsCreatingVault(false);
    }
  };

  const handleCopyVaultLink = async () => {
    await copyToClipboard(vaultLink);
    setVaultCopied(true);
    showToast('Vault link copied!');
    setTimeout(() => setVaultCopied(false), 2000);
  };

  const resetVault = () => {
    setVaultLink(''); setVaultItems([]); setVaultItemInput('');
    setVaultPassword(''); setVaultUsePassword(false); setVaultOneTime(true);
  };

  /* ── Render ─────────────────────────────────── */
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-indigo-100 dark:selection:bg-indigo-900/30 transition-colors duration-200 antialiased relative overflow-x-hidden">

      {/* Background */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full bg-radial from-indigo-500/8 dark:from-indigo-500/5 to-transparent blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-violet-500/6 dark:from-violet-500/4 to-transparent blur-[80px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-40 dark:opacity-20" />
      </div>

      {/* Header */}
      <header className="flex justify-between items-center px-4 sm:px-8 py-3 sm:py-4 w-full max-w-3xl mx-auto shrink-0 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl flex items-center justify-center shadow-sm">
            <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <span className="font-bold text-sm sm:text-base tracking-tight text-zinc-900 dark:text-zinc-100">Anonym</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-[10px] tracking-widest uppercase font-semibold text-zinc-400 dark:text-zinc-500">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            E2E Encrypted
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-3 sm:px-6 pb-8 w-full max-w-3xl mx-auto relative z-10">

        {/* ── Hero ──────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center pt-6 pb-8 sm:pt-10 sm:pb-12 space-y-4 max-w-xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-widest mb-2">
            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
            Zero Knowledge · Open Source
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1]">
            Private conversations.<br />
            <span className="text-zinc-400 dark:text-zinc-500 font-light">Gone forever.</span>
          </h1>
          <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-md mx-auto">
            End-to-end encrypted. Self-destructing. No accounts. No traces.
          </p>
        </motion.div>

        {/* ── Privacy Explainer ─────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="w-full mb-6 sm:mb-8"
        >
          <div className="bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md border border-zinc-100 dark:border-zinc-800/50 rounded-2xl p-4 sm:p-5">
            <div className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-3 text-center">How Privacy Works</div>
            <div className="flex items-center justify-between gap-1">
              {PRIVACY_STEPS.map((step, i) => (
                <React.Fragment key={step.label}>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                    className="flex flex-col items-center gap-1.5 flex-1"
                  >
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200/60 dark:border-zinc-700/50">
                      <step.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    <span className="text-[9px] sm:text-[10px] font-bold text-zinc-700 dark:text-zinc-300 text-center">{step.label}</span>
                    <span className="text-[8px] sm:text-[9px] text-zinc-400 dark:text-zinc-500 text-center leading-tight hidden sm:block">{step.desc}</span>
                  </motion.div>
                  {i < PRIVACY_STEPS.length - 1 && (
                    <div className="flex-shrink-0 flex items-center">
                      <ChevronRight className="w-3 h-3 text-zinc-300 dark:text-zinc-700" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Mode Tabs ─────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="bg-white/70 dark:bg-zinc-900/50 backdrop-blur-md p-1 rounded-full inline-flex border border-zinc-200/50 dark:border-zinc-800/50 mb-4 sm:mb-6 shadow-sm"
        >
          {([
            { id: 'message', label: 'Whisper', Icon: Lock },
            { id: 'chat', label: 'Stealth Chat', Icon: Flame },
            { id: 'vault', label: 'Vault', Icon: Vault },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              id={`btn-mode-${id}`}
              onClick={() => setMode(id)}
              className={`px-3 sm:px-5 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                mode === id
                  ? id === 'chat'
                    ? 'bg-rose-600 text-white shadow-md'
                    : id === 'vault'
                    ? 'bg-violet-600 text-white shadow-md'
                    : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {label}
            </button>
          ))}
        </motion.div>

        {/* ── Main Card ─────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white dark:bg-zinc-900 w-full rounded-[20px] sm:rounded-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.05)] dark:shadow-black/25 border border-zinc-100 dark:border-zinc-800/80 overflow-hidden"
        >
          <div className="p-4 sm:p-7">
            <AnimatePresence mode="wait">

              {/* ── WHISPER MODE ──────────────────── */}
              {mode === 'message' && (
                !shareLink ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-4 sm:space-y-5"
                  >
                    {/* Header */}
                    <div className="flex justify-between items-center pb-3 border-b border-zinc-100 dark:border-zinc-800">
                      <div>
                        <div className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-0.5">New Message</div>
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Whisper securely</div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${getSecurityTier().bg} ${getSecurityTier().color}`}>
                        <Shield className="w-3 h-3" />{getSecurityTier().label}
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                      {/* Textarea */}
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-100 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/30 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
                        <div className="relative bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 focus-within:border-indigo-300 dark:focus-within:border-indigo-700 rounded-2xl overflow-hidden transition-colors">
                          <textarea
                            id="textarea-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Type your sensitive message here..."
                            className="w-full min-h-[100px] sm:min-h-[140px] bg-transparent p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none font-normal custom-scrollbar"
                            maxLength={2000}
                            required
                          />
                          {selectedFile && (
                            <div className="px-4 pb-3 flex items-center gap-2">
                              <div className="bg-zinc-200/60 dark:bg-zinc-800/60 border border-zinc-200/40 dark:border-zinc-700/40 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs text-zinc-800 dark:text-zinc-200">
                                <Paperclip className="w-3 h-3 text-zinc-500" />
                                <span className="font-medium max-w-[150px] truncate">{selectedFile.name}</span>
                                <span className="text-zinc-400 text-[10px] font-mono">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                                <button type="button" onClick={() => setSelectedFile(null)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-0.5 rounded-full cursor-pointer">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="bg-zinc-100/50 dark:bg-zinc-900/70 px-4 sm:px-5 py-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between items-center gap-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-400 font-bold flex items-center gap-1.5 select-none">
                                <Lock className="w-2.5 h-2.5" /> Auto-destructs
                              </span>
                              <label className="text-[9px] sm:text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                                <Paperclip className="w-3 h-3" />
                                {selectedFile ? 'Change File' : 'Attach'}
                                <input type="file" className="hidden" onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    if (file.size > 5 * 1024 * 1024) triggerAlert('File Too Large', 'Max 5MB.');
                                    else setSelectedFile(file);
                                  }
                                }} />
                              </label>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold font-mono ${content.length > 1900 ? 'text-amber-500' : 'text-zinc-400'}`}>
                                {content.length}<span className="text-zinc-300 dark:text-zinc-700">/2000</span>
                              </span>
                              <svg className="w-4 h-4 -rotate-90" viewBox="0 0 20 20">
                                <circle className="text-zinc-200 dark:text-zinc-800" strokeWidth="2" stroke="currentColor" fill="transparent" r="8" cx="10" cy="10" />
                                <circle className={`${content.length >= 2000 ? 'text-rose-500' : content.length > 1800 ? 'text-amber-500' : 'text-indigo-500'} transition-all duration-300`}
                                  strokeWidth="2" strokeDasharray={50.26}
                                  strokeDashoffset={50.26 - (Math.min(content.length / 2000, 1) * 50.26)}
                                  strokeLinecap="round" stroke="currentColor" fill="transparent" r="8" cx="10" cy="10" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Settings Panel */}
                      <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 p-3 sm:p-4 rounded-xl space-y-3 sm:space-y-4">
                        {/* Timer */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">Self-Destruct Timer</label>
                            <span className="text-[10px] text-zinc-400">How long the recipient has to read it.</span>
                          </div>
                          <div className="flex bg-zinc-200/60 dark:bg-zinc-800/60 p-0.5 rounded-full border border-zinc-200/40 dark:border-zinc-700/40">
                            {([10, 30, 60, 300] as const).map(d => (
                              <button key={d} type="button" onClick={() => setExpiryDuration(d)}
                                className={`px-2.5 sm:px-3.5 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer ${expiryDuration === d ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}>
                                {d === 300 ? '5m' : `${d}s`}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Password */}
                        <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">Password Protection</label>
                              <span className="text-[10px] text-zinc-400">Require a password to decrypt.</span>
                            </div>
                            <button type="button" onClick={() => setUsePassword(!usePassword)}
                              className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${usePassword ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${usePassword ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          <AnimatePresence>
                            {usePassword && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden space-y-2">
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                  placeholder="Enter secure password"
                                  className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-indigo-400 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" required={usePassword} />
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 block">Fake Decoy Message (Optional)</label>
                                  <textarea value={decoyMessage} onChange={(e) => setDecoyMessage(e.target.value)}
                                    placeholder="e.g. Hi, here are the grocery items..."
                                    className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-indigo-400 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 h-16 resize-none" />
                                  <span className="text-[9px] text-zinc-400 leading-tight block">Shows immediately without password — covers your tracks.</span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Hold to Reveal */}
                        <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-3 flex items-center justify-between">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">Hold to Reveal</label>
                            <span className="text-[10px] text-zinc-400">Message only visible while held. Releases on lift.</span>
                          </div>
                          <button type="button" onClick={() => setHoldToReveal(!holdToReveal)}
                            className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${holdToReveal ? 'bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${holdToReveal ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>

                        {/* Custom Alias */}
                        <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">Custom Link Alias</label>
                              <span className="text-[10px] text-zinc-400">e.g. /m/project-midnight</span>
                            </div>
                            <button type="button" onClick={() => setUseCustomAlias(!useCustomAlias)}
                              className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${useCustomAlias ? 'bg-indigo-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${useCustomAlias ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          <AnimatePresence>
                            {useCustomAlias && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="flex items-center bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-indigo-400">
                                  <span className="px-3 text-zinc-400 text-xs font-mono">/m/</span>
                                  <input type="text" value={customAlias}
                                    onChange={(e) => setCustomAlias(e.target.value.replace(/[^a-zA-Z0-9\-]/g, '').slice(0, 30))}
                                    placeholder="your-alias-here"
                                    className="flex-1 bg-transparent py-3 pr-3 text-sm font-mono outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Submit */}
                      <div className="flex pt-1">
                        <button id="btn-generate-link" type="submit" disabled={isSubmitting || !content.trim()}
                          className="group relative bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold py-3 sm:py-3.5 px-6 sm:px-8 rounded-full hover:bg-black dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2.5 overflow-hidden shadow-lg shadow-zinc-900/15 active:scale-[0.98] cursor-pointer text-xs sm:text-sm btn-premium">
                          {isSubmitting
                            ? <div className="w-4 h-4 border-2 border-zinc-500 border-t-white dark:border-t-zinc-900 rounded-full animate-spin" />
                            : <><span>Generate Secure Link</span><ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" /></>}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                ) : (
                  /* Result state */
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, type: 'spring', bounce: 0.2 }}
                    className="space-y-5 py-2"
                  >
                    <div className="mx-auto w-12 h-12 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center border border-indigo-100 dark:border-indigo-900/50 mb-2">
                      <Check className="w-6 h-6" strokeWidth={2.5} />
                    </div>
                    <div className="text-center space-y-2">
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Link Encrypted</h2>
                      <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto text-xs sm:text-sm leading-relaxed">
                        Your message has been sealed. Share this link — it permanently self-destructs after one view.
                      </p>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-1.5 pl-4 rounded-full flex gap-3 items-center shadow-inner overflow-hidden">
                      <input id="input-share-link" type="text" value={shareLink} readOnly
                        className="bg-transparent text-xs sm:text-sm w-full text-zinc-800 dark:text-zinc-200 focus:outline-none font-mono truncate"
                        onFocus={(e) => e.target.select()} />
                      <button id="btn-copy-link" onClick={handleCopy}
                        className="bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-all flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer text-xs btn-premium">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <div className="bg-white p-2.5 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                        <QRCodeSVG value={shareLink} size={90} fgColor="#18181b" />
                      </div>
                      <div className="text-[9px] text-zinc-400 font-medium uppercase tracking-widest">or scan to view</div>
                    </div>

                    {/* Read Status */}
                    <div className="max-w-sm mx-auto">
                      <div className={`p-3 sm:p-4 rounded-xl flex items-center gap-3 transition-colors ${messageStatus === 'read' ? 'bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30' : 'bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${messageStatus === 'read' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600'}`}>
                          {messageStatus === 'read' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                          <span className={`text-xs font-bold block ${messageStatus === 'read' ? 'text-rose-700 dark:text-rose-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                            {messageStatus === 'read' ? 'Message Destroyed' : 'Awaiting Recipient'}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {messageStatus === 'read' ? 'Read and permanently erased.' : 'Watching for read event...'}
                          </span>
                        </div>
                        {messageStatus === 'unread' && <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse shrink-0" />}
                      </div>
                    </div>

                    <div className="flex justify-center pt-1">
                      <button id="btn-create-another" onClick={resetForm}
                        className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium px-6 py-2 transition-colors text-xs border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer">
                        Create Another Message
                      </button>
                    </div>
                  </motion.div>
                )
              )}

              {/* ── STEALTH CHAT MODE ─────────────── */}
              {mode === 'chat' && (
                <motion.div
                  key="chat"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 sm:space-y-5"
                >
                  <div className="flex justify-between items-center pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    <div>
                      <div className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] font-bold mb-0.5">Live Session</div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Stealth Chat</div>
                    </div>
                    <div className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5" /> Active
                    </div>
                  </div>

                  <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm leading-relaxed">
                    Create a live stealth chat or join an existing one. Rooms permanently self-destruct after 10 minutes of inactivity.
                  </p>

                  {/* Custom Room Code */}
                  <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 p-3 sm:p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">Custom Room Code</label>
                        <span className="text-[10px] text-zinc-400">Set a memorable room name.</span>
                      </div>
                      <button type="button" onClick={() => setUseCustomRoomCode(!useCustomRoomCode)}
                        className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${useCustomRoomCode ? 'bg-rose-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${useCustomRoomCode ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>
                    <AnimatePresence>
                      {useCustomRoomCode && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <input type="text" value={customRoomCode}
                            onChange={(e) => setCustomRoomCode(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20))}
                            placeholder="e.g. MySecretRoom"
                            className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-sm font-mono outline-none focus:ring-1 focus:ring-rose-400 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <button id="btn-create-room" onClick={handleCreateChat}
                    disabled={isCheckingRoom || (useCustomRoomCode && !customRoomCode.trim())}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 sm:py-3.5 px-6 rounded-full transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-rose-600/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer text-xs sm:text-sm btn-premium">
                    {isCheckingRoom
                      ? <div className="w-4 h-4 border-2 border-rose-300 border-t-white rounded-full animate-spin" />
                      : <><MessageSquare className="w-4 h-4" /><span>Create New Room</span></>}
                  </button>

                  <div className="flex items-center gap-3 py-1">
                    <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
                    <span className="text-[9px] uppercase tracking-widest text-zinc-400 font-bold">Or</span>
                    <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
                  </div>

                  <form onSubmit={handleJoinChat}>
                    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-1.5 pl-4 rounded-full flex gap-2 items-center shadow-inner focus-within:ring-2 focus-within:ring-rose-400 dark:focus-within:ring-rose-600 transition-all">
                      <KeyRound className="w-4 h-4 text-zinc-400 shrink-0" />
                      <input id="input-chat-code" type="text" value={chatCode}
                        onChange={(e) => handleChatCodeChange(e.target.value)}
                        placeholder="Enter room code"
                        className="bg-transparent text-sm sm:text-base tracking-widest w-full text-zinc-800 dark:text-zinc-200 focus:outline-none font-mono" />
                      <button type="button" onClick={handlePasteAndGo}
                        className="text-[9px] uppercase tracking-wider text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-bold px-3 py-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors shrink-0 cursor-pointer">
                        Paste & Go
                      </button>
                      <button id="btn-join-chat" type="submit"
                        disabled={chatCode.trim().length < 4 || isCheckingRoom}
                        className="bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white disabled:opacity-50 text-white dark:text-zinc-900 font-semibold px-5 sm:px-6 py-2 sm:py-2.5 rounded-full transition-all shrink-0 active:scale-95 cursor-pointer text-xs sm:text-sm shadow-sm">
                        {isCheckingRoom ? <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" /> : 'Join'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* ── VAULT MODE ────────────────────── */}
              {mode === 'vault' && (
                <motion.div
                  key="vault"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4 sm:space-y-5"
                >
                  <div className="flex justify-between items-center pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    <div>
                      <div className="text-[9px] text-zinc-400 uppercase tracking-[0.2em] font-bold mb-0.5">Secure Package</div>
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create Vault</div>
                    </div>
                    <div className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-violet-50 dark:bg-violet-950/20 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-900/30 flex items-center gap-1.5">
                      <Vault className="w-3 h-3" /> Encrypted
                    </div>
                  </div>

                  {!vaultLink ? (
                    <div className="space-y-4">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        Bundle multiple items — notes, links — into one encrypted package. Burns after opening or expires automatically.
                      </p>

                      {/* Items list */}
                      {vaultItems.length > 0 && (
                        <div className="space-y-2">
                          {vaultItems.map(item => (
                            <div key={item.id} className="flex items-start gap-2 bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 p-3 rounded-xl">
                              <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${item.type === 'note' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600'}`}>
                                {item.type === 'note' ? 'N' : 'L'}
                              </div>
                              <span className="text-xs text-zinc-700 dark:text-zinc-300 flex-1 break-all">{item.content}</span>
                              <button onClick={() => setVaultItems(prev => prev.filter(i => i.id !== item.id))} className="text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add item */}
                      <div className="space-y-2">
                        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-full w-fit">
                          {(['note', 'link'] as const).map(type => (
                            <button key={type} type="button" onClick={() => setVaultItemType(type)}
                              className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer ${vaultItemType === type ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'}`}>
                              {type}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input type={vaultItemType === 'link' ? 'url' : 'text'} value={vaultItemInput}
                            onChange={(e) => setVaultItemInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVaultItem(); } }}
                            placeholder={vaultItemType === 'note' ? 'Enter a secret note...' : 'https://...'}
                            className="flex-1 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-violet-400 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
                          <button type="button" onClick={addVaultItem}
                            className="w-10 h-10 bg-violet-600 hover:bg-violet-700 text-white rounded-xl flex items-center justify-center transition-colors cursor-pointer shadow-sm shrink-0">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Vault settings */}
                      <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 p-3 sm:p-4 rounded-xl space-y-3">
                        {/* Expiry */}
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Expires In</label>
                          <div className="flex bg-zinc-200/60 dark:bg-zinc-800/60 p-0.5 rounded-full">
                            {([300, 3600, 86400] as const).map(d => (
                              <button key={d} type="button" onClick={() => setVaultExpiry(d)}
                                className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-all cursor-pointer ${vaultExpiry === d ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}>
                                {d === 300 ? '5m' : d === 3600 ? '1h' : '24h'}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* One time */}
                        <div className="flex items-center justify-between border-t border-zinc-200/50 dark:border-zinc-800/50 pt-3">
                          <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">Burn After Read</label>
                            <span className="text-[9px] text-zinc-400">Destroy vault on first open.</span>
                          </div>
                          <button type="button" onClick={() => setVaultOneTime(!vaultOneTime)}
                            className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${vaultOneTime ? 'bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${vaultOneTime ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                        {/* Password */}
                        <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">Password Protection</label>
                              <span className="text-[9px] text-zinc-400">Extra layer of encryption.</span>
                            </div>
                            <button type="button" onClick={() => setVaultUsePassword(!vaultUsePassword)}
                              className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${vaultUsePassword ? 'bg-violet-500' : 'bg-zinc-200 dark:bg-zinc-800'}`}>
                              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${vaultUsePassword ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                          <AnimatePresence>
                            {vaultUsePassword && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <input type="password" value={vaultPassword} onChange={(e) => setVaultPassword(e.target.value)}
                                  placeholder="Vault password"
                                  className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-1 focus:ring-violet-400 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      <button onClick={handleCreateVault} disabled={isCreatingVault || vaultItems.length === 0}
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 sm:py-3.5 px-6 rounded-full transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-violet-600/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer text-xs sm:text-sm btn-premium">
                        {isCreatingVault
                          ? <div className="w-4 h-4 border-2 border-violet-300 border-t-white rounded-full animate-spin" />
                          : <><Vault className="w-4 h-4" /><span>Seal Vault ({vaultItems.length} item{vaultItems.length !== 1 ? 's' : ''})</span></>}
                      </button>
                    </div>
                  ) : (
                    /* Vault result */
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0.2 }} className="space-y-5 py-2">
                      <div className="mx-auto w-12 h-12 bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 rounded-full flex items-center justify-center border border-violet-100 dark:border-violet-900/50">
                        <Vault className="w-6 h-6" />
                      </div>
                      <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold tracking-tight">Vault Sealed</h2>
                        <p className="text-zinc-500 text-xs sm:text-sm leading-relaxed max-w-sm mx-auto">Share this link securely. The vault will {vaultOneTime ? 'burn after first open' : `expire after ${vaultExpiry === 300 ? '5 minutes' : vaultExpiry === 3600 ? '1 hour' : '24 hours'}`}.</p>
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-1.5 pl-4 rounded-full flex gap-3 items-center shadow-inner overflow-hidden">
                        <input type="text" value={vaultLink} readOnly className="bg-transparent text-xs sm:text-sm w-full text-zinc-800 dark:text-zinc-200 focus:outline-none font-mono truncate" onFocus={(e) => e.target.select()} />
                        <button onClick={handleCopyVaultLink}
                          className="bg-violet-600 hover:bg-violet-700 text-white font-medium px-4 sm:px-5 py-2 sm:py-2.5 rounded-full transition-all flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer text-xs btn-premium">
                          {vaultCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {vaultCopied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <div className="flex justify-center">
                        <button onClick={resetVault} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium px-6 py-2 transition-colors text-xs border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer">
                          Create Another Vault
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Sent Whispers History ─────────────── */}
        <AnimatePresence>
          {history.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="w-full mt-4 bg-white dark:bg-zinc-900 rounded-[20px] sm:rounded-[24px] border border-zinc-100 dark:border-zinc-800 p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-black/20 space-y-3"
            >
              <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                  <h2 className="text-xs font-bold uppercase tracking-wider">Sent Whispers</h2>
                </div>
                <button onClick={() => triggerConfirm('Clear History', 'Permanently clear your sent whispers history?', () => setHistory([]))}
                  className="text-[9px] text-zinc-400 hover:text-rose-500 dark:hover:text-rose-400 font-bold uppercase tracking-wider transition-colors cursor-pointer">
                  Clear All
                </button>
              </div>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                {history.map(item => (
                  <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2.5 sm:p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/60 gap-2 group">
                    <div className="flex flex-col text-left min-w-0">
                      <span className="text-[10px] font-mono font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[260px] sm:max-w-sm">{item.link}</span>
                      <span className="text-[9px] text-zinc-400 mt-0.5">{getRelativeTime(item.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                      {item.screenshotDetected && (
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 animate-pulse">⚠️ SS</span>
                      )}
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        item.status === 'revoked'
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                          : item.status === 'read'
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700'
                          : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30'
                      }`}>
                        {item.status === 'revoked' ? 'Revoked' : item.status === 'read' ? 'Destroyed' : 'Unread'}
                      </span>
                      {item.status === 'unread' && (
                        <button onClick={() => handleRevoke(item.id)} title="Revoke message"
                          className="p-1.5 text-zinc-400 hover:text-rose-500 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <button onClick={() => { copyToClipboard(item.link); showToast('Link copied!'); }}
                        className="p-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 rounded-full border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-all cursor-pointer">
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer ──────────────────────────────── */}
      <footer className="w-full max-w-3xl mx-auto px-4 sm:px-8 pb-8 pt-4 border-t border-zinc-200/50 dark:border-zinc-800/50 mt-6 text-[10px] text-zinc-400 dark:text-zinc-500 flex flex-col md:flex-row items-center justify-between gap-3 font-medium uppercase tracking-wider shrink-0 select-none relative z-10">
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span>System Active</span>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <span>Anti-Capture Enabled</span>
          <span className="text-zinc-300 dark:text-zinc-800 hidden sm:inline">•</span>
          <span className="hidden sm:inline">Press ESC×2 for Panic Mode</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-semibold">Privacy</Link>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-semibold">Terms</Link>
          <span className="text-zinc-300 dark:text-zinc-800">•</span>
          <span className="font-mono tracking-normal normal-case">© {new Date().getFullYear()} Anonym · Made by SUBH ROY</span>
        </div>
      </footer>

      {/* ── Modal ───────────────────────────────── */}
      <AnimatePresence>
        {modalConfig.isOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-950/40 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              className="bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200/60 dark:border-zinc-800 p-6 sm:p-7 max-w-sm w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}>
              <div className="space-y-4">
                <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <div className="w-8 h-8 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{modalConfig.title}</h3>
                </div>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">{modalConfig.message}</p>
                <div className="flex gap-3 pt-1">
                  {modalConfig.type === 'confirm' ? (
                    <>
                      <button onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                        className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 font-medium py-2.5 rounded-full text-xs uppercase tracking-wider transition-colors cursor-pointer border dark:border-zinc-700/50">
                        Cancel
                      </button>
                      <button onClick={() => { modalConfig.onConfirm?.(); setModalConfig(prev => ({ ...prev, isOpen: false })); }}
                        className="flex-1 bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-2.5 rounded-full text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-md">
                        Confirm
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                      className="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-2.5 rounded-full text-xs uppercase tracking-wider transition-colors cursor-pointer shadow-md">
                      Okay
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ───────────────────────────────── */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-6 right-4 sm:right-6 z-50 flex items-center gap-3 bg-zinc-900/95 dark:bg-white/95 text-white dark:text-zinc-900 px-4 py-3 rounded-2xl shadow-xl backdrop-blur-md border border-white/10 dark:border-black/5 text-sm font-medium">
            {toast.type === 'success' && <Check className="w-4 h-4 text-indigo-400 dark:text-indigo-600 shrink-0" />}
            {toast.type === 'warning' && <ShieldAlert className="w-4 h-4 text-rose-400 dark:text-rose-600 shrink-0" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
