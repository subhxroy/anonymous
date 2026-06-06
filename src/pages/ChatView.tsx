import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, addDoc, onSnapshot, serverTimestamp, orderBy, query, deleteDoc, getDoc, setDoc, updateDoc, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ShieldAlert, Flame, Send, Loader2, ArrowLeft, Check, CheckCheck, Users, Shield, Copy, Eye, EyeOff, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CryptoJS from 'crypto-js';
import ThemeToggle from '../components/ThemeToggle';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  createdAt: any;
  readBy?: string[];
  reactions?: Record<string, string[]>;
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const SPY_NAMES = ['Ghost', 'Spectre', 'Cipher', 'Shadow', 'Falcon', 'Phantom', 'Apex', 'Viper', 'Rogue', 'Raven'];
const generateSpyName = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SPY_NAMES.length;
  const num = Math.abs(hash) % 100;
  return `${SPY_NAMES[index]}-${num.toString().padStart(2, '0')}`;
};

const copyToClipboard = (text: string) => {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
};

const fallbackCopy = (text: string) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.width = "2em";
  textArea.style.height = "2em";
  textArea.style.padding = "0";
  textArea.style.border = "none";
  textArea.style.outline = "none";
  textArea.style.boxShadow = "none";
  textArea.style.background = "transparent";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, 999999);
  try {
    document.execCommand('copy');
  } catch (err) {
    console.error('Fallback copy failed', err);
  }
  document.body.removeChild(textArea);
};
const DecryptedText = ({ text }: { text: string }) => {
  const [displayText, setDisplayText] = useState('');
  const chars = '01#$&*+?@[]{}_-';

  useEffect(() => {
    if (text.startsWith('🔒')) {
      setDisplayText(text);
      return;
    }

    let iterations = 0;
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iterations) return text[index];
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('')
      );

      if (iterations >= text.length) {
        clearInterval(interval);
      }
      iterations += 1;
    }, 25);

    return () => clearInterval(interval);
  }, [text]);

  return <span>{displayText}</span>;
};

