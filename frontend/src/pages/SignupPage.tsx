/**
 * Signup page component.
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import { SignupForm } from '../components/auth/SignupForm';

export const SignupPage: React.FC = () => {
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">BetterMan</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create your account to start learning Linux commands
          </p>
        </div>
        
        <SignupForm redirectTo={from} />
      </div>
    </div>
  );
};