#!/bin/bash

# Script to validate Spaces setup before running main deployment

echo "🔍 DigitalOcean Spaces Setup Validator"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Validation results
ERRORS=0
WARNINGS=0

# Function to check requirement
check_requirement() {
    local status=$1
    local message=$2
    if [ "$status" = "pass" ]; then
        echo -e "${GREEN}✅ $message${NC}"
    elif [ "$status" = "warn" ]; then
        echo -e "${YELLOW}⚠️  $message${NC}"
        ((WARNINGS++))
    else
        echo -e "${RED}❌ $message${NC}"
        ((ERRORS++))
    fi
}

# Check doctl installation
echo "1. Checking doctl installation..."
if command -v doctl &> /dev/null; then
    check_requirement "pass" "doctl is installed"
else
    check_requirement "fail" "doctl is not installed"
    echo "   Install with: brew install doctl"
fi
echo ""

# Check doctl authentication
echo "2. Checking DigitalOcean authentication..."
if doctl auth list &> /dev/null; then
    check_requirement "pass" "Authenticated with DigitalOcean"
    
    # Show account info
    echo -e "${BLUE}   Account: $(doctl account get --format Email --no-header)${NC}"
else
    check_requirement "fail" "Not authenticated with DigitalOcean"
    echo "   Run: doctl auth init"
fi
echo ""

# Check for API token vs Spaces key confusion
echo "3. Checking for common key confusion..."
echo ""
echo -e "${YELLOW}📋 Quick Reference:${NC}"
echo "   • API Token format: dop_v1_xxxxx... (60+ chars)"
echo "   • Spaces Key format: DO00XXXXX... (20 chars)"
echo ""
read -p "Do you have your Spaces Access Key ready? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    read -p "Enter your Spaces Access Key to validate: " SPACES_KEY
    
    if [[ $SPACES_KEY =~ ^dop_v1.* ]]; then
        check_requirement "fail" "This is an API token, not a Spaces key!"
        echo -e "${RED}   You need to generate Spaces keys at:${NC}"
        echo "   https://cloud.digitalocean.com/account/api/spaces"
    elif [[ $SPACES_KEY =~ ^DO.* ]]; then
        check_requirement "pass" "Spaces Access Key format is correct"
    else
        check_requirement "fail" "Invalid key format"
        echo "   Spaces keys start with 'DO'"
    fi
else
    check_requirement "warn" "No Spaces key provided for validation"
fi
echo ""

# Check if AWS CLI is installed (optional but recommended)
echo "4. Checking optional tools..."
if command -v aws &> /dev/null; then
    check_requirement "pass" "AWS CLI is installed (optional)"
else
    check_requirement "warn" "AWS CLI not installed (optional)"
    echo "   Install with: brew install awscli"
fi
echo ""

# Check for existing Spaces configuration
echo "5. Checking for existing Spaces configuration..."
if [ -f ~/.aws/credentials ] && grep -q "digitalocean" ~/.aws/credentials; then
    check_requirement "pass" "AWS CLI profile 'digitalocean' exists"
else
    check_requirement "warn" "No AWS CLI profile for DigitalOcean"
    echo "   Configure with: aws configure --profile digitalocean"
fi
echo ""

# Check if spaces can be accessed (if AWS CLI is configured)
echo "6. Testing Spaces access (if configured)..."
if command -v aws &> /dev/null && grep -q "digitalocean" ~/.aws/credentials 2>/dev/null; then
    if aws s3 ls --endpoint-url https://nyc3.digitaloceanspaces.com --profile digitalocean &> /dev/null; then
        check_requirement "pass" "Successfully connected to Spaces"
        
        # Check if bucket exists
        if aws s3 ls --endpoint-url https://nyc3.digitaloceanspaces.com --profile digitalocean | grep -q "betterman-backups"; then
            check_requirement "pass" "Bucket 'betterman-backups' exists"
        else
            check_requirement "warn" "Bucket 'betterman-backups' not found"
            echo "   Create at: https://cloud.digitalocean.com/spaces"
        fi
    else
        check_requirement "warn" "Could not connect to Spaces"
        echo "   Check your credentials"
    fi
else
    echo "   Skipping - AWS CLI not configured"
fi
echo ""

# Check for environment file
echo "7. Checking for environment configuration..."
if [ -f .env.production.local ]; then
    check_requirement "pass" "Production environment file exists"
    
    # Check if Supabase credentials are set
    if grep -q "NEXT_PUBLIC_SUPABASE_URL=." .env.production.local; then
        check_requirement "pass" "Supabase URL is configured"
    else
        check_requirement "warn" "Supabase URL not configured"
    fi
else
    check_requirement "warn" "No .env.production.local file"
fi
echo ""

# Summary
echo "======================================"
echo "📊 Validation Summary"
echo "======================================"
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✅ All checks passed! Ready to deploy.${NC}"
    else
        echo -e "${YELLOW}⚠️  Some warnings found, but you can proceed.${NC}"
    fi
    echo ""
    echo "Next step: Run ./scripts/setup-digitalocean-fixed.sh"
else
    echo -e "${RED}❌ Please fix the errors before proceeding.${NC}"
    echo ""
    echo "Resources:"
    echo "• Setup checklist: docs/DIGITALOCEAN_SETUP_CHECKLIST.md"
    echo "• Visual guide: docs/SPACES_KEY_VISUAL_GUIDE.md"
    echo "• Spaces setup: docs/SPACES_SETUP_GUIDE.md"
    exit 1
fi

# Provide helpful next steps
echo ""
echo "📚 Documentation:"
echo "• Checklist: docs/DIGITALOCEAN_SETUP_CHECKLIST.md"
echo "• Key Guide: docs/SPACES_KEY_VISUAL_GUIDE.md"
echo "• Full Guide: docs/DIGITALOCEAN_MIGRATION_GUIDE.md"