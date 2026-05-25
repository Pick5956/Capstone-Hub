import { clearActiveRestaurantId, getActiveRestaurantId, getToken, getTokenType } from '@/src/storage/session-store';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const apiUrl = (configuredApiUrl || 'http://localhost:8080').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public url: string,
    public details?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequestOptions = RequestInit & {
  skipAuth?: boolean;
  skipRestaurant?: boolean;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const url = `${apiUrl}${path}`;

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (!options.skipAuth) {
    const token = await getToken();
    const tokenType = await getTokenType();
    if (token) {
      headers.set('Authorization', `${tokenType} ${token}`);
    }
  }

  if (!options.skipRestaurant) {
    const restaurantId = await getActiveRestaurantId();
    if (restaurantId) {
      headers.set('X-Restaurant-ID', String(restaurantId));
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const rawBody = await response.text().catch(() => '');
    const payload = rawBody ? tryParseJson(rawBody) : null;
    const message = payload?.error || payload?.message || `Request failed (${response.status})`;
    if ((response.status === 400 || response.status === 403) && String(message).toLowerCase().includes('restaurant')) {
      await clearActiveRestaurantId();
    }
    throw new ApiError(message, response.status, url, rawBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function tryParseJson(rawBody: string): { error?: string; message?: string } | null {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}
