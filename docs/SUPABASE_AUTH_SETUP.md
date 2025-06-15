# Supabase Authentication Setup Guide

This guide will help you complete the authentication setup for BetterMan using Supabase Auth.

## Prerequisites

- Supabase project already created (we have this)
- Access to Supabase dashboard

## Step 1: Run Database Migrations

1. Go to your Supabase dashboard: https://app.supabase.com
2. Navigate to the SQL Editor
3. Run the migrations in order:
   - First run the contents of `/supabase/migrations/001_create_users_table.sql`
   - Then run the contents of `/supabase/migrations/002_update_users_for_supabase_auth.sql`

## Step 2: Configure OAuth Providers

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `https://bhpmsekkidrdwjckifbr.supabase.co/auth/v1/callback`
5. Copy Client ID and Client Secret
6. In Supabase dashboard:
   - Go to Authentication → Providers
   - Enable Google
   - Paste Client ID and Client Secret

### GitHub OAuth Setup

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - Application name: BetterMan
   - Homepage URL: Your app URL
   - Authorization callback URL: `https://bhpmsekkidrdwjckifbr.supabase.co/auth/v1/callback`
4. Copy Client ID and Client Secret
5. In Supabase dashboard:
   - Go to Authentication → Providers
   - Enable GitHub
   - Paste Client ID and Client Secret

### GitLab OAuth Setup

1. Go to GitLab → User Settings → Applications
2. Add new application:
   - Name: BetterMan
   - Redirect URI: `https://bhpmsekkidrdwjckifbr.supabase.co/auth/v1/callback`
   - Scopes: `read_user`, `email`
3. Copy Application ID and Secret
4. In Supabase dashboard:
   - Go to Authentication → Providers
   - Enable GitLab
   - Paste Application ID and Secret

### Apple OAuth Setup (Requires Apple Developer Account)

1. Go to Apple Developer Portal
2. Create an App ID with Sign in with Apple capability
3. Create a Service ID
4. Configure domains and return URLs
5. Generate a private key
6. In Supabase dashboard:
   - Go to Authentication → Providers
   - Enable Apple
   - Configure with your credentials

## Step 3: Configure Authentication Settings

In Supabase dashboard → Authentication → Settings:

1. **Site URL**: Set to your production URL (e.g., `https://betterman.com`)
2. **Redirect URLs**: Add:
   - `http://localhost:5173/auth/callback` (for development)
   - `https://yourdomain.com/auth/callback` (for production)
3. **Email Templates**: Customize confirmation and recovery emails
4. **Email Auth**: 
   - Enable email confirmations
   - Configure SMTP if you want custom email sender

## Step 4: Enable Row Level Security (RLS)

The migrations already set up RLS policies, but ensure RLS is enabled:

1. Go to Database → Tables
2. For each table (users, user_preferences, etc.), ensure RLS is enabled
3. Review the policies to ensure they match your security requirements

## Step 5: Test Authentication

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Test sign up with email/password
3. Test OAuth providers
4. Verify email confirmation flow
5. Test password reset flow

## Step 6: Implement 2FA/MFA (Optional)

Supabase doesn't have built-in TOTP 2FA yet, but you can implement it:

1. Add columns to users table for 2FA:
   ```sql
   ALTER TABLE public.users 
   ADD COLUMN two_factor_enabled BOOLEAN DEFAULT false,
   ADD COLUMN two_factor_secret TEXT;
   ```

2. Implement TOTP logic in your backend using libraries like `speakeasy` or `otpauth`

3. Create endpoints for:
   - Enabling 2FA
   - Verifying TOTP codes
   - Disabling 2FA

## Environment Variables

Your `.env` file should have:
```env
VITE_SUPABASE_URL=https://bhpmsekkidrdwjckifbr.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Security Best Practices

1. **Never expose your service role key** in the frontend
2. **Use RLS policies** to protect data
3. **Enable email confirmations** for new signups
4. **Set up rate limiting** in Supabase dashboard
5. **Monitor authentication logs** regularly
6. **Use secure password policies**

## Troubleshooting

### OAuth redirect issues
- Ensure callback URLs exactly match in provider settings
- Check for trailing slashes
- Verify HTTPS is used in production

### Email not sending
- Check email settings in Supabase dashboard
- Verify SMTP configuration if using custom sender
- Check spam folder

### RLS policy errors
- Use SQL Editor to test policies
- Check auth.uid() is correctly set
- Verify foreign key relationships

## Next Steps

1. Customize email templates with your branding
2. Set up email rate limits
3. Configure session expiry times
4. Implement user roles if needed
5. Set up monitoring and alerts