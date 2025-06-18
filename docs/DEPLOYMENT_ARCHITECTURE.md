# BetterMan Deployment Architecture

## Current Issues

1. **Too many workflows** - 10 different GitHub Actions workflows causing confusion
2. **Type mismatches** - Build failures due to seeAlso type changes
3. **Docker build failures** - Non-existent packages in Dockerfiles
4. **Vercel limitations** - No persistent storage for parsed man pages

## Recommended Architecture

### Option 1: Simplified Vercel-Only (Current Approach - Fixed)

Keep everything on Vercel but simplify:

```
GitHub Repo → Vercel Build → Static Site with Pre-parsed Data
     ↓
GitHub Actions (Weekly)
     ↓
Parse Man Pages → Commit to Repo → Trigger Vercel Deploy
```

**Pros:**
- Simple deployment
- No additional infrastructure
- Automatic scaling

**Cons:**
- Man pages stored in Git (large repo)
- Build time increases with data

### Option 2: Hybrid with DigitalOcean (Recommended)

Separate concerns between static frontend and dynamic backend:

```
Frontend (Vercel)          Backend (DigitalOcean Droplet)
----------------          ----------------------------
Next.js App         →     FastAPI + PostgreSQL
Static Pages        →     Man Page Parser Service
Search UI           →     Search API
                   →     Admin API
```

## DigitalOcean Setup Guide

### 1. Create a Droplet

```bash
# Recommended specs
- 2 GB RAM
- 2 vCPUs  
- 60 GB SSD
- Ubuntu 24.04 LTS
- $18/month
```

### 2. Initial Server Setup

```bash
# SSH into server
ssh root@your-droplet-ip

# Create user
adduser betterman
usermod -aG sudo betterman

# Setup firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Install dependencies
apt update && apt upgrade -y
apt install -y python3 python3-pip nginx postgresql redis-server certbot python3-certbot-nginx
apt install -y man-db manpages manpages-dev groff
```

### 3. Deploy Backend

Create deployment script:

```bash
#!/bin/bash
# /home/betterman/deploy.sh

cd /home/betterman/BetterMan/backend
git pull origin main
pip install -r requirements.txt
alembic upgrade head
systemctl restart betterman
```

### 4. Setup Services

Create systemd service:

```ini
# /etc/systemd/system/betterman.service
[Unit]
Description=BetterMan API
After=network.target

[Service]
Type=simple
User=betterman
WorkingDirectory=/home/betterman/BetterMan/backend
Environment="PATH=/home/betterman/.local/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/usr/bin/python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

### 5. Setup Cron Jobs

```bash
# Parse man pages weekly
0 0 * * 0 /home/betterman/parse-man-pages.sh

# Backup database daily
0 2 * * * pg_dump betterman > /home/betterman/backups/db-$(date +%Y%m%d).sql
```

### 6. Nginx Configuration

```nginx
server {
    listen 80;
    server_name api.betterman.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Simplified Workflow Structure

Instead of 10 workflows, use just 3:

### 1. `ci.yml` - Continuous Integration
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    # Run tests
  lint:
    # Run linting
  build:
    # Test build
```

### 2. `deploy.yml` - Deployment
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy-frontend:
    # Deploy to Vercel
  deploy-backend:
    # SSH deploy to DO
```

### 3. `parse-man-pages.yml` - Data Updates
```yaml
name: Update Man Pages
on:
  schedule:
    - cron: '0 0 * * 0'
  workflow_dispatch:
jobs:
  parse:
    # Parse and update man pages
```

## Migration Steps

1. **Fix immediate issues:**
   - Update type definitions
   - Remove problematic Docker packages
   - Consolidate workflows

2. **Setup DigitalOcean droplet:**
   - Create droplet
   - Deploy backend
   - Setup cron jobs

3. **Update frontend:**
   - Point API calls to DO backend
   - Remove backend code from Vercel

4. **Clean up:**
   - Remove redundant workflows
   - Archive old Docker configs
   - Update documentation

## Environment Variables

### Vercel (Frontend)
```
NEXT_PUBLIC_API_URL=https://api.betterman.com
NEXT_PUBLIC_SUPABASE_URL=xxx
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

### DigitalOcean (Backend)
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
ADMIN_TOKEN=xxx
OPENAI_API_KEY=xxx
```

## Benefits

1. **Separation of concerns** - Frontend and backend deployed independently
2. **Better scaling** - Backend can handle heavy parsing without affecting frontend
3. **Cost effective** - $18/month for DO + free Vercel tier
4. **Persistent storage** - PostgreSQL for man pages, Redis for cache
5. **Easier updates** - Cron jobs can run without Git commits

## Quick Start

For now, to get Vercel working:

1. Fix the type issue (already done)
2. Remove redundant workflows
3. Use pre-parsed data committed to repo
4. Consider DO migration later