let token: string | null = null;
let tokenType = 'Bearer';
let activeRestaurantId: number | null = null;

export async function getToken() {
  return token;
}

export async function getTokenType() {
  return tokenType;
}

export async function setToken(nextToken: string, nextTokenType = 'Bearer') {
  token = nextToken;
  tokenType = nextTokenType;
}

export async function clearToken() {
  token = null;
  tokenType = 'Bearer';
}

export async function getActiveRestaurantId() {
  return activeRestaurantId;
}

export async function setActiveRestaurantId(id: number) {
  activeRestaurantId = id;
}

export async function clearActiveRestaurantId() {
  activeRestaurantId = null;
}

export async function clearSession() {
  await Promise.all([clearToken(), clearActiveRestaurantId()]);
}
