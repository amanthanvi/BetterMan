# Railway PostgreSQL Database Setup Guide

## 🚨 Current Issue Resolution

The backend is crashing because it's trying to use `asyncpg` to connect to PostgreSQL, but the connection string format is incompatible. Here's how to fix it:

## Step 1: Get Your Database URL from Railway

1. Go to your [Railway Dashboard](https://railway.app/dashboard)
2. Select your project: **betterman**
3. Click on the **Postgres** service
4. Go to the **Variables** tab
5. Copy the `DATABASE_URL` value (it should start with `postgresql://`)

## Step 2: Set Up Database Locally

```bash
# Export the DATABASE_URL from Railway
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@YOUR_HOST.railway.app:PORT/railway"

# You can also export from Railway CLI (if linked):
# eval $(railway variables export)

# Run the setup script
python3 setup-db.py
```

Choose option 5 to run all setup steps.

## Step 3: Fix the Backend Deployment

The backend service needs to use our new connection module. Here are the required environment variables for your backend service in Railway:

### Required Environment Variables

Go to your backend service in Railway and ensure these are set:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
CORS_ORIGINS=https://your-frontend-domain.railway.app
ENVIRONMENT=production
SECRET_KEY=your-secure-secret-key-here
PORT=8000
```

## Step 4: Deploy the Fixed Backend

### Option A: Use the Fixed API Configuration

The `/api/main.py` file is configured to work with Railway's PostgreSQL without asyncpg issues.

In Railway, set your backend service's start command to:
```bash
python api/main.py
```

### Option B: Update the Existing Backend

Update your backend's start command in Railway to:
```bash
cd backend && python -m uvicorn src.main:app --host 0.0.0.0 --port $PORT
```

## Step 5: Verify Deployment

1. Check the backend logs in Railway:
   - Look for "Database initialized successfully"
   - Check that there are no asyncpg connection errors

2. Test the health endpoint:
   ```bash
   curl https://your-backend.railway.app/health
   ```

3. Test the API endpoint:
   ```bash
   curl https://your-backend.railway.app/api/test
   ```

## Troubleshooting

### If you see "Connection refused" errors:

1. **Check PostgreSQL is running**: 
   - In Railway, ensure the Postgres service shows as "Running"
   - Check if there's a volume attached to persist data

2. **Verify DATABASE_URL format**:
   - Should be: `postgresql://user:password@host:port/database`
   - Railway provides this automatically when services are linked

3. **Check service linking**:
   - In Railway, ensure your backend service is linked to both Postgres and Redis
   - The variables should auto-populate when linked

### If migrations fail:

1. **Run migrations manually**:
   ```bash
   # Export Railway environment
   export DATABASE_URL="your-railway-postgres-url"
   
   # Run migrations
   cd backend
   python -m alembic upgrade head
   ```

2. **Initialize database**:
   ```bash
   python -m src.db.init_postgres
   ```

## Database Schema Features

Your PostgreSQL database now includes:

- **Full-text search** with weighted vectors
- **JSONB fields** for flexible content storage
- **Array fields** for related commands
- **UUID primary keys** for distributed systems
- **GIN indexes** for fast text search
- **Timezone-aware timestamps**
- **Hierarchical categories**
- **Search analytics tracking**
- **Cache metadata management**

## Next Steps

1. **Commit and push** your changes:
   ```bash
   git add .
   git commit -m "Fix PostgreSQL connection for Railway deployment"
   git push origin railway-refactor
   ```

2. **Redeploy** in Railway:
   - Railway should auto-deploy when you push
   - Or manually trigger a redeploy in the Railway dashboard

3. **Monitor** the deployment:
   - Check logs for any errors
   - Verify database tables are created
   - Test API endpoints

## Additional Commands

```bash
# Check database status
python3 setup-db.py  # Choose option 1

# View Railway logs
railway logs --service backend

# Connect to Railway PostgreSQL directly
railway connect postgres

# Run SQL commands
railway run --service postgres psql -c "SELECT COUNT(*) FROM man_pages;"
```

## Support

If you continue to have issues:

1. Check the Railway Discord for help
2. Ensure all environment variables are correctly set
3. Verify the backend is using the correct start command
4. Check that PostgreSQL and Redis services are running