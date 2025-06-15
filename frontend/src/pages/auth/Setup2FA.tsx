import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSupabase } from '@/providers/SupabaseProvider';
import QRCode from 'qrcode';
import {
  CheckCircledIcon,
  CopyIcon,
  InfoCircledIcon,
  ArrowRightIcon,
  MobileIcon,
} from '@radix-ui/react-icons';
import { Shield } from 'lucide-react';
import { cn } from '@/utils/cn';

export const Setup2FA: React.FC = () => {
  const { user } = useSupabase();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<'intro' | 'qr' | 'verify' | 'complete'>('intro');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate QR code for TOTP
  useEffect(() => {
    if (step === 'qr' && user) {
      // In a real implementation, you would get this from Clerk's API
      const secret = generateTOTPSecret();
      setSecretKey(secret);
      
      const otpauth = `otpauth://totp/BetterMan:${user.email}?secret=${secret}&issuer=BetterMan`;
      
      QRCode.toDataURL(otpauth, {
        width: 256,
        margin: 2,
        color: {
          dark: '#1f2937',
          light: '#ffffff',
        },
      }).then(setQrCodeUrl);
    }
  }, [step, user]);

  const generateTOTPSecret = () => {
    // This is a placeholder - in production, use Clerk's API
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)];
    }
    return secret;
  };

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerification = async () => {
    setIsVerifying(true);
    setError('');

    try {
      // In a real implementation, verify with Clerk's API
      // For demo purposes, we'll simulate verification
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      if (verificationCode.length === 6 && /^\d+$/.test(verificationCode)) {
        // Success - enable 2FA
        // In a real implementation, you would update the user's 2FA status in Supabase
        // For now, we'll just simulate success
        
        setStep('complete');
      } else {
        setError('Invalid verification code. Please try again.');
      }
    } catch (err) {
      setError('Failed to verify code. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleComplete = () => {
    const from = location.state?.from?.pathname || '/dashboard';
    navigate(from);
  };

  const AuthenticatorApps = () => (
    <div className="grid grid-cols-2 gap-3 mt-4">
      {[
        { name: 'Google Authenticator', icon: '🔐' },
        { name: 'Authy', icon: '🛡️' },
        { name: '1Password', icon: '🔑' },
        { name: 'Microsoft Authenticator', icon: '🏢' },
      ].map((app) => (
        <div
          key={app.name}
          className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center space-x-2">
            <span className="text-2xl">{app.icon}</span>
            <span className="text-sm font-medium">{app.name}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div}}
        className="w-full max-w-2xl"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Set Up Two-Factor Authentication
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Secure your account with an authenticator app
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 'intro' && (
              <div}}
                className="space-y-6"
              >
                <div className="text-center py-8">
                  <MobileIcon className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">
                    Enhance Your Account Security
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                    Two-factor authentication adds an extra layer of security by requiring
                    a code from your authenticator app when signing in.
                  </p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    You'll need an authenticator app
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                    Install one of these apps on your phone:
                  </p>
                  <AuthenticatorApps />
                </div>

                <button
                  onClick={() => setStep('qr')}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <span>Continue</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
              </div>
            )}

            {step === 'qr' && (
              <div}}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">
                    Scan QR Code
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Open your authenticator app and scan this QR code
                  </p>
                </div>

                {qrCodeUrl && (
                  <div className="flex justify-center">
                    <div className="p-4 bg-white rounded-xl shadow-lg">
                      <img src={qrCodeUrl} alt="2FA QR Code" className="w-64 h-64" />
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Can't scan? Enter this code manually:
                  </p>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 font-mono text-sm">
                      {secretKey}
                    </code>
                    <button
                      onClick={handleCopySecret}
                      className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    >
                      {copied ? <CheckCircledIcon className="w-5 h-5 text-green-500" /> : <CopyIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-start space-x-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <InfoCircledIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Save this secret key in a secure location. You'll need it to recover access if you lose your device.
                  </p>
                </div>

                <button
                  onClick={() => setStep('verify')}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  I've Added the Account
                </button>
              </div>
            )}

            {step === 'verify' && (
              <div}}
                className="space-y-6"
              >
                <div className="text-center">
                  <h2 className="text-xl font-semibold mb-2">
                    Verify Your Setup
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Enter the 6-digit code from your authenticator app
                  </p>
                </div>

                <div className="max-w-xs mx-auto">
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setVerificationCode(value);
                      setError('');
                    }}
                    placeholder="000000"
                    className={cn(
                      'w-full px-4 py-3 text-center text-2xl font-mono tracking-widest',
                      'border-2 rounded-lg transition-colors',
                      'focus:outline-none focus:ring-4',
                      error
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500/20'
                    )}
                    maxLength={6}
                  />
                  {error && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400 text-center">
                      {error}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleVerification}
                  disabled={verificationCode.length !== 6 || isVerifying}
                  className={cn(
                    'w-full py-3 rounded-lg transition-colors flex items-center justify-center',
                    verificationCode.length === 6 && !isVerifying
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  )}
                >
                  {isVerifying ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Verifying...
                    </>
                  ) : (
                    'Verify and Enable 2FA'
                  )}
                </button>
              </div>
            )}

            {step === 'complete' && (
              <div}}
                className="text-center py-8"
              >
                <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircledIcon className="w-10 h-10 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">
                  2FA Enabled Successfully!
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  Your account is now protected with two-factor authentication
                </p>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-6 text-left max-w-md mx-auto">
                  <h3 className="font-medium mb-2">Next time you sign in:</h3>
                  <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>1. Enter your email and password</li>
                    <li>2. Open your authenticator app</li>
                    <li>3. Enter the 6-digit code shown</li>
                  </ol>
                </div>

                <button
                  onClick={handleComplete}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Continue to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};