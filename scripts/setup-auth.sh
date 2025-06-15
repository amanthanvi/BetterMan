#!/bin/bash

# BetterMan Supabase Authentication Setup Script

set -e

echo "🔐 BetterMan Supabase Authentication Setup"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: Please run this script from the BetterMan root directory"
    exit 1
fi

# Check if .env exists in frontend
if [ ! -f "frontend/.env" ]; then
    echo "📝 Creating frontend/.env from template..."
    cp frontend/.env.example frontend/.env
    echo "✅ Created frontend/.env"
else
    echo "✅ frontend/.env already exists"
fi

echo ""
echo "📋 Your Supabase project is already configured with:"
echo "===================================================="
echo "Project URL: https://bhpmsekkidrdwjckifbr.supabase.co"
echo "Anon Key: Already set in .env"
echo ""

echo "📋 Next Steps:"
echo "=============="
echo ""
echo "1. Run Database Migrations:"
echo "   - Go to your Supabase SQL Editor"
echo "   - Run migrations from supabase/migrations/ folder"
echo ""
echo "2. Configure OAuth Providers (optional):"
echo "   - Go to Supabase Dashboard → Authentication → Providers"
echo "   - Enable and configure:"
echo "     • Google (requires Google Cloud Console setup)"
echo "     • GitHub (requires GitHub OAuth App)"
echo "     • GitLab (requires GitLab Application)"
echo "     • Apple (requires Apple Developer Account)"
echo ""
echo "3. Configure Authentication Settings:"
echo "   - Set Site URL in Authentication → Settings"
echo "   - Add redirect URLs for your domain"
echo "   - Customize email templates"
echo ""
echo "4. Start the application:"
echo "   docker-compose up -d"
echo ""
echo "📚 For detailed instructions, see:"
echo "   docs/SUPABASE_AUTH_SETUP.md"
echo ""

# Offer to open the Supabase dashboard
echo "🌐 Supabase Dashboard: https://app.supabase.com/project/bhpmsekkidrdwjckifbr"
echo ""
read -p "Would you like to open the Supabase dashboard now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v xdg-open &> /dev/null; then
        xdg-open "https://app.supabase.com/project/bhpmsekkidrdwjckifbr"
    elif command -v open &> /dev/null; then
        open "https://app.supabase.com/project/bhpmsekkidrdwjckifbr"
    else
        echo "Please open https://app.supabase.com/project/bhpmsekkidrdwjckifbr in your browser"
    fi
fi

echo ""
echo "🚀 Once you've configured OAuth providers (if desired), run:"
echo "   docker-compose up -d"
echo ""