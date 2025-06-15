import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
  require2FA?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  redirectTo = '/sign-in',
  require2FA = false,
}) => {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    // Save the attempted location
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // 2FA check can be implemented based on your Clerk configuration
  // if (require2FA && isAuthenticated && !user?.twoFactorEnabled) {
  //   return <Navigate to="/setup-2fa" state={{ from: location } replace} />;
  // }

  return <>{children}</>;
};