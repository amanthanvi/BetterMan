#!/bin/bash

# Frontend deployment script for betterman.sh

echo "🚀 Deploying BetterMan frontend to production..."

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if in frontend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from frontend directory${NC}"
    exit 1
fi

# Build the frontend
echo -e "${YELLOW}Building frontend...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build completed successfully${NC}"

# Copy .env.production if it exists
if [ -f ".env.production" ]; then
    echo -e "${YELLOW}Using production environment variables${NC}"
fi

echo -e "${GREEN}🎉 Frontend build ready for deployment!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Deploy the 'dist' folder to your hosting provider"
echo "2. Configure your web server to handle SPA routing"
echo "3. Ensure SSL certificates are configured"
echo "4. Update Supabase redirect URLs to include https://betterman.sh"

# Example deployment commands for common providers:
echo -e "\n${YELLOW}Deployment examples:${NC}"
echo "Vercel: vercel --prod"
echo "Netlify: netlify deploy --prod"
echo "Nginx: Copy dist/* to /var/www/betterman.sh"