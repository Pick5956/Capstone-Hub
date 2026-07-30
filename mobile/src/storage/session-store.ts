import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'restaurant_hub_token';
const TOKEN_TYPE_KEY = 'restaurant_hub_token_type';
const RESTAURANT_ID_KEY = 'restaurant_hub_active_restaurant_id';

let sessionMutationQueue: Promise<void> = Promise.resolve();

function runSessionMutation<T>(operation: () => Promise<T>) {
  const result = sessionMutationQueue.then(operation, operation);
  sessionMutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function clearTokenRaw() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(TOKEN_TYPE_KEY);
}

async function clearActiveRestaurantIdRaw() {
  await SecureStore.deleteItemAsync(RESTAURANT_ID_KEY);
}

export async function getToken() {
  await sessionMutationQueue;
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getTokenType() {
  await sessionMutationQueue;
  return (await SecureStore.getItemAsync(TOKEN_TYPE_KEY)) || 'Bearer';
}

export async function setToken(token: string, tokenType = 'Bearer') {
  return runSessionMutation(async () => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(TOKEN_TYPE_KEY, tokenType);
  });
}

export async function clearToken() {
  return runSessionMutation(clearTokenRaw);
}

export async function getActiveRestaurantId() {
  await sessionMutationQueue;
  const raw = await SecureStore.getItemAsync(RESTAURANT_ID_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setActiveRestaurantId(id: number) {
  return runSessionMutation(
    () => SecureStore.setItemAsync(RESTAURANT_ID_KEY, String(id)),
  );
}

export async function clearActiveRestaurantId() {
  return runSessionMutation(clearActiveRestaurantIdRaw);
}

export async function clearActiveRestaurantIdIfCurrent(
  expectedId: number,
  afterClear?: () => void,
) {
  return runSessionMutation(async () => {
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(RESTAURANT_ID_KEY);
    } catch (error) {
      afterClear?.();
      throw error;
    }
    const current = raw ? Number.parseInt(raw, 10) : NaN;
    if (!Number.isFinite(current) || current !== expectedId) return false;
    try {
      await clearActiveRestaurantIdRaw();
    } finally {
      afterClear?.();
    }
    return true;
  });
}

export async function clearSession() {
  return runSessionMutation(async () => {
    await Promise.all([clearTokenRaw(), clearActiveRestaurantIdRaw()]);
  });
}

export async function clearSessionIfTokenCurrent(
  expectedToken: string,
  afterClear?: () => void,
) {
  return runSessionMutation(async () => {
    let current: string | null;
    try {
      current = await SecureStore.getItemAsync(TOKEN_KEY);
    } catch (error) {
      afterClear?.();
      throw error;
    }
    if (current !== expectedToken) return false;
    try {
      await Promise.all([clearTokenRaw(), clearActiveRestaurantIdRaw()]);
    } finally {
      afterClear?.();
    }
    return true;
  });
}
