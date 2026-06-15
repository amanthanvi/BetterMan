# BetterMan

[![ci](https://github.com/amanthanvi/BetterMan/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/amanthanvi/BetterMan/actions/workflows/ci.yml)

<p align="center">
  <img src="nextjs/public/betterman-mark.svg" width="96" height="96" alt="BetterMan logo" />
</p>

BetterMan is a fast, readable web UI for `man` pages — built to feel like a tool: crisp type, keyboard-first, and no accounts.

- Live: https://betterman.sh
- Spec / architecture: `SPEC.md`
- Architecture overview (quick read): `docs/ARCHITECTURE.md`
- Getting started (local): `docs/GETTING_STARTED.md`
- Governance: `GOVERNANCE.md`
- Roadmap (high-level): `ROADMAP.md`
- Execution plan (living checklist): `PLAN.md`
- Changelog: `CHANGELOG.md`
- Releasing: `docs/RELEASING.md`
- Support: `SUPPORT.md`
- Contributing: `CONTRIBUTING.md`

<p align="center">
  <img src="nextjs/public/og-image.png" alt="BetterMan preview" />
</p>

## What you get

- Search with clean previews
- Multiple distros (Linux + BSD + macOS BSD-licensed pages)
- Local-only bookmarks, history, and reading preferences
- Command palette + shortcuts
- PWA + offline caching for recently read pages

## Repo layout

```text
/
├── nextjs/             # Next.js App Router (public web)
├── convex/             # Convex schema/functions for dataset reads, search, rate limits, ingest
├── backend/            # Legacy FastAPI API service (kept for maintenance/tests during cutover)
├── ingestion/          # Ingestion pipeline (dataset builds into Convex)
├── frontend/           # Legacy Vite SPA (used for CI/e2e harness only; do not add features here)
├── docker-compose.yml  # Local Postgres + Redis
└── SPEC.md
```

## Status

- Latest release: `v0.6.4` (tag `v0.6.4`)
- In progress: TBD (see `ROADMAP.md` + `PLAN.md`)
- Default branch: `main`

## Deploy (Railway)

- Auto-deploy: `.github/workflows/ci.yml` deploys after all jobs pass on pushes to `main`.
- Manual deploy: `.github/workflows/deploy.yml` (workflow `deploy-railway`, input `ref`).
- Requires `RAILWAY_TOKEN` GitHub Actions secret (used as Railway project-token auth in CI).
- Current runtime: `nextjs` reads datasets/search/rate limits from Convex.
- Legacy `web` FastAPI service may still exist during the infrastructure transition, but the active Next.js app no longer requires `FASTAPI_INTERNAL_URL`.

## Dataset updates

- Monthly ingest + promote: `.github/workflows/update-docs.yml` (workflow `update-dataset`).
  - `workflow_dispatch` defaults: `ingest=true`, `promote=false` (ingest to staging only).
  - Promote-only: `ingest=false`, `promote=true` (promotes current staging actives without re-ingesting).
  - Targeted ingest (debug): set `linux_distro=arch` and/or `bsd=false`.
- Requires `BETTERMAN_CONVEX_HTTP_URL` + `BETTERMAN_CONVEX_INGEST_SECRET` GitHub Actions secrets.
- Ingest activates `staging` release pointers; promotion copies active staging pointers to `prod` in Convex.
- Production Convex rebuild/import runbook: `docs/runbooks/convex-production-cutover.md`.

## Security / Quality (CI)

- Required PR checks for `main`: `dependency_review`, `frontend`, `backend`, `ingestion`, `api_types`, `e2e`.
- Code scanning: `.github/workflows/codeql.yml` (CodeQL) + `.github/workflows/scorecards.yml` (OSSF Scorecards → SARIF).
- Dependency updates: `.github/dependabot.yml` (GitHub Actions, frontend npm, backend/ingestion uv, Dockerfile base images).
- API contract: generated OpenAPI types for both `frontend/src/api/openapi.gen.ts` and `nextjs/lib/openapi.gen.ts` are enforced in CI.

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

### Convex

**Environment variables:**

- `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_URL` (Next.js): Convex client URL.
- `BETTERMAN_DATASET_STAGE` (Next.js): `prod` by default; `staging` for staging previews.
- `CONVEX_HTTP_URL` + `CONVEX_INGEST_SECRET` (ingestion): Convex HTTP actions URL and ingest bearer token.

## UX notes

- Desktop man pages: sticky sidebar (TOC + Find), collapsible via `b`.
- Mobile man pages: contents drawer (swipe from left edge, `b`, or the header contents button).
- Find-in-page: desktop in sidebar; mobile uses a compact sticky bar above content.
- `/bookmarks` and `/history` redirect to `/` (homepage dashboard includes Recent + Bookmarks).
- Man sections support extended suffixes (e.g. `/man/openssl/1ssl`, `/section/3p`).

## Golden commands

### Local services

- `pnpm db:up` — start legacy Postgres + Redis (Docker)
- `pnpm db:down` — stop services
  - Postgres exposed on `localhost:54320`

### Backend

- `pnpm backend:dev` — FastAPI dev server (port 8000)
- `pnpm backend:test` — backend tests (pytest)
- `pnpm backend:lint` — ruff check + format check

### Next.js

- `pnpm next:dev` — Convex watcher + Next.js dev server
- `pnpm convex:check` — one-shot Convex schema/function validation
- `pnpm next:build` — Next.js production build
- `pnpm next:lint` — Next.js lint

### Frontend

- `pnpm frontend:dev` — Vite dev server
- `pnpm frontend:build` — production build
- `pnpm frontend:lint` — eslint
- `pnpm frontend:test` — unit tests (Vitest)
- `pnpm frontend:e2e` — E2E tests (Playwright; expects Next.js + Convex running)

### Ingestion

- `pnpm ingest:sample` — ingest a small sample set
- `pnpm ingest:run` — ingest full dataset
- `pnpm ingest:lint` — ruff check + format check
- `pnpm ingest:test` — ingestion tests (pytest)

## Contributing

- Read `CONTRIBUTING.md`.
- Be kind: `CODE_OF_CONDUCT.md`.
- Security issues: `SECURITY.md`.
- Support/questions: `SUPPORT.md`.

## License

MIT — see `LICENSE`.
