#!/bin/bash

echo "🚀 BetterMan Production Setup for DigitalOcean"
echo "============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if doctl is installed
if ! command -v doctl &>/dev/null; then
  echo -e "${RED}❌ doctl CLI not found${NC}"
  echo "Please install it first:"
  echo "   brew install doctl  (macOS)"
  echo "   or visit: https://docs.digitalocean.com/reference/doctl/how-to/install/"
  exit 1
fi

# Check authentication
echo "🔑 Checking DigitalOcean authentication..."
if ! doctl auth list &>/dev/null; then
  echo -e "${RED}❌ Not authenticated${NC}"
  echo "Please run: doctl auth init"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated${NC}"
echo ""

# Production setup choices
echo -e "${BLUE}📋 Production Setup Options:${NC}"
echo "1. Basic ($12/month) - SQLite with daily backups"
echo "2. Standard ($27/month) - Managed PostgreSQL"
echo "3. Premium ($47/month) - PostgreSQL + Redis cache"
echo ""
read -p "Select option (1-3): " SETUP_OPTION

case $SETUP_OPTION in
  1)
    SETUP_TYPE="basic"
    echo -e "${GREEN}✓ Basic setup selected${NC}"
    ;;
  2)
    SETUP_TYPE="standard"
    echo -e "${GREEN}✓ Standard setup selected${NC}"
    ;;
  3)
    SETUP_TYPE="premium"
    echo -e "${GREEN}✓ Premium setup selected${NC}"
    ;;
  *)
    echo -e "${RED}Invalid option${NC}"
    exit 1
    ;;
esac

# Variables
SPACES_REGION="nyc3"
BUCKET_NAME="betterman-prod"
APP_NAME="betterman-prod"

# Create Spaces bucket
echo ""
echo "📦 Setting up Spaces for backups..."
echo ""
echo -e "${YELLOW}Please create a Spaces bucket:${NC}"
echo "1. Go to: https://cloud.digitalocean.com/spaces"
echo "2. Click 'Create a Space'"
echo "3. Name: ${BUCKET_NAME}"
echo "4. Region: ${SPACES_REGION}"
echo "5. File Listing: Restrict (private)"
echo ""
read -p "Have you created the Spaces bucket? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Please create the bucket first, then run this script again.${NC}"
  exit 1
fi

# Get Spaces access keys
echo ""
echo "🔑 Setting up Spaces access keys..."
echo ""
echo "Create Spaces access keys at:"
echo "https://cloud.digitalocean.com/account/api/spaces"
echo ""
read -p "Enter Spaces Access Key (starts with DO): " SPACES_ACCESS_KEY
read -sp "Enter Spaces Secret Key: " SPACES_SECRET_KEY
echo ""

# Generate tokens
ADMIN_TOKEN=$(openssl rand -hex 32)
SECRET_KEY=$(openssl rand -hex 32)
echo ""
echo "🔐 Generated tokens:"
echo "Admin Token: ${ADMIN_TOKEN}"
echo "Secret Key: ${SECRET_KEY}"
echo -e "${YELLOW}⚠️  Save these tokens - you'll need them!${NC}"

# Create database if standard or premium
if [ "$SETUP_TYPE" != "basic" ]; then
  echo ""
  echo "🗄️  Creating managed PostgreSQL database..."
  
  DB_CLUSTER_NAME="betterman-db"
  DB_SIZE="db-s-1vcpu-1gb"  # $15/month
  
  # Create database cluster
  DB_ID=$(doctl databases create $DB_CLUSTER_NAME \
    --engine pg \
    --num-nodes 1 \
    --region nyc3 \
    --size $DB_SIZE \
    --version 16 \
    --output json | jq -r '.[0].id')
  
  if [ -z "$DB_ID" ]; then
    echo -e "${RED}❌ Failed to create database${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ Database created with ID: $DB_ID${NC}"
  
  # Wait for database to be ready
  echo "⏳ Waiting for database to be ready (this may take 5-10 minutes)..."
  while true; do
    STATUS=$(doctl databases get $DB_ID --output json | jq -r '.[0].status')
    if [ "$STATUS" = "online" ]; then
      break
    fi
    echo -n "."
    sleep 30
  done
  echo ""
  echo -e "${GREEN}✅ Database is ready${NC}"
  
  # Get connection details
  DB_URI=$(doctl databases connection $DB_ID --output json | jq -r '.uri')
  DB_HOST=$(doctl databases connection $DB_ID --output json | jq -r '.host')
  DB_PORT=$(doctl databases connection $DB_ID --output json | jq -r '.port')
  DB_NAME=$(doctl databases connection $DB_ID --output json | jq -r '.database')
  DB_USER=$(doctl databases connection $DB_ID --output json | jq -r '.user')
  DB_PASSWORD=$(doctl databases connection $DB_ID --output json | jq -r '.password')
