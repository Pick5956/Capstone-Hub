const backendMediaFields = new Set([
  "cover_image",
  "image_url",
  "logo",
  "profile_image",
  "promptpay_qr_image",
]);

function isPrivateOrLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    normalized === "localhost" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    !normalized.includes(".")
  ) {
    return true;
  }

  const octets = normalized.split(".").map(Number);
  if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }

  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function joinApiUrl(apiBaseUrl: string, path: string) {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function resolveBackendMediaUrl(value: string, apiBaseUrl: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^\/?uploads\//i.test(trimmed)) {
    return joinApiUrl(apiBaseUrl, trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.startsWith("/uploads/") && isPrivateOrLocalHostname(parsed.hostname)) {
      return `${joinApiUrl(apiBaseUrl, parsed.pathname)}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

// Only a JSON body carries media fields. A Blob or ArrayBuffer — a CSV export
// coming back from the API — is an object too, and the rebuild below would turn
// it into an empty {} and hand the user a 0-byte file.
function isPlainJSONObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function normalizeApiMediaUrls<T>(payload: T, apiBaseUrl: string): T {
  if (Array.isArray(payload)) {
    return payload.map((value) => normalizeApiMediaUrls(value, apiBaseUrl)) as T;
  }

  if (!isPlainJSONObject(payload)) {
    return payload;
  }

  const normalized = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      if (typeof value === "string" && backendMediaFields.has(key)) {
        return [key, resolveBackendMediaUrl(value, apiBaseUrl)];
      }
      return [key, normalizeApiMediaUrls(value, apiBaseUrl)];
    })
  );

  return normalized as T;
}
