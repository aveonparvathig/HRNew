import client from './client';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: {
    userId: string;
    email: string;
    organizationId: string;
    firstName?: string;
    lastName?: string;
    role: string;
    personId?: string | null;
    mustChangePassword?: boolean;
    passwordExpired?: boolean;
  };
  org?: {
    status: string;
    planName: string | null;
    trialEndsOn: string | null;
    modules: string[];
    limits: { maxEmployees: number; maxUsers: number };
  };
  accessToken: string;
  refreshToken: string;
  // Days left when the password is close to expiring
  passwordExpiresInDays?: number | null;
}

export interface SignupRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

export const authAPI = {
  login: (data: LoginRequest) =>
    client.post<LoginResponse>('/auth/login', data),

  signup: (data: SignupRequest) =>
    client.post<LoginResponse>('/auth/signup', data),

  refresh: (data: RefreshTokenRequest) =>
    client.post<RefreshTokenResponse>('/auth/refresh', data),

  logout: () =>
    client.post('/auth/logout'),

  getCurrentUser: () =>
    client.get('/auth/me'),
};
