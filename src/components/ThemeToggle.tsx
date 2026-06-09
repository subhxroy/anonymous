import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const checkAutoTheme = () => {
    const hour = new Date().getHours();
    return hour >= 17 || hour < 5;
  };

  const [isDark, setIsDark] = useState(() => {
    const autoMode = localStorage.getItem('anonym_theme_auto');
    if (autoMode === 'false') {
      const saved = localStorage.getItem('anonym_theme');
      return saved === 'dark';
    }
    return checkAutoTheme();
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, [isDark]);

  useEffect(() => {
    const interval = setInterval(() => {
      const autoMode = localStorage.getItem('anonym_theme_auto');
      if (autoMode !== 'false') {
        const shouldBeDark = checkAutoTheme();
        setIsDark(shouldBeDark);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Ensure correct class is applied on mount
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []); // Initial mount check handled by state initialization

  const toggle = () => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem('anonym_theme', next ? 'dark' : 'light');
      localStorage.setItem('anonym_theme_auto', 'false');
      return next;
    });
  };

  return (
    <button
      id="btn-theme-toggle"
      onClick={toggle}
      className="p-2.5 rounded-full border border-zinc-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 active:scale-95 transition-all shadow-sm cursor-pointer"
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
