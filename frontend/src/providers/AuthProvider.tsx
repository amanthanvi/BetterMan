import React, { createContext, useContext, ReactNode } from 'react';
import { useSupabase } from './SupabaseProvider';

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
  const { user: supabaseUser, loading, signIn, signUp, signOut, updateUser } = useSupabase();

  // Transform Supabase user to our User interface
  const user: User | null = supabaseUser ? {
    id: supabaseUser.id,
    username: supabaseUser.user_metadata?.username || supabaseUser.email?.split('@')[0] || 'user',
    email: supabaseUser.email || '',
    full_name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name,
    avatar_url: supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture,
    is_premium: false,
    created_at: supabaseUser.created_at,
  } : null;

  const login = async (username: string, password: string) => {
    // For now, we'll use email as username
    const email = username.includes('@') ? username : `${username}@example.com`;
    const { error } = await signIn(email, password);
    if (error) throw error;
  };

  const signup = async (username: string, email: string, password: string, full_name?: string) => {
    const { error } = await signUp(email, password, {
      username,
      full_name,
    });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await signOut();
    if (error) throw error;
  };

  const updateProfile = async (data: Partial<User>) => {
    const updates: any = {};
    if (data.full_name) updates.full_name = data.full_name;
    if (data.username) updates.username = data.username;
    if (data.avatar_url) updates.avatar_url = data.avatar_url;
    
    const { error } = await updateUser({ data: updates });
    if (error) throw error;
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
    isAuthenticated: !!supabaseUser,
    login,
    signup,
    logout,
    updateProfile,
    refreshToken,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};