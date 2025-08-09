#!/bin/bash

# BetterMan Production Implementation Script
# This script sets up everything for production deployment on Railway

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     BetterMan Production Setup - Railway Deployment       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    if ! command -v git &> /dev/null; then
        echo "❌ Git not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js not installed"
        exit 1
    fi
    
    if ! command -v python3 &> /dev/null; then
        echo "❌ Python 3 not installed"
        exit 1
    fi
    
    echo "✅ All prerequisites met"
}

# Step 1: Restructure project
restructure_project() {
    echo ""
    echo "📁 Step 1: Restructuring project for Railway monorepo..."
    
    # Create new structure
    mkdir -p frontend backend shared scripts
    
    # Move Next.js files to frontend
    if [ -d "app" ]; then
        mv app frontend/ 2>/dev/null || true
    fi
    if [ -d "components" ]; then
        mv components frontend/ 2>/dev/null || true
    fi
    if [ -d "lib" ]; then
        mv lib frontend/ 2>/dev/null || true
    fi
    if [ -f "package.json" ]; then
        mv package*.json frontend/ 2>/dev/null || true
    fi
    if [ -f "next.config.mjs" ]; then
        mv next.config.* frontend/ 2>/dev/null || true
    fi
    if [ -f "tailwind.config.ts" ]; then
        mv tailwind.config.* frontend/ 2>/dev/null || true
    fi
    if [ -f "tsconfig.json" ]; then
        mv tsconfig.json frontend/ 2>/dev/null || true
    fi
    
    # Clean up old files
    rm -rf backend_old 2>/dev/null || true
    rm -f docker-compose*.yml Dockerfile* 2>/dev/null || true
    rm -f fly.toml render.yaml 2>/dev/null || true
    
    echo "✅ Project restructured"
}

# Step 2: Create FastAPI backend
create_backend() {
    echo ""
    echo "🔧 Step 2: Creating FastAPI backend..."
    
    # Create backend structure
    mkdir -p backend/app/{api,models,services,workers}
    
    # Create main.py
    cat > backend/app/main.py << 'EOF'
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from app.api import commands, search, health
from app.services.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown

app = FastAPI(
    title="BetterMan API",
    version="2.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://betterman.app", "https://www.betterman.app", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(commands.router, prefix="/api/commands", tags=["commands"])
app.include_router(search.router, prefix="/api/search", tags=["search"])

@app.get("/")
async def root():
    return {"name": "BetterMan API", "version": "2.0.0", "status": "operational"}
EOF

    # Create requirements.txt
    cat > backend/requirements.txt << 'EOF'
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
sqlalchemy==2.0.25
alembic==1.13.1
asyncpg==0.29.0
redis[hiredis]==5.0.1
orjson==3.9.10
python-multipart==0.0.6
EOF

    # Create __init__.py files
    touch backend/app/__init__.py
    touch backend/app/api/__init__.py
    touch backend/app/models/__init__.py
    touch backend/app/services/__init__.py
    touch backend/app/workers/__init__.py
    
    echo "✅ Backend created"
}

# Step 3: Create database models
create_models() {
    echo ""
    echo "📊 Step 3: Creating database models..."
    
    cat > backend/app/models/man_page.py << 'EOF'
from sqlalchemy import Column, Integer, String, Text, JSON, ARRAY, DateTime, Index
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func

Base = declarative_base()

class ManPage(Base):
    __tablename__ = "man_pages"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    section = Column(Integer, nullable=False, index=True)
    title = Column(Text)
    description = Column(Text)
    synopsis = Column(Text)
    content = Column(JSON)
    search_vector = Column(TSVECTOR)
    category = Column(String(100), index=True)
    related_commands = Column(ARRAY(String))
    metadata = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    __table_args__ = (
        Index('idx_name_section', 'name', 'section', unique=True),
        Index('idx_search_vector', 'search_vector', postgresql_using='gin'),
        Index('idx_category', 'category'),
    )
EOF
    
    echo "✅ Models created"
}

# Step 4: Create Railway configuration
create_railway_config() {
    echo ""
    echo "🚂 Step 4: Creating Railway configuration..."
    
    # Create railway.toml
    cat > railway.toml << 'EOF'
[build]
builder = "nixpacks"

[deploy]
numReplicas = 1
restartPolicyType = "on-failure"

[[services]]
name = "frontend"
buildCommand = "cd frontend && npm ci && npm run build"
startCommand = "cd frontend && npm start"
healthcheckPath = "/"
port = 3000

[[services]]
name = "backend"
buildCommand = "cd backend && pip install -r requirements.txt"
startCommand = "cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT"
healthcheckPath = "/health"
port = 8000
EOF
    
    echo "✅ Railway configuration created"
}

# Step 5: Create extraction script
create_extraction_script() {
    echo ""
    echo "📦 Step 5: Creating man page extraction script..."
    
    cat > scripts/extract_man_pages.py << 'EOF'
#!/usr/bin/env python3
"""Extract man pages from Ubuntu system"""

import subprocess
import json
import re
from pathlib import Path

def extract_all_man_pages():
    """Extract all available man pages"""
    
    # Get list of all man pages
    result = subprocess.run(['apropos', '.'], capture_output=True, text=True)
    man_pages = []
    
    for line in result.stdout.split('\n'):
        if line:
            match = re.match(r'^(\S+)\s*\((\d)\)', line)
            if match:
                man_pages.append((match.group(1), match.group(2)))
    
    print(f"Found {len(man_pages)} man pages")
    
    extracted = []
    for name, section in man_pages[:100]:  # Limit for testing
        try:
            # Get man page content
            result = subprocess.run(
                ['man', section, name],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                extracted.append({
                    'name': name,
                    'section': int(section),
                    'content': result.stdout
                })
                print(f"✓ {name}({section})")
        except Exception as e:
            print(f"✗ {name}({section}): {e}")
    
    # Save to JSON
    output_dir = Path('data')
    output_dir.mkdir(exist_ok=True)
    
    with open(output_dir / 'man_pages.json', 'w') as f:
        json.dump(extracted, f, indent=2)
    
    print(f"\n✅ Extracted {len(extracted)} man pages")

if __name__ == "__main__":
    extract_all_man_pages()
EOF
    
    chmod +x scripts/extract_man_pages.py
    echo "✅ Extraction script created"
}

# Step 6: Create GitHub Action
create_github_action() {
    echo ""
    echo "🤖 Step 6: Creating GitHub Action for extraction..."
    
    mkdir -p .github/workflows
    
    cat > .github/workflows/extract-and-deploy.yml << 'EOF'
name: Extract and Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  extract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install man pages
        run: |
          sudo apt-get update
          sudo apt-get install -y man-db manpages manpages-dev
      
      - name: Extract man pages
        run: python3 scripts/extract_man_pages.py
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: man-pages
          path: data/
  
  deploy:
    needs: extract
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Download man pages
        uses: actions/download-artifact@v3
        with:
          name: man-pages
          path: data/
      
      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway up
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
EOF
    
    echo "✅ GitHub Action created"
}

# Step 7: Update frontend configuration
update_frontend() {
    echo ""
    echo "🎨 Step 7: Updating frontend configuration..."
    
    cd frontend
    
    # Update package.json scripts if needed
    if [ -f "package.json" ]; then
        npm pkg set scripts.build="next build"
        npm pkg set scripts.start="next start"
        npm pkg set scripts.dev="next dev"
    fi
    
    # Create next.config.js if missing
    if [ ! -f "next.config.mjs" ] && [ ! -f "next.config.js" ]; then
        cat > next.config.mjs << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    optimizeCss: true,
  },
}

export default nextConfig
EOF
    fi
    
    cd ..
    echo "✅ Frontend updated"
}

