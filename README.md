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

- `v0.1.0` shipped (tag `v0.1.0`).
- `v0.1.1` in progress (frontend design overhaul + performance improvements).
- Default branch: `main`. Execution plan: `PLAN.md`.

## Deploy (Railway)

- Auto-deploy: `.github/workflows/ci.yml` deploys after all jobs pass on pushes to `main`.
- Manual deploy: `.github/workflows/deploy.yml` (workflow `deploy-railway`, input `ref`).
- Requires `RAILWAY_TOKEN` GitHub Actions secret (exported to Railway CLI as `RAILWAY_API_TOKEN`).

## Security / Quality (CI)

- Required PR checks for `main`: `frontend`, `backend`, `ingestion`, `dependency_review`.
- Code scanning: `.github/workflows/codeql.yml` (CodeQL) + `.github/workflows/scorecards.yml` (OSSF Scorecards → SARIF).
- Dependency updates: `.github/dependabot.yml` (GitHub Actions, frontend npm, backend/ingestion uv, Dockerfile base images).

## UX notes

- Desktop: the “On this page” table of contents stays sticky while you scroll.
- Man page: “Find in page” stays sticky by default; users can hide/show it.
- Mobile: TOC is available via the sticky header “TOC” button (drawer).

## Golden commands

### Local services

- `pnpm db:up` — start Postgres + Redis (Docker)
- `pnpm db:down` — stop services
  - Postgres exposed on `localhost:54320`

### Backend

- `pnpm backend:dev` — FastAPI dev server (port 8000)
- `pnpm backend:test` — backend tests (pytest)
- `pnpm backend:lint` — ruff check + format check

### Frontend

- `pnpm frontend:dev` — Vite dev server
- `pnpm frontend:build` — production build
- `pnpm frontend:lint` — eslint

### Ingestion

- `pnpm ingest:sample` — ingest a small sample set
- `pnpm ingest:run` — ingest full dataset
- `pnpm ingest:lint` — ruff check + format check
- `pnpm ingest:test` — ingestion tests (pytest)

## Contributing

- Read `CONTRIBUTING.md`.
- Be kind: `CODE_OF_CONDUCT.md`.
- Security issues: `SECURITY.md`.

## License

MIT — see `LICENSE`.
