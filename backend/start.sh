#!/bin/bash

# Check if this is the extractor service
if [ "$SERVICE_TYPE" = "extractor" ] || [ "$RUN_EXTRACTOR" = "true" ]; then
    echo "🔍 Starting Man Page Extractor..."
    echo "Database URL: ${DATABASE_URL:0:50}..."
    
    # Install man page packages if needed
    if [ "$INSTALL_PACKAGES" = "true" ]; then
        echo "Installing man page packages..."
        # Create apt directories if they don't exist
        mkdir -p /var/lib/apt/lists/partial
        apt-get update -qq && apt-get install -y -qq man-db manpages manpages-dev || true
    fi
    
    # Run the extractor
    exec python app/workers/railway_extractor.py
else
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
fi