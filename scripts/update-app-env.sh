#!/bin/bash

echo "🔧 BetterMan App Environment Update Script"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if app ID is provided
if [ -z "$1" ]; then
  echo -e "${RED}❌ Usage: ./update-app-env.sh <app-id>${NC}"
  echo "You can find your app ID with: doctl apps list"
  exit 1
fi

APP_ID=$1

# Check if doctl is installed
if ! command -v doctl &>/dev/null; then
  echo -e "${RED}❌ doctl CLI not found${NC}"
  echo "Please install it first: brew install doctl"
  exit 1
fi

# Generate SECRET_KEY if not provided
if [ -z "$SECRET_KEY" ]; then
  SECRET_KEY=$(openssl rand -hex 32)
  echo "🔑 Generated new SECRET_KEY: $SECRET_KEY"
  echo "(Save this key!)"
else
  echo "🔑 Using provided SECRET_KEY"
fi

# Update the app environment
echo ""
echo "📝 Updating app environment variables..."

# Create temporary env update file
cat >/tmp/env-update.yaml <<EOF
- key: SECRET_KEY
  value: "$SECRET_KEY"
  scope: RUN_AND_BUILD_TIME
  type: SECRET
EOF

# Update the app
if doctl apps update-env "$APP_ID" --env-file /tmp/env-update.yaml; then
  echo -e "${GREEN}✅ Environment updated successfully${NC}"
else
  echo -e "${RED}❌ Failed to update environment${NC}"
  exit 1
fi

# Clean up
rm -f /tmp/env-update.yaml

echo ""
echo "🔄 The app will redeploy automatically with the new environment variable."
echo ""
echo "💡 Monitor deployment status:"
echo "   doctl apps get $APP_ID"
echo "   doctl apps logs $APP_ID --follow"
echo ""
echo "🔐 Important: Save your SECRET_KEY!"
echo "   $SECRET_KEY"