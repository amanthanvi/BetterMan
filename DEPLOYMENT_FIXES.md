# Railway Deployment Fixes

## Changes Made

### Backend Fixes
1. Created `start.py` - Python script to handle PORT environment variable properly
2. Updated Dockerfile to use Python startup script instead of shell script
3. This resolves the "Invalid value for '--port'" error

### Frontend Fixes  
1. Switched to simpler Dockerfile without standalone build
2. Removed `output: 'standalone'` from next.config.mjs
3. Using `npm start` directly instead of standalone server.js

## Manual Steps Required in Railway

### 1. Restart PostgreSQL
Your PostgreSQL service shows as crashed. In Railway dashboard:
- Click on the Postgres service
- Click "Redeploy" or "Restart"

### 2. Verify Environment Variables

**Frontend** should have:
```
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}
```

**Backend** should have:
```
ENVIRONMENT=production
PORT=8000
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
SECRET_KEY=8166618069b015e25cb3a876ac866eb8647750d5ad785047e98097a96e8b5459
CORS_ORIGINS=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}
```

### 3. Ensure Public Domains
Both frontend and backend services need public domains:
- Go to each service → Settings → Networking
- Generate a domain if not already present

## Testing After Deployment

1. Backend health check: `https://[backend-domain]/health`
2. Backend API docs: `https://[backend-domain]/docs`
3. Frontend: `https://[frontend-domain]/`

## If Still Failing

Check the following in Railway dashboard:

1. **Build Logs**: Look for any build errors
2. **Deploy Logs**: Check runtime errors
3. **Root Directory**: Ensure each service has correct root:
   - Frontend: `/frontend`
   - Backend: `/backend`
4. **Build/Start Commands**: Leave empty (let Dockerfile handle it)

## File Structure
```
/
├── frontend/
│   ├── Dockerfile (simple version)
│   ├── package.json
│   └── ... Next.js app
├── backend/
│   ├── Dockerfile
│   ├── start.py (new)
│   ├── requirements.txt
│   └── src/
│       └── main.py
└── railway.toml (minimal config)
```