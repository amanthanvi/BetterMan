#!/bin/bash

# Railway Backend Deployment Script for BetterMan
# This script helps deploy the backend with PostgreSQL to Railway

echo "🚀 Railway Backend Deployment Script for BetterMan"
echo "================================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm install -g @railway/cli"
    exit 1
fi

# Function to check environment variables
check_env_vars() {
    echo "📋 Checking Railway environment variables..."
    
    REQUIRED_VARS=(
        "DATABASE_URL"
        "REDIS_URL"
        "CORS_ORIGINS"
        "SECRET_KEY"
        "ENVIRONMENT"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if railway variables get "$var" &> /dev/null; then
            echo "✅ $var is set"
        else
            echo "❌ $var is not set"
        fi
    done
}

# Function to run database migrations
run_migrations() {
    echo "🗄️ Running database migrations..."
    
    # Export Railway environment variables
    eval $(railway variables export)
    
    # Run Alembic migrations
    cd backend
    python -m alembic upgrade head
    
    if [ $? -eq 0 ]; then
        echo "✅ Migrations completed successfully"
    else
        echo "❌ Migration failed"
        exit 1
    fi
    cd ..
}

# Function to initialize database
init_database() {
    echo "🗄️ Initializing database with sample data..."
    
    # Export Railway environment variables
    eval $(railway variables export)
    
    # Run database initialization
    cd backend
    python -m src.db.init_postgres
    
    if [ $? -eq 0 ]; then
        echo "✅ Database initialized successfully"
    else
        echo "❌ Database initialization failed"
        exit 1
    fi
    cd ..
}

# Main deployment process
main() {
    echo ""
    echo "1️⃣ Checking environment..."
    check_env_vars
    
    echo ""
    echo "2️⃣ Select deployment action:"
    echo "   1) Deploy backend service only"
    echo "   2) Run database migrations"
    echo "   3) Initialize database with sample data"
    echo "   4) Full deployment (deploy + migrate + init)"
    echo "   5) Check deployment status"
    
    read -p "Enter your choice (1-5): " choice
    
    case $choice in
        1)
            echo "📦 Deploying backend service..."
            railway up --service backend
            ;;
        2)
            run_migrations
            ;;
        3)
            init_database
            ;;
        4)
            echo "📦 Full deployment starting..."
            railway up --service backend
            sleep 10  # Wait for deployment
            run_migrations
            init_database
            echo "✅ Full deployment completed!"
            ;;
        5)
            echo "📊 Checking deployment status..."
            railway status
            echo ""
            echo "🔍 Recent logs:"
            railway logs --service backend --lines 20
            ;;
        *)
            echo "Invalid choice"
            exit 1
            ;;
    esac
}

# Run main function
main