fi

# Create Redis if premium
if [ "$SETUP_TYPE" = "premium" ]; then
  echo ""
  echo "🚀 Creating managed Redis..."
  
  REDIS_CLUSTER_NAME="betterman-redis"
  REDIS_SIZE="db-s-1vcpu-1gb"  # $15/month
  
  REDIS_ID=$(doctl databases create $REDIS_CLUSTER_NAME \
    --engine redis \
    --num-nodes 1 \
    --region nyc3 \
    --size $REDIS_SIZE \
    --version 7 \
    --output json | jq -r '.[0].id')
  
  if [ -z "$REDIS_ID" ]; then
    echo -e "${RED}❌ Failed to create Redis${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ Redis created with ID: $REDIS_ID${NC}"
  
  # Wait for Redis
  echo "⏳ Waiting for Redis to be ready..."
  while true; do
    STATUS=$(doctl databases get $REDIS_ID --output json | jq -r '.[0].status')
    if [ "$STATUS" = "online" ]; then
      break
    fi
    echo -n "."
    sleep 30
  done
  echo ""
  
  # Get Redis connection
  REDIS_URI=$(doctl databases connection $REDIS_ID --output json | jq -r '.uri')
fi

# Create App Platform app
echo ""
echo "🚀 Creating App Platform app..."

# Create app spec based on setup type
if [ "$SETUP_TYPE" = "basic" ]; then
  # Basic setup with SQLite
  cat >/tmp/betterman-app.yaml <<EOF
name: $APP_NAME
region: nyc

services:
  - name: api
    github:
      repo: amanthanvi/BetterMan
      branch: main
      deploy_on_push: true
    source_dir: backend
    dockerfile_path: backend/Dockerfile.production
    
    envs:
      - key: DATABASE_URL
        value: "sqlite:///data/betterman.db"
      - key: SECRET_KEY
        value: "$SECRET_KEY"
      - key: ADMIN_TOKEN
        value: "$ADMIN_TOKEN"
      - key: SPACES_ACCESS_KEY
        value: "$SPACES_ACCESS_KEY"
      - key: SPACES_SECRET_KEY
        value: "$SPACES_SECRET_KEY"
      - key: SPACES_BUCKET_NAME
        value: "$BUCKET_NAME"
      - key: SPACES_REGION
        value: "$SPACES_REGION"
      - key: ENVIRONMENT
        value: "production"
      - key: CORS_ORIGINS
        value: "https://betterman.sh,https://www.betterman.sh"
    
    http_port: 8000
    
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
    
    instance_count: 1
    instance_size_slug: basic-xs
    
jobs:
  - name: backup
    kind: PRE_DEPLOY
    github:
      repo: amanthanvi/BetterMan
      branch: main
    source_dir: backend
    run_command: "python scripts/backup_to_spaces.py"
    envs:
      - key: SPACES_ACCESS_KEY
        value: "$SPACES_ACCESS_KEY"
      - key: SPACES_SECRET_KEY
        value: "$SPACES_SECRET_KEY"
      - key: SPACES_BUCKET_NAME
        value: "$BUCKET_NAME"
EOF

elif [ "$SETUP_TYPE" = "standard" ]; then
  # Standard setup with PostgreSQL
  cat >/tmp/betterman-app.yaml <<EOF
name: $APP_NAME
region: nyc

