import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    // Only restore dark if user explicitly set it to dark previously
    const saved = localStorage.getItem('anonym_theme');
    return saved === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('anonym_theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('anonym_theme', 'light');
    }
  }, [isDark]);

  // On mount, ensure the correct class is applied immediately
  useEffect(() => {
    const saved = localStorage.getItem('anonym_theme');
    const root = document.documentElement;
    if (saved === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const toggle = () => setIsDark(prev => !prev);

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
