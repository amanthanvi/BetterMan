#!/bin/bash

# Railway start script for BetterMan backend
echo "🚀 Starting BetterMan Backend..."

# Check if we're in the backend directory
if [ -d "backend" ]; then
    echo "📁 Found backend directory"
    cd backend
fi

# Check database connection
echo "🔍 Checking database connection..."
python -c "
import os
print(f\"DATABASE_URL: {os.environ.get('DATABASE_URL', 'Not set')[:50]}...\")
print(f\"ENVIRONMENT: {os.environ.get('ENVIRONMENT', 'Not set')}\")
"

# Start the application
echo "🚀 Starting FastAPI application..."
python -m uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}