services:
  - name: api
    github:
      repo: amanthanvi/BetterMan
      branch: main
      deploy_on_push: true
    source_dir: backend
    dockerfile_path: backend/Dockerfile.production
    
    envs:
      - key: DATABASE_URL
        value: "$DB_URI"
      - key: SECRET_KEY
        value: "$SECRET_KEY"
      - key: ADMIN_TOKEN
        value: "$ADMIN_TOKEN"
      - key: SPACES_ACCESS_KEY
        value: "$SPACES_ACCESS_KEY"
      - key: SPACES_SECRET_KEY
        value: "$SPACES_SECRET_KEY"
      - key: SPACES_BUCKET_NAME
        value: "$BUCKET_NAME"
      - key: SPACES_REGION
        value: "$SPACES_REGION"
      - key: ENVIRONMENT
        value: "production"
      - key: CORS_ORIGINS
        value: "https://betterman.sh,https://www.betterman.sh"
    
    http_port: 8000
    
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
    
    instance_count: 2
    instance_size_slug: basic-xxs
    
jobs:
  - name: migrate
    kind: PRE_DEPLOY
    github:
      repo: amanthanvi/BetterMan
      branch: main
    source_dir: backend
    run_command: "python -m alembic upgrade head"
    envs:
      - key: DATABASE_URL
        value: "$DB_URI"
EOF

else
  # Premium setup with PostgreSQL + Redis
  cat >/tmp/betterman-app.yaml <<EOF
name: $APP_NAME
region: nyc

services:
  - name: api
    github:
      repo: amanthanvi/BetterMan
      branch: main
      deploy_on_push: true
    source_dir: backend
    dockerfile_path: backend/Dockerfile.production
    
    envs:
      - key: DATABASE_URL
        value: "$DB_URI"
      - key: REDIS_URL
        value: "$REDIS_URI"
      - key: SECRET_KEY
        value: "$SECRET_KEY"
      - key: ADMIN_TOKEN
        value: "$ADMIN_TOKEN"
      - key: SPACES_ACCESS_KEY
        value: "$SPACES_ACCESS_KEY"
      - key: SPACES_SECRET_KEY
        value: "$SPACES_SECRET_KEY"
      - key: SPACES_BUCKET_NAME
        value: "$BUCKET_NAME"
      - key: SPACES_REGION
        value: "$SPACES_REGION"
      - key: ENVIRONMENT
        value: "production"
      - key: CORS_ORIGINS
        value: "https://betterman.sh,https://www.betterman.sh"
    
    http_port: 8000
    
    health_check:
      http_path: /health
      initial_delay_seconds: 30
      period_seconds: 10
      timeout_seconds: 5
      success_threshold: 1
      failure_threshold: 3
    
    instance_count: 2
    instance_size_slug: professional-xs
    
    alerts:
      - rule: DEPLOYMENT_FAILED
      - rule: DOMAIN_FAILED
      
jobs:
  - name: migrate
    kind: PRE_DEPLOY
    github:
      repo: amanthanvi/BetterMan
      branch: main
    source_dir: backend
    run_command: "python -m alembic upgrade head"
    envs:
      - key: DATABASE_URL
        value: "$DB_URI"
  
  - name: cache-warmup
    kind: POST_DEPLOY
    github:
      repo: amanthanvi/BetterMan
      branch: main
    source_dir: backend
    run_command: "python scripts/warm_cache.py"
    envs:
      - key: DATABASE_URL
        value: "$DB_URI"
      - key: REDIS_URL
        value: "$REDIS_URI"
EOF
fi

# Create the app
echo "📝 Creating app from spec..."
if doctl apps create --spec /tmp/betterman-app.yaml; then
  echo -e "${GREEN}✅ App creation started${NC}"
else
  echo -e "${RED}❌ Failed to create app${NC}"
  exit 1
fi

# Wait and get app details
echo "⏳ Waiting for app to be created..."
sleep 10

APP_ID=$(doctl apps list --format ID,Name --no-header | grep $APP_NAME | awk '{print $1}')

if [ -z "$APP_ID" ]; then
  echo -e "${RED}❌ Could not find app ID${NC}"
  exit 1
fi

echo -e "${GREEN}✅ App created with ID: ${APP_ID}${NC}"

# Get app URL
sleep 5
APP_URL=$(doctl apps get "$APP_ID" --format LiveURL --no-header)

# Create production environment file
echo ""
echo "📝 Creating production environment file..."
cat >.env.production <<EOF
# DigitalOcean Production Configuration
# Generated: $(date)

# App Details
APP_ID=$APP_ID
APP_URL=$APP_URL
SETUP_TYPE=$SETUP_TYPE

