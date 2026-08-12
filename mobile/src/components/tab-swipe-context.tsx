import { type ReactNode } from 'react';

import {
  PrimaryTabSwipeGestureProvider,
  usePrimaryTabSwipeExclusionHandlers,
} from '@/src/components/primary-tabs-runtime';

type NestedHorizontalGestureSetter = (active: boolean) => void;

export function TabSwipeGestureProvider({
  children,
  setNestedHorizontalGestureActive,
}: {
  children: ReactNode;
  setNestedHorizontalGestureActive: NestedHorizontalGestureSetter;
}) {
  return (
    <PrimaryTabSwipeGestureProvider
      setNestedHorizontalGestureActive={setNestedHorizontalGestureActive}
    >
      {children}
    </PrimaryTabSwipeGestureProvider>
  );
}

export function useTabSwipeExclusionHandlers() {
  return usePrimaryTabSwipeExclusionHandlers();
}
