"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "th" | "en";

type LanguageContextValue = {
  language: Language;
  mounted: boolean;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue>({
  language: "th",
  mounted: false,
  setLanguage: () => {},
});

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "th";
  const stored = window.localStorage.getItem("language");
  return stored === "en" ? "en" : "th";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("th");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLanguageState(getInitialLanguage());
      setMounted(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.lang = language;
    window.localStorage.setItem("language", language);
  }, [language, mounted]);

  const value = useMemo(
    () => ({
      language,
      mounted,
      setLanguage: setLanguageState,
    }),
    [language, mounted]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
