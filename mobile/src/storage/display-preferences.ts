import * as SecureStore from 'expo-secure-store';

import {
  DEFAULT_DISPLAY_PREFERENCES,
  normalizeDisplayPreferences,
  type DisplayPreferences,
} from '@/src/lib/display-preferences';

const DISPLAY_PREFERENCES_KEY = 'dishy_display_preferences';

export async function getDisplayPreferences(): Promise<DisplayPreferences> {
  const raw = await SecureStore.getItemAsync(DISPLAY_PREFERENCES_KEY);
  if (!raw) return { ...DEFAULT_DISPLAY_PREFERENCES };

  try {
    return normalizeDisplayPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DISPLAY_PREFERENCES };
  }
}

export async function setDisplayPreferences(preferences: DisplayPreferences) {
  const normalized = normalizeDisplayPreferences(preferences);
  await SecureStore.setItemAsync(
    DISPLAY_PREFERENCES_KEY,
    JSON.stringify(normalized),
  );
}
