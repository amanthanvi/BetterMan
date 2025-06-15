#!/bin/bash

echo "🚀 BetterMan Deployment Script"
echo "=============================="

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local not found!"
    echo "Please create .env.local with your Supabase credentials"
    exit 1
fi

# Parse man pages
echo "📄 Parsing man pages..."
npm run parse-man-pages

# Build search index
echo "🔍 Building search index..."
npm run build-search-index

# Run type checking
echo "✅ Type checking..."
npx tsc --noEmit

# Run linting
echo "🧹 Linting..."
npm run lint

# Build the project
echo "🏗️  Building for production..."
npm run build

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
if command -v vercel &> /dev/null; then
    vercel --prod
else
    echo "⚠️  Vercel CLI not found. Please install it:"
    echo "npm i -g vercel"
    echo ""
    echo "Or deploy via GitHub integration at https://vercel.com"
fi

echo "✨ Deployment complete!"