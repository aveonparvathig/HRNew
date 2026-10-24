import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { usePlatformStore } from '../store/platformStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// A dedicated client for the platform-owner console: it carries the PLATFORM
// token and refreshes against /platform/auth/refresh, never touching the tenant
// session.
const platformClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

platformClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = usePlatformStore.getState().accessToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// Concurrent 401s share one in-flight refresh (kept apart from the tenant
// client's, as the two sessions are).
let refreshing: Promise<string> | null = null;

function renewAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = usePlatformStore.getState().refreshToken;
      if (!refreshToken) throw new Error('No refresh token');
      const res = await axios.post(`${API_BASE_URL}/platform/auth/refresh`, { refreshToken });
      usePlatformStore.getState().setAccessToken(res.data.accessToken);
      return res.data.accessToken as string;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

platformClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const signingIn = /\/platform\/auth\/(login|refresh)$/.test(originalRequest?.url || '');

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !signingIn) {
      originalRequest._retry = true;
      try {
        const accessToken = await renewAccessToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return platformClient(originalRequest);
      } catch (refreshError) {
        usePlatformStore.getState().logout();
        window.location.href = '/platform/login';
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export default platformClient;
