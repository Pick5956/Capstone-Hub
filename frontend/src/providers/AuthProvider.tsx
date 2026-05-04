'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User } from '../types/auth';
import { Membership } from '../types/restaurant';
import { getCurrentUser } from '../lib/auth';
import { getMyMemberships } from '../lib/restaurant';
import { authRepository } from '../app/repositories/authRepository';
import { restaurantRepository } from '../app/repositories/restaurantRepository';
import AuthModal from '../components/auth/AuthModal';

interface AuthContextType {
  user: User | null;
  memberships: Membership[];
  activeMembership: Membership | null;
  loading: boolean;
  logout: () => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
  setActiveRestaurant: (restaurantId: number) => void;
  refreshMemberships: () => Promise<Membership[]>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  memberships: [],
  activeMembership: null,
  loading: true,
  logout: () => {},
  openLoginModal: () => {},
  closeLoginModal: () => {},
  setActiveRestaurant: () => {},
  refreshMemberships: async () => [],
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const applyMemberships = useCallback((list: Membership[]) => {
    setMemberships(list);
    const stored = restaurantRepository.getActiveId();
    const inList = list.find((m) => m.restaurant_id === stored);
    if (inList) {
      setActiveId(inList.restaurant_id);
    } else if (list.length === 1) {
      restaurantRepository.setActiveId(list[0].restaurant_id);
      setActiveId(list[0].restaurant_id);
    } else {
      restaurantRepository.clearActiveId();
      setActiveId(null);
    }
  }, []);

  const refreshMemberships = useCallback(async () => {
    try {
      const res = await getMyMemberships();
      const list = res?.data?.memberships ?? [];
      applyMemberships(list);
      return list;
    } catch {
      applyMemberships([]);
      return [];
    }
  }, [applyMemberships]);

  const fetchUser = useCallback(async () => {
    const token = authRepository.getToken();
    if (!token) {
      setUser(null);
      setMemberships([]);
      setActiveId(null);
      setLoading(false);
      return null;
    }

    try {
      const res = await getCurrentUser();
      if (res && res.data) {
        setUser(res.data);
        await refreshMemberships();
        return res.data;
      }
    } catch {
      authRepository.clearToken();
      restaurantRepository.clearActiveId();
      setUser(null);
      setMemberships([]);
      setActiveId(null);
    } finally {
      setLoading(false);
    }
    return null;
  }, [refreshMemberships]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = () => {
    authRepository.clearToken();
    restaurantRepository.clearActiveId();
    setUser(null);
    setMemberships([]);
    setActiveId(null);
    window.location.href = '/';
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  const handleAuthenticated = (authenticatedUser?: User, freshMemberships?: Membership[]) => {
    if (authenticatedUser) {
      setUser(authenticatedUser);
    }
    if (freshMemberships) {
      applyMemberships(freshMemberships);
    } else {
      refreshMemberships();
    }
    setLoading(false);
  };

  const setActiveRestaurant = (restaurantId: number) => {
    if (!memberships.find((m) => m.restaurant_id === restaurantId)) return;
    restaurantRepository.setActiveId(restaurantId);
    setActiveId(restaurantId);
  };

  const activeMembership = memberships.find((m) => m.restaurant_id === activeId) ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        activeMembership,
        loading,
        logout,
        openLoginModal,
        closeLoginModal,
        setActiveRestaurant,
        refreshMemberships,
      }}
    >
      {children}
      <AuthModal
        isOpen={isLoginModalOpen}
        onClose={closeLoginModal}
        initialMode="login"
        onAuthenticated={handleAuthenticated}
      />
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
