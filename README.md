# BetterMan

BetterMan is a fast, modern web interface for Linux man pages (see `SPEC.md`).

## Repo layout (planned)

```
/
├── frontend/           # React SPA
├── backend/            # FastAPI service (serves API + built SPA)
├── ingestion/          # Ingestion pipeline scripts
├── docker-compose.yml  # Local Postgres + Redis
└── SPEC.md
```

## Status

Implementation in progress on branch `refresh`. Execution plan: `PLAN.md`.

## Golden commands

### Local services

- `pnpm db:up` — start Postgres + Redis (Docker)
- `pnpm db:down` — stop services

### Backend

- `pnpm backend:dev` — FastAPI dev server (port 8000)
- `pnpm backend:test` — backend tests (pytest)
- `pnpm backend:lint` — ruff check + format check

### Frontend

- `pnpm frontend:dev` — Vite dev server
- `pnpm frontend:build` — production build
- `pnpm frontend:lint` — eslint

### Ingestion

- `pnpm ingest:sample` — ingest a small sample set (WIP)
- `pnpm ingest:run` — ingest full dataset (WIP)
