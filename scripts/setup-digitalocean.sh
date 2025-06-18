#!/bin/bash

echo "🚀 BetterMan DigitalOcean Setup Script"
echo "======================================"
echo ""

# Check if doctl is installed
if ! command -v doctl &> /dev/null; then
    echo "❌ doctl CLI not found. Please install it first:"
    echo "   brew install doctl  (macOS)"
    echo "   or visit: https://docs.digitalocean.com/reference/doctl/how-to/install/"
    exit 1
fi

# Check authentication
echo "🔑 Checking DigitalOcean authentication..."
if ! doctl auth list &> /dev/null; then
    echo "❌ Not authenticated. Please run: doctl auth init"
    exit 1
fi

echo "✅ Authenticated"
echo ""

# Create Spaces bucket
echo "📦 Creating Spaces bucket for backups..."
SPACES_REGION="nyc3"
BUCKET_NAME="betterman-backups"

if doctl storage bucket list | grep -q "$BUCKET_NAME"; then
    echo "✅ Bucket $BUCKET_NAME already exists"
else
    doctl storage bucket create "$BUCKET_NAME" --region "$SPACES_REGION"
    echo "✅ Created bucket: $BUCKET_NAME"
fi

# Get Spaces access keys
echo ""
echo "🔑 Setting up Spaces access keys..."
echo "Please create Spaces access keys in the DigitalOcean dashboard:"
echo "https://cloud.digitalocean.com/account/api/spaces"
echo ""
read -p "Enter Spaces Access Key: " SPACES_ACCESS_KEY
read -sp "Enter Spaces Secret Key: " SPACES_SECRET_KEY
echo ""

# Create App Platform app
echo ""
echo "🚀 Creating App Platform app..."

# Generate app spec
cat > /tmp/betterman-app.yaml << EOF
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
        value: /data/betterman.db
      - key: ADMIN_TOKEN
        value: "${ADMIN_TOKEN:-$(openssl rand -hex 32)}"
      - key: SPACES_ACCESS_KEY
        value: "$SPACES_ACCESS_KEY"
      - key: SPACES_SECRET_KEY
        value: "$SPACES_SECRET_KEY"
      - key: SPACES_BUCKET_NAME
        value: "$BUCKET_NAME"
      - key: SPACES_REGION
        value: "$SPACES_REGION"
      - key: ENVIRONMENT
        value: production
    
    http_port: 8000
    
    health_check:
      http_path: /health
      initial_delay_seconds: 10
      period_seconds: 10
    
    instance_count: 1
    instance_size_slug: basic-xxs
EOF

# Create the app
echo "📝 Creating app from spec..."
doctl apps create --spec /tmp/betterman-app.yaml --wait

# Get app ID
APP_ID=$(doctl apps list --format ID,Name --no-header | grep betterman-api | awk '{print $1}')

if [ -z "$APP_ID" ]; then
    echo "❌ Failed to create app"
    exit 1
fi

echo "✅ App created with ID: $APP_ID"

# Get app URL
APP_URL=$(doctl apps get "$APP_ID" --format LiveURL --no-header)
echo "🌐 App URL: $APP_URL"

# Update frontend .env
echo ""
echo "📝 Creating frontend environment file..."
cat > .env.production.local << EOF
# DigitalOcean Backend
NEXT_PUBLIC_API_URL=$APP_URL
NEXT_PUBLIC_API_ENABLED=true

# Copy your existing Supabase credentials here
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EOF

echo "✅ Created .env.production.local"

# Summary
echo ""
echo "✅ DigitalOcean setup complete!"
echo ""
echo "📋 Summary:"
echo "  - App Platform: $APP_URL"
echo "  - Spaces Bucket: $BUCKET_NAME"
echo "  - Admin Token: (saved in app environment)"
echo ""
echo "📝 Next steps:"
echo "  1. Add your Supabase credentials to .env.production.local"
echo "  2. Deploy frontend: git push (Vercel will auto-deploy)"
echo "  3. Monitor app: doctl apps logs $APP_ID --follow"
echo "  4. View metrics: https://cloud.digitalocean.com/apps/$APP_ID"
echo ""
echo "💡 Useful commands:"
echo "  - View logs: doctl apps logs $APP_ID --follow"
echo "  - Deploy: doctl apps create-deployment $APP_ID"
echo "  - Scale up: doctl apps update $APP_ID --spec .do/app.yaml"
echo ""

# Clean up
rm -f /tmp/betterman-app.yaml