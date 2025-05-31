#!/bin/bash
echo "Testing BetterMan Application..."
echo ""

# Check backend health
echo "Testing Backend API..."
BACKEND_RESPONSE=$(curl -s http://localhost:8000/health | jq -r '.status' 2>/dev/null)
if [ "$BACKEND_RESPONSE" == "ok" ]; then
    echo "✓ Backend is healthy"
else
    echo "✗ Backend is not responding correctly"
fi

# Test search API
echo ""
echo "Testing Search API..."
SEARCH_RESPONSE=$(curl -s "http://localhost:8000/api/search?q=ls" | jq -r '.results[0].id' 2>/dev/null)
if [ ! -z "$SEARCH_RESPONSE" ]; then
    echo "✓ Search API is working (found: $SEARCH_RESPONSE)"
else
    echo "✗ Search API is not working"
fi

# Check frontend
echo ""
echo "Testing Frontend..."
FRONTEND_RESPONSE=$(curl -s http://localhost:5173 | grep -c "BetterMan")
if [ "$FRONTEND_RESPONSE" -gt 0 ]; then
    echo "✓ Frontend HTML is serving"
else
    echo "✗ Frontend is not serving properly"
fi

echo ""
echo "Application URLs:"
echo "  Frontend: http://localhost:5173"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/api/docs"