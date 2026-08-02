import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  getCurrentUser,
  googleLogin,
  login,
  type LoginResponse,
} from '@/src/api/auth';
import { getMyMemberships } from '@/src/api/restaurant';
import {
  clearGoogleSignInSession,
  requestGoogleIdToken,
} from '@/src/lib/google-sign-in';
import {
  resolveActiveRestaurantId,
  upsertMembership,
} from '@/src/lib/auth-state';
import { resetRouteStack } from '@/src/lib/navigation-runtime';
import {
  loadStoredSession,
  shouldApplySessionInvalidation,
  subscribeSessionInvalidation,
} from '@/src/lib/session-runtime';
import { getDefaultWorkspaceRoute } from '@/src/lib/work-mode';
import {
  clearActiveRestaurantId,
  clearSession,
  getActiveRestaurantId,
  getToken,
  setActiveRestaurantId,
  setToken,
} from '@/src/storage/session-store';
import type { User } from '@/src/types/auth';
import type { Membership } from '@/src/types/restaurant';

type AuthStatus = 'loading' | 'ready' | 'recoverable-error';

interface AuthContextValue {
  status: AuthStatus;
  sessionRestoreError: boolean;
  membershipsLoadError: boolean;
  user: User | null;
  memberships: Membership[];
  activeMembership: Membership | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  selectRestaurant: (membership: Membership) => Promise<void>;
  setActiveRestaurantFromMembership: (membership: Membership) => Promise<void>;
  refreshMemberships: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  retrySessionRestore: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeRestaurantId, setActiveRestaurantIdState] = useState<number | null>(null);
  const [sessionRestoreError, setSessionRestoreError] = useState(false);
  const [membershipsLoadError, setMembershipsLoadError] = useState(false);
  const activeRestaurantIdRef = useRef<number | null>(null);
  const updateActiveRestaurantId = useCallback((restaurantId: number | null) => {
    activeRestaurantIdRef.current = restaurantId;
    setActiveRestaurantIdState(restaurantId);
  }, []);

  const activeMembership = useMemo(() => {
    if (!activeRestaurantId) return null;
    return memberships.find((membership) => membership.restaurant_id === activeRestaurantId) || null;
  }, [activeRestaurantId, memberships]);

  const applyMembershipSnapshot = useCallback(async (
    nextMemberships: Membership[],
    storedRestaurantId: number | null,
  ) => {
    const nextRestaurantId = resolveActiveRestaurantId(
      nextMemberships,
      storedRestaurantId,
    );
    setMemberships(nextMemberships);
    setMembershipsLoadError(false);
    updateActiveRestaurantId(nextRestaurantId);
    if (nextRestaurantId) {
      await setActiveRestaurantId(nextRestaurantId).catch(() => undefined);
    } else {
      await clearActiveRestaurantId().catch(() => undefined);
    }
  }, [updateActiveRestaurantId]);

  const refreshMemberships = useCallback(async () => {
    try {
      const response = await getMyMemberships();
      const storedRestaurantId = await getActiveRestaurantId()
        .catch(() => activeRestaurantId);
      await applyMembershipSnapshot(response.memberships, storedRestaurantId);
      return response;
    } catch (error) {
      setMembershipsLoadError(true);
      throw error;
    }
  }, [activeRestaurantId, applyMembershipSnapshot]);

  const refreshProfile = useCallback(async () => {
    const profile = await getCurrentUser();
    setUser(profile);
  }, []);

  const restore = useCallback(async () => {
    setStatus('loading');
    setSessionRestoreError(false);

    const result = await loadStoredSession({
      getToken,
      getProfile: getCurrentUser,
      getMemberships: async () => (await getMyMemberships()).memberships,
      getStoredRestaurantId: getActiveRestaurantId,
    });

    switch (result.kind) {
      case 'signed-out':
        setUser(null);
        setMemberships([]);
        setMembershipsLoadError(false);
        updateActiveRestaurantId(null);
        setStatus('ready');
        return;
      case 'invalid-session':
        await clearSession().catch(() => undefined);
        setUser(null);
        setMemberships([]);
        setMembershipsLoadError(false);
        updateActiveRestaurantId(null);
        setStatus('ready');
        resetRouteStack(router, '/login');
        return;
      case 'recoverable-error':
        setSessionRestoreError(true);
        setStatus('recoverable-error');
        return;
      case 'memberships-unavailable':
        setUser(result.user);
        setMembershipsLoadError(true);
        updateActiveRestaurantId(null);
        setStatus('ready');
        return;
      case 'authenticated':
        setUser(result.user);
        await applyMembershipSnapshot(
          result.memberships,
          result.storedRestaurantId,
        );
        setStatus('ready');
        return;
    }
  }, [applyMembershipSnapshot]);

  useEffect(() => {
    return subscribeSessionInvalidation((event) => {
      if (!shouldApplySessionInvalidation(event, activeRestaurantIdRef.current)) {
        return;
      }
      setSessionRestoreError(false);
      setStatus('ready');
      if (event.kind === 'auth-invalidated') {
        setUser(null);
        setMemberships([]);
        setMembershipsLoadError(false);
        updateActiveRestaurantId(null);
        resetRouteStack(router, '/login');
        return;
      }

      setMemberships((current) => current.filter(
        (membership) => membership.restaurant_id !== event.restaurantId,
      ));
      setMembershipsLoadError(false);
      updateActiveRestaurantId(null);
      resetRouteStack(router, '/restaurants');
    });
  }, [updateActiveRestaurantId]);

  useEffect(() => {
    void restore();
  }, [restore]);

  const completeSignIn = useCallback(async (response: LoginResponse) => {
    await setToken(response.token, 'Bearer');
    setUser(response.user);
    setMemberships(response.memberships);
    setSessionRestoreError(false);
    setMembershipsLoadError(false);

    await clearActiveRestaurantId();
    updateActiveRestaurantId(null);
    router.replace('/restaurants');
  }, [updateActiveRestaurantId]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error('กรอกอีเมลและรหัสผ่านให้ครบ');
    }

    const response = await login(email, password);
    await completeSignIn(response);
  }, [completeSignIn]);

  const signInWithGoogle = useCallback(async () => {
    const idToken = await requestGoogleIdToken();
    if (!idToken) {
      return false;
    }

    const response = await googleLogin(idToken);
    await completeSignIn(response);
    return true;
  }, [completeSignIn]);

  const signOut = useCallback(async () => {
    if (user?.auth_provider === 'google') {
      await clearGoogleSignInSession();
    }
    await clearSession();
    setUser(null);
    setMemberships([]);
    setSessionRestoreError(false);
    setMembershipsLoadError(false);
    updateActiveRestaurantId(null);
    resetRouteStack(router, '/login');
  }, [updateActiveRestaurantId, user?.auth_provider]);

  const selectRestaurant = useCallback(async (membership: Membership) => {
    await setActiveRestaurantId(membership.restaurant_id);
    updateActiveRestaurantId(membership.restaurant_id);
    resetRouteStack(router, getDefaultWorkspaceRoute(membership));
  }, [updateActiveRestaurantId]);

  const setActiveRestaurantFromMembership = useCallback(async (membership: Membership) => {
    await setActiveRestaurantId(membership.restaurant_id);
    setMemberships((current) => upsertMembership(current, membership));
    setMembershipsLoadError(false);
    updateActiveRestaurantId(membership.restaurant_id);
  }, [updateActiveRestaurantId]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      sessionRestoreError,
      membershipsLoadError,
      user,
      memberships,
      activeMembership,
      signIn,
      signInWithGoogle,
      signOut,
      selectRestaurant,
      setActiveRestaurantFromMembership,
      refreshMemberships: async () => {
        await refreshMemberships();
      },
      refreshProfile,
      retrySessionRestore: restore,
    }),
    [activeMembership, memberships, membershipsLoadError, refreshMemberships, refreshProfile, restore, selectRestaurant, sessionRestoreError, setActiveRestaurantFromMembership, signIn, signInWithGoogle, signOut, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
