import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '@/providers/SupabaseProvider';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { supabase } = useSupabase();

  useEffect(() => {
    // Handle the OAuth callback
    const handleCallback = async () => {
      try {
        // Get the code from the URL
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          // Exchange the code for a session
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('Error during auth callback:', error);
            navigate('/sign-in');
          } else {
            // Successfully authenticated, redirect to home or dashboard
            navigate('/');
          }
        } else {
          // No code found, redirect to sign-in
          navigate('/sign-in');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        navigate('/sign-in');
      }
    };

    handleCallback();
  }, [navigate, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-gray-600 dark:text-gray-400">
          Completing sign in...
        </p>
      </div>
    </div>
  );
};