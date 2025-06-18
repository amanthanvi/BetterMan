#!/bin/bash

# Setup GitHub Secrets for BetterMan CI/CD
# This script helps you configure the necessary secrets

echo "🔐 BetterMan GitHub Secrets Setup"
echo "================================="
echo ""
echo "You need to add the following secrets to your GitHub repository:"
echo ""
echo "1. Go to: https://github.com/amanthanvi/BetterMan/settings/secrets/actions"
echo ""
echo "2. Add these secrets:"
echo ""
echo "   ADMIN_TOKEN"
echo "   - Description: Token for admin API endpoints"
echo "   - Generate with: python3 scripts/generate-admin-token.py"
echo "   - Example: UyFFDqk5T_S9Wx2k8BFyOTkp5K3EwKVcD0yLo3KHEC4"
echo ""
echo "   VERCEL_API_URL (optional)"
echo "   - Description: Your Vercel backend URL"
echo "   - Example: https://betterman-api.vercel.app"
echo "   - Note: If not set, will use default production URL"
echo ""
echo "3. The same ADMIN_TOKEN must be set in Vercel:"
echo "   - Go to: https://vercel.com/[username]/betterman/settings/environment-variables"
echo "   - Add ADMIN_TOKEN with the same value"
echo ""
echo "4. Optional: For automated deployments, you can also add:"
echo "   VERCEL_TOKEN"
echo "   - Get from: https://vercel.com/account/tokens"
echo "   - Used for: Programmatic deployments"
echo ""

# Generate a token if requested
read -p "Would you like to generate a new admin token now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    python3 scripts/generate-admin-token.py
fi