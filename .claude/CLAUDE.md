# BetterMan

Monorepo: Next.js + React frontend, Python FastAPI backend, ingestion pipeline.

## Build & Test

```bash
pnpm frontend:dev    # React frontend dev
pnpm next:dev        # Next.js dev
pnpm backend:dev     # FastAPI dev
pnpm backend:test    # pytest
pnpm db:up           # Docker Compose (Postgres + Redis)
pnpm db:down         # Stop DB containers
```

## Stack

- Frontend: React 19, TypeScript, Next.js
- Backend: Python, FastAPI, uv
- DB: PostgreSQL + Redis (Docker Compose)
- Tests: pytest (backend), Vitest (frontend)
- Linting: Ruff (Python), ESLint (TS)
- Package managers: pnpm (root/frontend), uv (backend/ingestion)

## Conventions

- Monorepo workspaces: frontend/, nextjs/, backend/, ingestion/
- Python code uses uv for dependency management
- Ruff for Python linting and formatting
- Docker Compose for local infrastructure
- Keep frontend and backend concerns separated
