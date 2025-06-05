#!/bin/bash
# Comprehensive deployment script for loading ALL Linux man pages

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_ROOT/logs/deploy_$(date +%Y%m%d_%H%M%S).log"

# Create log directory
mkdir -p "$PROJECT_ROOT/logs"

# Logging function
log() {
    echo -e "${2:-$NC}$1${NC}" | tee -a "$LOG_FILE"
}

# Error handler
error_handler() {
    log "❌ Error occurred in deployment!" "$RED"
    log "Check log file: $LOG_FILE" "$YELLOW"
    exit 1
}

trap error_handler ERR

# Welcome message
log "🚀 BetterMan Comprehensive Man Page Loading" "$BLUE"
log "===========================================" "$BLUE"
log "This will load ALL Linux man pages into the system\n" "$YELLOW"

# Check if running in production
if [[ "$1" == "--production" ]]; then
    DOCKER_COMPOSE="docker-compose -f docker-compose.production.yml"
    ENV="production"
else
    DOCKER_COMPOSE="docker-compose"
    ENV="development"
fi

log "Environment: $ENV" "$GREEN"

# Step 1: Build containers
log "\n📦 Building Docker containers..." "$BLUE"
cd "$PROJECT_ROOT"
$DOCKER_COMPOSE build

# Step 2: Start core services
log "\n🔧 Starting core services..." "$BLUE"
$DOCKER_COMPOSE up -d redis
sleep 5  # Wait for Redis

$DOCKER_COMPOSE up -d backend
log "Waiting for backend to be healthy..." "$YELLOW"

# Wait for backend health check
MAX_WAIT=60
WAITED=0
while ! $DOCKER_COMPOSE exec backend curl -f http://localhost:8000/health &>/dev/null; do
    sleep 2
    WAITED=$((WAITED + 2))
    if [ $WAITED -ge $MAX_WAIT ]; then
        log "Backend failed to start!" "$RED"
        exit 1
    fi
    echo -n "."
done
echo ""
log "✅ Backend is healthy!" "$GREEN"

# Step 3: Run database migrations
log "\n🗄️  Running database migrations..." "$BLUE"
$DOCKER_COMPOSE exec backend python -m alembic upgrade head

# Step 4: Discovery phase
log "\n🔍 Discovering available man pages..." "$BLUE"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli discover

# Step 5: Show loading plan
log "\n📋 Loading plan:" "$YELLOW"
read -p "Do you want to see what will be loaded? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    $DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli load --dry-run
fi

# Step 6: Ask for confirmation
log "\n⚠️  This will load thousands of man pages and may take 30-60 minutes!" "$YELLOW"
read -p "Continue with loading? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log "Deployment cancelled by user" "$YELLOW"
    exit 0
fi

# Step 7: Load man pages by priority
log "\n📚 Loading man pages by priority..." "$BLUE"

# Priority 1-2: Core system commands (essential)
log "\n[Priority 1-2] Loading core system commands..." "$GREEN"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli load \
    --priority-min=1 --priority-max=2 --batch-size=100

# Check success
if [ $? -eq 0 ]; then
    log "✅ Core commands loaded successfully!" "$GREEN"
else
    log "❌ Failed to load core commands!" "$RED"
    exit 1
fi

# Priority 3-4: Standard utilities and libraries
log "\n[Priority 3-4] Loading standard utilities..." "$GREEN"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli load \
    --priority-min=3 --priority-max=4 --batch-size=100

# Priority 5-6: Development tools and GUI applications
log "\n[Priority 5-6] Loading development tools..." "$GREEN"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli load \
    --priority-min=5 --priority-max=6 --batch-size=100

# Priority 7-8: Optional and miscellaneous
log "\n[Priority 7-8] Loading optional packages..." "$GREEN"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli load \
    --priority-min=7 --priority-max=8 --batch-size=100

# Step 8: Show statistics
log "\n📊 Loading complete! Generating statistics..." "$BLUE"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli stats --detailed

# Step 9: Cleanup duplicates
log "\n🧹 Cleaning up duplicates..." "$BLUE"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli cleanup

# Step 10: Start all services
log "\n🌐 Starting all services..." "$BLUE"
$DOCKER_COMPOSE up -d

# Step 11: Final checks
log "\n✨ Deployment complete!" "$GREEN"
log "\nService URLs:" "$BLUE"
log "  - Frontend: http://localhost:5173" "$GREEN"
log "  - Backend API: http://localhost:8000" "$GREEN"
log "  - API Docs: http://localhost:8000/docs" "$GREEN"
log "  - Nginx Proxy: http://localhost:8080" "$GREEN"

# Show service status
log "\n📊 Service Status:" "$BLUE"
$DOCKER_COMPOSE ps

# Export statistics
log "\n📁 Exporting statistics..." "$BLUE"
STATS_FILE="$PROJECT_ROOT/logs/manpage_stats_$(date +%Y%m%d).json"
$DOCKER_COMPOSE run --rm man-loader python -m src.management.comprehensive_cli stats \
    --export="$STATS_FILE"

log "\n✅ All done! Statistics exported to: $STATS_FILE" "$GREEN"
log "Log file: $LOG_FILE" "$YELLOW"