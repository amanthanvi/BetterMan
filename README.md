# BetterMan

BetterMan is a fast, modern web interface for Linux man pages (see `SPEC.md`).

## Repo layout

```text
/
├── nextjs/             # Next.js App Router (public web)
├── backend/            # FastAPI (API-only; internal)
├── ingestion/          # Ingestion pipeline (dataset builds)
├── frontend/           # Legacy Vite SPA (used for CI/e2e harness only; do not add features here)
├── docker-compose.yml  # Local Postgres + Redis
└── SPEC.md
```

## Status

- `v0.1.0` shipped (tag `v0.1.0`).
- `v0.1.1` shipped (tag `v0.1.1`).
- `v0.1.2` shipped (tag `v0.1.2`).
- `v0.2.0` shipped (tag `v0.2.0`).
- `v0.2.1` shipped (tag `v0.2.1`).
- `v0.3.0` shipped (tag `v0.3.0`) (multi-distribution + SEO + performance).
- `v0.4.0` shipped (tag `v0.4.0`) (hardening + discoverability + observability).
- `v0.5.0` shipped (tag `v0.5.0`) (Next.js migration + 7 distros + bookmarks/history + PWA).
- `v0.6.0` in progress (design + UI/UX overhaul).
- Default branch: `main`. Execution plan: `PLAN.md`.

## Deploy (Railway)

- Auto-deploy: `.github/workflows/ci.yml` deploys after all jobs pass on pushes to `main`.
- Manual deploy: `.github/workflows/deploy.yml` (workflow `deploy-railway`, input `ref`).
- Requires `RAILWAY_TOKEN` GitHub Actions secret (exported to Railway CLI as `RAILWAY_API_TOKEN`).
- `v0.5.0` deploy topology: two Railway services
  - `nextjs` (public web) → set `FASTAPI_INTERNAL_URL=http://web.railway.internal:8080`
  - `web` (FastAPI API-only; private networking)

## Dataset updates

- Monthly ingest + promote: `.github/workflows/update-docs.yml` (workflow `update-dataset`).
  - `workflow_dispatch` defaults: `ingest=true`, `promote=false` (ingest to staging only).
  - Promote-only: `ingest=false`, `promote=true` (promotes current staging actives without re-ingesting).
  - Targeted ingest (debug): set `linux_distro=arch` and/or `bsd=false`.
- Requires `BETTERMAN_STAGING_DATABASE_URL` + `BETTERMAN_PROD_DATABASE_URL` GitHub Actions secrets.

## Security / Quality (CI)

- Required PR checks for `main`: `dependency_review`, `frontend`, `backend`, `ingestion`, `api_types`, `e2e`.
- Code scanning: `.github/workflows/codeql.yml` (CodeQL) + `.github/workflows/scorecards.yml` (OSSF Scorecards → SARIF).
- Dependency updates: `.github/dependabot.yml` (GitHub Actions, frontend npm, backend/ingestion uv, Dockerfile base images).
- API contract: `frontend/src/api/openapi.gen.ts` is generated from backend OpenAPI and enforced in CI.

## Observability (v0.5.0)

### Sentry (Error Tracking)

Error tracking for both services.

**Environment variables:**

- `SENTRY_DSN` (backend)
- `NEXT_PUBLIC_SENTRY_DSN` (Next.js)

### Plausible (Analytics)

Privacy-friendly analytics (no cookies, GDPR-compliant).

**Environment variables:**

- `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (Next.js): Domain configured in Plausible (e.g., `betterman.sh`)

Analytics are disabled if the env var is not set.

### Proxy Trust (Rate Limiting)

For accurate IP-based rate limiting behind a reverse proxy:

**Environment variables:**

- `TRUSTED_PROXY_CIDRS` (backend): Comma-separated list of trusted proxy CIDRs (e.g., `10.0.0.0/8,172.16.0.0/12`)

When set, X-Forwarded-For is only trusted from connections originating within these CIDRs.

## UX notes

- Desktop man pages: toggleable “Navigator” panel (TOC + Find), hidden by default (toggle via `b` or header button).
- Find-in-page: desktop inside Navigator; mobile uses a compact floating find bar.
- `/bookmarks` and `/history` redirect to `/` (homepage dashboard includes Recent + Bookmarks).
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

### Next.js

- `pnpm next:dev` — Next.js dev server
- `pnpm next:build` — Next.js production build
- `pnpm next:lint` — Next.js lint

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
