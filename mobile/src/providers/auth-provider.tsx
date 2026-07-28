import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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

type AuthStatus = 'loading' | 'ready';

interface AuthContextValue {
  status: AuthStatus;
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeRestaurantId, setActiveRestaurantIdState] = useState<number | null>(null);

  const activeMembership = useMemo(() => {
    if (!activeRestaurantId) return null;
    return memberships.find((membership) => membership.restaurant_id === activeRestaurantId) || null;
  }, [activeRestaurantId, memberships]);

  const refreshMemberships = useCallback(async () => {
    const response = await getMyMemberships();
    setMemberships(response.memberships);
    return response;
  }, []);

  const refreshProfile = useCallback(async () => {
    const profile = await getCurrentUser();
    setUser(profile);
  }, []);

  const restore = useCallback(async () => {
    setStatus('loading');
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        setMemberships([]);
        setActiveRestaurantIdState(null);
        return;
      }

      const profile = await getCurrentUser();
      setUser(profile);

      const [membershipResult, storedRestaurantResult] = await Promise.allSettled([
        getMyMemberships(),
        getActiveRestaurantId(),
      ]);
      const nextMemberships = membershipResult.status === 'fulfilled'
        ? membershipResult.value.memberships
        : [];
      const storedRestaurantId = storedRestaurantResult.status === 'fulfilled'
        ? storedRestaurantResult.value
        : null;
      const nextRestaurantId = resolveActiveRestaurantId(
        nextMemberships,
        storedRestaurantId,
      );

      setMemberships(nextMemberships);
      if (membershipResult.status === 'fulfilled') {
        if (nextRestaurantId) {
          await setActiveRestaurantId(nextRestaurantId).catch(() => undefined);
        } else {
          await clearActiveRestaurantId().catch(() => undefined);
        }
      }
      setActiveRestaurantIdState(nextRestaurantId);
    } catch {
      await clearSession().catch(() => undefined);
      setUser(null);
      setMemberships([]);
      setActiveRestaurantIdState(null);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const completeSignIn = useCallback(async (response: LoginResponse) => {
    await setToken(response.token, 'Bearer');
    setUser(response.user);
    setMemberships(response.memberships);

    await clearActiveRestaurantId();
    setActiveRestaurantIdState(null);
    router.replace('/restaurants');
  }, []);

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
    setActiveRestaurantIdState(null);
    router.replace('/login');
  }, [user?.auth_provider]);

  const selectRestaurant = useCallback(async (membership: Membership) => {
    await setActiveRestaurantId(membership.restaurant_id);
    setActiveRestaurantIdState(membership.restaurant_id);
    router.replace(getDefaultWorkspaceRoute(membership));
  }, []);

  const setActiveRestaurantFromMembership = useCallback(async (membership: Membership) => {
    await setActiveRestaurantId(membership.restaurant_id);
    setMemberships((current) => upsertMembership(current, membership));
    setActiveRestaurantIdState(membership.restaurant_id);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
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
    }),
    [activeMembership, memberships, refreshMemberships, refreshProfile, selectRestaurant, setActiveRestaurantFromMembership, signIn, signInWithGoogle, signOut, status, user],
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
