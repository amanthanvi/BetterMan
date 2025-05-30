# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BetterMan is a modern documentation platform that transforms traditional Linux man pages into a more readable, navigable format with advanced search capabilities. It uses a microservices architecture with Docker Compose orchestration.

## Architecture

### Backend (Python FastAPI)
- **API Server**: FastAPI on port 8000 with REST endpoints
- **Database**: SQLite with SQLAlchemy ORM and FTS5 for full-text search
- **Key Modules**:
  - `api/`: REST endpoints for documents, search, and cache management
  - `models/`: SQLAlchemy models (Document, Section, Subsection, RelatedDocument)
  - `search/`: Dual search implementation (FTS5 with BM25 ranking, fallback LIKE queries)
  - `parser/`: Man page parsing to structured format with Markdown/HTML output
  - `cache/`: Smart caching system with three-tier priority (permanent, temporary, on_demand)
  - `jobs/`: Background tasks with APScheduler

### Frontend (React + Vite)
- **Stack**: React 19, Vite, Tailwind CSS, React Router
- **Key Components**:
  - `SearchInterface`: Advanced search with debouncing, autocomplete, and highlighting
  - `DocumentViewer`: Man page display with Markdown rendering
  - **Features**: Dark mode, keyboard shortcuts, responsive design

### Database Schema
- Main tables: documents, sections, subsections, related_documents
- FTS5 virtual tables: fts_documents, fts_sections
- Migration system in `backend/src/db/migrations/`

## Development Commands

### Docker Development (Recommended)
```bash
# Start all services
docker-compose up

# Rebuild and start
docker-compose up --build

# Stop services
docker-compose down

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Local Development

Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

### Testing
```bash
# Backend tests
cd backend
python -m pytest tests/

# Frontend (no tests configured yet)
cd frontend
npm test
```

## API Endpoints

### Documents
- `GET /api/docs` - List documents (params: section, is_common, limit, offset)
- `GET /api/docs/{doc_id}` - Get document details
- `GET /api/docs/{doc_id}/html` - Get document as HTML
- `GET /api/docs/{doc_id}/markdown` - Get document as Markdown
- `POST /api/docs/import` - Import new document
- `DELETE /api/docs/{doc_id}` - Delete document

### Search
- `GET /api/search` - Basic search (params: q, section, limit, offset)
- `GET /api/search/search` - Advanced FTS search with highlighting
- `POST /api/search/reindex` - Rebuild search index

### Cache
- `GET /api/cache/stats` - Cache statistics
- `POST /api/cache/refresh` - Trigger cache refresh

## Key Implementation Details

### Search System
- Uses SQLite FTS5 with BM25 ranking for relevance
- Automatic fallback to LIKE queries if FTS unavailable
- Supports phrase search with quotes
- Returns highlighted snippets
- Debounced frontend input (300ms) in `useDebounce` hook

### Caching Strategy
- Pre-loads 62 common Linux commands on startup
- Three cache priorities: permanent (never evicted), temporary (can be evicted), on_demand (fetched as needed)
- Tracks access counts for popularity-based eviction
- Background job refreshes cache periodically

### Database Migrations
- Migration system in `backend/src/db/migrations/`
- Run automatically on startup
- Add new migrations as numbered Python files (e.g., `004_your_migration.py`)

## Common Development Tasks

### Adding a New API Endpoint
1. Add route to `backend/src/api/routes.py` or create new route file
2. Import in `backend/src/api/__init__.py`
3. Follow existing patterns for error handling and response models

### Modifying Database Schema
1. Create migration file in `backend/src/db/migrations/`
2. Update models in `backend/src/models/`
3. Migration runs automatically on next startup

### Updating Search Implementation
- Main logic in `backend/src/search/search_engine.py`
- Two search methods: `search()` for basic, `search_fts()` for advanced
- Remember to reindex after schema changes: `POST /api/search/reindex`

### Frontend State Management
- Currently uses local component state
- API calls via axios in individual components
- Consider adding global state management (Context API or Redux) if complexity grows

## Environment Variables

Backend expects:
- `DATABASE_URL` (defaults to `sqlite:///./data/betterman.db`)
- `LOG_LEVEL` (defaults to `INFO`)

Frontend expects:
- `VITE_API_URL` (defaults to `http://localhost:8000`)