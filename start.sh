#\!/bin/bash

# BetterMan Startup Script
echo "Starting BetterMan Application..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if \! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Stop any existing containers
echo -e "${BLUE}Stopping existing containers...${NC}"
docker-compose down

# Build containers with latest code
echo -e "${BLUE}Building containers with latest code...${NC}"
docker-compose build

# Start all services
echo -e "${BLUE}Starting services...${NC}"
docker-compose up -d

# Wait for services to be ready
echo -e "${BLUE}Waiting for services to start...${NC}"
sleep 10

# Check service health
echo -e "${BLUE}Checking service status...${NC}"
docker-compose ps

# Test backend health
echo -e "${BLUE}Testing backend health...${NC}"
curl -s http://localhost:8000/health  < /dev/null |  jq . || echo "Backend not ready yet"

echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}BetterMan is starting up!${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""
echo "Access points:"
echo -e "  ${BLUE}Frontend:${NC} http://localhost:5173"
echo -e "  ${BLUE}Backend API:${NC} http://localhost:8000"
echo -e "  ${BLUE}API Documentation:${NC} http://localhost:8000/api/docs"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop:"
echo "  docker-compose down"
echo ""
echo -e "${YELLOW}Note: Frontend may take a minute to compile on first run.${NC}"
