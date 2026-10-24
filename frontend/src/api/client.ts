import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add JWT token to headers
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// One refresh at a time: requests that fail together while the token is
// expired all wait on the same renewal instead of each starting their own.
let refreshing: Promise<string> | null = null;

function renewAccessToken(): Promise<string> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = response.data;
      useAuthStore.getState().setTokens(accessToken, newRefreshToken ?? refreshToken);
      return accessToken as string;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// Response interceptor: Handle token refresh and errors
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    // A wrong password at sign-in is the page's to show; there is no
    // session to renew.
    const signingIn = /\/auth\/(login|signup)$/.test(originalRequest?.url || '');

    // Handle 401 - Try to refresh token
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !signingIn) {
      originalRequest._retry = true;

      try {
        const accessToken = await renewAccessToken();

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return client(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // Handle 403 - Forbidden
    if (error.response?.status === 403) {
      console.error('Access denied');
    }

    return Promise.reject(error);
  }
);

export default client;
