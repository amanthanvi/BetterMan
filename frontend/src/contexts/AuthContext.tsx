/**
 * Authentication context for managing user state and auth operations.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI, tokenManager, User } from '../services/authApi';
import { analyticsAPI } from '../services/api';
import { useAppStore } from '../stores/appStore';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string, full_name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!user;

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      
      // Try to get user info if we have a token
      const token = localStorage.getItem('access_token');
      if (token) {
        const refreshToken = localStorage.getItem('refresh_token') || '';
        tokenManager.setTokens(token, refreshToken);
        const user = await authAPI.getMe();
        setUser(user);
      }
    } catch (error) {
      // Not authenticated
      tokenManager.clearTokens();
      localStorage.removeItem('access_token');
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      setError(null);
      const response = await authAPI.login(username, password);
      
      const { access_token, refresh_token } = response;
      
      // Store tokens
      tokenManager.setTokens(access_token, refresh_token);
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      
      // Get user info
      const user = await authAPI.getMe();
      setUser(user);
      
      // Track login
      await analyticsAPI.trackSearch('user_login', 1).catch(() => {}); // Don't fail login if analytics fails
      
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Login failed');
      throw error;
    }
  };

  const signup = async (
    username: string, 
    email: string, 
    password: string, 
    full_name?: string
  ) => {
    try {
      setError(null);
      
      // Register user
      await authAPI.register({
        username,
        email,
        password,
        full_name
      });
      
      // Auto-login after registration
      await login(username, password);
      
      // Track signup
      await analyticsAPI.trackSearch('user_signup', 1).catch(() => {});
      
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Signup failed');
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint
      await authAPI.logout();
    } catch (error) {
      // Continue with logout even if API call fails
    } finally {
      // Clear local state
      setUser(null);
      tokenManager.clearTokens();
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      
      // Clear any cached data
      localStorage.removeItem('favorites');
      localStorage.removeItem('preferences');
      sessionStorage.clear();
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    try {
      setError(null);
      const updatedUser = await authAPI.updateMe(data);
      setUser(updatedUser);
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Profile update failed');
      throw error;
    }
  };

  const refreshToken = async () => {
    try {
      const refresh = tokenManager.getRefreshToken();
      if (!refresh) throw new Error('No refresh token');
      
      const response = await authAPI.refreshToken(refresh);
      
      const { access_token, refresh_token: new_refresh } = response;
      tokenManager.setTokens(access_token, new_refresh || refresh);
      localStorage.setItem('access_token', access_token);
      if (new_refresh) {
        localStorage.setItem('refresh_token', new_refresh);
      }
      
    } catch (error) {
      // Refresh failed
      await logout();
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    signup,
    logout,
    updateProfile,
    refreshToken,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};