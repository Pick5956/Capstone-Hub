// Google sign-in as a real OAuth redirect in a new browser tab.
//
// This replaces Google Identity Services (the `accounts.google.com/gsi/client`
// script and its in-page account chooser overlay), which looked like a modal
// stacked on top of our own modal. The button now opens the normal Google
// consent screen in its own tab, the way most sites do it.
//
// Flow: the tab lands back on `/auth/google/callback` with an OpenID Connect
// id_token in the URL fragment, the callback page hands that token to the
// opener over postMessage, and the opener exchanges it through the existing
// `POST /api/google-login`. The backend already verifies signature, issuer,
// audience and email_verified for exactly this kind of token, so nothing had
// to move to the Go side and no client secret is involved.

// Must match the Authorized redirect URI registered on the OAuth client.
const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
export const GOOGLE_AUTH_MESSAGE = "dishy:google-auth";
export const GOOGLE_TAB_NAME = "dishy-google-login";

const PENDING_STORAGE_KEY = "dishy:google-auth-pending";

export type GoogleAuthPending = {
  /** Random value echoed back by Google; ties a callback to the click that started it. */
  state: string;
  /** Random value baked into the id_token by Google; proves the token answers this request. */
  nonce: string;
  /** Same-origin path to land on after the blocked-popup fallback signs in. */
  next?: string;
};

export type GoogleAuthMessage = {
  type: typeof GOOGLE_AUTH_MESSAGE;
  state: string;
  idToken?: string;
  error?: string;
};

export type GoogleCallbackParams = {
  idToken?: string;
  state?: string;
  error?: string;
};

// The new-tab flow reads this back out of module scope, so it survives an
// AuthModal remount while the Google tab is open. The blocked-popup fallback
// navigates the whole document away, so that one needs sessionStorage.
let pendingInMemory: GoogleAuthPending | null = null;

export function randomAuthToken(byteLength = 16): string {
  const buffer = new Uint8Array(byteLength);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function rememberPendingGoogleAuth(pending: GoogleAuthPending): void {
  pendingInMemory = pending;
  try {
    window.sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Private mode or storage blocked by policy. The in-memory copy still
    // covers the new-tab flow; only the same-tab fallback needs the stored one.
  }
}

export function readPendingGoogleAuth(): GoogleAuthPending | null {
  if (pendingInMemory) return pendingInMemory;
  try {
    const raw = window.sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GoogleAuthPending> | null;
    if (!parsed || typeof parsed.state !== "string" || typeof parsed.nonce !== "string") return null;
    return { state: parsed.state, nonce: parsed.nonce, next: typeof parsed.next === "string" ? parsed.next : undefined };
  } catch {
    return null;
  }
}

export function clearPendingGoogleAuth(): void {
  pendingInMemory = null;
  try {
    window.sessionStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // Nothing to clean up when storage was never writable.
  }
}

export function googleCallbackUrl(): string {
  return `${window.location.origin}${GOOGLE_CALLBACK_PATH}`;
}

export function buildGoogleAuthUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}): string {
  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    // OpenID Connect implicit flow: Google returns the signed id_token straight
    // to the redirect URI. The authorization-code flow would need a client
    // secret and a token-exchange endpoint on the backend; this one reuses the
    // id_token path that already exists.
    response_type: "id_token",
    // Fragment keeps the credential out of server logs and the Referer header.
    response_mode: "fragment",
    scope: "openid email profile",
    nonce: options.nonce,
    state: options.state,
    // Always show the chooser: staff share devices, and silently reusing the
    // one signed-in Google account is the wrong default in a restaurant.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Reads the callback result. Google answers in the fragment for this flow, but
 * some early failures (a rejected request rather than a rejected user) come
 * back as query parameters, so both are checked.
 */
export function parseGoogleCallbackParams(hash: string, search = ""): GoogleCallbackParams {
  const fromHash = new URLSearchParams(hash.replace(/^#/, ""));
  const fromSearch = new URLSearchParams(search.replace(/^\?/, ""));
  const pick = (key: string) => fromHash.get(key) ?? fromSearch.get(key) ?? undefined;
  return { idToken: pick("id_token"), state: pick("state"), error: pick("error") };
}

/** Reads the `nonce` claim without verifying the signature - the backend does that. */
export function idTokenNonce(idToken: string): string | undefined {
  const payload = idToken.split(".")[1];
  if (!payload) return undefined;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as { nonce?: unknown };
    return typeof claims.nonce === "string" ? claims.nonce : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the callback really answers the sign-in we started: same state, and
 * an id_token minted for our nonce. Guards against a stray or replayed message.
 */
export function isGoogleCallbackTrusted(params: GoogleCallbackParams, pending: GoogleAuthPending | null): boolean {
  if (!pending || !params.idToken || !params.state) return false;
  if (params.state !== pending.state) return false;
  return idTokenNonce(params.idToken) === pending.nonce;
}
