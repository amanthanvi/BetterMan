#!/bin/bash

# Backend startup script with debugging
echo "🚀 Starting BetterMan Backend..."
echo "Current directory: $(pwd)"
echo "Directory contents:"
ls -la

# Check environment
echo "Environment variables:"
echo "DATABASE_URL: ${DATABASE_URL:0:50}..."
echo "ENVIRONMENT: $ENVIRONMENT"
echo "PORT: $PORT"

# Check Python and installed packages
echo "Python version:"
python --version
echo "Installed packages (psycopg):"
pip list | grep psycopg || echo "psycopg not found"

# Start the application
echo "Starting FastAPI application..."
exec python start.py