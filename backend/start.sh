#!/bin/sh
# Backend startup script

# Use PORT environment variable or default to 8000
PORT=${PORT:-8000}

echo "Starting FastAPI server on port $PORT..."

# Start uvicorn
exec uvicorn src.main:app --host 0.0.0.0 --port $PORT