# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Quick Start
```bash
# Start all services (frontend, backend, Redis)
docker-compose up -d

# Access points:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:8000
# - API Documentation: http://localhost:8000/docs
# - Redis: localhost:6379
```

### Backend Development
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Run development server
uvicorn src.main:app --reload

# Run tests
python -m pytest
python -m pytest --cov=src  # With coverage

# Format code
python -m black src/

# Database migrations
python -m alembic upgrade head
```

### Frontend Development
```bash
cd frontend
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Preview production build
npm run preview
```

### Docker Operations
```bash
# Development environment
docker-compose up -d
docker-compose down
docker-compose logs -f [service_name]

# Production deployment
docker-compose -f docker-compose.production.yml up -d

# Rebuild containers
docker-compose up --build
```

## Architecture Overview

BetterMan is a modern documentation platform that transforms Linux man pages into an intuitive web interface with enterprise features.

### Backend Architecture (FastAPI)

**Core Components:**
- `src/api/` - RESTful API endpoints
  - `routes.py` - Main application routes
  - `search_routes.py` - Search-specific endpoints
- `src/models/` - SQLAlchemy ORM models
- `src/search/` - Search engine implementation with optimization
- `src/parser/` - Man page parsing (groff format)
- `src/cache/` - Multi-layer caching (Redis + in-memory)
- `src/analytics/` - Usage tracking and metrics
- `src/jobs/` - Background task scheduler

**Key Patterns:**
- Async/await throughout for maximum performance
- Dependency injection for database sessions
- Multi-layer caching strategy (Redis primary, in-memory fallback)
- Comprehensive error handling with custom exceptions
- Rate limiting and security middleware

### Frontend Architecture (React + TypeScript)

**Core Components:**
- `src/components/` - Reusable UI components
  - `CommandPalette.tsx` - Cmd/Ctrl+K navigation
  - `search/` - Search interface components
  - `document/` - Document viewer
  - `ui/` - Base UI components (Button, Input, etc.)
- `src/pages/` - Route-level page components
- `src/stores/` - Zustand state management
- `src/services/` - API client services

**Key Patterns:**
- Component composition with TypeScript interfaces
- Global state management with Zustand
- Error boundaries for graceful error handling
- Responsive design with Tailwind CSS
- Keyboard navigation support throughout

### Data Flow
1. Frontend makes API request to backend
2. Backend checks Redis cache
3. If cache miss, queries SQLite/PostgreSQL
4. Parses man pages using groff parser if needed
5. Updates cache and returns response
6. Frontend stores in Zustand and renders

### Production Considerations
- Nginx reverse proxy with caching headers
- PostgreSQL for production database
- Prometheus + Grafana for monitoring
- Rate limiting and CORS protection
- Health check endpoints for all services
- Multi-stage Docker builds for optimization