type RequestGeneration = {
  begin(): number;
  invalidate(): void;
  isCurrent(request: number): boolean;
};

export function createOrderDetailRequestGuard(requests: RequestGeneration) {
  let mutationInFlight = false;

  return {
    beginLoad() {
      return mutationInFlight ? null : requests.begin();
    },
    canApplyLoad(request: number | null) {
      return request !== null
        && !mutationInFlight
        && requests.isCurrent(request);
    },
    beginMutation() {
      if (mutationInFlight) return false;

      mutationInFlight = true;
      requests.invalidate();
      return true;
    },
    finishMutation() {
      requests.invalidate();
      mutationInFlight = false;
    },
    invalidateLoads() {
      requests.invalidate();
    },
  };
}
