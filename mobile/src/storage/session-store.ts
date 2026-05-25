import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'restaurant_hub_token';
const TOKEN_TYPE_KEY = 'restaurant_hub_token_type';
const RESTAURANT_ID_KEY = 'restaurant_hub_active_restaurant_id';

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getTokenType() {
  return (await SecureStore.getItemAsync(TOKEN_TYPE_KEY)) || 'Bearer';
}

export async function setToken(token: string, tokenType = 'Bearer') {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(TOKEN_TYPE_KEY, tokenType);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(TOKEN_TYPE_KEY);
}

export async function getActiveRestaurantId() {
  const raw = await SecureStore.getItemAsync(RESTAURANT_ID_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setActiveRestaurantId(id: number) {
  await SecureStore.setItemAsync(RESTAURANT_ID_KEY, String(id));
}

export async function clearActiveRestaurantId() {
  await SecureStore.deleteItemAsync(RESTAURANT_ID_KEY);
}

export async function clearSession() {
  await Promise.all([clearToken(), clearActiveRestaurantId()]);
}
