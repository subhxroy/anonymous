import React, { useState, useEffect } from 'react';
import { db, storage } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, getDoc, updateDoc } from 'firebase/firestore';
import { Send, Copy, Check, Shield, ShieldAlert, ArrowRight, Lock, Eye, EyeOff, MessageSquare, KeyRound, Flame, Paperclip, X } from 'lucide-react';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate, Link } from 'react-router-dom';
import CryptoJS from 'crypto-js';
import ThemeToggle from '../components/ThemeToggle';

const copyToClipboard = async (text: string): Promise<boolean> => {
  // Try modern Clipboard API first
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy
    }
  }
  // Legacy execCommand fallback
  return fallbackCopy(text);
};

const fallbackCopy = (text: string): boolean => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.cssText = "position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;box-shadow:none;background:transparent;opacity:0;";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, 999999);
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textArea);
  return success;
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
  
  // Try to match the URL format.
  // Example: http://localhost:3000/c/12345678#e2ekey
  const urlRegex = /\/c\/([a-zA-Z0-9_\-]+)(?:#([a-zA-Z0-9_\-]+))?/;
  const match = trimmed.match(urlRegex);
  
  if (match) {
    return {
      roomCode: match[1],
      e2eKey: match[2] || null
    };
  }
  
  // If it's not a full URL, check if it contains a hash (e.g., "12345678#key")
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex !== -1) {
    const roomCode = trimmed.substring(0, hashIndex).replace(/[^a-zA-Z0-9_\-]/g, '');
    const e2eKey = trimmed.substring(hashIndex + 1).replace(/[^a-zA-Z0-9_\-]/g, '');
    return { roomCode, e2eKey: e2eKey || null };
  }
  
  // Otherwise, it's just a raw room code
  return {
    roomCode: trimmed.replace(/[^a-zA-Z0-9_\-]/g, ''),
    e2eKey: null
  };
};

