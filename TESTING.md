# BetterMan Testing Guide

## Overview

BetterMan has a comprehensive test suite covering unit tests, integration tests, E2E tests, security tests, and performance tests.

## Quick Start

```bash
# Run all tests
./run_tests.sh all

# Run with coverage
./run_tests.sh all true

# Run specific test types
./run_tests.sh backend      # Backend tests only
./run_tests.sh frontend     # Frontend tests only
./run_tests.sh e2e          # End-to-end tests
./run_tests.sh load         # Load/performance tests
./run_tests.sh security     # Security scans
```

## Backend Testing

### Unit Tests

Located in `backend/tests/`:
- `test_services.py` - Service layer tests
- `test_security.py` - Security tests
- `test_performance.py` - Performance tests
- `test_parser.py` - Parser tests
- `test_groff_parser.py` - Groff parser tests

Run backend tests:
```bash
cd backend
pytest -v                    # Run all tests
pytest -v --cov=src         # With coverage
pytest -v -k "test_search"  # Run specific tests
```

### Integration Tests

Located in `backend/tests/test_integration.py`:
- API endpoint tests
- Authentication flows
- Database operations
- Full request/response cycles

### Security Tests

Located in `backend/tests/test_security.py`:
- SQL injection prevention
- XSS prevention
- Authentication security
- Input validation
- Rate limiting
- Terminal sandbox security

### Performance Tests

Located in `backend/tests/test_performance.py`:
- Search performance
- Cache performance
- Database query optimization
- Memory usage
- Concurrent request handling

### Load Testing

Using Locust (`backend/tests/locustfile.py`):
```bash
# Run load tests
cd backend
locust -f tests/locustfile.py --host http://localhost:8000

# Headless mode
locust -f tests/locustfile.py \
  --headless \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m \
  --host http://localhost:8000
```

## Frontend Testing

### Unit Tests

Located in `frontend/src/tests/`:
- Component tests with React Testing Library
- Hook tests
- Utility function tests
- Store tests

Run frontend tests:
```bash
cd frontend
npm test                    # Run tests in watch mode
npm run test:coverage      # With coverage
npm run test:ui           # With Vitest UI
```

### E2E Tests

Located in `frontend/e2e/`:
- `search.spec.ts` - Search functionality
- `auth.spec.ts` - Authentication flows
- `document.spec.ts` - Document viewing
- `terminal.spec.ts` - Terminal features

Run E2E tests:
```bash
cd frontend
npm run test:e2e          # Run all E2E tests
npm run test:e2e:ui       # With Playwright UI
npx playwright test --debug  # Debug mode
```

## Test Infrastructure

### CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/test.yml`):
1. Backend tests (unit, integration)
2. Frontend tests (unit, lint, type check)
3. E2E tests
4. Security scans
5. Performance tests (on PRs)
6. Code quality checks

### Test Data

Test fixtures in `backend/tests/fixtures.py`:
- Sample users with different roles
- Sample documents
- Mock data generators
- Database helpers

### Test Utilities

Helper functions in `backend/tests/utils.py`:
- API test helpers
- Database test helpers
- Mock services
- Assertion helpers
- Performance timers

## Writing Tests

### Backend Test Example

```python
def test_search_functionality(client, test_documents):
    """Test search returns relevant results"""
    response = client.get("/api/search?q=ls")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["results"]) > 0
    assert data["results"][0]["command"] == "ls"
```

### Frontend Test Example

```typescript
it('should display search results', async () => {
  const { user } = render(<SearchInterface />)
  
  await user.type(screen.getByRole('searchbox'), 'grep')
  
  await waitFor(() => {
    expect(screen.getByText('grep - print lines matching a pattern')).toBeInTheDocument()
  })
})
```

### E2E Test Example

```typescript
test('should search and navigate to document', async ({ page }) => {
  await page.goto('/')
  await page.fill('[placeholder="Search for commands..."]', 'ls')
  await page.click('[data-testid="result-0"]')
  
  await expect(page).toHaveURL(/\/docs\/ls/)
  await expect(page.locator('h1')).toContainText('ls')
})
```

## Coverage Reports

### Backend Coverage

```bash
cd backend
pytest --cov=src --cov-report=html
# Open htmlcov/index.html
```

### Frontend Coverage

```bash
cd frontend
npm run test:coverage
# Open coverage/lcov-report/index.html
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Services**: Use mocks for Redis, external APIs
3. **Test Data**: Use fixtures and factories
4. **Assertions**: Be specific about what you're testing
5. **Performance**: Keep tests fast (< 100ms for unit tests)
6. **Coverage**: Aim for >80% code coverage
7. **E2E Tests**: Test critical user journeys
8. **Security**: Test edge cases and malicious inputs

## Debugging Tests

### Backend
```bash
# Run specific test with print statements
pytest -s tests/test_services.py::TestSearchService::test_search_basic

# Run with debugger
pytest --pdb tests/test_services.py

# Verbose output
pytest -vv tests/
```

### Frontend
```bash
# Debug specific test
npm test -- --reporter=verbose SearchInterface

# Run single test file
npm test SearchInterface.test.tsx

# Interactive mode
npm run test:ui
```

### E2E
```bash
# Debug mode with Playwright Inspector
npx playwright test --debug

# Headed mode (see browser)
npx playwright test --headed

# Slow motion
npx playwright test --headed --slow-mo=1000
```

## Continuous Integration

Tests run automatically on:
- Every push to main/develop
- Every pull request
- Scheduled nightly runs

Failed tests will:
- Block PR merging
- Send notifications
- Generate reports

## Performance Benchmarks

Target performance metrics:
- API response time: < 200ms (p95)
- Search response: < 100ms
- Page load: < 2s
- Time to interactive: < 3s
- Memory usage: < 500MB
- Concurrent users: 1000+