#!/bin/bash

# BetterMan Diagnostic Script
# This script checks the current state of your project

echo "🔍 BetterMan Project Diagnostic"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 missing"
        return 1
    fi
}

# Function to check if directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1 exists"
        return 0
    else
        echo -e "${RED}✗${NC} $1 missing"
        return 1
    fi
}

# Function to check JSON validity
check_json() {
    if [ -f "$1" ]; then
        if python -m json.tool "$1" > /dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $1 is valid JSON"
            return 0
        else
            echo -e "${RED}✗${NC} $1 has invalid JSON"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠${NC} $1 not found"
        return 1
    fi
}

echo "📁 Project Structure Check:"
echo "---------------------------"
check_dir "app"
check_dir "components"
check_dir "lib"
check_dir "public"
check_dir "data"
check_dir ".next" && echo "  → Build output exists" || echo "  → No build output"
echo ""

echo "📄 Configuration Files:"
echo "----------------------"
check_file "package.json"
check_file "package-lock.json"
check_file "next.config.mjs" || check_file "next.config.js"
check_file "tailwind.config.js" || check_file "tailwind.config.ts"
check_file "tsconfig.json"
check_file "vercel.json"
echo ""

echo "🔧 Vercel Configuration:"
echo "-----------------------"
if [ -f "vercel.json" ]; then
    echo "Content of vercel.json:"
    cat vercel.json | python -m json.tool 2>/dev/null || cat vercel.json
else
    echo -e "${RED}No vercel.json found${NC}"
fi
echo ""

echo "📦 Package.json Scripts:"
echo "-----------------------"
if [ -f "package.json" ]; then
    echo "Available scripts:"
    node -e "const p=require('./package.json'); Object.keys(p.scripts||{}).forEach(s => console.log('  - npm run ' + s))"
else
    echo -e "${RED}No package.json found${NC}"
fi
echo ""

echo "🌐 Environment Variables:"
echo "------------------------"
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠${NC} .env file exists (should not be committed)"
fi
check_file ".env.local" && echo "  → Local environment configured" || echo "  → No local environment"
check_file ".env.production" && echo "  → Production environment configured" || echo "  → No production environment"
echo ""

echo "🚫 Potential Issues:"
echo "-------------------"
issues=0

# Check for legacy directories
if [ -d "frontend" ]; then
    echo -e "${RED}✗${NC} Legacy frontend/ directory exists"
    ((issues++))
fi

if [ -d "backend" ]; then
    echo -e "${RED}✗${NC} Legacy backend/ directory exists"
    ((issues++))
fi

# Check for Docker files
for file in Dockerfile docker-compose.yml docker-compose.yaml; do
    if [ -f "$file" ]; then
        echo -e "${YELLOW}⚠${NC} $file exists (not needed for Vercel)"
        ((issues++))
    fi
done

# Check for too many workflows
if [ -d ".github/workflows" ]; then
    workflow_count=$(ls -1 .github/workflows/*.yml 2>/dev/null | wc -l)
    if [ $workflow_count -gt 5 ]; then
        echo -e "${YELLOW}⚠${NC} Too many workflows ($workflow_count found, recommend 3-5)"
        ((issues++))
    fi
fi

if [ $issues -eq 0 ]; then
    echo -e "${GREEN}No major issues detected${NC}"
fi
echo ""

echo "🔨 Build Test:"
echo "-------------"
if command -v npm > /dev/null; then
    echo "Running build..."
    npm run build > /tmp/build.log 2>&1
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} Build successful"
        if [ -d ".next" ]; then
            echo "  → .next directory created"
            echo "  → Size: $(du -sh .next | cut -f1)"
        fi
    else
        echo -e "${RED}✗${NC} Build failed"
        echo "Last 10 lines of error:"
        tail -n 10 /tmp/build.log
        echo ""
        echo "Full log saved to /tmp/build.log"
    fi
else
    echo -e "${RED}npm not found${NC}"
fi
echo ""

echo "📊 Summary:"
echo "----------"
if [ $issues -eq 0 ] && [ -d ".next" ]; then
    echo -e "${GREEN}Project appears ready for deployment${NC}"
    echo ""
    echo "Deploy with: git push origin main"
else
    echo -e "${YELLOW}Project needs fixes before deployment${NC}"
    echo ""
    echo "Recommended actions:"
    echo "1. Run: ./emergency-fix.sh"
    echo "2. Fix any build errors"
    echo "3. Run: ./comprehensive-fix.sh"
fi
echo ""
echo "Diagnostic complete!"