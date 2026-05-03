'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type FontSize = 'small' | 'normal' | 'large' | 'extra-large';

interface ThemeCtx {
  theme: Theme;
  fontSize: FontSize;
  toggle: () => void;
  setFontSize: (size: FontSize) => void;
}

const FONT_SIZES: FontSize[] = ['small', 'normal', 'large', 'extra-large'];

const ThemeContext = createContext<ThemeCtx>({
  theme: 'light',
  fontSize: 'large',
  toggle: () => {},
  setFontSize: () => {},
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [fontSize, setFontSizeState] = useState<FontSize>(() => getInitialFontSize());

  const applyTheme = useCallback((t: Theme) => {
    setTheme(t);
  }, []);

  const applyFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.fontSize = fontSize;
    localStorage.setItem('theme', theme);
    localStorage.setItem('fontSize', fontSize);
  }, [fontSize, theme]);

  const toggle = () => applyTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, fontSize, toggle, setFontSize: applyFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
