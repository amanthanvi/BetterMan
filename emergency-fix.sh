#!/bin/bash

# BetterMan Emergency Fix Script
# This script fixes immediate deployment issues

echo "🚑 Starting BetterMan Emergency Fix..."

# 1. Fix vercel.json
echo "📝 Updating vercel.json..."
cat > vercel.json << 'EOF'
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "installCommand": "npm install",
  "regions": ["iad1"],
  "functions": {
    "app/api/search/route.ts": {
      "maxDuration": 10
    },
    "app/api/search/suggestions/route.ts": {
      "maxDuration": 10
    }
  }
}
EOF

# 2. Create/update package.json scripts
echo "📦 Updating package.json scripts..."
npm pkg set scripts.build="next build"
npm pkg set scripts.dev="next dev"
npm pkg set scripts.start="next start"
npm pkg set scripts.lint="next lint"

# 3. Ensure proper Next.js configuration
echo "⚙️ Creating next.config.mjs if missing..."
if [ ! -f next.config.mjs ]; then
cat > next.config.mjs << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizeCss: true,
  },
  images: {
    domains: ['localhost', 'betterman.sh', 'www.betterman.sh'],
  },
}

export default nextConfig
EOF
fi

# 4. Create .vercelignore to exclude unnecessary files
echo "🚫 Creating .vercelignore..."
cat > .vercelignore << 'EOF'
# Ignore old backend/frontend folders from previous architecture
backend/
frontend/
nginx/
monitoring/

# Ignore docker and deployment configs for other platforms
docker-compose*.yml
Dockerfile*
fly.toml
railway.json
render.yaml

# Ignore scripts and Python files
scripts/*.sh
scripts/*.py
venv/
__pycache__/
*.pyc

# Ignore test results and reports
test-results/
playwright-report/
coverage/

# Keep all app/ components/ lib/ and other Next.js files
EOF

# 5. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 6. Create stub data if missing
echo "📊 Ensuring data directory exists..."
mkdir -p data/man-pages
if [ ! -f data/man-pages/index.json ]; then
  echo '[]' > data/man-pages/index.json
fi

# 7. Build the project
echo "🔨 Building the project..."
npm run build

# 8. Verify build output
if [ -d ".next" ]; then
  echo "✅ Build successful! .next directory created."
else
  echo "❌ Build failed! Check the error messages above."
  exit 1
fi

echo "
✨ Emergency fix complete!

Next steps:
1. Commit these changes: git add . && git commit -m 'Emergency fix for Vercel deployment'
2. Push to main: git push origin main
3. Check Vercel dashboard for deployment status
4. If deployment succeeds, run the comprehensive fix next

Note: This is a temporary fix to get the site working.
Run the comprehensive fix script after deployment succeeds.
"