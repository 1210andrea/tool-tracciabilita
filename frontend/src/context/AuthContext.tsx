import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useAuth';

type User = { id: string; role: string; username?: string };

type AuthContextValue = {
  user: User | null;
  token: string | null;
  initializing: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setInitializing(false);
      return;
    }

    let cancelled = false;
    setInitializing(true);

    api.me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          localStorage.removeItem('token');
        }
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      initializing,
      login: async (username, password) => {
        const t = await api.login(username, password);
        setToken(t);
        localStorage.setItem('token', t);
      },
      logout: () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
      }
    }),
    [api, user, token, initializing]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

