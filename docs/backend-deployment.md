# Backend Deployment Guide

The BetterMan backend is a Python FastAPI application that serves Linux man pages. It needs to be deployed separately from the frontend.

## Recommended Deployment Options

### Option 1: Railway (Recommended - Easiest)
1. Sign up at [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Select the `/backend` directory as the root
4. Railway will auto-detect and deploy using the `railway.json` config
5. Add environment variables:
   ```
   DATABASE_URL=postgresql://...
   REDIS_URL=redis://...
   CORS_ORIGINS=https://betterman.sh,https://www.betterman.sh
   ```
6. Get your deployed URL (e.g., `betterman-api.up.railway.app`)

### Option 2: Render
1. Sign up at [render.com](https://render.com)
2. Create a new Web Service
3. Connect your GitHub repository
4. Set root directory to `/backend`
5. Use the `render.yaml` config
6. Add the same environment variables

### Option 3: Fly.io
1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. From the backend directory:
   ```bash
   cd backend
   fly launch
   fly deploy
   ```

### Option 4: DigitalOcean App Platform
1. Create an app in DigitalOcean
2. Connect GitHub repository
3. Configure:
   - Source Directory: `/backend`
   - Build Command: `pip install -r requirements.txt`
   - Run Command: `uvicorn src.main:app --host 0.0.0.0 --port 8000`

## After Deployment

1. Update your Vercel environment variable:
   - `VITE_API_URL` = Your deployed backend URL (e.g., `https://betterman-api.up.railway.app`)

2. Test the API:
   ```bash
   curl https://your-backend-url.com/health
   ```

## Important Notes

- The backend requires Linux man pages to be installed
- It uses SQLite for database (included in repo)
- Redis is optional but recommended for caching
- Make sure CORS is configured for your frontend domains