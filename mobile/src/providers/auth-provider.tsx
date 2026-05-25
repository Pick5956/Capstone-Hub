import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getCurrentUser, login } from '@/src/api/auth';
import { getMyMemberships } from '@/src/api/restaurant';
import {
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
  signOut: () => Promise<void>;
  selectRestaurant: (membership: Membership) => Promise<void>;
  refreshMemberships: () => Promise<void>;
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

      const [profile, membershipResponse, storedRestaurantId] = await Promise.all([
        getCurrentUser(),
        getMyMemberships(),
        getActiveRestaurantId(),
      ]);

      setUser(profile);
      setMemberships(membershipResponse.memberships);

      const activeExists = membershipResponse.memberships.some(
        (membership) => membership.restaurant_id === storedRestaurantId,
      );
      const nextRestaurantId = activeExists
        ? storedRestaurantId
        : membershipResponse.memberships.length === 1
          ? membershipResponse.memberships[0].restaurant_id
          : null;

      if (nextRestaurantId) {
        await setActiveRestaurantId(nextRestaurantId);
      }
      setActiveRestaurantIdState(nextRestaurantId);
    } catch {
      await clearSession();
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

  const signIn = useCallback(async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error('กรอกอีเมลและรหัสผ่านให้ครบ');
    }

    const response = await login(email, password);
    await setToken(response.token, 'Bearer');
    setUser(response.user);
    setMemberships(response.memberships);

    const nextRestaurantId = response.memberships.length === 1 ? response.memberships[0].restaurant_id : null;
    if (nextRestaurantId) {
      await setActiveRestaurantId(nextRestaurantId);
    }
    setActiveRestaurantIdState(nextRestaurantId);
    router.replace(nextRestaurantId ? '/home' : '/restaurants');
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    setUser(null);
    setMemberships([]);
    setActiveRestaurantIdState(null);
    router.replace('/login');
  }, []);

  const selectRestaurant = useCallback(async (membership: Membership) => {
    await setActiveRestaurantId(membership.restaurant_id);
    setActiveRestaurantIdState(membership.restaurant_id);
    router.replace('/home');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      memberships,
      activeMembership,
      signIn,
      signOut,
      selectRestaurant,
      refreshMemberships: async () => {
        await refreshMemberships();
      },
    }),
    [activeMembership, memberships, refreshMemberships, selectRestaurant, signIn, signOut, status, user],
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
