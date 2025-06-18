#!/bin/bash

echo "🚀 BetterMan DigitalOcean Setup Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if doctl is installed
if ! command -v doctl &>/dev/null; then
  echo -e "${RED}❌ doctl CLI not found${NC}"
  echo "Please install it first:"
  echo "   brew install doctl  (macOS)"
  echo "   or visit: https://docs.digitalocean.com/reference/doctl/how-to/install/"
  exit 1
fi

# Check authentication
echo "🔑 Checking DigitalOcean authentication..."
if ! doctl auth list &>/dev/null; then
  echo -e "${RED}❌ Not authenticated${NC}"
  echo "Please run: doctl auth init"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Variables
SPACES_REGION="nyc3"
BUCKET_NAME="betterman-backups"
SPACES_ENDPOINT="https://${SPACES_REGION}.digitaloceanspaces.com"

echo "📦 Setting up Spaces for backups..."
echo ""
echo -e "${YELLOW}Note: doctl doesn't support Spaces commands.${NC}"
echo "You have two options:"
echo ""
echo "1. Create the Spaces bucket manually:"
echo "   - Go to: https://cloud.digitalocean.com/spaces"
echo "   - Click 'Create a Spaces Bucket'"
echo "   - Name: ${BUCKET_NAME}"
echo "   - Region: ${SPACES_REGION}"
echo ""
echo "2. Use AWS CLI (recommended):"
echo "   brew install awscli"
echo ""

read -p "Have you created the Spaces bucket? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Please create the bucket first, then run this script again.${NC}"
  exit 1
fi

# Get Spaces access keys
echo ""
echo "🔑 Setting up Spaces access keys..."
echo ""
echo "Please create Spaces access keys in the DigitalOcean dashboard:"
echo "https://cloud.digitalocean.com/account/api/spaces"
echo ""
echo -e "${YELLOW}Important: The access key should start with 'DO' not 'dop_v1'${NC}"
echo "The key you entered looks like an API token, not a Spaces access key."
echo ""
read -p "Enter Spaces Access Key (starts with DO): " SPACES_ACCESS_KEY

# Validate the key format
if [[ ! $SPACES_ACCESS_KEY ]]; then
  echo -e "${RED}❌ Invalid Spaces Access Key format${NC}"
  echo "Spaces keys start with 'DO', not 'dop_v1'"
  echo "Please create Spaces keys at: https://cloud.digitalocean.com/account/api/spaces"
  exit 1
fi

read -sp "Enter Spaces Secret Key: " SPACES_SECRET_KEY
echo ""

# Generate tokens
ADMIN_TOKEN=$(openssl rand -hex 32)
SECRET_KEY=$(openssl rand -hex 32)
echo ""
echo "🔐 Generated Admin Token: ${ADMIN_TOKEN}"
echo "🔑 Generated Secret Key: ${SECRET_KEY}"
echo "(Save these tokens - you'll need them for API access)"

# Create App Platform app
echo ""
echo "🚀 Creating App Platform app..."

# Create temporary app spec
cat >/tmp/betterman-app.yaml <<EOF
name: betterman-api
region: nyc

services:
  - name: api
    github:
      repo: amanthanvi/BetterMan
      branch: main
      deploy_on_push: true
    source_dir: backend
    dockerfile_path: backend/Dockerfile.appplatform
    
    envs:
      - key: DATABASE_PATH
        value: "/tmp/betterman.db"
      - key: SECRET_KEY
        value: "${SECRET_KEY}"
      - key: ADMIN_TOKEN
        value: "${ADMIN_TOKEN}"
      - key: SPACES_ACCESS_KEY
        value: "${SPACES_ACCESS_KEY}"
      - key: SPACES_SECRET_KEY
        value: "${SPACES_SECRET_KEY}"
      - key: SPACES_BUCKET_NAME
        value: "${BUCKET_NAME}"
      - key: SPACES_REGION
        value: "${SPACES_REGION}"
      - key: ENVIRONMENT
        value: "production"
    
    http_port: 8000
    
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
    
    instance_count: 1
    instance_size_slug: basic-xxs
EOF

