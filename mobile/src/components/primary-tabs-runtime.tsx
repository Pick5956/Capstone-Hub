import { createContext, useContext, useMemo, type ReactNode } from 'react';

type NestedHorizontalGestureSetter = (active: boolean) => void;

export type PrimaryTabSceneStatus = 'active' | 'adjacent' | 'inactive' | null;

const PrimaryTabsHostContext = createContext(false);
const PrimaryTabSceneStatusContext = createContext<PrimaryTabSceneStatus>(null);
const PrimaryTabSwipeGestureContext = createContext<NestedHorizontalGestureSetter>(
  () => undefined,
);

export function PrimaryTabsHostProvider({ children }: { children: ReactNode }) {
  return (
    <PrimaryTabsHostContext.Provider value>
      {children}
    </PrimaryTabsHostContext.Provider>
  );
}

export function useIsPrimaryTabsHost() {
  return useContext(PrimaryTabsHostContext);
}

export function PrimaryTabSceneProvider({
  children,
  status,
}: {
  children: ReactNode;
  status: Exclude<PrimaryTabSceneStatus, null>;
}) {
  return (
    <PrimaryTabSceneStatusContext.Provider value={status}>
      {children}
    </PrimaryTabSceneStatusContext.Provider>
  );
}

export function usePrimaryTabSceneStatus() {
  return useContext(PrimaryTabSceneStatusContext);
}

export function PrimaryTabSwipeGestureProvider({
  children,
  setNestedHorizontalGestureActive,
}: {
  children: ReactNode;
  setNestedHorizontalGestureActive: NestedHorizontalGestureSetter;
}) {
  return (
    <PrimaryTabSwipeGestureContext.Provider value={setNestedHorizontalGestureActive}>
      {children}
    </PrimaryTabSwipeGestureContext.Provider>
  );
}

export function usePrimaryTabSwipeExclusionHandlers() {
  const setNestedHorizontalGestureActive = useContext(
    PrimaryTabSwipeGestureContext,
  );

  return useMemo(
    () => ({
      onTouchStart: () => setNestedHorizontalGestureActive(true),
      onTouchEnd: () => setNestedHorizontalGestureActive(false),
      onTouchCancel: () => setNestedHorizontalGestureActive(false),
      onPointerDown: () => setNestedHorizontalGestureActive(true),
      onPointerUp: () => setNestedHorizontalGestureActive(false),
      onPointerCancel: () => setNestedHorizontalGestureActive(false),
    }),
    [setNestedHorizontalGestureActive],
  );
}
