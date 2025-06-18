# Recommended Architecture for BetterMan

## Executive Summary

After analyzing performance, cost, and scalability factors, I recommend a **hybrid approach using Vercel for the frontend and DigitalOcean App Platform for the backend**, with SQLite as the primary data store.

## Why This Architecture?

### 1. Performance Benefits

- **SQLite is 35% faster than filesystem** for read-heavy workloads (which man pages are)
- **CDN edge caching** via Vercel for instant global access
- **No cold starts** with DigitalOcean App Platform (unlike pure serverless)
- **Built-in search optimization** with SQLite's FTS5 (Full-Text Search)

### 2. Cost Optimization

| Component | Service | Cost | Why |
|-----------|---------|------|-----|
| Frontend | Vercel Free | $0/month | Perfect for static site + API routes |
| Backend | DO App Platform | $5-12/month | Cheaper than Droplet, managed infrastructure |
| Database | SQLite (included) | $0/month | No separate DB service needed |
| Storage | DO Spaces | $5/month (250GB) | For backups and assets |
| **Total** | | **$10-17/month** | Scalable to 100k+ users |

### 3. Why Not Pure Vercel?

- **250MB function size limit** - Too small for comprehensive man pages
- **Git repo bloat** - Storing parsed data in Git is not scalable
- **No persistent storage** - Can't maintain search indices or user data
- **Limited backend flexibility** - Hard to add features like AI search

### 4. Why Not DigitalOcean Droplet?

- **More maintenance** - You manage OS updates, security patches
- **No automatic scaling** - Manual intervention for traffic spikes
- **Higher initial complexity** - Need to set up everything yourself
- **Similar cost** - $18/month for adequate specs vs $12/month for App Platform

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           Users                                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Vercel (Frontend)                            │
│  • Next.js App (Static + ISR)                                  │
│  • Global CDN                                                   │
│  • Instant deploys from GitHub                                  │
│  • Analytics & Web Vitals                                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │ API Calls
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DigitalOcean App Platform                          │
│  ┌─────────────────────────────────────────────┐               │
│  │         FastAPI Backend Service              │               │
│  │  • Man page parsing & processing            │               │
│  │  • Search API with SQLite FTS5              │               │
│  │  • Admin endpoints                          │               │
│  │  • Background jobs                          │               │
│  └──────────────────┬──────────────────────────┘               │
│                     │                                           │
│  ┌──────────────────▼──────────────────────────┐               │
│  │            SQLite Database                   │               │
│  │  • 148+ man pages (grows to 10k+)          │               │
│  │  • Full-text search indices                 │               │
│  │  • User preferences                         │               │
│  │  • Analytics data                           │               │
│  └─────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │ Backups
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DigitalOcean Spaces                            │
│  • SQLite backups (hourly)                                      │
│  • Parsed man page archives                                     │
│  • Static assets                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Backend on DigitalOcean App Platform (Week 1)

1. **Create App Platform app**:
   ```yaml
   name: betterman-api
   services:
   - name: api
     github:
       repo: amanthanvi/BetterMan
       branch: main
       deploy_on_push: true
     source_dir: backend
     environment_slug: python
     run_command: gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app
     http_port: 8000
   ```

2. **Configure environment**:
   ```bash
   ADMIN_TOKEN=xxx
   REDIS_URL=redis://localhost:6379
   SENTRY_DSN=xxx  # Optional monitoring
   ```

3. **Set up SQLite with persistence**:
   - Mount persistent volume: `/data`
   - Store SQLite at: `/data/betterman.db`
   - Enable WAL mode for better concurrency

### Phase 2: Migrate Data Pipeline (Week 1-2)

1. **Move parsing to backend**:
   - API endpoint: `POST /api/admin/parse-man-pages`
   - Scheduled job via DO App Platform
   - No more Git commits for data

2. **Implement SQLite FTS5**:
   ```sql
   CREATE VIRTUAL TABLE man_pages_fts USING fts5(
     name, title, description, content,
     content=man_pages
   );
   ```

3. **Set up backups**:
   ```python
   # Hourly backup to Spaces
   import boto3
   s3 = boto3.client('s3',
     endpoint_url='https://nyc3.digitaloceanspaces.com',
     aws_access_key_id=SPACES_KEY,
     aws_secret_access_key=SPACES_SECRET
   )
   ```

### Phase 3: Update Frontend (Week 2)

1. **Update API endpoints**:
   ```typescript
   // .env.production
   NEXT_PUBLIC_API_URL=https://betterman-api.ondigitalocean.app
   ```

2. **Remove backend code from Vercel**:
   - Delete `/api` routes that duplicate backend
   - Keep only BFF (Backend for Frontend) routes

3. **Implement caching**:
   ```typescript
   // Use SWR for client-side caching
   const { data } = useSWR(`/api/man/${name}`, fetcher, {
     revalidateOnFocus: false,
     revalidateOnReconnect: false,
     refreshInterval: 3600000, // 1 hour
   })
   ```

### Phase 4: Optimize Performance (Week 3)

1. **Enable SQLite optimizations**:
   ```python
   conn.execute("PRAGMA journal_mode = WAL")
   conn.execute("PRAGMA synchronous = NORMAL")
   conn.execute("PRAGMA cache_size = -64000")  # 64MB
   conn.execute("PRAGMA temp_store = MEMORY")
   ```

2. **Add Redis caching**:
   - Cache popular searches
   - Cache rendered man pages
   - Session storage

3. **CDN for static assets**:
   - Move images to DO Spaces
   - CloudFlare for additional caching

## Cost Breakdown

### Monthly Costs:
- **Vercel Free Tier**: $0
  - 100GB bandwidth
  - Unlimited static requests
  - 100k serverless function executions

- **DO App Platform Basic**: $5
  - 1 container
  - 512 MB RAM
  - 1 vCPU
  - Upgrade to $12 for 1GB RAM if needed

- **DO Spaces**: $5
  - 250GB storage
  - 1TB bandwidth
  - S3-compatible API

- **Total**: $10-17/month

### Scaling Costs:
- At 100k users: ~$25/month
- At 1M users: ~$100/month

## Migration Timeline

| Week | Tasks |
|------|-------|
| 1 | Set up DO App Platform, deploy backend |
| 2 | Migrate data pipeline, implement search |
| 3 | Update frontend, optimize performance |
| 4 | Testing, monitoring, documentation |

## Monitoring & Maintenance

1. **Uptime monitoring**: Better Uptime (free tier)
2. **Error tracking**: Sentry (free tier)
3. **Analytics**: Vercel Analytics (included)
4. **Backups**: Automated via DO Spaces

## Why This Is The Best Approach

1. **Performance**: SQLite + FTS5 provides millisecond search across 10k+ man pages
2. **Cost-effective**: $10-17/month vs $50+ for traditional database setup
3. **Scalable**: Can handle 100k+ concurrent users with caching
4. **Maintainable**: Managed infrastructure reduces DevOps burden
5. **Flexible**: Easy to add AI features, user accounts, etc.

## Next Steps

1. Create DigitalOcean account
2. Set up App Platform with the backend
3. Migrate data pipeline
4. Update frontend configuration
5. Test and optimize

This architecture provides the best balance of performance, cost, and maintainability for BetterMan's growth trajectory.