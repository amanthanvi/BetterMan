# Vercel Deployment Guide for BetterMan

## Configuration

The project uses a monorepo structure with the frontend in the `frontend` directory. The `vercel.json` file at the root configures:

1. **Build settings** - Points to the frontend directory
2. **SPA routing** - Rewrites all routes to index.html for client-side routing
3. **Output directory** - Specifies frontend/dist as the build output

## Environment Variables

Add these in your Vercel project settings:

```env
VITE_API_URL=https://api.betterman.sh
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_NODE_ENV=production
```

## Deployment Steps

1. **Connect GitHub Repository**
   - Already done ✓

2. **Configure Project Settings**
   - Framework Preset: Other
   - Root Directory: Leave empty (uses vercel.json)
   - Build Command: (handled by vercel.json)
   - Output Directory: (handled by vercel.json)

3. **Add Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add the variables listed above

4. **Configure Domains**
   - betterman.sh ✓
   - www.betterman.sh ✓

5. **Deploy**
   - Push to main branch or trigger manual deployment

## Troubleshooting

If deployment fails:
1. Check build logs for specific errors
2. Ensure all environment variables are set
3. Verify the frontend builds locally with `npm run build`

## Backend Deployment

The backend API needs to be deployed separately (e.g., on Railway, Render, or DigitalOcean) and accessible at `https://api.betterman.sh`.