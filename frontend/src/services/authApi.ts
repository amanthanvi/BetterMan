import apiClient from './api';

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  full_name?: string;
  bio?: string;
  avatar_url?: string;
  is_verified: boolean;
  is_superuser: boolean;
  created_at: string;
}

export const authAPI = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    return apiClient.post<LoginResponse>('/auth/login', { username, password });
  },

  register: async (data: {
    username: string;
    email: string;
    password: string;
    full_name?: string;
  }): Promise<User> => {
    return apiClient.post<User>('/auth/register', data);
  },

  logout: async (): Promise<void> => {
    return apiClient.post('/auth/logout');
  },

  getMe: async (): Promise<User> => {
    return apiClient.get<User>('/auth/me');
  },

  updateMe: async (data: Partial<User>): Promise<User> => {
    return apiClient.put<User>('/auth/me', data);
  },

  refreshToken: async (refreshToken: string): Promise<LoginResponse> => {
    return apiClient.post<LoginResponse>('/auth/refresh', { refresh_token: refreshToken });
  },

  verifyEmail: async (token: string): Promise<void> => {
    return apiClient.post('/auth/verify-email', { token });
  },

  requestPasswordReset: async (email: string): Promise<void> => {
    return apiClient.post('/auth/forgot-password', { email });
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    return apiClient.post('/auth/reset-password', { token, new_password: newPassword });
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    return apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword
    });
  }
};

// Token management with interceptors
class TokenManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<LoginResponse> | null = null;

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  getAccessToken() {
    return this.accessToken;
  }

  getRefreshToken() {
    return this.refreshToken;
  }

  async attachTokenToRequest(config: any) {
    if (this.accessToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${this.accessToken}`;
    }
    return config;
  }

  async handleTokenRefresh(): Promise<LoginResponse> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    // Prevent multiple refresh calls
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = authAPI.refreshToken(this.refreshToken);
    
    try {
      const response = await this.refreshPromise;
      this.setTokens(response.access_token, response.refresh_token || this.refreshToken);
      return response;
    } finally {
      this.refreshPromise = null;
    }
  }
}

export const tokenManager = new TokenManager();

// Create a wrapper for API calls with auth
export const authenticatedRequest = async <T>(
  method: 'get' | 'post' | 'put' | 'delete',
  endpoint: string,
  data?: any
): Promise<T> => {
  const token = tokenManager.getAccessToken();
  
  const options: RequestInit = {
    method: method.toUpperCase(),
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    ...(data && { body: JSON.stringify(data) })
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

  if (response.status === 401) {
    // Try to refresh token
    try {
      await tokenManager.handleTokenRefresh();
      // Retry the request with new token
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${tokenManager.getAccessToken()}`
      };
      const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, options);
      if (!retryResponse.ok) {
        throw new Error(`HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
      }
      return retryResponse.json();
    } catch (error) {
      // Refresh failed, user needs to login again
      tokenManager.clearTokens();
      throw error;
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};