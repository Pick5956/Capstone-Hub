import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_DISPLAY_PREFERENCES,
  textSizeMultiplier,
  type DisplayLanguage,
  type DisplayPreferences,
  type DisplayTextSize,
} from '@/src/lib/display-preferences';
import {
  getDisplayPreferences,
  setDisplayPreferences,
} from '@/src/storage/display-preferences';

interface DisplayPreferencesContextValue extends DisplayPreferences {
  ready: boolean;
  fontScale: number;
  persistenceStatus: 'loading' | 'saving' | 'saved' | 'memory-only';
  setLanguage: (language: DisplayLanguage) => void;
  setTextSize: (textSize: DisplayTextSize) => void;
  copy: (thai: string, english: string) => string;
}

const DisplayPreferencesContext =
  createContext<DisplayPreferencesContextValue | null>(null);

export function DisplayPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState<DisplayPreferences>(
    DEFAULT_DISPLAY_PREFERENCES,
  );
  const [ready, setReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<
    DisplayPreferencesContextValue['persistenceStatus']
  >('loading');
  const saveSequence = useRef(0);

  useEffect(() => {
    let active = true;
    getDisplayPreferences()
      .then((stored) => {
        if (active) {
          setPreferences(stored);
          setPersistenceStatus('saved');
        }
      })
      .catch(() => {
        if (active) setPersistenceStatus('memory-only');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((next: DisplayPreferences) => {
    const sequence = saveSequence.current + 1;
    saveSequence.current = sequence;
    setPreferences(next);
    setPersistenceStatus('saving');
    void setDisplayPreferences(next)
      .then(() => {
        if (saveSequence.current === sequence) setPersistenceStatus('saved');
      })
      .catch(() => {
        // The in-memory choice stays active even if device persistence is blocked.
        if (saveSequence.current === sequence) {
          setPersistenceStatus('memory-only');
        }
      });
  }, []);

  const setLanguage = useCallback(
    (language: DisplayLanguage) => {
      update({ ...preferences, language });
    },
    [preferences, update],
  );

  const setTextSize = useCallback(
    (textSize: DisplayTextSize) => {
      update({ ...preferences, textSize });
    },
    [preferences, update],
  );

  const value = useMemo<DisplayPreferencesContextValue>(
    () => ({
      ...preferences,
      ready,
      fontScale: textSizeMultiplier(preferences.textSize),
      persistenceStatus,
      setLanguage,
      setTextSize,
      copy: (thai, english) =>
        preferences.language === 'th' ? thai : english,
    }),
    [persistenceStatus, preferences, ready, setLanguage, setTextSize],
  );

  return (
    <DisplayPreferencesContext.Provider value={value}>
      {children}
    </DisplayPreferencesContext.Provider>
  );
}

export function useDisplayPreferences() {
  const value = useContext(DisplayPreferencesContext);
  if (!value) {
    throw new Error(
      'useDisplayPreferences must be used inside DisplayPreferencesProvider',
    );
  }
  return value;
}