export default function Home() {
  const [mode, setMode] = useState<'message' | 'chat'>('message');
  const [content, setContent] = useState('');

  const getSecurityTier = () => {
    if (usePassword && expiryDuration <= 10) {
      return { label: 'Maximum', color: 'text-rose-600 dark:text-rose-455', bg: 'bg-rose-50 dark:bg-rose-955/20' };
    }
    if (usePassword || expiryDuration <= 10) {
      return { label: 'High', color: 'text-amber-600 dark:text-amber-450', bg: 'bg-amber-50 dark:bg-amber-955/20' };
    }
    return { label: 'Standard', color: 'text-emerald-650 dark:text-emerald-450', bg: 'bg-emerald-50 dark:bg-emerald-955/20' };
  };

  const [chatCode, setChatCode] = useState('');
  const [pastedE2EKey, setPastedE2EKey] = useState<string | null>(null);

  const handlePasteAndGo = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const { roomCode, e2eKey } = parseInviteText(text);
      if (roomCode.length >= 4) {
        setChatCode(roomCode);
        setIsCheckingRoom(true);
        const roomRef = doc(db, 'rooms', roomCode);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          if (e2eKey) {
            sessionStorage.setItem(`chat_key_${roomCode}`, e2eKey);
            navigate(`/c/${roomCode}#${e2eKey}`);
          } else {
            navigate(`/c/${roomCode}`);
          }
        } else {
          triggerAlert('Room Not Found', 'This stealth chat room does not exist, has expired, or has already been incinerated.');
        }
        setIsCheckingRoom(false);
      } else {
        triggerAlert('Invalid Room Code', 'The clipboard content does not contain a valid room code (at least 4 characters).');
      }
    } catch (err) {
      triggerAlert('Clipboard Access Failed', 'Please paste the room code manually.');
    }
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingRoom, setIsCheckingRoom] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'warning' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const [shareLink, setShareLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [messageId, setMessageId] = useState('');
  const [messageStatus, setMessageStatus] = useState<'unread' | 'read'>('unread');
  
  // Custom Timer & Password States
  const [expiryDuration, setExpiryDuration] = useState<number>(60); // default 60s
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [decoyMessage, setDecoyMessage] = useState('');
  
  // Custom Room Code States
  const [useCustomRoomCode, setUseCustomRoomCode] = useState(false);
  const [customRoomCode, setCustomRoomCode] = useState('');

  // Attachment States
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [history, setHistory] = useState<Array<{ 
    id: string; 
    link: string; 
    createdAt: number; 
    status: 'unread' | 'read';
    screenshotDetected?: boolean;
  }>>(() => {
    const saved = localStorage.getItem('anonym_history');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Custom Modal State
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
  });

  const triggerAlert = (title: string, message: string) => {
    setModalConfig({
      isOpen: true,
      type: 'alert',
      title,
      message,
    });
  };

  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({
      isOpen: true,
      type: 'confirm',
      title,
      message,
      onConfirm,
    });
  };
  
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('anonym_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (history.length === 0) return;

    const unsubscribes = history.map(item => {
      const docRef = doc(db, 'messages', item.id);
      return onSnapshot(
        docRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setHistory(prev => 
              prev.map(h => h.id === item.id ? { 
                ...h, 
                status: data.status || 'unread',
                screenshotDetected: data.screenshotDetected || false
              } : h)
            );

            if (data.screenshotDetected) {
              if (document.hidden && "Notification" in window && Notification.permission === "granted") {
                new Notification("⚠️ SECURITY WARNING", {
                  body: "A screenshot attempt was detected on one of your secure messages!",
                });
              } else if (!document.hidden) {
                const alertKey = `alerted_ss_${item.id}`;
                if (!sessionStorage.getItem(alertKey)) {
                  sessionStorage.setItem(alertKey, 'true');
                  triggerAlert('Security Violation', 'The recipient of your message attempted to take a screenshot or lost window focus!');
                }
              }
            }
          } else {
            // Document deleted (permanently imploded)
            setHistory(prev => 
              prev.map(h => h.id === item.id ? { ...h, status: 'read' } : h)
            );
          }
        },
        () => {
          setHistory(prev => 
            prev.map(h => h.id === item.id ? { ...h, status: 'read' } : h)
          );
        }
      );
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [history.length]);

  useEffect(() => {
    document.title = "Anonym - Secure Messages & Stealth Chat";
  }, []);

  useEffect(() => {
    if (!messageId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'messages', messageId), 
      (docSnap) => {
        if (!docSnap.exists() || docSnap.data()?.status === 'read') {
          setMessageStatus('read');
        }
      },
      (error) => {
        console.log("Snapshot closed/error (likely read & deleted)", error);
        setMessageStatus('read');
      }
    );

    return () => unsubscribe();
  }, [messageId]);

  useEffect(() => {
    if (messageStatus === 'read' && "Notification" in window && Notification.permission === "granted") {
      new Notification("Message Read", {
        body: "Your secure message has been opened and permanently destroyed.",
      });
    }
  }, [messageStatus]);

  const requestNotificationPermission = () => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    
    requestNotificationPermission();
    
    setIsSubmitting(true);
    try {
      const secretKey = CryptoJS.lib.WordArray.random(32).toString();
      const encryptionKey = secretKey + (usePassword ? password : '');
      const encryptedContent = CryptoJS.AES.encrypt(content, encryptionKey).toString();

      if (selectedFile) {
        if (selectedFile.size > 5 * 1024 * 1024) {
          triggerAlert('File Too Large', 'Maximum file attachment size is 5MB.');
          setIsSubmitting(false);
          return;
        }

        // Read file as Data URL
        const fileDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });

        // Encrypt the entire Data URL string!
        const encryptedFile = CryptoJS.AES.encrypt(fileDataUrl, encryptionKey).toString();

        const docRef = await addDoc(collection(db, 'messages'), {
          content: encryptedContent,
          createdAt: serverTimestamp(),
          status: 'unread',
          screenshotDetected: false,
          duration: expiryDuration,
          isPasswordProtected: usePassword,
          hasAttachment: true,
          attachmentType: selectedFile.type,
          attachmentSize: selectedFile.size,
          attachmentName: CryptoJS.AES.encrypt(selectedFile.name, encryptionKey).toString(),
          decoy: usePassword && decoyMessage.trim() ? CryptoJS.AES.encrypt(decoyMessage.trim(), secretKey).toString() : ''
        });

        // Upload encrypted string to Firebase Storage
        const fileRef = ref(storage, `attachments/${docRef.id}`);
        await uploadString(fileRef, encryptedFile, 'raw');
        const attachmentUrl = await getDownloadURL(fileRef);

        // Update document with the storage URL
        await updateDoc(doc(db, 'messages', docRef.id), {
          attachmentUrl
        });

        const generatedLink = `${window.location.origin}/m/${docRef.id}#${secretKey}`;
        setShareLink(generatedLink);
        setMessageId(docRef.id);
        setMessageStatus('unread');

        const newHistoryItem = {
          id: docRef.id,
          link: generatedLink,
          createdAt: Date.now(),
          status: 'unread' as const
        };
        setHistory(prev => [newHistoryItem, ...prev]);

      } else {
        const docRef = await addDoc(collection(db, 'messages'), {
          content: encryptedContent,
          createdAt: serverTimestamp(),
          status: 'unread',
          screenshotDetected: false,
          duration: expiryDuration,
          isPasswordProtected: usePassword,
          hasAttachment: false,
          decoy: usePassword && decoyMessage.trim() ? CryptoJS.AES.encrypt(decoyMessage.trim(), secretKey).toString() : ''
        });

        const generatedLink = `${window.location.origin}/m/${docRef.id}#${secretKey}`;
        setShareLink(generatedLink);
        setMessageId(docRef.id);
        setMessageStatus('unread');

        const newHistoryItem = {
          id: docRef.id,
          link: generatedLink,
          createdAt: Date.now(),
          status: 'unread' as const
        };
        setHistory(prev => [newHistoryItem, ...prev]);
      }
    } catch (err) {
      console.error(err);
      triggerAlert('Error', 'Failed to securely generate the message link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async () => {
    await copyToClipboard(shareLink);
    setCopied(true);
    showToast('Secure message link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };


  const resetForm = () => {
    setShareLink('');
    setContent('');
    setCopied(false);
    setMessageId('');
    setMessageStatus('unread');
    setPassword('');
    setDecoyMessage('');
    setUsePassword(false);
    setSelectedFile(null);
  };

  const handleCreateChat = async () => {
    let code = '';
    if (useCustomRoomCode) {
      const trimmed = customRoomCode.trim();
      if (!trimmed.match(/^[a-zA-Z0-9_\-]{4,20}$/)) {
        triggerAlert('Invalid Room Code', 'Custom room codes must be between 4 and 20 alphanumeric characters, dashes, or underscores.');
        return;
      }
      code = trimmed;
      
      setIsCheckingRoom(true);
      try {
        const roomRef = doc(db, 'rooms', code);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          triggerAlert('Room Already Exists', 'This custom room code is already active. Please enter a different one.');
          setIsCheckingRoom(false);
          return;
        }
      } catch (err) {
        triggerAlert('Error', 'Failed to check room status.');
        setIsCheckingRoom(false);
        return;
      }
      setIsCheckingRoom(false);
    } else {
      code = Math.floor(10000000 + Math.random() * 90000000).toString();
    }
    
    // Generate a random E2E key for the room
    const e2eKey = CryptoJS.lib.WordArray.random(16).toString();
    navigate(`/c/${code}#${e2eKey}`);
  };

  const handleChatCodeChange = (val: string) => {
    if (val.includes('/c/') || val.includes('#')) {
      const { roomCode, e2eKey } = parseInviteText(val);
      setChatCode(roomCode);
      if (e2eKey) {
        sessionStorage.setItem(`chat_key_${roomCode}`, e2eKey);
        setPastedE2EKey(e2eKey);
      }
    } else {
      setChatCode(val.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20));
    }
  };

  const handleJoinChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = chatCode.trim();
    if (trimmedCode.length >= 4) {
      setIsCheckingRoom(true);
      try {
        const roomRef = doc(db, 'rooms', trimmedCode);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const finalKey = pastedE2EKey || sessionStorage.getItem(`chat_key_${trimmedCode}`);
          if (finalKey) {
            sessionStorage.setItem(`chat_key_${trimmedCode}`, finalKey);
            navigate(`/c/${trimmedCode}#${finalKey}`);
          } else {
            navigate(`/c/${trimmedCode}`);
          }
        } else {
          triggerAlert('Room Not Found', 'This stealth chat room does not exist, has expired, or has already been incinerated.');
        }
      } catch (err) {
        triggerAlert('Error', 'Failed to securely check chat room status.');
      } finally {
        setIsCheckingRoom(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-200 antialiased relative overflow-hidden">
      {/* Background Graphic Elements */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.4] dark:opacity-[0.2]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-emerald-500/10 dark:from-emerald-500/5 to-transparent blur-[80px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-rose-500/10 dark:from-rose-500/5 to-transparent blur-[80px]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
      </div>

      <header className="flex justify-between items-center px-4 sm:px-8 py-2.5 sm:py-4 w-full max-w-3xl mx-auto shrink-0 relative z-10">
        <h1 className="font-bold text-base sm:text-xl tracking-tighter uppercase flex items-center gap-1.5">
          <div className="w-6 h-6 sm:w-8 sm:h-8 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg flex items-center justify-center">
            <Lock className="w-3 h-3 sm:w-4 sm:h-4" />
          </div>
          Anonym
        </h1>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="text-[9px] sm:text-[11px] tracking-widest uppercase text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5 font-semibold">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="hidden sm:inline">E2E Encrypted</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center items-center px-3 sm:px-6 pb-6 w-full max-w-3xl mx-auto relative z-10">
             <div className="bg-white/50 dark:bg-zinc-900/35 backdrop-blur-md p-1 rounded-full inline-flex border border-zinc-200/50 dark:border-zinc-800/50 mb-3 sm:mb-6 shadow-sm">
          <button 
            id="btn-mode-message"
            onClick={() => setMode('message')}
            className={`px-4 sm:px-6 py-2 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${mode === 'message' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-md' : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}
          >
            <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> One-Time Message
          </button>
          <button 
            id="btn-mode-chat"
            onClick={() => setMode('chat')}
            className={`px-4 sm:px-6 py-2 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer ${mode === 'chat' ? 'bg-rose-600 text-white shadow-md' : 'text-zinc-500 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-505 dark:hover:text-rose-500'}`}
          >
            <Flame className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Stealth Chat
          </button>
        </div>

        <div className="bg-white dark:bg-zinc-900 w-full rounded-[20px] sm:rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] dark:shadow-black/20 relative border border-zinc-100 dark:border-zinc-800/80 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.01]" style={{ backgroundImage: 'radial-gradient(#000 1px,transparent 1px)', backgroundSize: '16px 16px' }}></div>
          
          <div className="relative z-10 p-4 sm:p-8">
            <AnimatePresence mode="wait">
              {mode === 'message' ? (
                /* MESSAGE MODE */
                 !shareLink ? (
                  <motion.div 
                    key="form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4 sm:space-y-6"
                  >
                    <div className="flex justify-between items-end mb-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-2 sm:pb-4">
                      <div>
                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">New Message</div>
                        <div className="text-sm sm:text-base text-zinc-800 dark:text-zinc-200 font-medium tracking-tight">Whisper securely</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Security Level</div>
                        <div className={`mt-1 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center justify-end gap-1.5 ${getSecurityTier().bg} ${getSecurityTier().color}`}>
                          <Shield className="w-3.5 h-3.5" />
                          {getSecurityTier().label}
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-5">
                      <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-zinc-200 to-zinc-100 dark:from-zinc-800 dark:to-zinc-900 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
                        <div className="relative bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-300 dark:focus-within:border-zinc-700 rounded-2xl overflow-hidden transition-colors">
                          <textarea
                            id="textarea-content"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Type your sensitive message here..."
                            className="w-full min-h-[80px] sm:min-h-[140px] bg-transparent p-3 sm:p-5 text-sm sm:text-xl leading-relaxed tracking-tight text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none resize-none font-normal custom-scrollbar"
                            maxLength={2000}
                            required
                          />
                          {selectedFile && (
                            <div className="px-4 sm:px-6 pb-2.5 sm:pb-4 flex items-center gap-2">
                              <div className="bg-zinc-200/50 dark:bg-zinc-800/50 border border-zinc-200/40 dark:border-zinc-700/40 px-3 py-1.5 rounded-xl flex items-center gap-2 w-fit text-xs text-zinc-800 dark:text-zinc-200">
                                <Paperclip className="w-3 h-3 text-zinc-500" />
                                <span className="font-semibold max-w-[150px] sm:max-w-[200px] truncate text-[10px] sm:text-xs">{selectedFile.name}</span>
                                <span className="text-zinc-405 dark:text-zinc-500 text-[9px] sm:text-[10px] font-mono font-bold">
                                  ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                                </span>
                                <button 
                                  type="button" 
                                  onClick={() => setSelectedFile(null)}
                                  className="text-zinc-405 hover:text-zinc-950 dark:hover:text-white transition-colors p-0.5 rounded-full hover:bg-zinc-300/40 dark:hover:bg-zinc-700/40 cursor-pointer"
                                  title="Remove attachment"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="bg-zinc-100/50 dark:bg-zinc-900/60 px-4 sm:px-6 py-2.5 sm:py-4 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between items-center flex-wrap gap-2.5">
                            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                              <span className="text-[9px] sm:text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-bold flex items-center gap-1.5 select-none">
                                  <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Auto-destructs
                              </span>
                              <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>
                              <label className="text-[9px] sm:text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-bold flex items-center gap-1.5 cursor-pointer transition-colors select-none">
                                <Paperclip className="w-3.5 h-3.5" />
                                <span>{selectedFile ? 'Change File' : 'Attach File (Max 5MB)'}</span>
                                <input 
                                  type="file" 
                                  className="hidden" 
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      if (file.size > 5 * 1024 * 1024) {
                                        triggerAlert('File Too Large', 'Maximum file attachment size is 5MB.');
                                      } else {
                                        setSelectedFile(file);
                                      }
                                    }
                                  }}
                                />
                              </label>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold font-mono ${content.length > 1900 ? 'text-amber-500' : 'text-zinc-400 dark:text-zinc-500'}`}>
                                {content.length} <span className="text-zinc-300 dark:text-zinc-700">/ 2000</span>
                              </span>
                              <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
                                <circle
                                  className="text-zinc-200 dark:text-zinc-800"
                                  strokeWidth="2"
                                  stroke="currentColor"
                                  fill="transparent"
                                  r="8"
                                  cx="10"
                                  cy="10"
                                />
                                <circle
                                  className={`${
                                    content.length >= 2000 
                                      ? 'text-rose-500' 
                                      : content.length > 1800 
                                      ? 'text-amber-500' 
                                      : 'text-zinc-800 dark:text-zinc-200'
                                  } transition-all duration-300`}
                                  strokeWidth="2"
                                  strokeDasharray={50.26}
                                  strokeDashoffset={50.26 - (Math.min((content.length / 2000) * 100, 100) / 100) * 50.26}
                                  strokeLinecap="round"
                                  stroke="currentColor"
                                  fill="transparent"
                                  r="8"
                                  cx="10"
                                  cy="10"
                                />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Whisper Settings */}
                      <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 p-3 sm:p-5 rounded-xl sm:rounded-2xl space-y-3 sm:space-y-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">
                              Self-Destruct Timer
                            </label>
                            <span className="text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-550 block">
                              How long the recipient has to read the message.
                            </span>
                          </div>
                          <div className="flex bg-zinc-200/50 dark:bg-zinc-800/50 p-0.5 sm:p-1 rounded-full border border-zinc-200/45 dark:border-zinc-700/40 w-fit self-start sm:self-center">
                            {([10, 30, 60, 300] as const).map(d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setExpiryDuration(d)}
                                className={`px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-bold transition-all cursor-pointer ${
                                  expiryDuration === d
                                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                                }`}
                              >
                                {d === 300 ? '5m' : `${d}s`}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="border-t border-zinc-200/50 dark:border-zinc-800/50 pt-3 sm:pt-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">
                                Password Protection
                              </label>
                              <span className="text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-550 block">
                                Require a password to decrypt the message.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setUsePassword(!usePassword)}
                              className={`w-12 h-6.5 rounded-full p-1 transition-colors focus:outline-none cursor-pointer ${
                                usePassword ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-800'
                              }`}
                            >
                              <div
                                className={`w-4.5 h-4.5 rounded-full bg-white dark:bg-zinc-900 transition-transform duration-200 ${
                                  usePassword ? 'translate-x-5.5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>

                          <AnimatePresence>
                            {usePassword && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden space-y-3"
                              >
                                <input
                                  type="password"
                                  value={password}
                                  onChange={(e) => setPassword(e.target.value)}
                                  placeholder="Enter secure password"
                                  className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-xl text-sm outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                                  required={usePassword}
                                />
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                                    Fake Decoy Message (Optional)
                                  </label>
                                  <textarea
                                    value={decoyMessage}
                                    onChange={(e) => setDecoyMessage(e.target.value)}
                                    placeholder="e.g. Hi, here are the grocery items: Milk, bread, eggs..."
                                    className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600 h-20 resize-none"
                                  />
                                  <span className="text-[9px] text-zinc-400 dark:text-zinc-500 block leading-tight">
                                    Decoy cover text displays immediately without a password prompt. Useful if anyone looks over the recipient's shoulder.
                                  </span>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      
                      <div className="flex pt-1">
                        <button
                          id="btn-generate-link"
                          type="submit"
                          disabled={isSubmitting || !content.trim()}
                          className="group relative bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-full hover:bg-black dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2.5 sm:gap-3 overflow-hidden shadow-lg shadow-zinc-900/20 active:scale-[0.98] cursor-pointer text-xs sm:text-base"
                        >
                          {isSubmitting ? (
                            <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              <span className="relative z-10">Generate Secure Link</span>
                              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, type: "spring", bounce: 0.2 }}
                    className="space-y-4 sm:space-y-6 py-1 sm:py-3"
                  >
                    <div className="mx-auto w-10 h-10 sm:w-14 sm:h-14 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center border border-emerald-100 dark:border-emerald-900/50 shadow-sm mb-2 sm:mb-4">
                      <Check className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={2.5} />
                    </div>

                    <div className="text-center space-y-2 sm:space-y-3">
                      <h2 className="text-2xl sm:text-3xl tracking-tight text-zinc-900 dark:text-zinc-100 font-semibold">
                        Link Encrypted
                      </h2>
                      <p className="text-zinc-500 dark:text-zinc-400 max-w-md mx-auto text-xs sm:text-sm leading-relaxed">
                        Your message has been sealed. Share this link with the recipient. It will permanently self-destruct after one view.
                      </p>
                    </div>
                    
                    <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-1.5 pl-4 sm:p-2 sm:pl-6 rounded-full flex gap-3 sm:gap-4 items-center shadow-inner overflow-hidden">
                      <input 
                        id="input-share-link"
                        type="text" 
                        value={shareLink} 
                        readOnly
                        className="bg-transparent text-xs sm:text-sm w-full text-zinc-800 dark:text-zinc-200 focus:outline-none font-medium truncate"
                        onFocus={(e) => e.target.select()}
                      />
                      <button
                        id="btn-copy-link"
                        onClick={handleCopy}
                        className="bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-medium px-4 sm:px-6 py-2 sm:py-3 rounded-full transition-all flex items-center justify-center gap-1.5 sm:gap-2 shrink-0 active:scale-95 cursor-pointer shadow-sm text-xs"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    
                    <div className="flex flex-col items-center gap-2 pt-1">
                      <div className="bg-white p-2.5 rounded-2xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                        <QRCodeSVG value={shareLink} size={100} fgColor="#18181b" />
                      </div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-widest">or scan to view</div>
                    </div>

                    {/* Read Status Indicator */}
                    <div className="max-w-sm mx-auto">
                      <div className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl flex items-center gap-3 sm:gap-4 transition-colors ${messageStatus === 'read' ? 'bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30' : 'bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-205 dark:border-zinc-850'}`}>
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 ${messageStatus === 'read' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-450' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-450'}`}>
                          {messageStatus === 'read' ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </div>
                        <div className="flex flex-col text-left">
                          <span className={`text-xs sm:text-sm font-bold ${messageStatus === 'read' ? 'text-rose-700 dark:text-rose-400' : 'text-zinc-800 dark:text-zinc-200'}`}>
                            {messageStatus === 'read' ? 'Message Destroyed' : 'Awaiting Recipient'}
                          </span>
                          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {messageStatus === 'read' 
                              ? 'The recipient has opened and read your message.' 
                              : 'We will notify you here once it is read.'}
                          </span>
                        </div>
                        {messageStatus === 'unread' && (
                          <div className="ml-auto w-2 h-2 bg-amber-500 rounded-full animate-pulse shrink-0" />
                        )}
                      </div>
                    </div>
                    
                    <div className="pt-2 flex justify-center">
                      <button
                        id="btn-create-another"
                        onClick={resetForm}
                        className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-medium px-6 py-2 transition-colors text-xs border-b border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 cursor-pointer"
                      >
                        Create Another Message
                      </button>
                    </div>
                  </motion.div>
                )
              ) : (
                /* CHAT MODE */
                <motion.div 
                  key="chat"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4 sm:space-y-6 py-1 sm:py-2"
                >
                  <div className="flex justify-between items-end mb-2 border-b border-zinc-100 dark:border-zinc-800 pb-2 sm:pb-4">
                    <div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Live Session</div>
                      <div className="text-sm sm:text-base text-zinc-800 dark:text-zinc-200 font-medium tracking-tight">Stealth Chat</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1">Status</div>
                      <div className="text-xs sm:text-sm text-rose-600 dark:text-rose-400 font-medium flex items-center justify-end gap-1">
                        <Flame className="w-3 h-3" />
                        Active
                      </div>
                    </div>
                  </div>

                  <div className="text-center space-y-3 sm:space-y-5 max-w-md mx-auto">
                     <p className="text-zinc-500 dark:text-zinc-400 text-xs sm:text-sm leading-relaxed">
                       Create a live stealth chat or join an existing one. Rooms permanently self-destruct after 10 minutes of inactivity.
                     </p>

                     {/* Custom Room Code Box */}
                     <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-zinc-200/60 dark:border-zinc-800/60 p-3 sm:p-5 rounded-xl sm:rounded-2xl text-left space-y-3">
                       <div className="flex items-center justify-between">
                         <div>
                           <label className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 block mb-0.5">
                             Use Custom Room Code
                           </label>
                           <span className="text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-550 block">
                             Set a memorable custom room code instead of random numbers.
                           </span>
                         </div>
                         <button
                           type="button"
                           onClick={() => setUseCustomRoomCode(!useCustomRoomCode)}
                           className={`w-12 h-6.5 rounded-full p-1 transition-colors focus:outline-none cursor-pointer ${
                             useCustomRoomCode ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-800'
                           }`}
                         >
                           <div
                             className={`w-4.5 h-4.5 rounded-full bg-white dark:bg-zinc-900 transition-transform duration-200 ${
                               useCustomRoomCode ? 'translate-x-5.5' : 'translate-x-0'
                             }`}
                           />
                         </button>
                       </div>

                       <AnimatePresence>
                         {useCustomRoomCode && (
                           <motion.div
                             initial={{ opacity: 0, height: 0 }}
                             animate={{ opacity: 1, height: 'auto' }}
                             exit={{ opacity: 0, height: 0 }}
                             className="overflow-hidden"
                           >
                             <input
                               type="text"
                               value={customRoomCode}
                               onChange={(e) => setCustomRoomCode(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20))}
                               placeholder="e.g. MySecretRoom"
                               className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-sm font-mono outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                               required={useCustomRoomCode}
                             />
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>
                     
                     <button
                        id="btn-create-room"
                        onClick={handleCreateChat}
                        disabled={isCheckingRoom || (useCustomRoomCode && !customRoomCode.trim())}
                        className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold py-3 sm:py-4 px-6 sm:px-8 rounded-full transition-all flex items-center justify-center gap-2.5 sm:gap-3 shadow-lg shadow-rose-600/20 active:scale-[0.98] disabled:opacity-50 cursor-pointer text-xs sm:text-base"
                      >
                        {isCheckingRoom ? (
                          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-rose-300 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span>Create New Room</span>
                          </>
                        )}
                      </button>

                      <div className="flex items-center gap-3 py-1 sm:py-2">
                        <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1"></div>
                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-550 font-bold">Or</span>
                        <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1"></div>
                      </div>

                      <form onSubmit={handleJoinChat} className="space-y-4">
                        <div className="bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-1.5 pl-4 sm:p-2 sm:pl-6 rounded-full flex gap-3 sm:gap-4 items-center shadow-inner overflow-hidden focus-within:ring-2 focus-within:ring-zinc-900 dark:focus-within:ring-zinc-100 focus-within:border-zinc-900 dark:focus-within:border-zinc-700 transition-all">
                          <KeyRound className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400 dark:text-zinc-500 shrink-0" />
                          <input 
                            id="input-chat-code"
                            type="text" 
                            value={chatCode}
                            onChange={(e) => handleChatCodeChange(e.target.value)}
                            placeholder="Enter room code"
                            className="bg-transparent text-sm sm:text-lg tracking-widest w-full text-zinc-800 dark:text-zinc-200 focus:outline-none font-mono font-medium"
                          />
                          <button
                            type="button"
                            onClick={handlePasteAndGo}
                            className="text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-bold px-3 py-1.5 rounded-lg hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors shrink-0 cursor-pointer"
                            title="Paste and join room"
                          >
                            Paste &amp; Go
                          </button>
                          <button
                            id="btn-join-chat"
                            type="submit"
                            disabled={chatCode.trim().length < 4 || isCheckingRoom}
                            className="bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-white dark:text-zinc-900 font-semibold px-5 sm:px-8 py-2.5 sm:py-3 rounded-full transition-all shrink-0 active:scale-95 flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-sm text-xs sm:text-sm"
                          >
                            {isCheckingRoom ? (
                              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                            ) : (
                              'Join'
                            )}
                          </button>
                        </div>
                      </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {history.length > 0 && (
          <div className="w-full mt-4 bg-white dark:bg-zinc-900 rounded-[20px] sm:rounded-[28px] border border-zinc-100 dark:border-zinc-800 p-4 sm:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.03)] dark:shadow-black/20 space-y-3 sm:space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-800 pb-4">
              <div className="flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
                <Lock className="w-4 h-4 text-zinc-500" />
                <h2 className="text-sm font-bold uppercase tracking-wider">My Sent Whispers</h2>
              </div>
              <button 
                onClick={() => {
                  triggerConfirm(
                    'Clear History', 
                    'Are you sure you want to permanently clear your sent whispers history?', 
                    () => setHistory([])
                  );
                }}
                className="text-[10px] text-zinc-400 hover:text-rose-600 dark:text-zinc-500 dark:hover:text-rose-450 font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Clear History
              </button>
            </div>
            
            <div className="space-y-2 max-h-[180px] sm:max-h-[220px] overflow-y-auto pr-2 custom-scrollbar">
              {history.map(item => (
                <div key={item.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2.5 sm:p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/50 dark:border-zinc-800/65 gap-2">
                  <div className="flex flex-col text-left">
                    <span className="text-xs font-mono font-medium text-zinc-500 dark:text-zinc-400 truncate max-w-[280px] sm:max-w-md">
                      {item.link}
                    </span>
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1" title={new Date(item.createdAt).toLocaleString()}>
                      {getRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    {item.screenshotDetected && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-300 dark:border-rose-900/40 animate-pulse flex items-center gap-1">
                        ⚠️ Screenshot Detected!
                      </span>
                    )}
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${item.status === 'read' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60' : 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-450 border border-amber-100 dark:border-amber-900/30'}`}>
                      {item.status === 'read' ? 'Destroyed' : 'Unread'}
                    </span>
                    <button
                      onClick={() => {
                        copyToClipboard(item.link);
                        showToast('Secure message link copied to clipboard!');
                      }}
                      className="p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700/80 text-zinc-600 dark:text-zinc-300 rounded-full border border-zinc-200/60 dark:border-zinc-700/60 active:scale-95 transition-transform cursor-pointer"
                      title="Copy Link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="w-full max-w-3xl mx-auto px-4 sm:px-8 pb-8 pt-4 border-t border-zinc-200/50 dark:border-zinc-800/50 mt-8 text-[11px] text-zinc-400 dark:text-zinc-500 flex flex-col md:flex-row items-center justify-between gap-4 font-medium uppercase tracking-wider shrink-0 select-none relative z-10">
        <div className="flex items-center gap-2 text-center md:text-left leading-relaxed flex-wrap justify-center">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>System Active</span>
          <span className="text-zinc-300 dark:text-zinc-800">&bull;</span>
          <span>Anti-Capture Enabled</span>
          <span className="text-zinc-300 dark:text-zinc-800 hidden sm:inline">&bull;</span>
          <span className="hidden sm:inline">Made by Subh Roy</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-center md:justify-end">
          <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-semibold">Privacy</Link>
          <span className="text-zinc-300 dark:text-zinc-800">&bull;</span>
          <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-semibold">Terms</Link>
          <span className="text-zinc-300 dark:text-zinc-800">&bull;</span>
          <span className="text-zinc-400 dark:text-zinc-500 font-mono tracking-normal">&copy; {new Date().getFullYear()} Anonym</span>
        </div>
      </footer>

      {/* Custom Modal Popup */}
      <AnimatePresence>
        {modalConfig.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-zinc-950/40 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200/60 dark:border-zinc-850 p-6 sm:p-8 max-w-sm w-full shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ backgroundImage: 'radial-gradient(#000 1px,transparent 1px)', backgroundSize: '12px 12px' }}></div>
              <div className="relative z-10 space-y-5 text-left">
                <div className="flex items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">{modalConfig.title}</h3>
                </div>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">{modalConfig.message}</p>
                <div className="flex gap-3 pt-2">
                  {modalConfig.type === 'confirm' ? (
                    <>
                      <button
                        onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                        className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-705 text-zinc-650 dark:text-zinc-350 font-medium py-3 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-95 cursor-pointer border dark:border-zinc-700/50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          modalConfig.onConfirm?.();
                          setModalConfig(prev => ({ ...prev, isOpen: false }));
                        }}
                        className="flex-1 bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-3 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-95 shadow-md shadow-zinc-900/10 dark:shadow-none cursor-pointer"
                      >
                        Confirm
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                      className="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-medium py-3 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-95 shadow-md shadow-zinc-900/10 dark:shadow-none cursor-pointer"
                    >
                      Okay
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-zinc-900/90 dark:bg-white/95 text-white dark:text-zinc-900 px-5 py-3.5 rounded-2xl shadow-xl backdrop-blur-md border border-white/10 dark:border-black/5 text-sm font-medium"
          >
            {toast.type === 'success' && <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />}
            {toast.type === 'warning' && <ShieldAlert className="w-4 h-4 text-rose-400 dark:text-rose-600 shrink-0" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
