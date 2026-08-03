export type FilteredReplacementResult<T> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: unknown };

export async function loadFilteredReplacement<T>(
  load: () => Promise<T>,
): Promise<FilteredReplacementResult<T>> {
  try {
    return { ok: true, data: await load(), error: null };
  } catch (error) {
    return { ok: false, data: null, error };
  }
}
