/**
 * OAuth callback page to handle provider redirects.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { toast } from '../components/ui/Toast';

export const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const provider = window.location.pathname.split('/').pop();

    if (error) {
      setError(`OAuth error: ${error}`);
      toast.error(`Authentication failed: ${error}`);
      setTimeout(() => navigate('/auth/login'), 3000);
      return;
    }

    if (!code || !state) {
      setError('Invalid OAuth callback parameters');
      toast.error('Authentication failed: Invalid parameters');
      setTimeout(() => navigate('/auth/login'), 3000);
      return;
    }

    try {
      // Exchange code for tokens
      const response = await api.post(`/auth/oauth/callback/${provider}`, {
        code,
        state
      });

      if (response.data.access_token) {
        // Login successful
        localStorage.setItem('access_token', response.data.access_token);
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.access_token}`;
        
        // Refresh auth state
        await checkAuth();
        
        toast.success('Login successful!');
        navigate('/');
      } else if (response.data.message) {
        // Account linking successful
        toast.success(response.data.message);
        navigate('/profile');
      }
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Authentication failed');
      toast.error('Authentication failed');
      setTimeout(() => navigate('/auth/login'), 3000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        {error ? (
          <>
            <div className="text-red-600 text-xl font-semibold mb-2">Authentication Failed</div>
            <p className="text-gray-600">{error}</p>
            <p className="text-sm text-gray-500 mt-4">Redirecting to login...</p>
          </>
        ) : (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Completing authentication...</p>
          </>
        )}
      </div>
    </div>
  );
};