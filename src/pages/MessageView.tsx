import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, storage } from '../firebase';
import { ref, deleteObject } from 'firebase/storage';
import { ShieldAlert, Lock, Key, Flame, Timer, Shield, Paperclip, Download, ChevronDown, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CryptoJS from 'crypto-js';
import ThemeToggle from '../components/ThemeToggle';

export default function MessageView() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isBlurred, setIsBlurred] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSecurityReady, setIsSecurityReady] = useState(false);
  const [initialDuration, setInitialDuration] = useState<number>(60);

  // Password Protection States
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [decoyContent, setDecoyContent] = useState<string | null>(null);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [tempCachedData, setTempCachedData] = useState<any>(null);

  // Attachment Decryption States
  const [attachmentMeta, setAttachmentMeta] = useState<any>(null);
  const [decryptedFileUrl, setDecryptedFileUrl] = useState<string | null>(null);
  const [decryptedFileName, setDecryptedFileName] = useState<string | null>(null);
  const [isDownloadingFile, setIsDownloadingFile] = useState(false);

  const [showScrollIndicator, setShowScrollIndicator] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isScrollable = el.scrollHeight > el.clientHeight;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 15;
    setShowScrollIndicator(isScrollable && !isAtBottom);
  };

  const scrollToBottom = () => {
    scrollContainerRef.current?.scrollTo({
      top: scrollContainerRef.current.scrollHeight,
      behavior: 'smooth'
    });
  };

  const openAttachmentInNewTab = () => {
    if (!decryptedFileUrl) return;
    try {
      const newWindow = window.open('', '_blank');
      if (!newWindow) {
        // Fallback if popup blocker is active
        window.location.href = decryptedFileUrl;
        return;
      }

      const isImage = attachmentMeta?.type?.startsWith('image/');
      
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Anonym - Secure Attachment</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              margin: 0;
              padding: 0;
              background-color: #09090b;
              color: #f4f4f5;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              overflow: hidden;
            }
            .container {
              width: 100%;
              height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              box-sizing: border-box;
            }
            img {
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
              border-radius: 8px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              user-select: none;
              -webkit-user-select: none;
            }
            .fallback-card {
              background: #18181b;
              border: 1px solid #27272a;
              padding: 2rem;
              border-radius: 16px;
              text-align: center;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
              max-width: 400px;
            }
            .btn {
              display: inline-block;
              margin-top: 1.5rem;
              background: #f4f4f5;
              color: #09090b;
              padding: 0.75rem 1.5rem;
              border-radius: 9999px;
              text-decoration: none;
              font-weight: bold;
              font-size: 0.875rem;
            }
          </style>
          <script>
            document.addEventListener('contextmenu', function(e) {
              e.preventDefault();
            });
          </script>
        </head>
        <body>
          <div class="container">
            \${isImage 
              ? \`<img src="\${decryptedFileUrl}" alt="Secure Attachment" oncontextmenu="event.preventDefault();" />\`
              : \`
                <div class="fallback-card">
                  <h2>Secure Document</h2>
                  <p>This attachment cannot be previewed directly. Click below to download it securely.</p>
                  <a href="\${decryptedFileUrl}" download="\${decryptedFileName || 'whisper-file'}" class="btn">Download Document</a>
                </div>
              \`
            }
          </div>
        </body>
        </html>
      `);
      newWindow.document.close();
    } catch (err) {
      console.error("Failed to open attachment in a new tab:", err);
      window.open(decryptedFileUrl, '_blank');
    }
  };

  const getSecurityTier = () => {
    if (isPasswordProtected && initialDuration <= 10) {
      return { label: 'Maximum', color: 'text-rose-600 dark:text-rose-450', bg: 'bg-rose-50 dark:bg-rose-950/20' };
    }
    if (isPasswordProtected || initialDuration <= 10) {
      return { label: 'High', color: 'text-amber-655 dark:text-amber-450', bg: 'bg-amber-50 dark:bg-amber-950/20' };
    }
    return { label: 'Standard', color: 'text-emerald-600 dark:text-emerald-450', bg: 'bg-emerald-50 dark:bg-emerald-950/20' };
  };

  useEffect(() => {
    if (isRevealed && content) {
      checkScroll();
      const timer = setTimeout(checkScroll, 100);
      window.addEventListener('resize', checkScroll);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [isRevealed, content, decryptedFileUrl]);

  const loadAndDecryptAttachment = async (meta: any, key: string) => {
    if (!meta || !meta.url || decryptedFileUrl) return;
    setIsDownloadingFile(true);
    try {
      const response = await fetch(meta.url);
      const ciphertext = await response.text();
      
      const bytes = CryptoJS.AES.decrypt(ciphertext, key);
      const decryptedDataUrl = bytes.toString(CryptoJS.enc.Utf8);
      if (!decryptedDataUrl) throw new Error('Attachment decryption failed');
      
      let fileName = 'file';
      if (meta.name) {
        try {
          const nameBytes = CryptoJS.AES.decrypt(meta.name, key);
          fileName = nameBytes.toString(CryptoJS.enc.Utf8) || 'file';
        } catch (e) {
          fileName = 'file';
        }
      }

      setDecryptedFileUrl(decryptedDataUrl);
      setDecryptedFileName(fileName);
    } catch (err) {
      console.error("Attachment decryption failed:", err);
    } finally {
      setIsDownloadingFile(false);
    }
  };

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
            attachment = {
              url: data.attachmentUrl,
              name: data.attachmentName,
              type: data.attachmentType,
              size: data.attachmentSize
            };
            setAttachmentMeta(attachment);
          }

          const duration = data.duration || 60;
          setInitialDuration(duration);

          if (data.status === 'read' || !data.content) {
            // Already read. Check if we have it cached in this session.
            const cached = sessionStorage.getItem(`msg_${id}`);
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                fetchedContent = parsed.content;
                expiresAt = parsed.expiresAt;
                if (parsed.duration) {
                  setInitialDuration(parsed.duration);
                }
                if (parsed.attachment) {
                  setAttachmentMeta(parsed.attachment);
                }
              } catch (e) {
                fetchedContent = cached;
                expiresAt = Date.now() + 60000;
              }
            } else {
              setError('This message has been read and permanently destroyed, or never existed.');
              setIsLoading(false);
              return;
            }
          } else {
            // Message is unread in DB
            setIsPasswordProtected(data.isPasswordProtected || false);
            
            let decryptedDecoy = '';
            if (data.decoy && secretKey) {
              try {
                const decoyBytes = CryptoJS.AES.decrypt(data.decoy, secretKey);
                decryptedDecoy = decoyBytes.toString(CryptoJS.enc.Utf8);
                if (decryptedDecoy) {
                  setDecoyContent(decryptedDecoy);
                }
              } catch (e) {
                console.error("Failed to decrypt decoy content", e);
              }
            }

            if (data.isPasswordProtected) {
              // Cache details for password input form
              setTempCachedData({
                content: data.content,
                duration: data.duration || 60,
                secretKey,
                attachment
              });
              
              if (decryptedDecoy) {
                setContent(decryptedDecoy);
                // Allow user to continue and view decoy first
                setIsLoading(false);
                return;
              } else {
                setIsPasswordModalOpen(true);
                setIsLoading(false);
                return;
              }
            }

            // Standard message (no password)
            const rawContent = data.content;
            if (secretKey) {
              try {
                const bytes = CryptoJS.AES.decrypt(rawContent, secretKey);
                fetchedContent = bytes.toString(CryptoJS.enc.Utf8);
                if (!fetchedContent) throw new Error('Decryption failed');
              } catch (e) {
                fetchedContent = null;
                setError('Decryption failed. The secret key is invalid.');
              }
            } else {
               setError('Decryption key is missing from the URL.');
            }

            const duration = data.duration || 60;
            expiresAt = Date.now() + duration * 1000;
            if (fetchedContent) {
              sessionStorage.setItem(`msg_${id}`, JSON.stringify({ 
                content: fetchedContent, 
                expiresAt,
                attachment,
                duration
              }));
              
              // Burn content immediately in DB but keep metadata for screenshot alerts
              await updateDoc(docRef, {
                content: '',
                status: 'read',
                openedAt: Date.now()
              });
            }
          }
        } else {
          // If the document is completely gone, check if we still have it in sessionStorage countdown
          const cached = sessionStorage.getItem(`msg_${id}`);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              fetchedContent = parsed.content;
              expiresAt = parsed.expiresAt;
              if (parsed.attachment) {
                setAttachmentMeta(parsed.attachment);
              }
            } catch (e) {
              fetchedContent = cached;
              expiresAt = Date.now() + 60000;
            }
          }
        }

        if (fetchedContent && expiresAt) {
          const remaining = Math.floor((expiresAt - Date.now()) / 1000);
          if (remaining > 0) {
            setContent(fetchedContent);
            setTimeLeft(remaining);
          } else {
            setError('This message has expired and permanently destroyed.');
            sessionStorage.removeItem(`msg_${id}`);
          }
        } else {
          setError('This message has been read and permanently destroyed, or never existed.');
        }
      } catch (err) {
        setError('Failed to securely retrieve the message.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchMessage();
  }, [id]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !tempCachedData) return;
    
    setPasswordError(null);
    const { content: encryptedText, duration, secretKey, attachment } = tempCachedData;
    const encryptionKey = secretKey + password;
    
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, encryptionKey);
      const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedText) {
        setPasswordError('Invalid password. Decryption failed.');
        return;
      }
      
      // Decryption success!
      const expiresAt = Date.now() + duration * 1000;
      sessionStorage.setItem(`msg_${id}`, JSON.stringify({ 
        content: decryptedText, 
        expiresAt,
        attachment,
        duration
      }));
      
      if (attachment) {
        setAttachmentMeta(attachment);
      }
      
      setContent(decryptedText);
      setTimeLeft(duration);
      setInitialDuration(duration);
      setIsPasswordVerified(true);
      setIsPasswordModalOpen(false);
      
      if (attachment) {
        setAttachmentMeta(attachment);
        const decryptionKey = secretKey + password;
        loadAndDecryptAttachment(attachment, decryptionKey);
      }
      
      const docRef = doc(db, 'messages', id);
      await updateDoc(docRef, {
        content: '',
        status: 'read',
        openedAt: Date.now()
      });
      
    } catch (err) {
      setPasswordError('Invalid password. Decryption failed.');
    }
  };

  useEffect(() => {
    if (timeLeft === null) return;
    
    if (timeLeft <= 0) {
      setContent(null);
      setError('Time expired. The message has self-destructed.');
      setIsRevealed(false);
      if (id) {
        sessionStorage.removeItem(`msg_${id}`);
        // Delete document completely after expiry
        deleteDoc(doc(db, 'messages', id)).catch(console.error);
        
        // Delete attachment from Storage if present
        const fileRef = ref(storage, `attachments/${id}`);
        deleteObject(fileRef).catch(() => {});
      }
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft(prev => prev !== null ? prev - 1 : null);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft, id]);

  // No temporary reveal timer needed as requested. Message remains visible.

  // Security activation delay
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        setIsSecurityReady(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  const reportScreenshot = async () => {
    if (!id || !isSecurityReady) return;
    try {
      const docRef = doc(db, 'messages', id);
      await updateDoc(docRef, {
        screenshotDetected: true,
        status: 'read',
        content: ''
      });
    } catch (err) {
      console.error("Failed to report screenshot:", err);
    } finally {
      // Local self-destruct
      setContent(null);
      setError('Security Violation: Message permanently incinerated due to screen capture or window focus loss.');
      setIsRevealed(false);
      if (id) {
        sessionStorage.removeItem(`msg_${id}`);
        // Delete attachment from Storage if present
        const fileRef = ref(storage, `attachments/${id}`);
        deleteObject(fileRef).catch(() => {});
      }
    }
  };

  // Window blur & PrintScreen protection hooks
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsBlurred(true);
        setIsRevealed(false);
        reportScreenshot();
      }
    };

    const handleWindowBlur = () => {
      setIsBlurred(true);
      setIsRevealed(false);
      reportScreenshot();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' || 
        (e.metaKey && e.shiftKey) || 
        (e.ctrlKey && e.key === 'p') ||
        (e.metaKey && e.key === 's')
      ) {
        setIsBlurred(true);
        setIsRevealed(false);
        reportScreenshot();
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
  }, [id, isSecurityReady]);

  useEffect(() => {
    document.title = "Anonym - View Secure Message";
  }, []);

  const handleReveal = () => {
    setIsRevealed(true);

    if (attachmentMeta && (!isPasswordProtected || isPasswordVerified)) {
      const secretKey = location.hash.substring(1);
      const decryptionKey = secretKey + password;
      loadAndDecryptAttachment(attachmentMeta, decryptionKey);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center space-y-6">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-zinc-200 dark:border-zinc-800 rounded-full"></div>
          <div className="w-12 h-12 border-4 border-zinc-900 dark:border-zinc-100 border-t-transparent dark:border-t-transparent rounded-full animate-spin absolute inset-0"></div>
        </div>
        <p className="text-zinc-400 dark:text-zinc-550 text-xs uppercase tracking-widest font-bold animate-pulse">Decrypting</p>
      </div>
    );
  }

  if (error || (!content && !isPasswordProtected)) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center font-sans selection:bg-zinc-200 dark:selection:bg-zinc-800 px-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white dark:bg-zinc-900 w-full max-w-md p-10 sm:p-12 rounded-[32px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] dark:shadow-black/25 border border-zinc-100 dark:border-zinc-800/80 text-center space-y-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.01]" style={{ backgroundImage: 'radial-gradient(#000 1px,transparent 1px)', backgroundSize: '12px 12px' }}></div>
          
          <div className="mx-auto w-20 h-20 bg-rose-50 dark:bg-rose-950/20 text-rose-500 dark:text-rose-450 rounded-full flex items-center justify-center border border-rose-100 dark:border-rose-900/40 relative z-10">
            <Flame className="w-10 h-10" />
          </div>
          <div className="space-y-3 relative z-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Incinerated</h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">{error}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col font-sans select-none overflow-hidden transition-colors duration-200 relative"
      onContextMenu={(e) => e.preventDefault()}
      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
    >
      {/* Background Graphic Elements */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.4] dark:opacity-[0.2]">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-emerald-500/10 dark:from-emerald-500/5 to-transparent blur-[80px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-radial from-rose-500/10 dark:from-rose-500/5 to-transparent blur-[80px]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#27272a_1px,transparent_1px),linear-gradient(to_bottom,#27272a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
      </div>

      <header className="flex justify-between items-center px-8 lg:px-16 py-8 w-full max-w-7xl mx-auto z-10 relative">
        <h1 className="font-bold text-xl tracking-tighter uppercase flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
          <div className="w-8 h-8 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg flex items-center justify-center">
             <Key className="w-4 h-4" />
          </div>
          Anonym
        </h1>
        <div className="flex items-center gap-6">
          <div className="text-[10px] sm:text-[11px] tracking-widest uppercase text-zinc-500 dark:text-zinc-400 flex items-center gap-2 font-semibold">
            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></div>
            <span className="hidden sm:inline">Burn After Reading &bull; </span>
            Active
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Password Decryption Dialog */}
      <AnimatePresence>
        {isPasswordProtected && !isPasswordVerified && isPasswordModalOpen && (
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
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                  <Shield className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-xl tracking-tight">Enter Password</h3>
                  <p className="text-zinc-500 dark:text-zinc-400 text-xs leading-relaxed">
                    This whisper is encrypted with a second password. Enter it below to decrypt the contents.
                  </p>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-zinc-100/60 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-xl text-sm outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 text-zinc-900 dark:text-zinc-100 transition-all placeholder:text-zinc-400 dark:placeholder:text-zinc-650"
                    autoFocus
                    required
                  />

                  {passwordError && (
                    <p className="text-rose-600 dark:text-rose-400 text-xs font-bold">{passwordError}</p>
                  )}

                  <button
                    type="submit"
                    className="w-full bg-zinc-900 dark:bg-zinc-100 hover:bg-black dark:hover:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-[0.98] shadow-md cursor-pointer"
                  >
                    Decrypt Whisper
                  </button>

                  {decoyContent && (
                    <button
                      type="button"
                      onClick={() => setIsPasswordModalOpen(false)}
                      className="w-full mt-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold py-2.5 rounded-full text-xs uppercase tracking-wider transition-colors active:scale-[0.98] border border-zinc-200 dark:border-zinc-700 cursor-pointer"
                    >
                      Back to Cover Message
                    </button>
                  )}
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                  Screen capture attempt or window focus loss detected. The message has been hidden to protect its contents.
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

      <main className="flex-1 flex justify-center items-center px-4 sm:px-6 lg:px-16 pb-16 w-full max-w-7xl mx-auto relative z-10">
        <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl min-h-[480px] p-8 lg:p-16 rounded-[32px] sm:rounded-[40px] shadow-[0_8px_40px_rgba(0,0,0,0.04)] dark:shadow-black/20 relative border border-zinc-100 dark:border-zinc-800/80 flex flex-col justify-between">
          
          <div className="flex justify-between items-end mb-8 border-b border-zinc-100 dark:border-zinc-800 pb-6 shrink-0">
            <div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1.5">Origin</div>
              <div className="text-zinc-800 dark:text-zinc-200 font-medium tracking-tight">Anonymous Sender</div>
            </div>
            <div className="text-right flex items-end gap-4 sm:gap-8">
              {timeLeft !== null && (
                <div className="text-right">
                  <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1.5">Destructs In</div>
                  <div className={`font-mono font-bold flex items-center justify-end gap-1.5 text-base sm:text-lg ${timeLeft <= 10 ? 'text-rose-600 animate-pulse' : 'text-amber-600 dark:text-amber-450'}`}>
                    <Timer className="w-4 h-4" />
                    {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              )}
              <div className="text-right hidden sm:block">
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1.5">Security Level</div>
                <div className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1.5 ${getSecurityTier().bg} ${getSecurityTier().color}`}>
                  <Shield className="w-3 h-3" />
                  {getSecurityTier().label}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.2em] font-bold mb-1.5">Status</div>
                <div className="text-rose-600 dark:text-rose-455 font-medium flex items-center justify-end gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  Volatile
                </div>
              </div>
            </div>
          </div>

          <div className="relative flex-1 flex items-center justify-center w-full my-8">

            <AnimatePresence>
              {!isRevealed && (
                <motion.div 
                  key="reveal-btn-container"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, filter: 'blur(10px)', scale: 1.05 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-6 space-y-6 z-20 bg-white dark:bg-zinc-900 text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shadow-sm">
                    <Shield className="w-8 h-8 text-zinc-600 dark:text-zinc-300" />
                  </div>
                  <div className="space-y-2 max-w-sm">
                    <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                      One-Time Secure Message
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                      This is a secure one-time message that can be read only once. Once you click continue, the message will be revealed and permanently deleted when you close this window or the timer expires.
                    </p>
                  </div>
                  <button
                    id="btn-reveal-message"
                    onClick={handleReveal}
                    disabled={isPasswordProtected && !isPasswordVerified && !decoyContent}
                    className="inline-flex items-center gap-2 px-8 py-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold text-xs uppercase tracking-widest rounded-full hover:bg-black dark:hover:bg-white transition-all active:scale-[0.98] shadow-md cursor-pointer disabled:opacity-40"
                  >
                    Click to Continue
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div 
              className="absolute inset-0 flex items-center justify-center overflow-hidden z-10 px-4"
              animate={{ 
                opacity: isRevealed ? 1 : 0, 
                filter: isRevealed ? 'blur(0px)' : 'blur(20px)',
                scale: isRevealed ? 1 : 0.95
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <div 
                ref={scrollContainerRef}
                onScroll={checkScroll}
                className="relative w-full max-h-full overflow-y-auto custom-scrollbar flex flex-col items-center touch-pan-y"
              >
                {/* Moving stripes overlay to protect decrypted screenshot */}
                {isRevealed && (
                  <div className="absolute inset-0 moving-stripes pointer-events-none z-20 mix-blend-overlay" />
                )}

                <div className="w-full flex flex-col items-center my-auto py-4">
                  {isPasswordProtected && !isPasswordVerified && isRevealed && decoyContent && (
                    <div className="mb-6 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-955/20 border border-amber-200/50 dark:border-amber-900/30 text-amber-600 dark:text-amber-450 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 animate-pulse shadow-sm z-30">
                      <Shield className="w-3.5 h-3.5" />
                      <span>Decoy Cover Active</span>
                      <button 
                        onClick={() => setIsPasswordModalOpen(true)}
                        className="ml-2 px-3 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full hover:bg-black dark:hover:bg-white transition-colors text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                      >
                        Unlock Payload
                      </button>
                    </div>
                  )}

                  {content && (
                    <p className="text-2xl sm:text-3xl lg:text-4xl leading-relaxed sm:leading-snug tracking-tight text-zinc-900 dark:text-zinc-100 font-normal whitespace-pre-wrap text-center mix-blend-multiply dark:mix-blend-screen pb-6">
                      {content}
                    </p>
                  )}

                  {/* Attachment Display */}
                  {isRevealed && attachmentMeta && (
                    <div className="mt-6 flex flex-col items-center justify-center w-full z-10 relative">
                      {isDownloadingFile ? (
                        <div className="flex flex-col items-center gap-2 py-4">
                          <div className="w-6 h-6 border-2 border-zinc-200 dark:border-zinc-800 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin"></div>
                          <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-bold">Decrypting Secure Attachment...</span>
                        </div>
                      ) : decryptedFileUrl ? (
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/60 p-5 rounded-2xl flex flex-col items-center gap-3 w-full max-w-xs shadow-inner">
                          <Paperclip className="w-8 h-8 text-zinc-450 dark:text-zinc-500 animate-pulse" />
                          <div className="text-center space-y-1">
                            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]">{decryptedFileName}</div>
                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                              ({(attachmentMeta.size / (1024 * 1024)).toFixed(2)} MB)
                            </div>
                          </div>
                          <button 
                            onClick={openAttachmentInNewTab}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full hover:bg-black dark:hover:bg-white transition-colors text-[10px] font-bold uppercase tracking-widest shadow-md cursor-pointer"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View Attachment
                          </button>
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-500">
                          Failed to decrypt attachment.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Scroll Indicator */}
              <AnimatePresence>
                {isRevealed && showScrollIndicator && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, x: "-50%" }}
                    animate={{ opacity: 1, y: 0, x: "-50%" }}
                    exit={{ opacity: 0, y: 10, x: "-50%" }}
                    onClick={scrollToBottom}
                    className="absolute bottom-4 left-1/2 z-30 bg-zinc-900/95 dark:bg-zinc-100/95 backdrop-blur-sm text-white dark:text-zinc-900 text-[11px] font-semibold py-2.5 px-4 rounded-full shadow-lg flex items-center gap-1.5 cursor-pointer select-none hover:scale-105 active:scale-95 transition-transform"
                  >
                    <span>Scroll down to read more</span>
                    <motion.div
                      animate={{ y: [0, 3, 0] }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

        </div>
      </main>

      {/* Watermark Overlay */}
      <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center select-none overflow-hidden opacity-[0.03] dark:opacity-[0.012]">
        <div className="text-[8vw] font-bold text-zinc-900 dark:text-zinc-100 rotate-[-30deg] whitespace-nowrap">
          CONFIDENTIAL • DO NOT CAPTURE • ANONYM SECURE
        </div>
      </div>

      <footer className="w-full max-w-7xl mx-auto px-8 lg:px-16 pb-12 pt-6 border-t border-zinc-200/50 dark:border-zinc-800/50 mt-8 text-[11px] text-zinc-400 dark:text-zinc-550 flex flex-col md:flex-row items-center justify-between gap-4 font-medium uppercase tracking-wider shrink-0 select-none relative z-10">
        <div className="flex items-center gap-2 text-center md:text-left leading-relaxed flex-wrap justify-center">
          <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
          <span>Screen Capture Protection Active</span>
          <span className="text-zinc-300 dark:text-zinc-800 hidden sm:inline">&bull;</span>
          <span className="hidden sm:inline">Made by Subh Roy</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-center md:justify-end">
          <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-semibold">Privacy</Link>
          <span className="text-zinc-300 dark:text-zinc-800">&bull;</span>
          <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors font-semibold">Terms</Link>
          <span className="text-zinc-300 dark:text-zinc-800">&bull;</span>
          <span className="text-zinc-400 dark:text-zinc-550 font-mono tracking-normal">&copy; {new Date().getFullYear()} Anonym</span>
        </div>
      </footer>
    </div>
  );
}
