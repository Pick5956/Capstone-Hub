export type DisplayLanguage = 'th' | 'en';

export interface DisplayPreferences {
  language: DisplayLanguage;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  language: 'th',
};

const LANGUAGE_VALUES = new Set<DisplayLanguage>(['th', 'en']);

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }

  const candidate = value as Partial<DisplayPreferences>;
  return {
    language: LANGUAGE_VALUES.has(candidate.language as DisplayLanguage)
      ? (candidate.language as DisplayLanguage)
      : DEFAULT_DISPLAY_PREFERENCES.language,
  };
}