# Create the app
echo "📝 Creating app from spec..."
if doctl apps create --spec /tmp/betterman-app.yaml; then
  echo -e "${GREEN}✅ App creation started${NC}"
else
  echo -e "${RED}❌ Failed to create app${NC}"
  exit 1
fi

# Wait a bit for app to be created
echo "⏳ Waiting for app to be created..."
sleep 10

# Get app ID
APP_ID=$(doctl apps list --format ID,Name --no-header | grep betterman-api | awk '{print $1}')

if [ -z "$APP_ID" ]; then
  echo -e "${RED}❌ Could not find app ID${NC}"
  echo "Please check: doctl apps list"
  exit 1
fi

echo -e "${GREEN}✅ App created with ID: ${APP_ID}${NC}"

# Get app URL (might take a moment to be available)
echo "⏳ Waiting for app URL..."
sleep 5
APP_URL=$(doctl apps get "$APP_ID" --format LiveURL --no-header)

if [ -z "$APP_URL" ]; then
  APP_URL="https://betterman-api-xxxxx.ondigitalocean.app"
  echo -e "${YELLOW}⚠️  App URL not yet available. Check later with:${NC}"
  echo "   doctl apps get $APP_ID --format LiveURL"
else
  echo "🌐 App URL: $APP_URL"
fi

# Update frontend .env
echo ""
echo "📝 Creating frontend environment file..."
cat >.env.production.local <<EOF
# DigitalOcean Backend
NEXT_PUBLIC_API_URL=$APP_URL
NEXT_PUBLIC_API_ENABLED=true

# Copy your existing Supabase credentials here
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EOF

echo -e "${GREEN}✅ Created .env.production.local${NC}"

# Configure AWS CLI for Spaces (optional)
echo ""
echo "📝 Optional: Configure AWS CLI for Spaces"
echo ""
echo "To use AWS CLI with Spaces, run:"
echo "   aws configure --profile digitalocean"
echo ""
echo "Then enter:"
echo "   Access Key ID: $SPACES_ACCESS_KEY"
echo "   Secret Access Key: $SPACES_SECRET_KEY"
echo "   Default region: $SPACES_REGION"
echo "   Default output format: json"
echo ""
echo "Test with:"
echo "   aws s3 ls --endpoint-url $SPACES_ENDPOINT --profile digitalocean"

# Summary
echo ""
echo -e "${GREEN}✅ DigitalOcean setup complete!${NC}"
echo ""
echo "📋 Summary:"
echo "  - App ID: $APP_ID"
echo "  - App URL: $APP_URL"
echo "  - Spaces Bucket: $BUCKET_NAME"
echo "  - Admin Token: $ADMIN_TOKEN (save this!)"
echo "  - Secret Key: $SECRET_KEY (save this!)"
echo ""
echo "📝 Next steps:"
echo "  1. Wait for app deployment (~5-10 minutes)"
echo "  2. Add your Supabase credentials to .env.production.local"
echo "  3. Deploy frontend: git push (Vercel will auto-deploy)"
echo "  4. Monitor app: doctl apps logs $APP_ID --follow"
echo ""
echo "💡 Useful commands:"
echo "  - View logs: doctl apps logs $APP_ID --follow"
echo "  - View build logs: doctl apps logs $APP_ID --type build"
echo "  - Get app URL: doctl apps get $APP_ID --format LiveURL"
echo "  - View app: https://cloud.digitalocean.com/apps/$APP_ID"
echo ""
echo "🔐 Important: Save your credentials!"
echo "   Admin Token: $ADMIN_TOKEN"
echo "   Secret Key: $SECRET_KEY"
echo ""

# Save config for reference
cat >.do/config.env <<EOF
# DigitalOcean Configuration
# Generated: $(date)

APP_ID=$APP_ID
APP_URL=$APP_URL
SECRET_KEY=$SECRET_KEY
ADMIN_TOKEN=$ADMIN_TOKEN
SPACES_BUCKET=$BUCKET_NAME
SPACES_REGION=$SPACES_REGION
EOF

echo "Configuration saved to: .do/config.env"

# Clean up
rm -f /tmp/betterman-app.yaml
