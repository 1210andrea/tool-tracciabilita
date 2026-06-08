import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useApi } from '../hooks/useAuth';

type User = { id: string; role: string; username?: string; operator_category_id?: string | null; operator_name?: string | null };

type AuthContextValue = {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const api = useApi();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!token) return;
    api.me().then((u) => setUser(u)).catch(() => {
      setToken(null);
      localStorage.removeItem('token');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
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
    [api, user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

