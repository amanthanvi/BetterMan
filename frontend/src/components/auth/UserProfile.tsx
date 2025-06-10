/**
 * User profile component with settings and preferences.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { toast } from '../ui/Toast';
import { 
  User, Settings, Shield, Key, Palette, Bell, 
  Globe, Keyboard, Award, BookOpen, Code,
  Camera, Save, LogOut, Trash2, Link2
} from 'lucide-react';
import { api } from '../../services/api';

interface UserPreferences {
  theme: string;
  language: string;
  timezone: string;
  keyboard_shortcuts: Record<string, string>;
  font_size: string;
  line_height: string;
  code_theme: string;
  enable_animations: boolean;
  enable_sounds: boolean;
  enable_notifications: boolean;
  show_profile_publicly: boolean;
  share_statistics: boolean;
}

interface LearningProgress {
  documents_viewed: number;
  commands_learned: number;
  current_streak: number;
  longest_streak: number;
  achievement_points: number;
  achievements: any[];
}

interface LinkedAccount {
  provider: string;
  linked_at: string;
}

export const UserProfile: React.FC = () => {
  const { user, updateProfile, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Profile data
  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    bio: user?.bio || '',
    avatar_url: user?.avatar_url || ''
  });
  
  // Preferences
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  
  // Security
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  
  // Learning
  const [learningProgress, setLearningProgress] = useState<LearningProgress | null>(null);
  
  // Password change
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      // Load preferences
      const prefsResponse = await api.get('/personalization/preferences');
      setPreferences(prefsResponse.data);
      
      // Load 2FA status
      const tfaResponse = await api.get('/auth/2fa/status');
      setTwoFactorEnabled(tfaResponse.data.enabled);
      
      // Load linked accounts
      const accountsResponse = await api.get('/auth/oauth/linked-accounts');
      setLinkedAccounts(accountsResponse.data);
      
      // Load learning progress
      const progressResponse = await api.get('/personalization/learning-progress');
      setLearningProgress(progressResponse.data);
      
    } catch (error) {
      toast.error('Failed to load user data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      await updateProfile(profileData);
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreferencesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const response = await api.patch('/personalization/preferences', preferences);
      setPreferences(response.data);
      toast.success('Preferences saved successfully');
      
      // Apply theme immediately
      if (preferences?.theme) {
        document.documentElement.setAttribute('data-theme', preferences.theme);
      }
    } catch (error) {
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('Passwords do not match');
      return;
    }
    
    setIsSaving(true);
    try {
      await api.post('/auth/change-password', {
        current_password: passwordData.current_password,
        new_password: passwordData.new_password
      });
      
      toast.success('Password changed successfully');
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: ''
      });
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to change password');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnable2FA = () => {
    window.location.href = '/settings/security/2fa/setup';
  };

  const handleLinkAccount = (provider: string) => {
    window.location.href = `/api/auth/oauth/authorize/${provider}?link_account=true`;
  };

  const handleUnlinkAccount = async (provider: string) => {
    if (!confirm(`Are you sure you want to unlink your ${provider} account?`)) {
      return;
    }
    
    try {
      await api.delete(`/auth/oauth/unlink/${provider}`);
      setLinkedAccounts(prev => prev.filter(acc => acc.provider !== provider));
      toast.success(`${provider} account unlinked`);
    } catch (error) {
      toast.error('Failed to unlink account');
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }
    
    // Implement account deletion
    toast.info('Account deletion not yet implemented');
  };

  const renderProfileTab = () => (
    <form onSubmit={handleProfileSubmit} className="space-y-6">
      <div className="flex items-center space-x-6">
        <div className="relative">
          <img
            src={profileData.avatar_url || `https://ui-avatars.com/api/?name=${user?.username}&size=128`}
            alt="Avatar"
            className="w-24 h-24 rounded-full"
          />
          <button
            type="button"
            className="absolute bottom-0 right-0 p-1 bg-primary-600 text-white rounded-full hover:bg-primary-700"
          >
            <Camera size={16} />
          </button>
        </div>
        
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{user?.username}</h3>
          <p className="text-gray-600">{user?.email}</p>
          <div className="flex items-center gap-2 mt-2">
            {user?.is_verified && (
              <Badge variant="success">Verified</Badge>
            )}
            {user?.is_superuser && (
              <Badge variant="primary">Admin</Badge>
            )}
            <Badge variant="default">
              Member since {new Date(user?.created_at || '').toLocaleDateString()}
            </Badge>
          </div>
        </div>
      </div>
      
      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Full Name</label>
          <Input
            value={profileData.full_name}
            onChange={(e) => setProfileData(prev => ({ ...prev, full_name: e.target.value }))}
            placeholder="Your full name"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">Bio</label>
          <textarea
            value={profileData.bio}
            onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
            placeholder="Tell us about yourself"
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
            rows={4}
          />
        </div>
      </div>
      
      <Button type="submit" loading={isSaving}>
        <Save size={16} className="mr-2" />
        Save Profile
      </Button>
    </form>
  );

  const renderPreferencesTab = () => (
    <form onSubmit={handlePreferencesSubmit} className="space-y-6">
      <div className="grid gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            <Palette size={16} className="inline mr-2" />
            Theme
          </label>
          <select
            value={preferences?.theme || 'system'}
            onChange={(e) => setPreferences(prev => prev ? { ...prev, theme: e.target.value } : null)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">
            <Globe size={16} className="inline mr-2" />
            Language
          </label>
          <select
            value={preferences?.language || 'en'}
            onChange={(e) => setPreferences(prev => prev ? { ...prev, language: e.target.value } : null)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-2">
            <Code size={16} className="inline mr-2" />
            Code Theme
          </label>
          <select
            value={preferences?.code_theme || 'monokai'}
            onChange={(e) => setPreferences(prev => prev ? { ...prev, code_theme: e.target.value } : null)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary-500"
          >
            <option value="monokai">Monokai</option>
            <option value="github">GitHub</option>
            <option value="dracula">Dracula</option>
            <option value="solarized">Solarized</option>
            <option value="nord">Nord</option>
          </select>
        </div>
        
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={preferences?.enable_animations || false}
              onChange={(e) => setPreferences(prev => prev ? { ...prev, enable_animations: e.target.checked } : null)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2"
            />
            Enable animations
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={preferences?.enable_notifications || false}
              onChange={(e) => setPreferences(prev => prev ? { ...prev, enable_notifications: e.target.checked } : null)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2"
            />
            <Bell size={16} className="mr-2" />
            Enable notifications
          </label>
          
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={preferences?.show_profile_publicly || false}
              onChange={(e) => setPreferences(prev => prev ? { ...prev, show_profile_publicly: e.target.checked } : null)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-2"
            />
            Show profile publicly
          </label>
        </div>
      </div>
      
      <Button type="submit" loading={isSaving}>
        <Save size={16} className="mr-2" />
        Save Preferences
      </Button>
    </form>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <Card>
        <div className="p-4">
          <h3 className="font-semibold mb-2 flex items-center">
            <Shield size={18} className="mr-2" />
            Two-Factor Authentication
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Add an extra layer of security to your account
          </p>
          {twoFactorEnabled ? (
            <div className="flex items-center justify-between">
              <Badge variant="success">Enabled</Badge>
              <Button variant="outline" size="sm">
                Manage 2FA
              </Button>
            </div>
          ) : (
            <Button onClick={handleEnable2FA} variant="primary">
              Enable 2FA
            </Button>
          )}
        </div>
      </Card>
      
      <Card>
        <div className="p-4">
          <h3 className="font-semibold mb-2 flex items-center">
            <Key size={18} className="mr-2" />
            Change Password
          </h3>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Input
              type="password"
              placeholder="Current password"
              value={passwordData.current_password}
              onChange={(e) => setPasswordData(prev => ({ ...prev, current_password: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder="New password"
              value={passwordData.new_password}
              onChange={(e) => setPasswordData(prev => ({ ...prev, new_password: e.target.value }))}
              required
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={passwordData.confirm_password}
              onChange={(e) => setPasswordData(prev => ({ ...prev, confirm_password: e.target.value }))}
              required
            />
            <Button type="submit" loading={isSaving}>
              Change Password
            </Button>
          </form>
        </div>
      </Card>
      
      <Card>
        <div className="p-4">
          <h3 className="font-semibold mb-4 flex items-center">
            <Link2 size={18} className="mr-2" />
            Linked Accounts
          </h3>
          <div className="space-y-2">
            {['github', 'google', 'gitlab'].map(provider => {
              const linked = linkedAccounts.find(acc => acc.provider === provider);
              return (
                <div key={provider} className="flex items-center justify-between p-2 border rounded">
                  <span className="capitalize">{provider}</span>
                  {linked ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Connected</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnlinkAccount(provider)}
                      >
                        Unlink
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleLinkAccount(provider)}
                    >
                      Connect
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      
      <Card className="border-red-200">
        <div className="p-4">
          <h3 className="font-semibold mb-2 text-red-600 flex items-center">
            <Trash2 size={18} className="mr-2" />
            Danger Zone
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Once you delete your account, there is no going back.
          </p>
          <Button variant="danger" onClick={handleDeleteAccount}>
            Delete Account
          </Button>
        </div>
      </Card>
    </div>
  );

  const renderLearningTab = () => (
    <div className="space-y-6">
      {learningProgress && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <div className="p-4 text-center">
                <BookOpen className="w-8 h-8 mx-auto mb-2 text-primary-600" />
                <div className="text-2xl font-bold">{learningProgress.documents_viewed}</div>
                <div className="text-sm text-gray-600">Documents Read</div>
              </div>
            </Card>
            
            <Card>
              <div className="p-4 text-center">
                <Code className="w-8 h-8 mx-auto mb-2 text-primary-600" />
                <div className="text-2xl font-bold">{learningProgress.commands_learned}</div>
                <div className="text-sm text-gray-600">Commands Learned</div>
              </div>
            </Card>
            
            <Card>
              <div className="p-4 text-center">
                <Award className="w-8 h-8 mx-auto mb-2 text-primary-600" />
                <div className="text-2xl font-bold">{learningProgress.current_streak}</div>
                <div className="text-sm text-gray-600">Day Streak</div>
              </div>
            </Card>
            
            <Card>
              <div className="p-4 text-center">
                <Shield className="w-8 h-8 mx-auto mb-2 text-primary-600" />
                <div className="text-2xl font-bold">{learningProgress.achievement_points}</div>
                <div className="text-sm text-gray-600">Points</div>
              </div>
            </Card>
          </div>
          
          <Card>
            <div className="p-4">
              <h3 className="font-semibold mb-4">Recent Achievements</h3>
              {learningProgress.achievements.length > 0 ? (
                <div className="space-y-2">
                  {learningProgress.achievements.slice(0, 5).map(achievement => (
                    <div key={achievement.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="font-medium">{achievement.name}</div>
                        <div className="text-sm text-gray-600">{achievement.description}</div>
                      </div>
                      <Badge variant="primary">+{achievement.points} pts</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500">Start learning to earn achievements!</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'preferences', label: 'Preferences', icon: Settings },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'learning', label: 'Learning', icon: Award }
  ];

  if (isLoading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <Button variant="outline" onClick={logout}>
          <LogOut size={16} className="mr-2" />
          Sign Out
        </Button>
      </div>
      
      <div className="flex gap-2 mb-6 border-b">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={18} className="mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>
      
      <div className="bg-white rounded-lg shadow-sm p-6">
        {activeTab === 'profile' && renderProfileTab()}
        {activeTab === 'preferences' && renderPreferencesTab()}
        {activeTab === 'security' && renderSecurityTab()}
        {activeTab === 'learning' && renderLearningTab()}
      </div>
    </div>
  );
};