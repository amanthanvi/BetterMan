# PostgreSQL psycopg3 Migration Guide

## ✅ What's Been Updated

1. **Requirements**: Updated from `psycopg2-binary` to `psycopg[binary,pool]` (psycopg3)
2. **Database Connection Module**: Updated to support psycopg3 URL format
3. **Alembic Configuration**: Updated to use psycopg3
4. **All database scripts**: Updated to use the new psycopg3 driver

## 🚨 Current Issue: Connection Timeout

The Railway PostgreSQL connection is timing out. This could be due to:

### 1. Check Railway PostgreSQL Status

Go to your Railway dashboard and verify:
- PostgreSQL service is showing as "Running" ✅
- A volume is attached to persist data
- The deployment hasn't crashed

### 2. Database URLs

Railway provides two URLs:
- **Internal URL** (only works within Railway): `postgres.railway.internal:5432`
- **Public URL** (for external access): `switchback.proxy.rlwy.net:12970`

Currently getting:
```
DATABASE_URL=postgresql://postgres:AQfyPloUplKWvSMLgKXqKQwgYLGONgqQ@postgres.railway.internal:5432/railway
DATABASE_PUBLIC_URL=postgresql://postgres:AQfyPloUplKWvSMLgKXqKQwgYLGONgqQ@switchback.proxy.rlwy.net:12970/railway
```

## 🔧 Fix Steps

### Step 1: Restart PostgreSQL in Railway

1. Go to Railway Dashboard
2. Select the Postgres service
3. Click the three dots menu → "Restart"
4. Wait for it to show as "Running"

### Step 2: Test Connection from Railway

In Railway, you can run commands directly on the service:

```bash
# Connect to your backend service shell
railway run --service backend bash

# Test the connection from within Railway
python -c "
import psycopg
conn = psycopg.connect('postgresql://postgres:AQfyPloUplKWvSMLgKXqKQwgYLGONgqQ@postgres.railway.internal:5432/railway')
print('Connected!')
conn.close()
"
```

### Step 3: Update Backend Service Variables

Ensure your backend service has these environment variables:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_PUBLIC_URL=${{Postgres.DATABASE_PUBLIC_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
CORS_ORIGINS=https://frontend-production-f722.up.railway.app
ENVIRONMENT=production
SECRET_KEY=8166618069b015e25cb3a876ac866eb8647750d5ad785047e98097a96e8b5459
PORT=8000
```

### Step 4: Deploy with the Fixed Code

```bash
# Commit the psycopg3 updates
git add .
git commit -m "Migrate to psycopg3 for PostgreSQL connection"
git push origin railway-refactor
```

### Step 5: Run Migrations on Railway

Once deployed, run migrations directly on Railway:

```bash
# Option A: Use Railway CLI to run commands on the deployed service
railway run --service backend python -m alembic upgrade head

# Option B: SSH into the service and run
railway shell --service backend
cd backend
python -m alembic upgrade head
python -m src.db.init_postgres
```

## 📝 Testing Locally

If you want to test locally with the Railway database (when it's accessible):

```bash
# Activate virtual environment
source venv/bin/activate

# Export environment variables
export DATABASE_URL="postgresql://postgres:AQfyPloUplKWvSMLgKXqKQwgYLGONgqQ@switchback.proxy.rlwy.net:12970/railway"
export SECRET_KEY="8166618069b015e25cb3a876ac866eb8647750d5ad785047e98097a96e8b5459"
export ENVIRONMENT="production"

# Test connection
python -c "
from backend.src.db.postgres_connection import engine
with engine.connect() as conn:
    print('Connected to PostgreSQL!')
"

# Run setup
python setup-db.py
```

## 🐛 Troubleshooting

### If you see "No module named 'psycopg2'"

This means the code is still trying to use psycopg2. The migration to psycopg3 is complete, but ensure:
1. You're using the virtual environment: `source venv/bin/activate`
2. Requirements are installed: `pip install -r backend/requirements.txt`

### If connection times out

1. **Check Railway Status**: https://railway.app/status
2. **Check PostgreSQL logs**: 
   ```bash
   railway logs --service Postgres --lines 50
   ```
3. **Try restarting PostgreSQL**: In Railway dashboard, restart the Postgres service
4. **Check firewall**: Ensure your network allows outbound connections to port 12970

### If "SECRET_KEY must be at least 32 characters"

Set the SECRET_KEY environment variable:
```bash
export SECRET_KEY="8166618069b015e25cb3a876ac866eb8647750d5ad785047e98097a96e8b5459"
```

## 🚀 Next Steps

1. **Fix the PostgreSQL connection** in Railway (likely needs a restart)
2. **Deploy the updated code** with psycopg3 support
3. **Run migrations** to create the new schema
4. **Test the API** endpoints

## 📦 What psycopg3 Brings

- **Better performance**: Native PostgreSQL protocol implementation
- **Better connection pooling**: Built-in pool support
- **Better async support**: Native async/await
- **Better type handling**: Automatic type conversion
- **Active development**: psycopg2 is in maintenance mode

The migration is complete in the code. Once the Railway PostgreSQL connection issue is resolved, everything will work with psycopg3!