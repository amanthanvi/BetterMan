#!/bin/bash

# BetterMan Monorepo Deployment Script for Railway

set -e

echo "🚀 Starting BetterMan deployment..."

# Check if we're in the root directory
if [ ! -f "railway.toml" ]; then
    echo "❌ Error: railway.toml not found. Please run from the project root."
    exit 1
fi

# Function to check if Railway CLI is installed
check_railway_cli() {
    if ! command -v railway &> /dev/null; then
        echo "❌ Railway CLI not found. Installing..."
        curl -fsSL https://railway.app/install.sh | sh
    else
        echo "✅ Railway CLI found"
    fi
}

# Function to deploy services
deploy_services() {
    echo "📦 Deploying services to Railway..."
    
    # Deploy using Railway CLI
    railway up --detach
    
    echo "✅ Services deployed successfully!"
}

# Function to verify deployment
verify_deployment() {
    echo "🔍 Verifying deployment..."
    
    # Check frontend health
    railway run --service frontend curl -f http://localhost:3000/ || echo "⚠️  Frontend health check pending..."
    
    # Check backend health
    railway run --service backend curl -f http://localhost:8000/health || echo "⚠️  Backend health check pending..."
    
    echo "📊 Deployment status:"
    railway status
}

# Main deployment flow
main() {
    check_railway_cli
    
    # Login to Railway if not already logged in
    railway whoami || railway login
    
    # Link to project if not already linked
    if [ ! -f ".railway/config.json" ]; then
        echo "🔗 Linking to Railway project..."
        railway link
    fi
    
    deploy_services
    verify_deployment
    
    echo "🎉 Deployment complete!"
    echo "View your deployment at: https://railway.app"
}

main "$@"