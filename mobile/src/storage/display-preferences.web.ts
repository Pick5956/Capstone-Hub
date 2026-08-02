import {
  DEFAULT_DISPLAY_PREFERENCES,
  normalizeDisplayPreferences,
  type DisplayPreferences,
} from '@/src/lib/display-preferences';

const DISPLAY_PREFERENCES_KEY = 'dishy_display_preferences';
let memoryPreferences: DisplayPreferences = { ...DEFAULT_DISPLAY_PREFERENCES };

function getBrowserStorage() {
  if (typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage;
}

export async function getDisplayPreferences(): Promise<DisplayPreferences> {
  const storage = getBrowserStorage();
  if (!storage) return { ...memoryPreferences };

  const raw = storage.getItem(DISPLAY_PREFERENCES_KEY);
  if (!raw) return { ...DEFAULT_DISPLAY_PREFERENCES };

  try {
    memoryPreferences = normalizeDisplayPreferences(JSON.parse(raw));
  } catch {
    memoryPreferences = { ...DEFAULT_DISPLAY_PREFERENCES };
  }

  return { ...memoryPreferences };
}

export async function setDisplayPreferences(preferences: DisplayPreferences) {
  memoryPreferences = normalizeDisplayPreferences(preferences);
  const storage = getBrowserStorage();
  if (!storage) return;
  storage.setItem(DISPLAY_PREFERENCES_KEY, JSON.stringify(memoryPreferences));
}
