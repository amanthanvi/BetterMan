/**
 * Authentication context for managing user state and auth operations.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!user;

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      
      // For now, just check localStorage for a mock user
      const savedUser = localStorage.getItem('betterman-user');
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    // Mock login - in production, this would call your API
    const mockUser: User = {
      id: '1',
      username,
      email: `${username}@example.com`,
      full_name: username,
      created_at: new Date().toISOString(),
    };
    
    setUser(mockUser);
    localStorage.setItem('betterman-user', JSON.stringify(mockUser));
  };

  const signup = async (
    username: string, 
    email: string, 
    password: string, 
    full_name?: string
  ) => {
    // Mock signup - in production, this would call your API
    const mockUser: User = {
      id: '1',
      username,
      email,
      full_name: full_name || username,
      created_at: new Date().toISOString(),
    };
    
    setUser(mockUser);
    localStorage.setItem('betterman-user', JSON.stringify(mockUser));
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('betterman-user');
    
    // Clear any cached data
    localStorage.removeItem('favorites');
    localStorage.removeItem('preferences');
    sessionStorage.clear();
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!user) return;
    
    const updatedUser = { ...user, ...data };
    setUser(updatedUser);
    localStorage.setItem('betterman-user', JSON.stringify(updatedUser));
  };

  const refreshToken = async () => {
    // No-op for mock auth
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