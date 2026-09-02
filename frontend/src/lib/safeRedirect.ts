// Shared guard for post-login / post-selection redirect targets.
//
// A `next` value reaches us from the query string, so it is attacker-controlled.
// Prefix checks alone are not enough: the URL parser strips ASCII tab/newline and
// treats a backslash like a slash, so "/\/evil.com" and "/\t//evil.com" both
// resolve to another origin while still passing a startsWith("/") test.
// Resolving against the current origin and comparing is the only reliable check.

const FALLBACK_BASE = "http://internal.invalid";

function resolveBase(base?: string) {
  if (base) return base;
  return typeof window !== "undefined" ? window.location.href : FALLBACK_BASE;
}

/**
 * Returns the value only when it is a same-origin path, otherwise undefined.
 * Legitimate paths ("/home", "/orders?date=2026-01-01") are returned unchanged.
 */
export function safeInternalPath(value: string | null | undefined, base?: string): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;

  const resolvedBase = resolveBase(base);
  try {
    const origin = new URL(resolvedBase).origin;
    const target = new URL(value, resolvedBase);
    if (target.origin !== origin) return undefined;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
}

/** Reads and validates the `next` parameter out of a query string. */
export function safeNextPathFromSearch(search: string, base?: string): string | undefined {
  return safeInternalPath(new URLSearchParams(search).get("next"), base);
}
