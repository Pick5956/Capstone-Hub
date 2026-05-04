export function createSingleFlight() {
  let locked = false;

  return async function runSingleFlight<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (locked) return undefined;
    locked = true;
    try {
      return await task();
    } finally {
      locked = false;
    }
  };
}
