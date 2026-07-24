type PosTableNavigationGuard = {
  tryStart(orderId: number): boolean;
  current(): number | null;
  reset(): void;
};

export function createPosTableNavigationGuard(): PosTableNavigationGuard {
  let orderId: number | null = null;

  return {
    tryStart(nextOrderId) {
      if (orderId !== null) return false;
      orderId = nextOrderId;
      return true;
    },
    current() {
      return orderId;
    },
    reset() {
      orderId = null;
    },
  };
}
