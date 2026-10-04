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

platformClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const signingIn = /\/platform\/auth\/(login|refresh)$/.test(originalRequest?.url || '');

    if (error.response?.status === 401 && !originalRequest._retry && !signingIn) {
      originalRequest._retry = true;
      try {
        const refreshToken = usePlatformStore.getState().refreshToken;
        if (!refreshToken) throw new Error('No refresh token');
        const res = await axios.post(`${API_BASE_URL}/platform/auth/refresh`, { refreshToken });
        usePlatformStore.getState().setAccessToken(res.data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`;
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
