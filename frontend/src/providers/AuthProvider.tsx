import React, { createContext, useContext, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  is_premium?: boolean;
  created_at?: string;
}

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
  // For now, just provide a mock auth context
  const user: User | null = null;
  const loading = false;

  const login = async (username: string, password: string) => {
    // Mock implementation
    console.log('Login called with:', username);
  };

  const signup = async (username: string, email: string, password: string, full_name?: string) => {
    // Mock implementation
    console.log('Signup called with:', username, email);
  };

  const logout = async () => {
    // Mock implementation
    console.log('Logout called');
  };

  const updateProfile = async (data: Partial<User>) => {
    // Mock implementation
    console.log('Update profile called with:', data);
  };

  const refreshToken = async () => {
    // Supabase handles token refresh automatically
  };

  const checkAuth = async () => {
    // Supabase checks auth automatically
  };

  const value: AuthContextType = {
    user,
    isLoading: loading,
    isAuthenticated: false,
    login,
    signup,
    logout,
    updateProfile,
    refreshToken,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};