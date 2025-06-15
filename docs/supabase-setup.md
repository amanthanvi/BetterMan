# Supabase Configuration for BetterMan

## Redirect URLs Configuration

To properly configure authentication redirects for your domain, update the following in your Supabase project:

### 1. Go to Supabase Dashboard
- Visit https://app.supabase.com
- Select your project
- Navigate to Authentication → URL Configuration

### 2. Update Redirect URLs
Add the following URLs to the "Redirect URLs" section:

**Development:**
- `http://localhost:5173/*`
- `http://localhost:5174/*`

**Production:**
- `https://betterman.sh/*`
- `https://www.betterman.sh/*`
- `https://api.betterman.sh/*`

### 3. Update Site URL
Set the Site URL to:
- Development: `http://localhost:5173`
- Production: `https://betterman.sh`

### 4. Email Templates
Update email templates to use your production domain:
- Go to Authentication → Email Templates
- Update the confirmation URL in templates to use `https://betterman.sh`

### 5. OAuth Providers (if using)
For each OAuth provider:
- Update the redirect URL to `https://betterman.sh/auth/callback`
- Add `https://www.betterman.sh/auth/callback` as an additional redirect

## Environment Variables

### Frontend (.env.production)
```env
VITE_API_URL=https://api.betterman.sh
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_NODE_ENV=production
```

### Backend (.env.production)
```env
API_URL=https://api.betterman.sh
FRONTEND_URL=https://betterman.sh
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

## DNS Configuration

For your domain `betterman.sh`, configure:

1. **Main domain (betterman.sh)**
   - A record pointing to your frontend server IP
   - Or CNAME to your hosting provider

2. **API subdomain (api.betterman.sh)**
   - A record pointing to your backend server IP
   - Or CNAME to your backend hosting provider

3. **WWW subdomain (www.betterman.sh)**
   - CNAME pointing to `betterman.sh`

## SSL Certificates

Ensure SSL certificates are configured for:
- `betterman.sh`
- `www.betterman.sh`
- `api.betterman.sh`

Most hosting providers offer free SSL through Let's Encrypt.