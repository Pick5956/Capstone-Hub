export type PositiveRouteId =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'valid'; id: number };

export function parsePositiveRouteId(value: unknown): PositiveRouteId {
  if (value === undefined || value === null) {
    return { kind: 'missing' };
  }

  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0
      ? { kind: 'valid', id: value }
      : { kind: 'invalid' };
  }

  if (typeof value !== 'string') {
    return { kind: 'invalid' };
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return { kind: 'invalid' };
  }

  const id = Number(normalized);
  return Number.isSafeInteger(id) && id > 0
    ? { kind: 'valid', id }
    : { kind: 'invalid' };
}
