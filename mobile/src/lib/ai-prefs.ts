import * as SecureStore from 'expo-secure-store';

// Per-device assistant preferences, the phone's copy of the web's aiPrefs:
// whether follow-up suggestions show under answers, a cached copy of what the
// assistant calls the owner (so the greeting is right on first paint), which
// chat was open last, and which insights the owner has already seen. Every
// read has a fallback; the screen renders correctly with nothing stored.

const FOLLOW_UPS_KEY = 'ai_follow_ups';
const OWNER_TITLE_KEY = 'ai_owner_title';
const ACTIVE_THREAD_KEY = 'ai_active_thread';
const INSIGHTS_SEEN_KEY = 'ai_insights_seen';

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Storage unavailable: the preference simply does not persist.
  }
}

export async function readFollowUpsEnabled(): Promise<boolean> {
  return (await read(FOLLOW_UPS_KEY)) !== 'off';
}

export async function writeFollowUpsEnabled(enabled: boolean): Promise<void> {
  await write(FOLLOW_UPS_KEY, enabled ? null : 'off');
}

export async function readCachedOwnerTitle(): Promise<string> {
  return (await read(OWNER_TITLE_KEY))?.trim() ?? '';
}

export async function writeCachedOwnerTitle(title: string): Promise<void> {
  const trimmed = title.trim();
  await write(OWNER_TITLE_KEY, trimmed === '' ? null : trimmed);
}

/** The chat that was open when the screen was last left, per restaurant. */
export async function readActiveThread(scope: string): Promise<string | null> {
  const raw = await read(ACTIVE_THREAD_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[scope] ?? null;
  } catch {
    return null;
  }
}

export async function writeActiveThread(scope: string, conversationId: string | null): Promise<void> {
  const raw = await read(ACTIVE_THREAD_KEY);
  let parsed: Record<string, string> = {};
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    parsed = {};
  }
  if (conversationId) parsed[scope] = conversationId;
  else delete parsed[scope];
  await write(ACTIVE_THREAD_KEY, JSON.stringify(parsed));
}

/**
 * Which insights this owner has already read, per restaurant. The scope goes in
 * the value, never in the key: a key may only hold letters, digits, dots,
 * dashes and underscores, and a scope contains a colon — a key built from one
 * is rejected, and the write is lost without an error.
 */
async function readSeenMap(): Promise<Record<string, string[]>> {
  const raw = await read(INSIGHTS_SEEN_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed ?? {})) {
      if (Array.isArray(value)) out[key] = value.filter((item): item is string => typeof item === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

export async function readSeenInsights(scope: string): Promise<string[]> {
  return (await readSeenMap())[scope] ?? [];
}

export async function writeSeenInsights(scope: string, keys: string[]): Promise<void> {
  const map = await readSeenMap();
  map[scope] = keys.slice(-60);
  await write(INSIGHTS_SEEN_KEY, JSON.stringify(map));
}
