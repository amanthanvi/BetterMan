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
- `v0.1.1` shipped (tag `v0.1.1`).
- `v0.1.2` shipped (tag `v0.1.2`).
- `v0.2.0` shipped (tag `v0.2.0`).
- Default branch: `main`. Execution plan: `PLAN.md`.

## Deploy (Railway)

- Auto-deploy: `.github/workflows/ci.yml` deploys after all jobs pass on pushes to `main`.
- Manual deploy: `.github/workflows/deploy.yml` (workflow `deploy-railway`, input `ref`).
- Requires `RAILWAY_TOKEN` GitHub Actions secret (exported to Railway CLI as `RAILWAY_API_TOKEN`).

## Dataset updates

- Monthly ingest + promote: `.github/workflows/update-docs.yml` (workflow `update-dataset`).
- Requires `BETTERMAN_STAGING_DATABASE_URL` + `BETTERMAN_PROD_DATABASE_URL` GitHub Actions secrets.

## Security / Quality (CI)

- Required PR checks for `main`: `dependency_review`, `frontend`, `backend`, `ingestion`, `api_types`, `e2e`.
- Code scanning: `.github/workflows/codeql.yml` (CodeQL) + `.github/workflows/scorecards.yml` (OSSF Scorecards → SARIF).
- Dependency updates: `.github/dependabot.yml` (GitHub Actions, frontend npm, backend/ingestion uv, Dockerfile base images).
- API contract: `frontend/src/api/openapi.gen.ts` is generated from backend OpenAPI and enforced in CI.

## UX notes

- Desktop man pages: sticky “Navigator” rail (TOC + Find) with scroll-spy.
- Man page: “Find in page” stays sticky by default; users can hide/show it.
- Mobile: TOC is available via the sticky header “TOC” button (drawer).
- Man sections support extended suffixes (e.g. `/man/openssl/1ssl`, `/section/3p`).

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
- `pnpm frontend:test` — unit tests (Vitest)
- `pnpm frontend:e2e` — E2E tests (Playwright; expects backend running)

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