# Step 8: Initialize git and commit
initialize_git() {
    echo ""
    echo "📝 Step 8: Committing changes..."
    
    # Create .gitignore
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
.nyc_output

# Next.js
.next/
out/

# Production
build/
dist/

# Python
__pycache__/
*.py[cod]
*$py.class
.Python
venv/
env/
.venv

# Environment
.env
.env.local
.env.production

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Database
*.db
*.sqlite
data/
EOF
    
    git add .
    git commit -m "Restructure for Railway production deployment" || true
    
    echo "✅ Changes committed"
}

# Main execution
main() {
    check_prerequisites
    restructure_project
    create_backend
    create_models
    create_railway_config
    create_extraction_script
    create_github_action
    update_frontend
    initialize_git
    
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                 ✅ Setup Complete!                        ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📋 Next Steps:"
    echo ""
    echo "1. Sign up for Railway: https://railway.app"
    echo ""
    echo "2. Install Railway CLI:"
    echo "   npm install -g @railway/cli"
    echo ""
    echo "3. Login to Railway:"
    echo "   railway login"
    echo ""
    echo "4. Initialize project:"
    echo "   railway init"
    echo ""
    echo "5. Deploy:"
    echo "   railway up"
    echo ""
    echo "6. Add GitHub secret:"
    echo "   Get token from Railway dashboard → Settings → Tokens"
    echo "   Add as RAILWAY_TOKEN in GitHub repo settings → Secrets"
    echo ""
    echo "7. Push to GitHub:"
    echo "   git push origin main"
    echo ""
    echo "📚 Documentation:"
    echo "   Railway: https://docs.railway.app"
    echo "   FastAPI: https://fastapi.tiangolo.com"
    echo "   Next.js: https://nextjs.org/docs"
    echo ""
    echo "🎯 Your app will be live at:"
    echo "   Frontend: https://betterman.app"
    echo "   Backend: https://betterman-backend.up.railway.app"
    echo ""
}

# Run main function
main