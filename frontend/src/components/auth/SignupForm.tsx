/**
 * Signup form component with validation and OAuth options.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { toast } from '../ui/Toast';
import { Github, Mail, GitBranch, Eye, EyeOff, Check, X } from 'lucide-react';

interface SignupFormProps {
  redirectTo?: string;
}

interface PasswordStrength {
  score: number;
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

export const SignupForm: React.FC<SignupFormProps> = ({ redirectTo = '/' }) => {
  const navigate = useNavigate();
  const { signup } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    requirements: {
      length: false,
      uppercase: false,
      lowercase: false,
      number: false,
      special: false
    }
  });

  const checkPasswordStrength = (password: string): PasswordStrength => {
    const requirements = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    const score = Object.values(requirements).filter(Boolean).length;
    
    return { score, requirements };
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    
    // Update password strength
    if (name === 'password') {
      setPasswordStrength(checkPasswordStrength(value));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Username validation
    if (!formData.username) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      newErrors.username = 'Username can only contain letters, numbers, underscores and hyphens';
    }
    
    // Email validation
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (passwordStrength.score < 5) {
      newErrors.password = 'Password does not meet all requirements';
    }
    
    // Confirm password
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      await signup(
        formData.username,
        formData.email,
        formData.password,
        formData.fullName || undefined
      );
      toast.success('Account created successfully!');
      navigate(redirectTo);
    } catch (error: any) {
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error('Signup failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuthSignup = (provider: string) => {
    // Redirect to OAuth authorization
    window.location.href = `/api/auth/oauth/authorize/${provider}?redirect_uri=${encodeURIComponent(window.location.origin + '/auth/callback')}`;
  };

  const getPasswordStrengthColor = () => {
    if (passwordStrength.score < 2) return 'bg-red-500';
    if (passwordStrength.score < 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-center mb-6">Create Account</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium mb-2">
              Full Name (Optional)
            </label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              value={formData.fullName}
              onChange={handleChange}
              placeholder="John Doe"
              disabled={isLoading}
              autoComplete="name"
            />
          </div>
          
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-2">
              Username
            </label>
            <Input
              id="username"
              name="username"
              type="text"
              value={formData.username}
              onChange={handleChange}
              placeholder="johndoe"
              error={errors.username}
              disabled={isLoading}
              autoComplete="username"
              required
            />
          </div>
          
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="john@example.com"
              error={errors.email}
              disabled={isLoading}
              autoComplete="email"
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
                placeholder="Create a strong password"
                error={errors.password}
                disabled={isLoading}
                autoComplete="new-password"
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
            
            {formData.password && (
              <div className="mt-2">
                <div className="flex gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded ${
                        i < passwordStrength.score
                          ? getPasswordStrengthColor()
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <ul className="text-xs space-y-1">
                  {Object.entries(passwordStrength.requirements).map(([key, met]) => (
                    <li key={key} className={`flex items-center ${met ? 'text-green-600' : 'text-gray-500'}`}>
                      {met ? <Check size={12} className="mr-1" /> : <X size={12} className="mr-1" />}
                      {key === 'length' && 'At least 8 characters'}
                      {key === 'uppercase' && 'One uppercase letter'}
                      {key === 'lowercase' && 'One lowercase letter'}
                      {key === 'number' && 'One number'}
                      {key === 'special' && 'One special character'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm your password"
              error={errors.confirmPassword}
              disabled={isLoading}
              autoComplete="new-password"
              required
            />
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="terms"
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              required
            />
            <label htmlFor="terms" className="ml-2 text-sm text-gray-600">
              I agree to the{' '}
              <Link to="/terms" className="text-primary-600 hover:text-primary-500">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-primary-600 hover:text-primary-500">
                Privacy Policy
              </Link>
            </label>
          </div>
          
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={isLoading}
            disabled={isLoading}
          >
            Create Account
          </Button>
        </form>
        
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or sign up with</span>
            </div>
          </div>
          
          <div className="mt-6 grid grid-cols-3 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthSignup('github')}
              disabled={isLoading}
              className="flex items-center justify-center"
            >
              <Github size={20} />
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthSignup('google')}
              disabled={isLoading}
              className="flex items-center justify-center"
            >
              <Mail size={20} />
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuthSignup('gitlab')}
              disabled={isLoading}
              className="flex items-center justify-center"
            >
              <GitBranch size={20} />
            </Button>
          </div>
        </div>
        
        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link
            to="/auth/login"
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            Sign in
          </Link>
        </p>
      </div>
    </Card>
  );
};