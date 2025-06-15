import React, { useState } from 'react';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircledIcon,
  CrossCircledIcon,
  InfoCircledIcon,
  GearIcon,
  PersonIcon,
  ExitIcon,
  MobileIcon,
  EnvelopeClosedIcon,
} from '@radix-ui/react-icons';
import { Shield, Key } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';

export const UserProfile: React.FC = () => {
  const { user: authUser } = useAuth();
  const { signOut, updateUser, resetPassword } = useSupabase();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [fullName, setFullName] = useState(authUser?.full_name || '');

  if (!authUser) return null;

  const handleUpdateProfile = async () => {
    setLoading(true);
    setMessage('');
    try {
      const { error } = await updateUser({
        data: { full_name: fullName }
      });
      if (error) throw error;
      setMessage('Profile updated successfully!');
      setEditMode(false);
    } catch (error: any) {
      setMessage(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setLoading(true);
    setMessage('');
    try {
      const { error } = await resetPassword(authUser.email);
      if (error) throw error;
      setMessage('Password reset email sent! Check your inbox.');
    } catch (error: any) {
      setMessage(error.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: PersonIcon },
    { id: 'security', label: 'Security', icon: ShieldIcon },
    { id: 'settings', label: 'Settings', icon: GearIcon },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div}}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6">
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {authUser.full_name?.charAt(0) || authUser.email.charAt(0).toUpperCase()}
              </div>
              <div className="text-white">
                <h1 className="text-2xl font-bold">{authUser.full_name || 'User Profile'}</h1>
                <p className="text-blue-100">{authUser.email}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex space-x-1 p-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors',
                      activeTab === tab.id
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {message && (
              <div className={cn(
                'p-3 rounded-lg mb-4',
                message.includes('success') || message.includes('sent')
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
              )}>
                {message}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Profile Information</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Email
                      </label>
                      <div className="flex items-center space-x-2">
                        <EnvelopeClosedIcon className="w-5 h-5 text-gray-400" />
                        <span className="text-gray-900 dark:text-gray-100">{authUser.email}</span>
                        <CheckCircledIcon className="w-4 h-4 text-green-500" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Full Name
                      </label>
                      {editMode ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
                          />
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={handleUpdateProfile}
                              disabled={loading}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditMode(false);
                                setFullName(authUser.full_name || '');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-900 dark:text-gray-100">
                            {authUser.full_name || 'Not set'}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditMode(true)}
                          >
                            Edit
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        User ID
                      </label>
                      <code className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        {authUser.id}
                      </code>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Security Settings</h2>
                  
                  <div className="space-y-4">
                    {/* Password */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <KeyIcon className="w-5 h-5 text-gray-400" />
                          <div>
                            <h3 className="font-medium">Password</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Manage your password
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handlePasswordReset}
                          disabled={loading}
                        >
                          Reset Password
                        </Button>
                      </div>
                    </div>

                    {/* 2FA */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <MobileIcon className="w-5 h-5 text-gray-400" />
                          <div>
                            <h3 className="font-medium">Two-Factor Authentication</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Add an extra layer of security
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate('/setup-2fa')}
                        >
                          Set up 2FA
                        </Button>
                      </div>
                    </div>

                    {/* Active Sessions */}
                    <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                      <h3 className="font-medium mb-2">Active Sessions</h3>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div>
                            <p className="font-medium">Current session</p>
                            <p className="text-gray-500 dark:text-gray-400">
                              Active now
                            </p>
                          </div>
                          <CheckCircledIcon className="w-4 h-4 text-green-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-4">Account Settings</h2>
                  
                  <div className="space-y-4">
                    {/* Account Status */}
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div className="flex items-start space-x-3">
                        <InfoCircledIcon className="w-5 h-5 text-blue-500 mt-0.5" />
                        <div>
                          <h3 className="font-medium">Account Status</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Your account is active and in good standing.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Sign Out */}
                    <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                      <Button
                        variant="outline"
                        className="w-full justify-center"
                        onClick={handleSignOut}
                      >
                        <ExitIcon className="w-4 h-4 mr-2" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};