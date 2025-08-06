# DigitalOcean Deployment Troubleshooting Guide

This guide helps you resolve common issues when deploying BetterMan to DigitalOcean.

## Table of Contents
1. [Authentication Issues](#authentication-issues)
2. [Spaces Key Problems](#spaces-key-problems)
3. [App Platform Deployment Failures](#app-platform-deployment-failures)
4. [Database Issues](#database-issues)
5. [Network and API Issues](#network-and-api-issues)
6. [Script Errors](#script-errors)

## Authentication Issues

### Problem: "Not authenticated" error with doctl

**Symptoms:**
```
❌ Not authenticated. Please run: doctl auth init
```

**Solution:**
1. Get your API token from https://cloud.digitalocean.com/account/api/tokens
2. Run:
   ```bash
   doctl auth init
   ```
3. Paste your API token when prompted
4. Verify with:
   ```bash
   doctl auth list
   ```

### Problem: "Unable to authenticate" with API token

**Possible Causes:**
- Token expired or revoked
- Token doesn't have required permissions
- Network connectivity issues

**Solution:**
1. Generate a new token with Read + Write permissions
2. Ensure token starts with `dop_v1_`
3. Check internet connection
4. Try: `doctl auth init --access-token YOUR_TOKEN`

## Spaces Key Problems

### Problem: "Invalid Spaces Access Key format"

**Symptoms:**
```
❌ Invalid Spaces Access Key format
Spaces keys start with 'DO', not 'dop_v1'
```

**Root Cause:** Using API token instead of Spaces access key

**Solution:**
1. Go to https://cloud.digitalocean.com/account/api/spaces
2. Click "Generate New Key"
3. Use the key that starts with `DO`, not `dop_v1`

### Problem: "unknown command 'storage' for 'doctl'"

**Root Cause:** doctl doesn't support Spaces commands

**Solution:**
Use the web UI to create Spaces:
1. Go to https://cloud.digitalocean.com/spaces
2. Create bucket manually
3. Use AWS CLI for command-line access:
   ```bash
   brew install awscli
   aws configure --profile digitalocean
   ```

### Problem: Spaces access denied

**Symptoms:**
```
An error occurred (403) when calling the ListBuckets operation: Forbidden
```

**Possible Causes:**
- Wrong credentials
- Key permissions issue
- Region mismatch

**Solution:**
1. Regenerate Spaces keys
2. Verify endpoint URL matches bucket region:
   - NYC3: `https://nyc3.digitaloceanspaces.com`
   - SFO3: `https://sfo3.digitaloceanspaces.com`
3. Test with:
   ```bash
   aws s3 ls --endpoint-url https://nyc3.digitaloceanspaces.com --profile digitalocean
   ```

## App Platform Deployment Failures

### Problem: App creation fails

**Symptoms:**
```
❌ Failed to create app
```

**Common Causes:**
1. GitHub repository not connected
2. Invalid app specification
3. Quota limits reached

**Solutions:**

**1. Connect GitHub:**
- Go to https://cloud.digitalocean.com/apps
- Click "Create App"
- Authorize GitHub access

**2. Validate app spec:**
```bash
doctl apps spec validate --spec .do/app.yaml
```

**3. Check quotas:**
```bash
doctl account get
```

### Problem: Build fails with "exit code: 1"

**Check build logs:**
```bash
doctl apps logs <app-id> --type build
```

**Common Solutions:**
1. **Missing dependencies:** Update requirements.txt
2. **Wrong Python version:** Update Dockerfile
3. **Path issues:** Ensure source_dir is correct

### Problem: App crashes on startup

**Symptoms:**
- Health checks failing
- App restarting repeatedly

**Debug steps:**
1. Check runtime logs:
   ```bash
   doctl apps logs <app-id> --type run --follow
   ```

2. Common fixes:
   - Ensure DATABASE_PATH is `/data/betterman.db`
   - Verify all environment variables are set
   - Check port configuration (should be 8000)

## Database Issues

### Problem: "Database not found"

**Symptoms:**
```
sqlite3.OperationalError: unable to open database file
```

**Solution:**
1. SSH into container:
   ```bash
   doctl apps console <app-id> --type shell
   ```
2. Check directory:
   ```bash
   ls -la /data/
   ```
3. Create directory if missing:
   ```bash
   mkdir -p /data
   chmod 755 /data
   ```

### Problem: "Database is locked"

**Causes:**
- Multiple processes accessing SQLite
- Long-running transactions

**Solutions:**
1. Enable WAL mode in database initialization
2. Add to backend code:
   ```python
   conn.execute("PRAGMA journal_mode=WAL")
   ```

## Network and API Issues

### Problem: CORS errors in frontend

**Symptoms:**
```
Access to fetch at 'https://api.example.com' from origin 'https://betterman.vercel.app' has been blocked by CORS policy
```

**Solution:**
Add CORS configuration to backend:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://betterman-7wuel0a8k-aman-thanvis-projects.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Problem: API returns 502 Bad Gateway

**Common Causes:**
1. App not running
2. Health check failing
3. Timeout issues

**Debug:**
```bash
# Check app status
doctl apps get <app-id>

# View recent logs
doctl apps logs <app-id> --tail 100

# Test health endpoint
curl https://your-app.ondigitalocean.app/health
```

## Script Errors

### Problem: Setup script fails immediately

**Solution:**
1. Check script permissions:
   ```bash
   chmod +x scripts/setup-digitalocean-fixed.sh
   ```

2. Run with debug mode:
   ```bash
   bash -x scripts/setup-digitalocean-fixed.sh
   ```

### Problem: "command not found" errors

**Install missing tools:**
```bash
# macOS
brew install doctl awscli openssl

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install doctl awscli openssl
```

## Quick Fixes Reference

### Reset and Start Over
```bash
# List all apps
doctl apps list

# Delete failed app
doctl apps delete <app-id>

# Remove local config
rm -rf .do/config.env

# Start fresh
./scripts/setup-digitalocean-fixed.sh
```

### Validate Everything
```bash
# Run validation script
./scripts/validate-spaces-setup.sh

# Check all services
doctl auth list
doctl apps list
aws s3 ls --endpoint-url https://nyc3.digitaloceanspaces.com --profile digitalocean
```

### Emergency Admin Token Reset
```bash
# Generate new token
NEW_TOKEN=$(openssl rand -hex 32)
echo "New Admin Token: $NEW_TOKEN"

# Update app
doctl apps update <app-id> --spec - <<EOF
envs:
- key: ADMIN_TOKEN
  value: "$NEW_TOKEN"
EOF
```

## Getting Help

If you're still stuck:

1. **Check logs thoroughly:**
   ```bash
   doctl apps logs <app-id> --tail 200 > debug.log
   ```

2. **DigitalOcean Support:**
   - https://www.digitalocean.com/support/

3. **Community:**
   - DigitalOcean Community: https://www.digitalocean.com/community/
   - GitHub Issues: https://github.com/amanthanvi/BetterMan/issues

4. **Documentation:**
   - App Platform: https://docs.digitalocean.com/products/app-platform/
   - Spaces: https://docs.digitalocean.com/products/spaces/