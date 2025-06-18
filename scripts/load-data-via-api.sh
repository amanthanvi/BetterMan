#!/bin/bash

# Load JSON data via admin API endpoint
# Usage: ./load-data-via-api.sh <API_URL> <ADMIN_TOKEN>

API_URL="${1:-https://your-backend.vercel.app}"
ADMIN_TOKEN="${2}"

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Error: ADMIN_TOKEN is required"
    echo "Usage: $0 <API_URL> <ADMIN_TOKEN>"
    exit 1
fi

echo "Loading data to $API_URL..."

# Load JSON data
response=$(curl -s -X POST \
    "${API_URL}/api/admin/load-json-data" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json")

echo "Response: $response"

# Check stats
echo -e "\nChecking stats..."
stats=$(curl -s -X GET \
    "${API_URL}/api/admin/stats" \
    -H "X-Admin-Token: ${ADMIN_TOKEN}")

echo "Stats: $stats"