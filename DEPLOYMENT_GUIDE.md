# BetterMan Deployment Guide

## Overview

BetterMan consists of a React frontend and a FastAPI backend. This guide covers deployment options and configurations.

## Vercel Deployment (Current Setup)

### Frontend Deployment

The frontend is configured to deploy directly to Vercel with the current `vercel.json` configuration.

### API Deployment

The API is currently configured to run as serverless functions on Vercel, with fallback to mock data when the backend is not available.

#### Issues Fixed:
1. **Runtime Version**: Updated from deprecated Python 3.9 to Python 3.12
2. **Handler Format**: Updated API endpoints to use Vercel's serverless function format
3. **Database Connection**: Added fallback to mock data when database is not available

### Current Limitations on Vercel:

1. **No Persistent Database**: Vercel serverless functions don't support SQLite persistence
2. **No Background Jobs**: Scheduler and background tasks won't work
3. **Limited Dependencies**: Some backend features may not work in serverless environment

## Recommended Deployment Options

### Option 1: Full Backend Deployment (Recommended)

Deploy the backend separately on a platform that supports persistent storage:

1. **Railway.app**
   - Supports Docker deployment
   - Persistent volumes for SQLite
   - Environment variables support
   - The `backend/railway.json` is already configured

2. **Fly.io**
   - Supports Docker deployment
   - Persistent volumes
   - The `backend/fly.toml` is already configured

3. **Render.com**
   - Supports Docker deployment
   - Persistent disks for databases
   - The `backend/render.yaml` is already configured

### Option 2: Hybrid Deployment

1. Deploy frontend on Vercel
2. Deploy backend on Railway/Fly.io/Render
3. Update frontend environment variables to point to backend API

### Option 3: Docker Compose (Self-hosted)

Use the provided Docker Compose configuration for self-hosting:

```bash
docker-compose -f docker-compose.production.yml up -d
```

## Populating Real Man Page Data

### Local Development

1. Run the population script:
```bash
cd backend
python populate_manpages_for_vercel.py
```

2. Or use Docker:
```bash
docker-compose exec backend python populate_manpages_for_vercel.py
```

### Production Database

For production deployments with persistent storage:

1. SSH into your server or use the platform's CLI
2. Run the population script
3. The script will populate from `generated_manpages/` directory

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=https://your-backend-url.com  # For external backend
# or leave empty for Vercel serverless functions
```

### Backend (.env)
```
DATABASE_URL=sqlite:///./db_data/betterman.db  # or PostgreSQL for production
REDIS_URL=redis://localhost:6379  # Optional
SECRET_KEY=your-secret-key
ENVIRONMENT=production
```

## Vercel Deployment Steps

1. **Install Vercel CLI**:
```bash
npm i -g vercel
```

2. **Deploy**:
```bash
vercel
```

3. **Set Environment Variables** (if using external backend):
```bash
vercel env add VITE_API_URL
```

## Backend Deployment Steps (Railway Example)

1. **Install Railway CLI**:
```bash
npm i -g @railway/cli
```

2. **Deploy**:
```bash
cd backend
railway up
```

3. **Run database population**:
```bash
railway run python populate_manpages_for_vercel.py
```

## Monitoring

- Frontend: Vercel dashboard provides analytics
- Backend: Check `/health` and `/metrics` endpoints
- Logs: Available in platform dashboards

## Troubleshooting

### Vercel Functions Timeout
- Increase timeout in vercel.json if needed
- Consider moving heavy operations to external backend

### Database Not Persisting
- Vercel functions are stateless
- Use external database service (PostgreSQL recommended)

### CORS Issues
- All API endpoints include CORS headers
- Check frontend API URL configuration

### Missing Man Pages
- Run the population script
- Check database connection
- Verify file paths in the script