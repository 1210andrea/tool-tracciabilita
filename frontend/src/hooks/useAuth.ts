import axios from 'axios';
import { useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL as string;

export function useApi() {
  const client = useMemo(() => {
    const instance = axios.create({ baseURL: API_URL, withCredentials: true });

    instance.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    return instance;
  }, []);

  return {
    login: async (username: string, password: string) => {
      const resp = await axios.post(`${API_URL}/auth/login`, { username, password });
      return resp.data.token as string;
    },
    me: async () => {
      const resp = await client.get('/auth/me');
      return resp.data.user as { id: string; role: string };
    }
  };
}

