export function createRequestGeneration() {
  let current = 0;

  return {
    begin() {
      current += 1;
      return current;
    },
    invalidate() {
      current += 1;
    },
    isCurrent(request: number) {
      return request === current;
    },
  };
}

export function shouldStartRequest(
  quiet: boolean,
  foregroundRequestPending: boolean,
) {
  return !quiet || !foregroundRequestPending;
}
