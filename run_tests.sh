#!/bin/bash

# BetterMan Test Suite Runner
# This script runs all tests with various configurations

set -e

echo "🧪 BetterMan Test Suite"
echo "======================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse command line arguments
TEST_TYPE=${1:-all}
COVERAGE=${2:-false}

# Function to run backend tests
run_backend_tests() {
    echo -e "\n${YELLOW}Running Backend Tests...${NC}"
    cd backend
    
    # Activate virtual environment if it exists
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    # Install dependencies if needed
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
    fi
    
    # Run different test categories
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "unit" ]; then
        echo -e "\n${GREEN}Running unit tests...${NC}"
        if [ "$COVERAGE" == "true" ]; then
            pytest tests/test_services.py tests/test_parser.py tests/test_groff_parser.py -v --cov=src --cov-report=html --cov-report=term
        else
            pytest tests/test_services.py tests/test_parser.py tests/test_groff_parser.py -v
        fi
    fi
    
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "integration" ]; then
        echo -e "\n${GREEN}Running integration tests...${NC}"
        pytest tests/test_integration.py -v
    fi
    
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "security" ]; then
        echo -e "\n${GREEN}Running security tests...${NC}"
        pytest tests/test_security.py -v
    fi
    
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "performance" ]; then
        echo -e "\n${GREEN}Running performance tests...${NC}"
        pytest tests/test_performance.py -v -s
    fi
    
    # Run linting
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "lint" ]; then
        echo -e "\n${GREEN}Running linters...${NC}"
        black --check src/
        isort --check-only src/
        # mypy src/ || true
    fi
    
    cd ..
}

# Function to run frontend tests
run_frontend_tests() {
    echo -e "\n${YELLOW}Running Frontend Tests...${NC}"
    cd frontend
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing dependencies..."
        npm ci
    fi
    
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "unit" ]; then
        echo -e "\n${GREEN}Running unit tests...${NC}"
        if [ "$COVERAGE" == "true" ]; then
            npm run test:coverage
        else
            npm test
        fi
    fi
    
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "lint" ]; then
        echo -e "\n${GREEN}Running linter...${NC}"
        npm run lint
    fi
    
    if [ "$TEST_TYPE" == "all" ] || [ "$TEST_TYPE" == "type" ]; then
        echo -e "\n${GREEN}Running type checks...${NC}"
        npx tsc --noEmit
    fi
    
    cd ..
}

# Function to run E2E tests
run_e2e_tests() {
    echo -e "\n${YELLOW}Running E2E Tests...${NC}"
    
    # Start backend in test mode
    echo "Starting backend..."
    cd backend
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    export DATABASE_URL="sqlite:///./test.db"
    export ENVIRONMENT="test"
    python -m src.db.init_db
    uvicorn src.main:app --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
    cd ..
    
    # Wait for backend to start
    echo "Waiting for backend to start..."
    sleep 5
    
    # Run E2E tests
    cd frontend
    echo -e "\n${GREEN}Running E2E tests...${NC}"
    npx playwright install --with-deps
    npm run test:e2e
    E2E_EXIT_CODE=$?
    cd ..
    
    # Stop backend
    kill $BACKEND_PID
    
    return $E2E_EXIT_CODE
}

# Function to run load tests
run_load_tests() {
    echo -e "\n${YELLOW}Running Load Tests...${NC}"
    
    # Start backend
    echo "Starting backend for load testing..."
    cd backend
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    export DATABASE_URL="sqlite:///./test.db"
    export ENVIRONMENT="test"
    python -m src.db.init_db
    python -m src.db.populate_test_data
    uvicorn src.main:app --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
    
    # Wait for backend to start
    sleep 5
    
    # Run Locust
    echo -e "\n${GREEN}Running load tests with Locust...${NC}"
    locust -f tests/locustfile.py \
        --headless \
        --users 50 \
        --spawn-rate 5 \
        --run-time 1m \
        --host http://localhost:8000 \
        --html load-test-report.html \
        --csv load-test
    
    # Stop backend
    kill $BACKEND_PID
    
    cd ..
    
    echo -e "\n${GREEN}Load test report generated: backend/load-test-report.html${NC}"
}

# Function to run security scan
run_security_scan() {
    echo -e "\n${YELLOW}Running Security Scan...${NC}"
    
    cd backend
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    # Install security tools
    pip install bandit safety
    
    # Run bandit
    echo -e "\n${GREEN}Running Bandit security linter...${NC}"
    bandit -r src/ -f json -o security-report.json || true
    
    # Run safety check
    echo -e "\n${GREEN}Checking for known vulnerabilities...${NC}"
    safety check --json --output safety-report.json || true
    
    cd ..
    
    # Frontend security audit
    cd frontend
    echo -e "\n${GREEN}Running npm audit...${NC}"
    npm audit --json > npm-audit-report.json || true
    cd ..
    
    echo -e "\n${GREEN}Security reports generated in backend/ and frontend/ directories${NC}"
}

# Main execution
echo "Test configuration:"
echo "  Test Type: $TEST_TYPE"
echo "  Coverage: $COVERAGE"

case $TEST_TYPE in
    backend)
        run_backend_tests
        ;;
    frontend)
        run_frontend_tests
        ;;
    e2e)
        run_e2e_tests
        ;;
    load)
        run_load_tests
        ;;
    security)
        run_security_scan
        ;;
    lint)
        run_backend_tests
        run_frontend_tests
        ;;
    all)
        run_backend_tests
        run_frontend_tests
        if [ "$COVERAGE" != "true" ]; then
            run_e2e_tests
        fi
        ;;
    *)
        echo -e "${RED}Invalid test type: $TEST_TYPE${NC}"
        echo "Usage: $0 [backend|frontend|e2e|load|security|lint|all] [true|false]"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ Tests completed!${NC}"

# Generate combined coverage report if requested
if [ "$COVERAGE" == "true" ] && [ "$TEST_TYPE" == "all" ]; then
    echo -e "\n${YELLOW}Generating combined coverage report...${NC}"
    
    # Backend coverage is in backend/htmlcov
    # Frontend coverage is in frontend/coverage
    
    echo -e "${GREEN}Coverage reports:${NC}"
    echo "  Backend: backend/htmlcov/index.html"
    echo "  Frontend: frontend/coverage/lcov-report/index.html"
fi