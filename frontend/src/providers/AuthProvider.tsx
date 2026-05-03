'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User } from '../types/auth';
import { getCurrentUser } from '../lib/auth';
import { authRepository } from '../app/repositories/authRepository';
import AuthModal from '../components/auth/AuthModal';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  openLoginModal: () => {},
  closeLoginModal: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const fetchUser = useCallback(async () => {
    const token = authRepository.getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }

    try {
      const res = await getCurrentUser();
      if (res && res.data) {
        setUser(res.data);
        return res.data;
      }
    } catch (error) {
      console.error("Failed to fetch user profile", error);
    } finally {
      setLoading(false);
    }

    return null;
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = () => {
    authRepository.clearToken();
    setUser(null);
    window.location.href = '/';
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);
  const handleAuthenticated = (authenticatedUser?: User) => {
    if (authenticatedUser) {
      setUser(authenticatedUser);
      setLoading(false);
      return;
    }

    fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, openLoginModal, closeLoginModal }}>
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
