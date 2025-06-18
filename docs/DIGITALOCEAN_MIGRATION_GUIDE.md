# DigitalOcean Migration Guide

This guide walks you through setting up BetterMan on DigitalOcean App Platform.

## Prerequisites

1. **DigitalOcean Account** - [Sign up here](https://www.digitalocean.com/)
2. **GitHub Repository** - Your BetterMan repo connected to DigitalOcean
3. **doctl CLI** - DigitalOcean command line tool
   ```bash
   # macOS
   brew install doctl
   
   # Linux/WSL
   wget https://github.com/digitalocean/doctl/releases/download/v1.98.0/doctl-1.98.0-linux-amd64.tar.gz
   tar xf doctl-1.98.0-linux-amd64.tar.gz
   sudo mv doctl /usr/local/bin
   ```

## Step 1: Authenticate with DigitalOcean

```bash
# Initialize doctl
doctl auth init

# Verify authentication
doctl account get
```

## Step 2: Run Setup Script

```bash
# Run the automated setup
./scripts/setup-digitalocean.sh
```

This script will:
- Create a Spaces bucket for backups
- Set up the App Platform app
- Configure environment variables
- Generate frontend configuration

## Step 3: Manual Setup (if script fails)

### Create Spaces Bucket

1. Go to [Spaces](https://cloud.digitalocean.com/spaces)
2. Click "Create a Space"
3. Name: `betterman-backups`
4. Region: NYC3
5. Create Space

### Create Spaces Access Keys

1. Go to [API Tokens](https://cloud.digitalocean.com/account/api/spaces)
2. Generate New Key
3. Save the Access Key and Secret Key

### Create App Platform App

1. Go to [App Platform](https://cloud.digitalocean.com/apps)
2. Click "Create App"
3. Choose GitHub repository: `amanthanvi/BetterMan`
4. Source Directory: `backend`
5. Dockerfile Path: `backend/Dockerfile.appplatform`
6. Add environment variables:
   ```
   DATABASE_PATH=/data/betterman.db
   ADMIN_TOKEN=<generate with: openssl rand -hex 32>
   SPACES_ACCESS_KEY=<your spaces key>
   SPACES_SECRET_KEY=<your spaces secret>
   SPACES_BUCKET_NAME=betterman-backups
   SPACES_REGION=nyc3
   ```

## Step 4: Update Frontend Configuration

Create `.env.production.local`:
```env
# DigitalOcean Backend
NEXT_PUBLIC_API_URL=https://betterman-api-xxxxx.ondigitalocean.app
NEXT_PUBLIC_API_ENABLED=true

# Your existing Supabase config
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Step 5: Deploy Frontend

```bash
# Commit changes
git add .
git commit -m "feat: add DigitalOcean backend configuration"
git push

# Vercel will auto-deploy
```

## Step 6: Initialize Database

```bash
# SSH into app (if needed)
doctl apps console <app-id> --type=shell

# Or trigger via API
curl -X POST https://your-app.ondigitalocean.app/api/admin/init-db \
  -H "X-Admin-Token: your-admin-token"
```

## Step 7: Parse Man Pages

```bash
# Trigger parsing
curl -X POST https://your-app.ondigitalocean.app/api/admin/parse-man-pages \
  -H "X-Admin-Token: your-admin-token"
```

## Monitoring

### View Logs
```bash
doctl apps logs <app-id> --follow
```

### Check Health
```bash
curl https://your-app.ondigitalocean.app/health
```

### View Metrics
Visit: https://cloud.digitalocean.com/apps/<app-id>/metrics

## Backup Management

### Manual Backup
```bash
curl -X POST https://your-app.ondigitalocean.app/api/admin/backup \
  -H "X-Admin-Token: your-admin-token"
```

### List Backups
```bash
doctl storage ls betterman-backups/backups/
```

### Restore Backup
```bash
# Download backup
doctl storage get betterman-backups/backups/backup_20240618_120000.db.gz backup.db.gz

# Restore via API
curl -X POST https://your-app.ondigitalocean.app/api/admin/restore \
  -H "X-Admin-Token: your-admin-token" \
  -F "backup=@backup.db.gz"
```

## Scaling

### Upgrade to Professional ($12/month)
```bash
# Update app.yaml
sed -i 's/basic-xxs/professional-xs/g' .do/app.yaml

# Apply changes
doctl apps update <app-id> --spec .do/app.yaml
```

### Add Redis Cache
```bash
# Add Redis database
doctl databases create betterman-redis --engine redis --version 7 --size db-s-1vcpu-1gb --region nyc3

# Get connection string
doctl databases connection <db-id> --format RedisURI
```

## Troubleshooting

### App Won't Start
```bash
# Check logs
doctl apps logs <app-id> --type=build
doctl apps logs <app-id> --type=run

# Check app spec
doctl apps spec get <app-id>
```

### Database Issues
```bash
# Check if SQLite file exists
doctl apps console <app-id> --type=shell
ls -la /data/
```

### Spaces Connection Issues
```bash
# Test Spaces connection
doctl storage ls

# Check credentials
doctl apps list-envs <app-id>
```

## Cost Optimization

### Current Setup ($10-17/month)
- App Platform Basic: $5/month
- Spaces: $5/month
- Redis (optional): $7/month

### Tips to Save Money
1. Use Basic tier until you need more resources
2. Enable Spaces lifecycle rules to auto-delete old backups
3. Use CDN for static assets (CloudFlare free tier)

## Security

### Rotate Admin Token
```bash
# Generate new token
NEW_TOKEN=$(openssl rand -hex 32)

# Update app
doctl apps update-env <app-id> ADMIN_TOKEN="$NEW_TOKEN"

# Update GitHub secret
gh secret set ADMIN_TOKEN --body="$NEW_TOKEN"
```

### Enable Firewall
```bash
# Create firewall for app
doctl compute firewall create --name betterman-api \
  --inbound-rules "protocol:tcp,ports:443,address:0.0.0.0/0" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0"
```

## Next Steps

1. Set up monitoring with Better Uptime
2. Configure Sentry for error tracking
3. Add custom domain
4. Enable automated backups
5. Set up CI/CD for backend