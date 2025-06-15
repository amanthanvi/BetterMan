import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EyeOpenIcon, EyeClosedIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import { Mail, Lock, User, Github, Chrome, Command } from 'lucide-react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

export const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const { signUp, signInWithOAuth } = useSupabase();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordRequirements = [
    { regex: /.{8,}/, text: 'At least 8 characters' },
    { regex: /[A-Z]/, text: 'One uppercase letter' },
    { regex: /[a-z]/, text: 'One lowercase letter' },
    { regex: /[0-9]/, text: 'One number' },
    { regex: /[^A-Za-z0-9]/, text: 'One special character' },
  ];

  const passwordStrength = passwordRequirements.filter(req => req.regex.test(password)).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error, data } = await signUp(email, password, {
        full_name: fullName,
      });
      
      if (error) throw error;
      
      if (data?.user?.identities?.length === 0) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignUp = async (provider: 'google' | 'github' | 'gitlab' | 'apple') => {
    setError('');
    try {
      const { error } = await signInWithOAuth(provider);
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to sign up with provider');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div}}
          className="text-center"
        >
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircledIcon className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Check your email!</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
            We've sent a confirmation link to {email}. Please check your email to verify your account.
          </p>
          <Link to="/sign-in">
            <Button variant="primary">
              Go to Sign In
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div}}}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <Command className="w-7 h-7 text-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              BetterMan
            </span>
          </div>
        </Link>

        {/* Sign Up Form */}
        <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-2xl p-8 border border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-center mb-2">Create an account</h2>
          <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
            Join BetterMan to access premium features
          </p>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <button
              onClick={() => handleOAuthSignUp('google')}
              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Chrome className="w-5 h-5" />
              <span>Continue with Google</span>
            </button>
            <button
              onClick={() => handleOAuthSignUp('github')}
              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Github className="w-5 h-5" />
              <span>Continue with GitHub</span>
            </button>
          </div>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">Or sign up with email</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={cn(
                    "w-full pl-10 pr-3 py-2 border rounded-lg",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500",
                    "dark:bg-gray-700 dark:border-gray-600"
                  )}
                  placeholder="John Doe"
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(
                    "w-full pl-10 pr-3 py-2 border rounded-lg",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500",
                    "dark:bg-gray-700 dark:border-gray-600"
                  )}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    "w-full pl-10 pr-10 py-2 border rounded-lg",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500",
                    "dark:bg-gray-700 dark:border-gray-600"
                  )}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeClosedIcon className="w-5 h-5" /> : <EyeOpenIcon className="w-5 h-5" />}
                </button>
              </div>

              {/* Password Strength Indicator */}
              {password && (
                <div className="mt-2">
                  <div className="flex space-x-1 mb-1">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex-1 h-1 rounded-full transition-colors",
                          i < passwordStrength
                            ? passwordStrength <= 2
                              ? "bg-red-500"
                              : passwordStrength <= 3
                              ? "bg-yellow-500"
                              : "bg-green-500"
                            : "bg-gray-300 dark:bg-gray-600"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Medium' : 'Strong'} password
                  </p>
                </div>
              )}
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={loading || passwordStrength < 3}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{' '}
            <Link to="/sign-in" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
              Sign in
            </Link>
          </p>
        </div>

        {/* Terms */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            By signing up, you agree to our{' '}
            <Link to="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};