# BetterMan Deployment Guide

## Architecture Overview

BetterMan now uses a **single, unified frontend architecture**:

- **Next.js 15 App (Root Directory)**
  - Modern App Router architecture with React 19
  - Optimized for static generation and performance
  - Configured for Vercel deployment
  - Uses both API and local data fallback
  - Ready for future authentication features

**Note**: The duplicate React/Vite frontend has been removed for clarity and maintainability.

## Backend Deployment Guide

### Option 1: Render.com (Recommended)

**Why Render?**
- Free tier available
- Automatic deploys from GitHub
- Built-in PostgreSQL
- Redis support
- Easy scaling

**Setup Steps:**

1. **Create Render Account**
   - Sign up at [render.com](https://render.com)
   - Connect your GitHub account

2. **Create PostgreSQL Database**
   ```
   Dashboard → New → PostgreSQL
   - Name: betterman-db
   - Region: Choose closest to your users
   - Plan: Free (or Starter for production)
   ```

3. **Create Redis Instance**
   ```
   Dashboard → New → Redis
   - Name: betterman-redis
   - Region: Same as database
   - Plan: Free (or Starter)
   - Maxmemory Policy: allkeys-lru
   ```

4. **Create Web Service**
   ```
   Dashboard → New → Web Service
   - Connect repository
   - Name: betterman-api
   - Environment: Python 3
   - Build Command: cd backend && pip install -r requirements.txt
   - Start Command: cd backend && uvicorn src.main:app --host 0.0.0.0 --port $PORT
   ```

5. **Environment Variables**
   ```
   DATABASE_URL=<PostgreSQL Internal URL from step 2>
   REDIS_URL=<Redis Internal URL from step 3>
   ADMIN_TOKEN=<generate secure token>
   BACKEND_CORS_ORIGINS=["https://your-app.vercel.app"]
   ```

6. **Deploy**
   - Render will automatically deploy on git push
   - Get your API URL: https://betterman-api.onrender.com

### Option 2: Railway (Alternative)

**Why Railway?**
- Simple deployment
- Good developer experience
- Usage-based pricing
- Built-in databases

**Setup Steps:**

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create Project**
   ```bash
   cd backend
   railway init
   ```

3. **Add Services**
   ```bash
   # In Railway dashboard
   + New → Database → PostgreSQL
   + New → Database → Redis
   ```

4. **Configure & Deploy**
   ```bash
   railway link
   railway up
   ```

5. **Set Variables**
   ```bash
   railway variables set DATABASE_URL=${{Postgres.DATABASE_URL}}
   railway variables set REDIS_URL=${{Redis.REDIS_URL}}
   railway variables set ADMIN_TOKEN=your-secure-token
   railway variables set BACKEND_CORS_ORIGINS='["https://your-app.vercel.app"]'
   ```

### Option 3: Fly.io (For Global Distribution)

**Why Fly.io?**
- Edge deployment
- Global distribution
- Built-in Redis
- Good free tier

**Setup Steps:**

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   fly auth login
   ```

2. **Create fly.toml**
   ```toml
   app = "betterman-api"
   primary_region = "iad"

   [build]
     dockerfile = "backend/Dockerfile"

   [env]
     PORT = "8080"

   [[services]]
     http_checks = []
     internal_port = 8080
     protocol = "tcp"
     script_checks = []

     [[services.ports]]
       port = 80

     [[services.ports]]
       port = 443
   ```

3. **Deploy**
   ```bash
   fly launch
   fly postgres create
   fly redis create
   fly secrets set ADMIN_TOKEN=your-secure-token
   fly deploy
   ```

### Option 4: DigitalOcean App Platform

**Setup Steps:**

1. **Create App**
   - Go to [cloud.digitalocean.com](https://cloud.digitalocean.com)
   - Create → App Platform
   - Connect GitHub repository

2. **Configure Components**
   - Add Web Service (backend)
   - Add Database (PostgreSQL)
   - Add Redis

3. **Set Build & Run**
   ```yaml
   build_command: cd backend && pip install -r requirements.txt
   run_command: cd backend && gunicorn src.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8080
   ```

## Frontend Deployment (Next.js to Vercel)

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Deploy**
   ```bash
   vercel
   # Follow prompts
   # Set environment variables in Vercel dashboard
   ```

3. **Environment Variables**
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.com
   NEXT_PUBLIC_API_ENABLED=true
   ```

## Local Development Setup

### Using Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Manual Setup

1. **Backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn src.main:app --reload
   ```

2. **Frontend (Next.js)**
   ```bash
   npm install
   npm run dev
   ```

## Production Checklist

- [ ] Set secure ADMIN_TOKEN
- [ ] Configure CORS origins properly
- [ ] Enable HTTPS on all services
- [ ] Set up monitoring (Sentry, LogRocket)
- [ ] Configure rate limiting
- [ ] Set up backups for database
- [ ] Configure CDN for static assets
- [ ] Set up health checks
- [ ] Configure auto-scaling (if needed)

## Cost Estimates

### Free Tier Options
- **Render**: Free web service + free PostgreSQL + free Redis
- **Railway**: $5 credit/month
- **Fly.io**: Free allowances for small apps
- **Vercel**: Free for personal projects

### Production Costs (Estimated)
- **Backend**: $7-25/month (depending on traffic)
- **Database**: $7-20/month
- **Redis**: $0-10/month
- **Frontend**: Free on Vercel
- **Total**: ~$15-50/month

## Migration Strategy

1. **Phase 1**: Deploy Next.js app as-is (public docs)
2. **Phase 2**: Add authentication to Next.js
3. **Phase 3**: Migrate user features (favorites, analytics)
4. **Phase 4**: Remove React frontend
5. **Phase 5**: Update Docker Compose

## Support & Monitoring

### Recommended Tools
- **Error Tracking**: Sentry
- **Analytics**: Vercel Analytics
- **Uptime**: Better Uptime or Uptime Robot
- **Logs**: Backend provider's built-in logging

### Health Checks
- Backend: `GET /health`
- Database: Connection pooling
- Redis: Ping/pong check