'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
export type FontSize = 'small' | 'normal' | 'large' | 'extra-large';

interface ThemeCtx {
  theme: Theme;
  fontSize: FontSize;
  showAIAssistant: boolean;
  mounted: boolean;
  toggle: () => void;
  setFontSize: (size: FontSize) => void;
  setShowAIAssistant: (show: boolean) => void;
}

const FONT_SIZES: FontSize[] = ['small', 'normal', 'large', 'extra-large'];

const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  fontSize: 'large',
  showAIAssistant: true,
  mounted: false,
  toggle: () => {},
  setFontSize: () => {},
  setShowAIAssistant: () => {},
});

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme') as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialFontSize(): FontSize {
  if (typeof window === 'undefined') return 'large';
  const stored = localStorage.getItem('fontSize') as FontSize | null;
  return stored && FONT_SIZES.includes(stored) ? stored : 'large';
}

function getInitialShowAIAssistant(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem('showAIAssistant');
  return stored === null ? true : stored === 'true';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [fontSize, setFontSizeState] = useState<FontSize>('large');
  const [showAIAssistant, setShowAIAssistantState] = useState<boolean>(true);

  const applyTheme = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  const applyFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
  }, []);

  const applyShowAIAssistant = useCallback((show: boolean) => {
    setShowAIAssistantState(show);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(getInitialTheme());
      setFontSizeState(getInitialFontSize());
      setShowAIAssistantState(getInitialShowAIAssistant());
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.fontSize = fontSize;
    localStorage.setItem('theme', theme);
    localStorage.setItem('fontSize', fontSize);
    localStorage.setItem('showAIAssistant', String(showAIAssistant));
  }, [fontSize, mounted, theme, showAIAssistant]);

  const toggle = () => applyTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      fontSize, 
      showAIAssistant, 
      mounted, 
      toggle, 
      setFontSize: applyFontSize,
      setShowAIAssistant: applyShowAIAssistant
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
