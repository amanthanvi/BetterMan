import React from 'react';
import { InfoCircledIcon } from '@radix-ui/react-icons';
import { Link } from 'react-router-dom';

export const AuthSetupNotice: React.FC = () => {
  // Only show if Supabase is not configured
  const isConfigured = import.meta.env.VITE_SUPABASE_URL && 
                      !import.meta.env.VITE_SUPABASE_URL.includes('your-project') &&
                      import.meta.env.VITE_SUPABASE_ANON_KEY &&
                      !import.meta.env.VITE_SUPABASE_ANON_KEY.includes('your_supabase');

  if (isConfigured) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
      <div className="flex items-start space-x-3">
        <InfoCircledIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-medium text-amber-900 dark:text-amber-100 mb-1">
            Complete Authentication Setup
          </h3>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
            To enable SSO providers (Google, GitHub, GitLab, Apple), configure them in your Supabase dashboard.
          </p>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Quick Setup:</span>
              <code className="ml-2 px-2 py-1 bg-amber-100 dark:bg-amber-900/50 rounded">
                ./scripts/setup-auth.sh
              </code>
            </div>
            <div>
              <span className="font-medium">Detailed Guide:</span>
              <Link 
                to="/docs/AUTHENTICATION_SETUP.md" 
                className="ml-2 text-amber-700 dark:text-amber-400 hover:underline"
              >
                Authentication Setup Documentation
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};