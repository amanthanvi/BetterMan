# DigitalOcean Setup Checklist

This checklist ensures you complete all steps for deploying BetterMan to DigitalOcean correctly.

## Pre-Setup Requirements

- [ ] **DigitalOcean Account** - Create at [digitalocean.com](https://www.digitalocean.com/)
- [ ] **doctl CLI Installed** - Run `brew install doctl` (macOS)
- [ ] **doctl Authenticated** - Run `doctl auth init` with your API token
- [ ] **GitHub Repository Connected** - Authorize DigitalOcean to access your repo

## Step 1: Create DigitalOcean API Token

1. [ ] Go to [API Tokens](https://cloud.digitalocean.com/account/api/tokens)
2. [ ] Click "Generate New Token"
3. [ ] Name: `betterman-cli`
4. [ ] Scopes: Select "Read" and "Write"
5. [ ] Click "Generate Token"
6. [ ] **Copy the token** (starts with `dop_v1_...`)
7. [ ] Run `doctl auth init` and paste the token

## Step 2: Create Spaces Bucket (Manual)

⚠️ **Important**: Spaces cannot be created via doctl. Use the web UI.

1. [ ] Go to [Spaces](https://cloud.digitalocean.com/spaces)
2. [ ] Click "Create a Space"
3. [ ] Configure:
   - **Region**: NYC3 (New York)
   - **Name**: `betterman-backups`
   - **File Listing**: Restrict File Listing
   - **CDN**: Leave disabled
4. [ ] Click "Create a Space"
5. [ ] Wait for Space to be created

## Step 3: Generate Spaces Access Keys

⚠️ **Critical**: These are different from API tokens!

1. [ ] Go to [Spaces Keys](https://cloud.digitalocean.com/account/api/spaces)
2. [ ] Click "Generate New Key"
3. [ ] Name: `betterman-backend`
4. [ ] Click "Generate Key"
5. [ ] **IMMEDIATELY COPY**:
   - [ ] **Access Key**: Starts with `DO` (e.g., `DO00K5XY8EXAMPLE`)
   - [ ] **Secret Key**: Long random string
6. [ ] Save these securely - **the secret is shown only once!**

### Verify Key Format
- ✅ Correct Spaces Key: `DO00K5XY8EXAMPLE123`
- ❌ Wrong (API Token): `dop_v1_abcdef123456...`

## Step 4: Run Setup Script

1. [ ] Make script executable:
   ```bash
   chmod +x scripts/setup-digitalocean-fixed.sh
   ```

2. [ ] Run the script:
   ```bash
   ./scripts/setup-digitalocean-fixed.sh
   ```

3. [ ] When prompted:
   - [ ] Confirm you created the Spaces bucket
   - [ ] Enter Spaces Access Key (starts with `DO`)
   - [ ] Enter Spaces Secret Key
   
4. [ ] Script will:
   - [ ] Validate key format
   - [ ] Generate admin token
   - [ ] Create App Platform app
   - [ ] Save configuration

## Step 5: Verify Deployment

1. [ ] Check app creation:
   ```bash
   doctl apps list
   ```

2. [ ] Get app details:
   ```bash
   doctl apps get <app-id>
   ```

3. [ ] Monitor deployment:
   ```bash
   doctl apps logs <app-id> --follow
   ```

4. [ ] Wait for deployment (5-10 minutes)

## Step 6: Update Frontend Configuration

1. [ ] Edit `.env.production.local`
2. [ ] Add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_url_here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
   ```

3. [ ] Commit and push:
   ```bash
   git add .env.production.local
   git commit -m "feat: add production environment configuration"
   git push
   ```

## Step 7: Test the Deployment

1. [ ] Check backend health:
   ```bash
   curl https://<your-app-url>/health
   ```

2. [ ] Initialize database:
   ```bash
   curl -X POST https://<your-app-url>/api/admin/init-db \
     -H "X-Admin-Token: <your-admin-token>"
   ```

3. [ ] Parse man pages:
   ```bash
   curl -X POST https://<your-app-url>/api/admin/parse-man-pages \
     -H "X-Admin-Token: <your-admin-token>"
   ```

## Step 8: Verify Spaces Integration

1. [ ] Test Spaces connection:
   ```bash
   aws s3 ls --endpoint-url https://nyc3.digitaloceanspaces.com \
     --profile digitalocean
   ```

2. [ ] Create test backup:
   ```bash
   curl -X POST https://<your-app-url>/api/admin/backup \
     -H "X-Admin-Token: <your-admin-token>"
   ```

## Common Issues and Solutions

### "unknown command 'storage' for 'doctl'"
- **Cause**: doctl doesn't support Spaces commands
- **Solution**: Use web UI or AWS CLI

### "Invalid Spaces Access Key format"
- **Cause**: Using API token instead of Spaces key
- **Solution**: Generate Spaces-specific keys

### App deployment fails
- **Check**: GitHub permissions
- **Check**: Dockerfile path is correct
- **Check**: Environment variables

### Database not found
- **Solution**: Wait for app to fully deploy
- **Solution**: Check logs for initialization errors

## Important URLs

- **App Dashboard**: https://cloud.digitalocean.com/apps/<app-id>
- **Spaces Dashboard**: https://cloud.digitalocean.com/spaces
- **API Tokens**: https://cloud.digitalocean.com/account/api/tokens
- **Spaces Keys**: https://cloud.digitalocean.com/account/api/spaces

## Security Reminders

- [ ] **Never commit** Spaces keys to Git
- [ ] **Save admin token** securely
- [ ] **Rotate keys** regularly
- [ ] **Use environment variables** for all secrets

## Next Steps

Once everything is working:
1. Set up monitoring alerts
2. Configure automated backups
3. Add custom domain
4. Enable CDN for better performance