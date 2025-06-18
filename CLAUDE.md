# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Quick Start
```bash
# Start all services (frontend, backend, Redis)
docker-compose up -d

# Access points:
# - Frontend: http://localhost:3000
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
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run linting
npm run lint

# Start production server
npm start
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

### CI/CD Deployment

**GitHub Actions Workflows:**
- `ci.yml` - Runs tests and linting on every push/PR
- `deploy.yml` - Deploys to production on main branch
- `update-man-pages.yml` - Weekly man page updates

**Deployment Targets:**
- Frontend: Vercel (automatic deployment)
- Backend: Render.com (triggered via API)
- Man Pages: Parsed in GitHub Actions, committed to repo

**Required Secrets:**
- `VERCEL_TOKEN` - For frontend deployment
- `RENDER_API_KEY` & `RENDER_SERVICE_ID` - For backend deployment

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

### Frontend Architecture (Next.js 15 + TypeScript)

**Core Components:**
- `app/` - Next.js App Router pages and layouts
  - `(marketing)/` - Marketing pages
  - `docs/` - Documentation viewer
  - `api/` - API routes
- `components/` - Reusable UI components
  - `CommandPalette.tsx` - Cmd/Ctrl+K navigation
  - `search/` - Search interface components
  - `ui/` - Base UI components (Button, Input, etc.)
- `lib/` - Utilities and data access
- `hooks/` - Custom React hooks

**Key Patterns:**
- Component composition with TypeScript interfaces
- Server and client components (Next.js App Router)
- Static generation with dynamic fallbacks
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
- PostgreSQL for production database (or SQLite for smaller deployments)
- Rate limiting and CORS protection
- Health check endpoints for all services
- Multi-stage Docker builds for optimization
- GitHub Actions for CI/CD with cost-effective man page parsing
- Vercel for frontend hosting with automatic deployments
- Render/Railway for backend API hosting