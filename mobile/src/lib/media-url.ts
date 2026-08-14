const backendMediaFields = new Set([
  'cover_image',
  'image_url',
  'logo',
  'profile_image',
  'promptpay_qr_image',
]);

function isPrivateOrLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || !normalized.includes('.')
  ) {
    return true;
  }

  const octets = normalized.split('.').map(Number);
  if (
    octets.length === 4
    && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
  ) {
    return (
      octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
    );
  }

  return normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:');
}

function joinApiUrl(apiBaseUrl: string, path: string) {
  return `${apiBaseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export function resolveBackendMediaUrl(value: string, apiBaseUrl: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (/^\/?uploads\//i.test(trimmed)) {
    return joinApiUrl(apiBaseUrl, trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.pathname.startsWith('/uploads/')
      && isPrivateOrLocalHostname(parsed.hostname)
    ) {
      return `${joinApiUrl(apiBaseUrl, parsed.pathname)}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function normalizeApiMediaUrls<T>(payload: T, apiBaseUrl: string): T {
  if (Array.isArray(payload)) {
    return payload.map((value) => normalizeApiMediaUrls(value, apiBaseUrl)) as T;
  }

  if (!payload || typeof payload !== 'object') return payload;

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (typeof value === 'string' && backendMediaFields.has(key)) {
        return [key, resolveBackendMediaUrl(value, apiBaseUrl)];
      }
      return [key, normalizeApiMediaUrls(value, apiBaseUrl)];
    }),
  ) as T;
}
