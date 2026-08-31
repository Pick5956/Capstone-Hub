'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  showAIAssistant: boolean;
  mounted: boolean;
  toggle: () => void;
  setShowAIAssistant: (show: boolean) => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  showAIAssistant: true,
  mounted: false,
  toggle: () => {},
  setShowAIAssistant: () => {},
});

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialShowAIAssistant(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('showAIAssistant');
  return stored === null ? true : stored === 'true';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [showAIAssistant, setShowAIAssistantState] = useState<boolean>(true);

  const applyTheme = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  const applyShowAIAssistant = useCallback((show: boolean) => {
    setShowAIAssistantState(show);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(getInitialTheme());
      setShowAIAssistantState(getInitialShowAIAssistant());
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
    localStorage.setItem('showAIAssistant', String(showAIAssistant));
    // The UI-size preference was removed; drop any value an earlier build left
    // behind so it cannot be read back if the feature ever returns.
    localStorage.removeItem('fontSize');
    delete document.documentElement.dataset.fontSize;
  }, [mounted, theme, showAIAssistant]);

  const toggle = () => applyTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{
      theme,
      showAIAssistant,
      mounted,
      toggle,
      setShowAIAssistant: applyShowAIAssistant
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
