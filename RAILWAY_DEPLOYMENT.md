# Railway Deployment Guide for Man Page Extraction

## Overview

This guide explains how to deploy the man page extraction pipeline as a cron job on Railway alongside your existing BetterMan services.

## Current Architecture

Your Railway project currently has:
- **frontend**: Next.js application
- **backend**: FastAPI application  
- **Postgres**: PostgreSQL database
- **Redis**: Redis cache

You need to add:
- **extractor**: Man page extraction cron job

## Step-by-Step Deployment

### 1. Create the Extraction Service

1. Go to your Railway project dashboard
2. Click **"+ New"** → **"GitHub Repo"**
3. Select your BetterMan repository
4. Name the service: `extractor` or `man-page-extractor`

### 2. Configure Build Settings

In the extractor service settings:

1. **Source**:
   - Branch: `railway-refactor` (or your main branch after merge)
   - Root Directory: `/backend`

2. **Build**:
   - Builder: Docker
   - Dockerfile Path: `app/workers/Dockerfile.extractor`
   
   **IMPORTANT**: Make sure Railway is using the correct Dockerfile path!
   - Go to Settings → Build
   - Set "Dockerfile Path" to: `app/workers/Dockerfile.extractor`
   - NOT the default `Dockerfile`

3. **Deploy**:
   - Start Command: (leave empty, uses Dockerfile CMD)
   - Railway Config Path: `railway-extractor.toml` (if prompted)

### 3. Configure as Cron Job

1. In the service settings, go to **"Deploy"** tab
2. Change **"Deployment Type"** from "Service" to **"Cron Job"**
3. Set schedule:
   - Cron Expression: `0 3 * * *` (daily at 3 AM UTC)
   - Or use Railway's schedule builder for "Daily at 3:00 AM"

### 4. Set Environment Variables

The extractor needs these environment variables:

1. **Automatic** (inherited from Railway):
   - `DATABASE_URL` - Should auto-connect to your Postgres
   - `REDIS_URL` - Should auto-connect to your Redis

2. **Manual** (add these):
   ```
   EXTRACTION_MODE=incremental
   PYTHON_VERSION=3.12
   LOG_LEVEL=INFO
   ```

3. **Optional** (for monitoring):
   ```
   SENTRY_DSN=<your-sentry-dsn>
   SLACK_WEBHOOK_URL=<for-notifications>
   ```

### 5. Verify Database Connection

Before deploying, ensure your Postgres has:

1. The required tables (should exist from migrations)
2. The UUID and FTS extensions enabled

You can verify by running in Railway shell:
```sql
SELECT * FROM pg_extension WHERE extname IN ('uuid-ossp', 'pg_trgm', 'btree_gin');
```

### 6. Deploy and Test

1. Click **"Deploy"** in the Railway dashboard
2. Monitor the build logs
3. Once deployed, you can:
   - Wait for the cron to run at 3 AM UTC
   - Or manually trigger: Click **"Run Now"** in the cron job settings

### 7. Manual Trigger (Alternative)

You can also manually trigger extraction:

```bash
# From Railway CLI
railway run --service=extractor python /app/workers/railway_extractor.py

# Or from backend service
railway run --service=backend python src/management/extract_man_pages.py
```

## Monitoring

### Check Extraction Status

1. **View Logs**: 
   - Railway Dashboard → extractor service → Logs

2. **Database Check**:
   ```sql
   -- Check extraction metadata
   SELECT * FROM cache_metadata 
   WHERE cache_key = 'extraction_metadata'
   ORDER BY created_at DESC 
   LIMIT 1;

   -- Count extracted pages
   SELECT COUNT(*) FROM man_pages;

   -- Check categories
   SELECT category, COUNT(*) 
   FROM man_pages 
   GROUP BY category;
   ```

3. **Health Metrics**:
   - Total pages extracted
   - Success/failure rate
   - Processing time
   - Category distribution

## Configuration Options

### Cron Schedule Options

- **Daily at 3 AM UTC**: `0 3 * * *` (recommended)
- **Weekly on Sunday**: `0 3 * * 0`
- **Every 12 hours**: `0 */12 * * *`
- **Every 6 hours**: `0 */6 * * *`

### Extraction Modes

Set via `EXTRACTION_MODE` environment variable:

- `incremental` (default): Only process new/changed pages
- `full`: Re-extract all pages (use sparingly)

### Resource Limits

Railway automatically manages resources, but you can set:

- **Memory**: 512MB should be sufficient
- **CPU**: 0.5 vCPU is adequate
- **Timeout**: Set to 30 minutes for full extraction

## Troubleshooting

### Common Issues

1. **"Database connection failed"**
   - Verify `DATABASE_URL` is set correctly
   - Check if service can access Postgres

2. **"No man pages found"**
   - The Ubuntu packages install on first run
   - Check build logs for package installation

3. **"Extraction timeout"**
   - Increase timeout in Railway settings
   - Switch to incremental mode

4. **"Permission denied"**
   - Should not occur with current Dockerfile
   - Check user permissions in container

### Debug Mode

Enable debug logging:
```
LOG_LEVEL=DEBUG
```

### Force Full Extraction

If needed, trigger a full extraction:
```bash
railway run --service=extractor python /app/workers/railway_extractor.py --full
```

## Cost Optimization

The extraction cron job is cost-effective:

- **Runs once daily**: ~30 minutes execution time
- **Incremental updates**: Usually < 5 minutes after initial run
- **Resource efficient**: Low memory and CPU usage
- **Auto-scales down**: No resources used between runs

Estimated monthly cost: < $1 (based on Railway pricing)

## Integration with Frontend

Once extraction is complete, the frontend will automatically:

1. Display extracted man pages
2. Enable full-text search
3. Show command categories
4. Display related commands

No frontend changes needed - it reads from the same `man_pages` table.

## Next Steps

After successful deployment:

1. ✅ Verify extraction completed (check logs)
2. ✅ Confirm man pages in database
3. ✅ Test search functionality in frontend
4. ✅ Monitor performance metrics
5. ✅ Set up alerts for failures (optional)

## Support

If you encounter issues:

1. Check Railway logs for error messages
2. Verify environment variables are set
3. Ensure database migrations are applied
4. Check the extraction statistics in `cache_metadata`

The extraction pipeline is designed to be self-healing and will retry on failures.