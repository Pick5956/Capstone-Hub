export type DisplayLanguage = 'th' | 'en';
export type DisplayTextSize = 'small' | 'normal' | 'large' | 'extra-large';

export interface DisplayPreferences {
  language: DisplayLanguage;
  textSize: DisplayTextSize;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  language: 'th',
  textSize: 'normal',
};

const LANGUAGE_VALUES = new Set<DisplayLanguage>(['th', 'en']);
const TEXT_SIZE_VALUES = new Set<DisplayTextSize>([
  'small',
  'normal',
  'large',
  'extra-large',
]);

export function normalizeDisplayPreferences(value: unknown): DisplayPreferences {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }

  const candidate = value as Partial<DisplayPreferences>;
  return {
    language: LANGUAGE_VALUES.has(candidate.language as DisplayLanguage)
      ? (candidate.language as DisplayLanguage)
      : DEFAULT_DISPLAY_PREFERENCES.language,
    textSize: TEXT_SIZE_VALUES.has(candidate.textSize as DisplayTextSize)
      ? (candidate.textSize as DisplayTextSize)
      : DEFAULT_DISPLAY_PREFERENCES.textSize,
  };
}

export function textSizeMultiplier(textSize: DisplayTextSize) {
  switch (textSize) {
    case 'small':
      return 0.9;
    case 'large':
      return 1.12;
    case 'extra-large':
      return 1.25;
    default:
      return 1;
  }
}

export function scaleTextMetric(value: number, textSize: DisplayTextSize) {
  return Math.round(value * textSizeMultiplier(textSize) * 100) / 100;
}
