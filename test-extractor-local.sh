#!/bin/bash
# Test the extractor Docker image locally

echo "=== Testing Man Page Extractor Locally ==="
echo ""

# Build the Docker image
echo "Building Docker image..."
docker build -f backend/Dockerfile.extractor -t betterman-extractor . || {
    echo "❌ Docker build failed"
    exit 1
}

echo ""
echo "=== Testing man page availability in container ==="
echo ""

# Test that common commands have man pages
echo "Checking individual commands:"
docker run --rm betterman-extractor bash -c '
    for cmd in ls grep curl git tar ps cat mkdir cp mv rm find sed awk; do
        if man -w "$cmd" >/dev/null 2>&1; then
            echo "✓ $cmd: $(man -w $cmd)"
        else
            echo "✗ $cmd: NOT FOUND"
        fi
    done
'

echo ""
echo "=== Man page statistics ==="
docker run --rm betterman-extractor bash -c '
    total=$(find /usr/share/man -type f -name "*.gz" | wc -l)
    echo "Total man pages: $total"
    
    if [ $total -lt 1000 ]; then
        echo "⚠️  WARNING: Only $total man pages found (expected 1500+)"
    else
        echo "✅ SUCCESS: Found $total man pages!"
    fi
    
    echo ""
    echo "Breakdown by section:"
    for i in 1 2 3 4 5 6 7 8; do
        count=$(find /usr/share/man/man$i -type f -name "*.gz" 2>/dev/null | wc -l || echo 0)
        [ $count -gt 0 ] && echo "  Section $i: $count pages"
    done
'

echo ""
echo "=== Sample man page content test ==="
docker run --rm betterman-extractor bash -c '
    echo "Testing ls man page content:"
    if man ls | head -20 | grep -q "list directory contents"; then
        echo "✅ ls man page content is readable"
    else
        echo "❌ ls man page content issue"
    fi
'

echo ""
echo "=== Python extractor verification test ==="
docker run --rm betterman-extractor python3 -c "
import subprocess
import sys

commands = ['ls', 'grep', 'curl', 'git', 'tar']
missing = []

for cmd in commands:
    result = subprocess.run(['man', '-w', cmd], capture_output=True)
    if result.returncode != 0:
        missing.append(cmd)
        
if missing:
    print(f'❌ Python check failed. Missing: {missing}')
    sys.exit(1)
else:
    print('✅ Python can access all test commands')
"

echo ""
echo "=== Test complete ==="
echo ""
echo "If all checks passed, the extractor should work on Railway!"
echo "Deploy with: git add -A && git commit -m 'Fix man page extraction' && git push"