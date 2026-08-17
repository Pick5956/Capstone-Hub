import { createContext, useContext, useMemo, type ReactNode } from 'react';

type NestedHorizontalGestureSetter = (active: boolean) => void;
type VerticalScrollActivityReporter = (activityTimeMs: number) => void;

type PrimaryTabSwipeGestureContextValue = Readonly<{
  reportVerticalScrollActivity: VerticalScrollActivityReporter;
  setNestedHorizontalGestureActive: NestedHorizontalGestureSetter;
}>;

export type PrimaryTabSceneStatus = 'active' | 'adjacent' | 'inactive' | null;

const PrimaryTabsHostContext = createContext(false);
const PrimaryTabSceneStatusContext = createContext<PrimaryTabSceneStatus>(null);
const PrimaryTabSwipeGestureContext = createContext<PrimaryTabSwipeGestureContextValue>({
  reportVerticalScrollActivity: () => undefined,
  setNestedHorizontalGestureActive: () => undefined,
});

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
  reportVerticalScrollActivity,
  setNestedHorizontalGestureActive,
}: {
  children: ReactNode;
  reportVerticalScrollActivity: VerticalScrollActivityReporter;
  setNestedHorizontalGestureActive: NestedHorizontalGestureSetter;
}) {
  const value = useMemo(
    () => ({
      reportVerticalScrollActivity,
      setNestedHorizontalGestureActive,
    }),
    [reportVerticalScrollActivity, setNestedHorizontalGestureActive],
  );

  return (
    <PrimaryTabSwipeGestureContext.Provider value={value}>
      {children}
    </PrimaryTabSwipeGestureContext.Provider>
  );
}

export function usePrimaryTabSwipeExclusionHandlers() {
  const { setNestedHorizontalGestureActive } = useContext(PrimaryTabSwipeGestureContext);

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

export function usePrimaryTabVerticalScrollActivityReporter() {
  return useContext(PrimaryTabSwipeGestureContext).reportVerticalScrollActivity;
}
