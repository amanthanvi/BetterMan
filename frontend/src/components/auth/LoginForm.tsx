/**
 * Login form component with email/password and OAuth options.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { toast } from '../ui/Toast';
import { Github, Mail, GitBranch, Eye, EyeOff } from 'lucide-react';

interface LoginFormProps {
  redirectTo?: string;
}

export const LoginForm: React.FC<LoginFormProps> = ({ redirectTo = '/' }) => {
  const navigate = useNavigate();
  const { login } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.username) {
      newErrors.username = 'Username or email is required';
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      await login(formData.username, formData.password);
      toast.success('Welcome back!');
      navigate(redirectTo);
    } catch (error: any) {
      if (error.response?.status === 423) {
        toast.error('Account locked. Please try again later.');
      } else if (error.response?.status === 401) {
        toast.error('Invalid username or password');
      } else {
        toast.error('Login failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthLogin = (provider: string) => {
    // Redirect to OAuth authorization
    window.location.href = `/api/auth/oauth/authorize/${provider}?redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}`;
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-center mb-6">Welcome Back</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-2">
              Username or Email
            </label>
            <Input
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              placeholder="Enter your username or email"
              error={errors.username}
              disabled={isLoading}
              autoComplete="username"
              required
            />
          </div>
          
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
                error={errors.password}
                disabled={isLoading}
                autoComplete="current-password"
                required
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                name="remember"
              />
              <span className="ml-2 text-sm text-gray-600">Remember me</span>
            </label>
            
            <Link
              to="/auth/forgot-password"
              className="text-sm text-primary-600 hover:text-primary-500"
            >
              Forgot password?
            </Link>
          </div>
          
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={isLoading}
            disabled={isLoading}
          >
            Sign In
          </Button>
        </form>
        
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>
          
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthLogin('github')}
              disabled={isLoading}
              className="flex items-center justify-center"
            >
              <Github size={20} />
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthLogin('google')}
              disabled={isLoading}
              className="flex items-center justify-center"
            >
              <Mail size={20} />
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthLogin('gitlab')}
              disabled={isLoading}
              className="flex items-center justify-center"
            >
              <GitBranch size={20} />
            </Button>
          </div>
        </div>
        
        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link
            to="/auth/signup"
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            Sign up
          </Link>
        </p>
      </div>
    </Card>
  );
};