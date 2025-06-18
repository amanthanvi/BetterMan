# DigitalOcean Database Solution

## The Problem

DigitalOcean App Platform uses ephemeral containers, which means:
- Files written to the container filesystem are lost on redeploy
- The `/data` directory we created doesn't persist
- SQLite databases need persistent storage

## The Solution

We've implemented a hybrid approach that works within App Platform's constraints:

### 1. Temporary Database Storage
- Database is stored in `/tmp/betterman.db` (writable in containers)
- Database is initialized on startup if it doesn't exist
- Initial data is loaded automatically

### 2. Startup Script (`startup_appplatform.py`)
- Checks if database exists
- Creates schema if needed
- Loads essential man pages on first run
- Starts the Gunicorn server

### 3. App Platform Specific Code
- `database_appplatform.py` - Database module with auto-initialization
- `routes_appplatform.py` - API routes that ensure DB exists
- `main_appplatform.py` - Simplified main app for App Platform

## How It Works

1. **Container Starts**
   - `startup_appplatform.py` runs
   - Checks `/tmp/betterman.db`
   - If missing, creates database and schema

2. **Initial Data Loading**
   - Parses essential man pages from the system
   - Stores in SQLite with FTS5 search
   - Takes ~30 seconds on first run

3. **Normal Operation**
   - API serves requests from in-memory database
   - Fast performance (SQLite is very efficient)
   - Search works via FTS5

4. **On Redeploy**
   - Database is recreated
   - Data is reloaded
   - ~30 second initialization

## Limitations

- Data is ephemeral (lost on redeploy)
- Initial startup takes ~30 seconds
- Limited to system man pages available in container

## Future Improvements

### Option 1: DigitalOcean Managed Database
- Use PostgreSQL ($15/month)
- Persistent data
- No initialization delay

### Option 2: Spaces Integration
- Backup database to Spaces periodically
- Restore from Spaces on startup
- Adds ~10 seconds to startup

### Option 3: Pre-built Database
- Include database in Docker image
- Instant startup
- Requires rebuild for updates

## Deployment Commands

```bash
# Check app status
doctl apps get <app-id>

# View logs during startup
doctl apps logs <app-id> --follow

# Force redeploy
doctl apps create-deployment <app-id>
```

## Monitoring

The `/health` endpoint shows:
- Database connection status
- Number of man pages loaded
- Overall system health

## Cost Analysis

Current solution:
- App Platform Basic: $5/month
- No additional database costs
- Total: $5/month

With managed database:
- App Platform Basic: $5/month
- Managed PostgreSQL: $15/month
- Total: $20/month