export default function ChatView() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isDestroyed, setIsDestroyed] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(1);
  const [isBlurred, setIsBlurred] = useState(false);
  const [isSecurityReady, setIsSecurityReady] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // E2E Encryption States
  const [roomKey, setRoomKey] = useState<string | null>(() => {
    const hash = window.location.hash.substring(1);
    const cleanHash = hash ? hash.split('?')[0] : null;
    return cleanHash || sessionStorage.getItem(`chat_key_${code}`) || null;
  });
  const [keyInput, setKeyInput] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(!roomKey);
  const [serverKeyHash, setServerKeyHash] = useState<string | null>(null);
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

  // Sync roomKey to sessionStorage
  useEffect(() => {
    if (roomKey && code) {
      sessionStorage.setItem(`chat_key_${code}`, roomKey);
    }
  }, [roomKey, code]);

  // Listen for hash changes in case the URL gets updated asynchronously
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      const cleanHash = hash ? hash.split('?')[0] : null;
      if (cleanHash) {
        setRoomKey(cleanHash);
        setIsKeyModalOpen(false);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Custom Spy Name States
  const [customName, setCustomName] = useState(() => {
    return sessionStorage.getItem(`chat_name_${code}`) || '';
  });
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');

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

  const handleCopyInviteLink = () => {
    const inviteLink = `${window.location.origin}/c/${code}${roomKey ? '#' + roomKey : ''}`;
    copyToClipboard(inviteLink);
    showToast('Secure invite link copied to clipboard!');
  };

  const handleCopyRoomCode = () => {
    if (!code) return;
    copyToClipboard(code);
    const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
    showToast(`Room code copied: ${formattedCode}`);
  };
  
  // Use session storage to persist user ID across reloads for bubble styling
  const [userId] = useState(() => {
    const existing = sessionStorage.getItem('anon_chat_userId');
    if (existing) return existing;
    const newId = Math.random().toString(36).substring(2, 10);
    sessionStorage.setItem('anon_chat_userId', newId);
    return newId;
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const playNotifySound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.log("Audio feedback blocked or unavailable:", e);
    }
  };

  const decryptMessage = (encryptedText: string, key: string) => {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, key);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return decrypted || '🔒 [Key Mismatch: Failed to Decrypt]';
    } catch (e) {
      return '🔒 [Key Mismatch: Failed to Decrypt]';
    }
  };

  useEffect(() => {
    const formattedCode = code?.match(/.{1,4}/g)?.join('-');
    document.title = formattedCode ? `Anonym - Stealth Chat Room ${formattedCode}` : "Anonym - Stealth Chat Room";
  }, [code]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Security activation delay
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setIsSecurityReady(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const reportScreenshotAttempt = async () => {
    if (!code || isDestroyed || !isSecurityReady) return;
    try {
      const messagesRef = collection(db, 'rooms', code, 'messages');
      const spyName = customName || generateSpyName(userId);
      await addDoc(messagesRef, {
        senderId: 'system',
        senderName: 'SYSTEM',
        content: `SECURITY ALERT: ${spyName} attempted to screenshot or capture the chat!`,
        createdAt: serverTimestamp()
      });
      
      const roomRef = doc(db, 'rooms', code);
      await setDoc(roomRef, {
        lastActiveAt: serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("Failed to log security violation:", e);
    }
  };

  // Anti-screenshot & focus loss hooks
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlurred(true);
        reportScreenshotAttempt();
      }
    };

    const handleWindowBlur = () => {
      setIsBlurred(true);
      reportScreenshotAttempt();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' || 
        (e.metaKey && e.shiftKey) || 
        (e.ctrlKey && e.key === 'p') ||
        (e.metaKey && e.key === 's')
      ) {
        setIsBlurred(true);
        reportScreenshotAttempt();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [code, isSecurityReady, customName]);

  // Listen for screen capture alerts from the other user
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.senderId === 'system') {
        const spyName = customName || generateSpyName(userId);
        if (!lastMsg.content.includes(spyName)) {
          const alertKey = `alerted_chat_ss_${lastMsg.id}`;
          if (!sessionStorage.getItem(alertKey)) {
            sessionStorage.setItem(alertKey, 'true');
            triggerAlert('Security Violation', 'The other user attempted to screenshot the chat room or lost window focus!');
          }
        }
      }
    }
  }, [messages, userId, customName]);

  // Name modal trigger after key configuration
  useEffect(() => {
    if (roomKey && !customName && !sessionStorage.getItem(`chat_name_skipped_${code}`)) {
      setIsNameModalOpen(true);
    }
  }, [roomKey, customName, code]);

  useEffect(() => {
    if (!code || !code.match(/^[a-zA-Z0-9_\-]{4,20}$/)) {
      setIsDestroyed(true);
      setIsLoading(false);
      return;
    }

    const roomRef = doc(db, 'rooms', code);
    let unsubRoom: (() => void) | null = null;
    let unsubMessages: (() => void) | null = null;
    let isMounted = true;
    
    const setupRoom = async () => {
      try {
        const snap = await getDoc(roomRef);
        let currentKeyHash = '';
        if (!snap.exists()) {
          currentKeyHash = roomKey ? CryptoJS.SHA256(roomKey).toString() : '';
          await setDoc(roomRef, {
            lastActiveAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            presence: [userId],
            keyHash: currentKeyHash,
            roomKey: roomKey || ''
          });
        } else {
          const data = snap.data();
          currentKeyHash = data?.keyHash || '';
          
          let activeKey = roomKey;
          if (!activeKey && data?.roomKey) {
            activeKey = data.roomKey;
            setRoomKey(activeKey);
            sessionStorage.setItem(`chat_key_${code}`, activeKey);
            setIsKeyModalOpen(false);
          }
          
          // Self-healing: if keyHash or roomKey is missing in DB but we have roomKey locally, write them!
          const updates: Record<string, any> = {};
          let needsUpdate = false;
          
          if (!currentKeyHash && activeKey) {
            currentKeyHash = CryptoJS.SHA256(activeKey).toString();
            updates.keyHash = currentKeyHash;
            needsUpdate = true;
          }
          if (!data?.roomKey && activeKey) {
            updates.roomKey = activeKey;
            needsUpdate = true;
          }
          if (!data?.createdAt) {
            updates.createdAt = serverTimestamp();
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            await setDoc(roomRef, updates, { merge: true });
          }

          await setDoc(roomRef, {
            presence: arrayUnion(userId)
          }, { merge: true });
        }

        if (!isMounted) return;

        if (currentKeyHash) {
          setServerKeyHash(currentKeyHash);
          const activeKey = roomKey || sessionStorage.getItem(`chat_key_${code}`);
          if (activeKey) {
            const localHash = CryptoJS.SHA256(activeKey).toString();
            if (localHash !== currentKeyHash) {
              setRoomKey(null);
              sessionStorage.removeItem(`chat_key_${code}`);
              setIsKeyModalOpen(true);
            }
          }
        }

        unsubRoom = onSnapshot(roomRef, (docSnap) => {
          if (!docSnap.exists()) {
            setIsDestroyed(true);
            setIsLoading(false);
            return;
          }
          
          const data = docSnap.data();
          const lastActiveAt = data.lastActiveAt?.toMillis() || Date.now();
          const activeMembers = data.presence || [];
          setMemberCount(activeMembers.length || 1);

          const typingMap = data.typing || {};
          const activeTypers = Object.entries(typingMap)
            .filter(([id, isTyping]) => id !== userId && isTyping === true)
            .map(([id]) => id);
          setTypingUsers(activeTypers);
          
          const checkAndSetTimer = () => {
            const remaining = Math.floor((lastActiveAt + 10 * 60 * 1000 - Date.now()) / 1000);
            if (remaining <= 0) {
              setIsDestroyed(true);
              deleteDoc(roomRef).catch(() => {});
            } else {
              setTimeLeft(remaining);
            }
          };
          
          checkAndSetTimer();
          setIsLoading(false);
        });

        const messagesRef = collection(db, 'rooms', code, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));
        
        unsubMessages = onSnapshot(q, (snapshot) => {
          const fetchedMessages: ChatMessage[] = [];
          const unreadIds: string[] = [];
          let hasNewIncomingMessage = false;
          
          snapshot.forEach((msgDoc) => {
            const data = msgDoc.data() as ChatMessage;
            fetchedMessages.push({ id: msgDoc.id, ...data });
            
            if (data.senderId !== userId && (!data.readBy || !data.readBy.includes(userId))) {
              unreadIds.push(msgDoc.id);
            }
          });

          setMessages(prev => {
            if (fetchedMessages.length > prev.length) {
              const lastMsg = fetchedMessages[fetchedMessages.length - 1];
              if (lastMsg.senderId !== userId) {
                hasNewIncomingMessage = true;
              }
            }
            return fetchedMessages;
          });
          
          if (hasNewIncomingMessage) {
            playNotifySound();
          }

          if (unreadIds.length > 0 && document.hasFocus()) {
            const batch = writeBatch(db);
            unreadIds.forEach(id => {
              const msgRef = doc(db, 'rooms', code, 'messages', id);
              batch.set(msgRef, { readBy: arrayUnion(userId) }, { merge: true });
            });
            batch.commit().catch(console.error);
          }
        });

      } catch (err) {
        console.error("Failed to setup room:", err);
        if (isMounted) {
          setIsDestroyed(true);
          setIsLoading(false);
        }
      }
    };
    
    setupRoom();

    return () => {
      isMounted = false;
      if (unsubRoom) unsubRoom();
      if (unsubMessages) unsubMessages();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      if (code) {
        const rRef = doc(db, 'rooms', code);
        updateDoc(rRef, {
          presence: arrayRemove(userId)
        }).catch(() => {});
      }
    };
  }, [code, userId]);

  useEffect(() => {
    if (timeLeft === null || isDestroyed) return;
    
    if (timeLeft <= 0) {
      setIsDestroyed(true);
      if (code) {
        deleteDoc(doc(db, 'rooms', code)).catch(() => {});
      }
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft(prev => prev !== null ? prev - 1 : null);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft, isDestroyed, code]);

  useEffect(() => {
    const handleFocus = () => {
      if (!code || !messages.length) return;
      const unreadIds = messages
        .filter(m => m.senderId !== userId && (!m.readBy || !m.readBy.includes(userId)))
        .map(m => m.id);
        
      if (unreadIds.length > 0) {
        const batch = writeBatch(db);
        unreadIds.forEach(id => {
          const msgRef = doc(db, 'rooms', code, 'messages', id);
          batch.set(msgRef, { readBy: arrayUnion(userId) }, { merge: true });
        });
        batch.commit().catch(console.error);
      }
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [messages, code, userId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!code || isDestroyed) return;

    const roomRef = doc(db, 'rooms', code);
    
    setDoc(roomRef, {
      typing: {
        [userId]: true
      }
    }, { merge: true }).catch(() => {});
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setDoc(roomRef, {
        typing: {
          [userId]: false
        }
      }, { merge: true }).catch(() => {});
    }, 2000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !code || isDestroyed || !roomKey) return;

    const messageContent = newMessage.trim();
    setNewMessage('');
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    try {
      const roomRef = doc(db, 'rooms', code);
      const messagesRef = collection(db, 'rooms', code, 'messages');
      
      // E2E encrypt outbound message
      const encrypted = CryptoJS.AES.encrypt(messageContent, roomKey).toString();
      
      await addDoc(messagesRef, {
        senderId: userId,
        senderName: customName || generateSpyName(userId),
        content: encrypted,
        createdAt: serverTimestamp()
      });
      
      await setDoc(roomRef, {
        lastActiveAt: serverTimestamp(),
        typing: {
          [userId]: false
        }
      }, { merge: true });
      
    } catch (err) {
      console.error(err);
    }
  };

  const handleReact = async (msgId: string, emoji: string, currentReactions: Record<string, string[]> = {}) => {
    if (!code) return;
    setActiveReactionMsgId(null);
    try {
      const msgRef = doc(db, 'rooms', code, 'messages', msgId);
      const users = currentReactions[emoji] || [];
      await setDoc(msgRef, {
        reactions: {
          [emoji]: users.includes(userId) ? arrayRemove(userId) : arrayUnion(userId)
        }
      }, { merge: true });
    } catch(e) {
      console.error(e);
    }
  };

  const handleIncinerateRoom = () => {
    triggerConfirm(
      'Incinerate Room',
      'Are you sure you want to permanently incinerate this room and destroy all messages? This action cannot be undone.',
      async () => {
        if (!code) return;
        try {
          await deleteDoc(doc(db, 'rooms', code));
        } catch (e) {
          console.error("Failed to incinerate room:", e);
        }
      }
    );
  };

  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center space-y-6">
        <Loader2 className="w-8 h-8 text-zinc-900 dark:text-zinc-100 animate-spin" />
        <p className="text-zinc-400 dark:text-zinc-550 text-xs uppercase tracking-widest font-bold animate-pulse">Connecting to room</p>
      </div>
    );
  }

  if (isDestroyed) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center font-sans px-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white dark:bg-zinc-900 w-full max-w-md p-10 sm:p-12 rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] dark:shadow-black/25 border border-zinc-100 dark:border-zinc-800 text-center space-y-6 relative overflow-hidden"
        >
          <div className="mx-auto w-20 h-20 bg-rose-50 dark:bg-rose-950/20 text-rose-505 dark:text-rose-400 rounded-full flex items-center justify-center border border-rose-100 dark:border-rose-900/40">
            <Flame className="w-10 h-10" />
          </div>
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Room Incinerated</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">This chat has permanently self-destructed due to inactivity or manually triggered destruction.</p>
          </div>
          <div className="pt-6">
            <button 
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full hover:bg-black dark:hover:bg-white transition-colors font-medium flex items-center gap-2 mx-auto cursor-pointer"
            >
               <ArrowLeft className="w-4 h-4" />
               Return Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
  return (
    <div 
      className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans relative select-none touch-none overflow-hidden transition-colors duration-200"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {/* Background Graphic Elements */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.4] dark:opacity-[0.2]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-emerald-500/10 dark:from-emerald-500/5 to-transparent blur-[80px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-rose-500/10 dark:from-rose-500/5 to-transparent blur-[80px]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
      </div>
      <header className="w-full border-b border-zinc-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/85 backdrop-blur-md sticky top-0 z-20 px-3 py-3 sm:px-8 sm:py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between w-full">
          
          {/* Top row / Left section */}
          <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <button id="btn-back-home" onClick={() => navigate('/')} className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors p-1.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                 <ArrowLeft className="w-4.5 h-4.5" />
              </button>
              <div className="flex flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-zinc-450 dark:text-zinc-500">Stealth Room</span>
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" title={`${memberCount} member(s) active`}></span>
                </div>
                <h1 
                  onClick={handleCopyRoomCode} 
                  className="text-sm sm:text-base font-mono font-bold tracking-wider text-zinc-900 dark:text-zinc-100 cursor-pointer hover:opacity-85 flex items-center gap-1.5"
                  title="Click to copy room code"
                >
                  {code?.match(/.{1,4}/g)?.join('-')}
                  <Copy className="w-3 h-3 text-zinc-400" />
                </h1>
              </div>
            </div>
            
            {/* On mobile, show the invite action next to code or in right align */}
            <div className="flex items-center gap-2 sm:hidden">
              <button 
                id="btn-copy-invite-link"
                onClick={handleCopyInviteLink}
                className="text-[9px] bg-zinc-100 dark:bg-zinc-800 text-zinc-650 hover:bg-zinc-200 dark:text-zinc-350 hover:text-zinc-900 dark:hover:text-zinc-100 font-bold uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors cursor-pointer border border-zinc-200/40 dark:border-zinc-700/50"
              >
                Invite Link
              </button>
            </div>
          </div>

          {/* Right section / Bottom row on mobile */}
          <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto border-t border-zinc-100 dark:border-zinc-800/60 pt-2.5 sm:pt-0 sm:border-none">
            {/* Desktop invite link button */}
            <button 
              onClick={handleCopyInviteLink}
              className="hidden sm:inline-flex text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 font-bold uppercase tracking-wider transition-colors cursor-pointer hover:underline"
            >
              Copy Invite Link
            </button>
            
            <div className="flex items-center gap-2 ml-auto sm:ml-0">
              {/* Presence text for mobile */}
              <span className="text-[9px] uppercase tracking-wider text-zinc-450 dark:text-zinc-500 font-bold sm:hidden">
                {memberCount} Active
              </span>

              {/* Destruct Timer */}
              <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 px-2.5 py-1 rounded-full shadow-sm">
                 <Flame className="w-3.5 h-3.5 text-rose-500" />
                 <span className="font-mono font-bold text-rose-600 dark:text-rose-455 text-xs w-9 text-right">
                   {timeLeft !== null ? formatTimeLeft(timeLeft) : '--:--'}
                 </span>
              </div>

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Incinerate Room Button */}
              <button
                id="btn-incinerate-room"
                onClick={handleIncinerateRoom}
                className="bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-full transition-colors flex items-center justify-center shrink-0 active:scale-95 shadow-sm cursor-pointer"
                title="Incinerate Room Now"
              >
                <Flame className="w-4 h-4" />
              </button>
            </div>
          </div>
          
        </div>
      </header>

      {/* Decryption Key Modal Popup */}
      <AnimatePresence>
        {isKeyModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-zinc-950/60 dark:bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-[28px] border border-zinc-200/60 dark:border-zinc-800 p-8 sm:p-10 max-w-md w-full shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative z-10 space-y-6 text-center">
                <div className="w-16 h-16 bg-zinc-105 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-xl tracking-tight">🔒 Decryption Key Required</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">
                    This stealth room is end-to-end encrypted. Enter the shared password/key to enter and decrypt messages.
                  </p>
                </div>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = keyInput.trim();
                    if (trimmed) {
                      let finalKey = trimmed;
                      if (trimmed.includes('#')) {
                        finalKey = trimmed.split('#').pop() || trimmed;
                      } else if (trimmed.includes('/c/')) {
                        finalKey = trimmed.split('/c/').pop() || trimmed;
                      }
                      if (finalKey.startsWith('#')) {
                        finalKey = finalKey.substring(1);
                      }
                      
                      if (serverKeyHash) {
                        const localHash = CryptoJS.SHA256(finalKey).toString();
                        if (localHash !== serverKeyHash) {
                          triggerAlert('Invalid Decryption Key', 'The key you entered is incorrect. Please check the invite link or key and try again.');
                          return;
                        }
                      }
                      
                      setRoomKey(finalKey);
                      sessionStorage.setItem(`chat_key_${code}`, finalKey);
                      setIsKeyModalOpen(false);
                    }
                  }} 
                  className="space-y-4"
                >
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Enter Shared E2E Key"
                    className="w-full bg-zinc-105/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-xl text-sm outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-650"
                    autoFocus
                    required
                  />

                  <button
                    type="submit"
                    className="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-[0.98] shadow-md cursor-pointer"
                  >
                    Unlock Chat Room
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pick Spy Name Modal Popup */}
      <AnimatePresence>
        {isNameModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-zinc-955/60 dark:bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 rounded-[28px] border border-zinc-200/60 dark:border-zinc-800 p-8 sm:p-10 max-w-md w-full shadow-2xl relative overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative z-10 space-y-6 text-center">
                <div className="w-16 h-16 bg-zinc-105 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                  <Users className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-xl tracking-tight">🕵️ Pick Your Spy Name</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">
                    Set a custom codename for this session. Leave blank to auto-generate a random spy name.
                  </p>
                </div>

                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmedName = nameInput.trim();
                    if (trimmedName) {
                      setCustomName(trimmedName);
                      sessionStorage.setItem(`chat_name_${code}`, trimmedName);
                    } else {
                      sessionStorage.setItem(`chat_name_skipped_${code}`, 'true');
                    }
                    setIsNameModalOpen(false);
                  }} 
                  className="space-y-4"
                >
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value.slice(0, 15))}
                    placeholder="e.g. Agent-X"
                    className="w-full bg-zinc-105/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-xl text-sm outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-650"
                    autoFocus
                  />

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.setItem(`chat_name_skipped_${code}`, 'true');
                        setIsNameModalOpen(false);
                      }}
                      className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-605 dark:text-zinc-350 font-semibold py-3 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-95 cursor-pointer border dark:border-zinc-700/50"
                    >
                      Skip
                    </button>
                    <button
                      type="submit"
                      className="flex-1 bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-semibold py-3 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-95 shadow-md cursor-pointer"
                    >
                      Use Codename
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Watermark Overlay */}
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center select-none overflow-hidden opacity-[0.03] dark:opacity-[0.012]">
        <div className="text-[8vw] font-bold text-zinc-900 dark:text-zinc-100 rotate-[-30deg] whitespace-nowrap">
          CONFIDENTIAL • DO NOT CAPTURE • ANONYM SECURE
        </div>
      </div>

      {/* Security Lock Popover */}
      <AnimatePresence>
        {isBlurred && (
          <motion.div 
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
            exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-zinc-50/70 dark:bg-zinc-950/75"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white dark:bg-zinc-900 p-8 sm:p-12 rounded-[32px] shadow-2xl border border-zinc-200 dark:border-zinc-800 text-center max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#f4f4f5_10px,#f4f4f5_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#18181b_10px,#18181b_20px)] opacity-[0.3]"></div>
              
              <div className="relative z-10">
                <div className="w-20 h-20 bg-amber-50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-amber-100 dark:border-amber-900/40">
                  <ShieldAlert className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 mb-3">Security Lock</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed">
                  Screen capture attempt or window focus loss detected. The stealth chat has been hidden to protect its contents.
                </p>
                <button 
                  id="btn-resecure-session"
                  onClick={() => setIsBlurred(false)}
                  className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium py-4 rounded-full hover:bg-black dark:hover:bg-white transition-colors active:scale-[0.98] cursor-pointer"
                >
                  Resecure Session & Resume
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main onClick={() => setActiveReactionMsgId(null)} className="flex-1 overflow-hidden flex flex-col w-full max-w-4xl mx-auto p-4 sm:p-6 relative">
        <div className="flex-1 overflow-y-auto w-full pr-2 space-y-6 pb-24 custom-scrollbar">
          
          <div className="text-center py-6 border-b border-zinc-200/60 dark:border-zinc-800 mb-6 space-y-2">
             <ShieldAlert className="w-6 h-6 mx-auto text-zinc-500" />
             <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest max-w-sm mx-auto">
               End-to-end encrypted session established. Room will implode after 10m of silence.
             </p>
          </div>

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              if (msg.senderId === 'system') {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex justify-center w-full my-4"
                  >
                    <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-rose-700 dark:text-rose-400 text-xs font-bold px-4 py-2.5 rounded-full uppercase tracking-wider flex items-center gap-2 shadow-sm animate-pulse">
                      <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-450 shrink-0" />
                      <span>{msg.content}</span>
                    </div>
                  </motion.div>
                );
              }

              const isMine = msg.senderId === userId;
              const isSameAsPrev = i > 0 && messages[i - 1].senderId === msg.senderId;
              const isRead = msg.readBy && msg.readBy.length > 0;

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'} ${isSameAsPrev ? 'mt-1' : 'mt-6'}`}
                >
                  <div className="relative group/msg max-w-[85%] sm:max-w-[70%] flex flex-col">
                    {/* Spy Codenames */}
                    {!isMine && !isSameAsPrev && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider mb-1.5 self-start select-none">
                        {msg.senderName || generateSpyName(msg.senderId)}
                      </span>
                    )}

                    {/* Popover Backdrop */}
                    {activeReactionMsgId === msg.id && (
                       <div className="fixed inset-0 z-30" onClick={() => setActiveReactionMsgId(null)} />
                    )}

                    <AnimatePresence>
                      {activeReactionMsgId === msg.id && (
                        <motion.div
                           initial={{ opacity: 0, scale: 0.8 }}
                           animate={{ opacity: 1, scale: 1 }}
                           exit={{ opacity: 0, scale: 0.8 }}
                           className={`absolute ${isMine ? 'right-0' : 'left-0'} -top-12 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2 py-1.5 rounded-full shadow-lg flex gap-1 z-40`}
                        >
                           {EMOJIS.map(emoji => (
                              <button 
                                id={`btn-react-${msg.id}-${emoji}`}
                                key={emoji} 
                                onClick={(e) => { e.stopPropagation(); handleReact(msg.id, emoji, msg.reactions); }}
                                className="hover:scale-125 hover:-translate-y-1 transition-transform w-8 h-8 flex items-center justify-center text-lg cursor-pointer"
                              >
                                {emoji}
                              </button>
                           ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id);
                      }}
                      className={`px-5 py-3 text-sm sm:text-base leading-relaxed flex flex-col cursor-pointer active:opacity-80 relative shadow-sm ${
                        isMine 
                          ? 'bg-zinc-900 text-white rounded-2xl rounded-br-sm' 
                          : 'bg-white border border-zinc-200 text-zinc-900 rounded-2xl rounded-bl-sm dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100'
                      }`}
                      style={{ wordBreak: 'break-word' }}
                    >
                      <div className="font-sans">
                        {msg.senderId === 'system' ? (
                          msg.content
                        ) : (
                          <DecryptedText text={decryptMessage(msg.content, roomKey || '')} />
                        )}
                      </div>
                      <div className={`text-[10px] self-end mt-1 flex items-center gap-1 ${isMine ? 'text-white/70' : 'text-zinc-400 dark:text-zinc-500'}`}>
                        <span>
                          {msg.createdAt 
                            ? (msg.createdAt.toDate ? msg.createdAt.toDate() : new Date(msg.createdAt)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                            : '...'}
                        </span>
                        {isMine && (
                          isRead ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-white/50 dark:text-zinc-500" />
                          )
                        )}
                      </div>
                    </div>

                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1 z-10 relative ${isMine ? 'justify-end pr-2' : 'justify-start pl-2'}`}>
                        {(Object.entries(msg.reactions) as [string, string[]][])
                           .filter(([_, users]) => users.length > 0)
                           .map(([emoji, users]) => (
                               <button 
                                  id={`btn-reaction-count-${msg.id}-${emoji}`}
                                  key={emoji}
                                  onClick={(e) => { e.stopPropagation(); handleReact(msg.id, emoji, msg.reactions); }}
                                  className={`text-[11px] px-1.5 py-0.5 rounded-full border ${users.includes(userId) ? 'bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450'} shadow-sm flex items-center gap-1 active:scale-95 transition-transform cursor-pointer`}
                               >
                                 <span>{emoji}</span>
                                 <span className="text-zinc-500 dark:text-zinc-400 font-medium">{users.length > 1 ? users.length : ''}</span>
                               </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing Indicator with Spy Names */}
          <AnimatePresence>
            {typingUsers.length > 0 && (
              <motion.div
                key="typing-indicator"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex justify-start mt-4 flex-col gap-1"
              >
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-wider ml-2 select-none">
                  {typingUsers.map(id => generateSpyName(id)).join(', ')} typing...
                </span>
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1.5 h-[40px] w-fit">
                  <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce"></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        <div className="w-full absolute bottom-4 sm:bottom-6 left-0 px-4 sm:px-6">
          <form 
            onSubmit={handleSendMessage}
            className="flex items-center gap-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2 rounded-full shadow-lg shadow-zinc-900/5 mx-auto max-w-3xl focus-within:ring-2 focus-within:ring-zinc-900 dark:focus-within:ring-zinc-100 focus-within:border-zinc-900 dark:focus-within:border-zinc-750 transition-all"
          >
            <input 
              id="input-new-message"
              type="text" 
              value={newMessage}
              onChange={handleInputChange}
              placeholder="Type your message..."
              className="flex-1 bg-transparent px-4 py-3 outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
              autoFocus
            />
            <button 
              id="btn-send-message"
              type="submit"
              disabled={!newMessage.trim() || !roomKey}
              className="w-12 h-12 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full flex items-center justify-center shrink-0 hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95 cursor-pointer shadow-sm"
            >
              <Send className="w-5 h-5 -ml-0.5" />
            </button>
          </form>
        </div>
      </main>

      <footer className="px-8 lg:px-16 pb-10 w-full max-w-7xl mx-auto text-[10px] sm:text-[11px] text-zinc-400 dark:text-zinc-550 flex flex-col md:flex-row justify-between gap-4 font-medium uppercase tracking-widest z-10 relative shrink-0">
        <div className="max-w-md leading-relaxed flex items-center gap-2">
           <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
           Screen capture protection active &bull; Made by Subh Roy
        </div>
        <div>&copy; {new Date().getFullYear()} Anonym Secure</div>
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
