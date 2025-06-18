# BetterMan DigitalOcean Setup Summary

## What We've Done

### 1. Fixed the Setup Script Issue
- Identified that `doctl` doesn't support Spaces commands
- Created `setup-digitalocean-fixed.sh` with proper validation
- Added key format validation to prevent API token confusion

### 2. Created Comprehensive Documentation
- **DIGITALOCEAN_SETUP_CHECKLIST.md** - Step-by-step checklist
- **SPACES_KEY_VISUAL_GUIDE.md** - Visual guide to finding correct keys
- **SPACES_SETUP_GUIDE.md** - Detailed Spaces configuration
- **DIGITALOCEAN_TROUBLESHOOTING.md** - Common issues and solutions

### 3. Added Validation Tools
- **validate-spaces-setup.sh** - Pre-deployment validation script
- Checks all prerequisites before running main setup

## Next Steps for You

### 1. Create Spaces Bucket (Manual)
```bash
# Go to: https://cloud.digitalocean.com/spaces
# Click "Create a Space"
# Name: betterman-backups
# Region: NYC3
```

### 2. Generate Spaces Access Keys
```bash
# Go to: https://cloud.digitalocean.com/account/api/spaces
# Click "Generate New Key"
# Name: betterman-backend
# SAVE BOTH KEYS IMMEDIATELY!
```

### 3. Run Validation Script
```bash
./scripts/validate-spaces-setup.sh
```

### 4. Run Fixed Setup Script
```bash
./scripts/setup-digitalocean-fixed.sh
```

When prompted, enter:
- Spaces Access Key (starts with `DO`)
- Spaces Secret Key (long random string)

### 5. Add Supabase Credentials
Edit `.env.production.local` and add your Supabase credentials.

### 6. Push to Deploy
```bash
git add .
git commit -m "feat: configure DigitalOcean deployment"
git push
```

## Key Points to Remember

1. **Two Different Keys:**
   - API Token (`dop_v1_...`) - For doctl/API
   - Spaces Keys (`DO...`) - For S3/storage

2. **Manual Steps Required:**
   - Create Spaces bucket via web UI
   - Generate Spaces keys via web UI

3. **Save Your Admin Token:**
   - Generated during setup
   - Required for API access

## Useful Commands

```bash
# Check app status
doctl apps list

# View logs
doctl apps logs <app-id> --follow

# Test backend
curl https://<your-app-url>/health

# Validate Spaces (with AWS CLI)
aws s3 ls --endpoint-url https://nyc3.digitaloceanspaces.com --profile digitalocean
```

## Cost Summary
- App Platform (Basic): $5/month
- Spaces: $5/month
- Total: $10/month

## Support Resources
- Checklist: `docs/DIGITALOCEAN_SETUP_CHECKLIST.md`
- Visual Guide: `docs/SPACES_KEY_VISUAL_GUIDE.md`
- Troubleshooting: `docs/DIGITALOCEAN_TROUBLESHOOTING.md`

The setup is now ready for you to complete the manual steps!