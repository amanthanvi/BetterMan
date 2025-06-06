#!/bin/bash
# Prepare BetterMan for production deployment

echo "Preparing BetterMan for production deployment..."

# Remove Python cache files
echo "Cleaning Python cache..."
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find . -type f -name "*.pyc" -delete 2>/dev/null || true
find . -type f -name "*.pyo" -delete 2>/dev/null || true
find . -type f -name ".DS_Store" -delete 2>/dev/null || true

# Remove development scripts
echo "Removing development scripts..."
rm -f backend/generate_manpages_standalone.py
rm -f backend/generate_manpages.py
rm -f backend/add_generated_manpages.py
rm -f backend/fix_broken_documents.py
rm -f backend/fix_groff_formatting.py
rm -f backend/load_generated_manpages.py
rm -f backend/test_loader.py
rm -f backend/load_via_docker.sh
rm -f backend/run_loader.sh
rm -f cleanup_dev_files.sh
rm -f test-app.sh

# Remove test HTML files
echo "Removing test files..."
rm -f frontend/test-*.html

# Remove log files
echo "Removing log files..."
find . -name "*.log" -delete 2>/dev/null || true

# Remove node_modules if rebuilding
echo "Note: Run 'cd frontend && npm ci --production' to install production dependencies"

# Create production environment file if not exists
if [ ! -f .env.production ]; then
    echo "Creating .env.production from example..."
    cp .env.production.example .env.production
    echo "IMPORTANT: Edit .env.production with your production values!"
fi

# Set proper permissions
echo "Setting proper file permissions..."
chmod +x scripts/*.sh
chmod 644 .env.production.example

# Verify docker files are present
echo "Verifying Docker configuration..."
required_files=(
    "docker-compose.production.yml"
    "nginx/nginx.conf"
    "backend/Dockerfile.production"
    "frontend/Dockerfile.production"
)

missing_files=()
for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -eq 0 ]; then
    echo "✓ All required Docker files present"
else
    echo "⚠ Missing files:"
    printf '%s\n' "${missing_files[@]}"
fi

# Generate secrets if needed
echo ""
echo "Generate production secrets with:"
echo "  openssl rand -hex 32  # For SECRET_KEY"
echo "  openssl rand -hex 32  # For JWT_SECRET_KEY"

echo ""
echo "Production preparation complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env.production with your production values"
echo "2. Set up SSL certificates (see DEPLOYMENT_GUIDE.md)"
echo "3. Run: docker-compose -f docker-compose.production.yml up -d"