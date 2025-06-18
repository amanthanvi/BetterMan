#!/bin/bash

echo "🔧 Completing DigitalOcean Setup"
echo "================================"
echo ""

# Variables from your setup
APP_ID="a0db0878-e610-49aa-8eb9-b129e62baebf"
APP_NAME="betterman-prod"
SPACES_ACCESS_KEY="DO8012YLQ8BXEWFYE8WW"
ADMIN_TOKEN="2b7849c7a05b21d989fb38075552aefc4ec8cc0e1eed82ac90147f656bf88a7c"
SECRET_KEY="014e633f407befbd2081d008e5e155ec819d3f342f41855beeca79aecd6153bf"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "📱 App Information:"
echo "  - App ID: $APP_ID"
echo "  - App Name: $APP_NAME"
echo ""

# Get app status
echo "🔍 Checking app status..."
APP_STATUS=$(doctl apps get "$APP_ID" --format LiveURL,Status --no-header)
APP_URL=$(echo "$APP_STATUS" | awk '{print $1}')
STATUS=$(echo "$APP_STATUS" | awk '{print $2}')

echo "  - Status: $STATUS"
echo "  - URL: $APP_URL"
echo ""

# Create frontend environment file
echo "📝 Creating frontend environment file..."
cat >.env.production.local <<EOF
# DigitalOcean Backend
NEXT_PUBLIC_API_URL=$APP_URL
NEXT_PUBLIC_API_ENABLED=true

# Your existing Supabase credentials (add these)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EOF

echo -e "${GREEN}✅ Created .env.production.local${NC}"
echo ""

# Save configuration
mkdir -p .do
cat >.do/config.env <<EOF
# DigitalOcean Configuration
# Generated: $(date)

APP_ID=$APP_ID
APP_URL=$APP_URL
APP_NAME=$APP_NAME
SECRET_KEY=$SECRET_KEY
ADMIN_TOKEN=$ADMIN_TOKEN
SPACES_ACCESS_KEY=$SPACES_ACCESS_KEY
SPACES_BUCKET=betterman-prod
SPACES_REGION=nyc3
EOF

echo -e "${GREEN}✅ Configuration saved to .do/config.env${NC}"
echo ""

echo "📋 Next Steps:"
echo ""
echo "1. Monitor deployment status:"
echo "   doctl apps logs $APP_ID --follow"
echo ""
echo "2. View app in browser:"
echo "   https://cloud.digitalocean.com/apps/$APP_ID"
echo ""
echo "3. Add your Supabase credentials to .env.production.local"
echo ""
echo "4. Deploy frontend to Vercel with domain betterman.sh"
echo ""
echo "5. Test your API:"
echo "   curl $APP_URL/health"
echo ""
echo -e "${YELLOW}⚠️  Important: Keep your tokens secure!${NC}"
echo "   Admin Token: $ADMIN_TOKEN"
echo "   Secret Key: $SECRET_KEY"
echo ""