# Secrets (DO NOT COMMIT)
SECRET_KEY=$SECRET_KEY
ADMIN_TOKEN=$ADMIN_TOKEN

# Spaces
SPACES_ACCESS_KEY=$SPACES_ACCESS_KEY
SPACES_SECRET_KEY=$SPACES_SECRET_KEY
SPACES_BUCKET=$BUCKET_NAME
SPACES_REGION=$SPACES_REGION

# Database (if applicable)
$([ "$SETUP_TYPE" != "basic" ] && echo "DATABASE_URL=$DB_URI" || echo "# Using SQLite")
$([ "$SETUP_TYPE" != "basic" ] && echo "DB_HOST=$DB_HOST" || echo "")
$([ "$SETUP_TYPE" != "basic" ] && echo "DB_PORT=$DB_PORT" || echo "")
$([ "$SETUP_TYPE" != "basic" ] && echo "DB_NAME=$DB_NAME" || echo "")
$([ "$SETUP_TYPE" != "basic" ] && echo "DB_USER=$DB_USER" || echo "")
$([ "$SETUP_TYPE" != "basic" ] && echo "DB_PASSWORD=$DB_PASSWORD" || echo "")

# Redis (if applicable)
$([ "$SETUP_TYPE" = "premium" ] && echo "REDIS_URL=$REDIS_URI" || echo "# No Redis")

# Frontend
NEXT_PUBLIC_API_URL=$APP_URL
EOF

echo -e "${GREEN}✅ Created .env.production${NC}"

# Summary
echo ""
echo "═══════════════════════════════════════════════════"
echo -e "${GREEN}✅ Production Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════"
echo ""
echo "📋 Configuration Summary:"
echo "  - Setup Type: $SETUP_TYPE"
echo "  - App ID: $APP_ID"
echo "  - App URL: $APP_URL"
echo "  - Spaces Bucket: $BUCKET_NAME"
[ "$SETUP_TYPE" != "basic" ] && echo "  - Database: PostgreSQL managed"
[ "$SETUP_TYPE" = "premium" ] && echo "  - Cache: Redis managed"
echo ""
echo "💰 Monthly Cost Estimate:"
case $SETUP_TYPE in
  basic)
    echo "  - App Platform (Basic XS): $5"
    echo "  - Spaces (5GB): $5"
    echo "  - Domain (optional): $2"
    echo "  - Total: ~$12/month"
    ;;
  standard)
    echo "  - App Platform (2x Basic XXS): $5"
    echo "  - PostgreSQL (1GB): $15"
    echo "  - Spaces (5GB): $5"
    echo "  - Domain (optional): $2"
    echo "  - Total: ~$27/month"
    ;;
  premium)
    echo "  - App Platform (2x Professional XS): $12"
    echo "  - PostgreSQL (1GB): $15"
    echo "  - Redis (1GB): $15"
    echo "  - Spaces (5GB): $5"
    echo "  - Domain (optional): $2"
    echo "  - Total: ~$47/month"
    ;;
esac
echo ""
echo "📝 Next Steps:"
echo "  1. Wait for deployment (~5-10 minutes)"
echo "  2. Monitor: doctl apps logs $APP_ID --follow"
echo "  3. Add custom domain (optional)"
echo "  4. Set up monitoring alerts"
echo "  5. Configure automated backups"
echo ""
echo "🔐 Important Files Created:"
echo "  - .env.production (contains secrets)"
echo "  - Store these securely!"
echo ""
echo "💡 Useful Commands:"
echo "  doctl apps get $APP_ID"
echo "  doctl apps logs $APP_ID --follow"
echo "  doctl apps list-deployments $APP_ID"
echo ""
if [ "$SETUP_TYPE" != "basic" ]; then
  echo "  # Database commands:"
  echo "  doctl databases get $DB_ID"
  echo "  doctl databases connection $DB_ID"
  echo ""
fi
if [ "$SETUP_TYPE" = "premium" ]; then
  echo "  # Redis commands:"
  echo "  doctl databases get $REDIS_ID"
  echo "  doctl databases connection $REDIS_ID"
  echo ""
fi
echo "🚀 Your production environment is being deployed!"
echo ""

# Clean up
rm -f /tmp/betterman-app.yaml