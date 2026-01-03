#!/bin/bash
# Deploy script for the dedicated manpage extraction service

echo "=== Deploying Manpage Extraction Service to Railway ==="
echo ""
echo "This script will deploy a dedicated Ubuntu 24.04 container"
echo "with full man page support for extracting Linux command documentation."
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Error: Railway CLI is not installed"
    echo "Install it from: https://docs.railway.app/develop/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "Error: Not logged in to Railway"
    echo "Run: railway login"
    exit 1
fi

echo "Current Railway project status:"
railway status

echo ""
echo "To deploy the manpage service:"
echo ""
echo "1. In Railway Dashboard:"
echo "   - Click 'New Service' > 'GitHub Repo'"
echo "   - Select your BetterMan repository"
echo "   - Set the root directory to: /backend"
echo "   - Set the Dockerfile path to: Dockerfile.manpage"
echo ""
echo "2. Configure environment variables:"
echo "   - DATABASE_URL (copy from your Postgres service)"
echo "   - REDIS_URL (optional, copy from Redis service)"
echo "   - EXTRACTION_MODE=full"
echo ""
echo "3. Set the cron schedule:"
echo "   - Go to Settings > Cron"
echo "   - Set schedule: '0 3 * * *' (daily at 3 AM UTC)"
echo ""
echo "4. Or use Railway CLI:"
echo "   railway add"
echo "   # Select 'Empty Service'"
echo "   # Name it: manpage-extractor"
echo ""
echo "Then deploy with:"
echo "   cd backend"
echo "   railway up --service manpage-extractor"
echo ""

# Create a test script to verify man pages locally
cat > test-manpages-local.sh << 'EOF'
#!/bin/bash
# Test the manpage extraction locally

echo "Building the manpage Docker image..."
docker build -f backend/Dockerfile.manpage -t betterman-manpage backend/

echo "Testing man page availability..."
docker run --rm betterman-manpage bash -c "
    echo 'Testing common commands:'
    for cmd in ls grep curl git tar ps cat echo mkdir cp mv rm find sed awk; do
        if man -w \$cmd >/dev/null 2>&1; then
            echo '✓ '\$cmd
        else
            echo '✗ '\$cmd' not found'
        fi
    done
    echo ''
    echo 'Total man pages available:'
    find /usr/share/man -name '*.gz' | wc -l
"
EOF

chmod +x test-manpages-local.sh

echo "Created test-manpages-local.sh to test the container locally"
echo ""
echo "Run ./test-manpages-local.sh to verify man pages work before deploying"