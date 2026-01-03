#!/bin/bash

# Test script for BetterMan API endpoints
# Usage: ./test_api_endpoints.sh [backend_url]

# Backend URL (default to Railway production URL)
BACKEND_URL="${1:-https://backend-production-df7c.up.railway.app}"
API_URL="${BACKEND_URL}/api"

echo "🔍 Testing BetterMan API Endpoints"
echo "=================================="
echo "Backend URL: $BACKEND_URL"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local endpoint="$1"
    local description="$2"
    local expected_status="${3:-200}"
    
    echo -n "Testing $description... "
    
    response=$(curl -s -w "\n%{http_code}" "$endpoint" 2>/dev/null)
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
        if [ ! -z "$body" ]; then
            # Show first 100 chars of response
            preview=$(echo "$body" | head -c 100)
            echo "  Response preview: $preview..."
        fi
        return 0
    else
        echo -e "${RED}✗${NC} (HTTP $http_code, expected $expected_status)"
        if [ ! -z "$body" ]; then
            error=$(echo "$body" | head -c 200)
            echo "  Error: $error"
        fi
        return 1
    fi
}

# Function to test man page endpoint
test_man_page() {
    local command="$1"
    local section="${2:-1}"
    
    endpoint="${API_URL}/man/commands/${command}/${section}"
    test_endpoint "$endpoint" "man page for ${command}(${section})"
    
    # Also check if content is actually there
    if [ $? -eq 0 ]; then
        response=$(curl -s "$endpoint" 2>/dev/null)
        if echo "$response" | grep -q "\"name\":\"${command}\""; then
            echo -e "  ${GREEN}Content verified${NC}"
        else
            echo -e "  ${YELLOW}Warning: Response doesn't contain expected content${NC}"
        fi
    fi
}

echo "1. Testing Health Check"
echo "-----------------------"
test_endpoint "${API_URL}/health" "Health check"
echo ""

echo "2. Testing Man Page Stats"
echo "-------------------------"
test_endpoint "${API_URL}/man/stats" "Man page statistics"
stats_response=$(curl -s "${API_URL}/man/stats" 2>/dev/null)
if [ ! -z "$stats_response" ]; then
    total=$(echo "$stats_response" | grep -o '"total_pages":[0-9]*' | grep -o '[0-9]*')
    if [ ! -z "$total" ]; then
        echo -e "  ${GREEN}Total man pages in database: $total${NC}"
    fi
fi
echo ""

echo "3. Testing Individual Man Pages"
echo "-------------------------------"
# Test common commands
commands=("ls" "grep" "curl" "git" "tar" "ps" "cat" "mkdir" "cp" "mv" "rm" "find" "sed" "awk" "docker" "man")

success_count=0
fail_count=0

for cmd in "${commands[@]}"; do
    test_man_page "$cmd" "1"
    if [ $? -eq 0 ]; then
        ((success_count++))
    else
        ((fail_count++))
    fi
done

echo ""
echo "4. Testing List Endpoints"
echo "-------------------------"
test_endpoint "${API_URL}/man/commands" "List all commands (paginated)"
test_endpoint "${API_URL}/man/commands?limit=5" "List 5 commands"
test_endpoint "${API_URL}/man/categories" "List all categories"
test_endpoint "${API_URL}/man/commands?category=file-operations" "List file operation commands"
echo ""

echo "5. Testing Search Endpoints"
echo "---------------------------"
test_endpoint "${API_URL}/search?q=grep" "Search for 'grep'"
test_endpoint "${API_URL}/search/enhanced" "Enhanced search" "405"  # POST endpoint, should fail with GET
test_endpoint "${API_URL}/search/autocomplete?q=git" "Autocomplete for 'git'"
test_endpoint "${API_URL}/search/similar/grep" "Similar commands to 'grep'"

# Test enhanced search with POST
echo -n "Testing enhanced search (POST)... "
response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/search/enhanced" \
    -H "Content-Type: application/json" \
    -d '{"query":"ls","limit":5,"fuzzy":true}' 2>/dev/null)
http_code=$(echo "$response" | tail -n 1)
if [ "$http_code" = "200" ]; then
    echo -e "${GREEN}✓${NC} (HTTP $http_code)"
else
    echo -e "${RED}✗${NC} (HTTP $http_code)"
fi
echo ""

echo "6. Testing Database Connectivity"
echo "--------------------------------"
# Try to get a few random man pages to verify DB is working
test_endpoint "${API_URL}/man/random" "Random man page" "200"
echo ""

echo "=================================="
echo "Summary:"
echo "  Man pages tested: $((success_count + fail_count))"
echo -e "  ${GREEN}Successful: $success_count${NC}"
if [ $fail_count -gt 0 ]; then
    echo -e "  ${RED}Failed: $fail_count${NC}"
else
    echo -e "  Failed: 0"
fi

if [ $success_count -gt 10 ]; then
    echo -e "\n${GREEN}✓ API is working! Man pages are accessible.${NC}"
else
    echo -e "\n${YELLOW}⚠ Some issues detected. Check the backend logs.${NC}"
fi

# Test specific sections
echo ""
echo "7. Testing Different Sections"
echo "-----------------------------"
test_man_page "printf" "1"  # User command
test_man_page "printf" "3"  # Library function
test_man_page "passwd" "5"  # File format

echo ""
echo "Test complete!"