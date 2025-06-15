import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase environment variables are not set. Authentication features will not work.'
  );
}

interface SupabaseContextType {
  supabase: SupabaseClient;
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string, metadata?: any) => Promise<any>;
  signInWithOAuth: (provider: 'google' | 'github' | 'gitlab' | 'apple') => Promise<any>;
  signOut: () => Promise<any>;
  resetPassword: (email: string) => Promise<any>;
  updateUser: (attributes: any) => Promise<any>;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error('useSupabase must be used within a SupabaseProvider');
  }
  return context;
};

interface SupabaseProviderProps {
  children: React.ReactNode;
}

export const SupabaseProvider: React.FC<SupabaseProviderProps> = ({ children }) => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => {
    return createClient(supabaseUrl || '', supabaseAnonKey || '');
  }, []);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event);
      setSession(session);
      setUser(session?.user ?? null);

      // Sync user data with our custom users table
      if (event === 'SIGNED_IN' && session?.user) {
        await syncUserData(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, navigate]);

  const syncUserData = async (user: User) => {
    try {
      // Check if user exists in our custom users table
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching user:', fetchError);
        return;
      }

      // If user doesn't exist, create them
      if (!existingUser) {
        const { error: insertError } = await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error('Error creating user:', insertError);
        } else {
          // Create default user preferences
          await supabase.from('user_preferences').insert({
            user_id: user.id,
          });
        }
      } else {
        // Update user if needed
        const updates: any = {
          updated_at: new Date().toISOString(),
          last_login_at: new Date().toISOString(),
        };

        if (user.user_metadata?.full_name || user.user_metadata?.name) {
          updates.full_name = user.user_metadata?.full_name || user.user_metadata?.name;
        }

        if (user.user_metadata?.avatar_url || user.user_metadata?.picture) {
          updates.avatar_url = user.user_metadata?.avatar_url || user.user_metadata?.picture;
        }

        await supabase.from('users').update(updates).eq('id', user.id);
      }
    } catch (error) {
      console.error('Error syncing user data:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const result = await supabase.auth.signInWithPassword({ email, password });
    return result;
  };

  const signUp = async (email: string, password: string, metadata?: any) => {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    });
    return result;
  };

  const signInWithOAuth = async (provider: 'google' | 'github' | 'gitlab' | 'apple') => {
    const result = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return result;
  };

  const signOut = async () => {
    const result = await supabase.auth.signOut();
    navigate('/');
    return result;
  };

  const resetPassword = async (email: string) => {
    const result = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return result;
  };

  const updateUser = async (attributes: any) => {
    const result = await supabase.auth.updateUser(attributes);
    if (result.data.user) {
      await syncUserData(result.data.user);
    }
    return result;
  };

  const value = {
    supabase,
    session,
    user,
    loading,
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
    resetPassword,
    updateUser,
  };

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
};