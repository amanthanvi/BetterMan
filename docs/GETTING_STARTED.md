# Getting started (local)

This doc is for running BetterMan locally.

- Want to contribute? Read `CONTRIBUTING.md`.
- Want the architecture deep dive? Read `SPEC.md` (or `docs/ARCHITECTURE.md` first).

## Prerequisites

- Node.js + pnpm (see `package.json` → `packageManager`)
- Python + `uv`
- Docker (only for legacy FastAPI/Postgres maintenance paths)

## Run it

For the active app:

```bash
pnpm install
pnpm convex:check
pnpm next:dev
```

By default:

- Next.js runs on `http://localhost:3000`
- Convex local dev runs on `http://127.0.0.1:3210`

For legacy FastAPI maintenance:

```bash
pnpm db:up
pnpm backend:dev
```

## Environment variables (optional)

Defaults are sensible for local dev, but you can customize via env vars.

- Copy the repo template: `cp .env.example .env`
  - `backend/` will load `../.env` automatically.

Useful vars:

- `NEXT_PUBLIC_CONVEX_URL` / `CONVEX_URL` (Next.js → Convex)
- `BETTERMAN_DATASET_STAGE` (`prod` by default)
- `CONVEX_HTTP_URL` / `CONVEX_INGEST_SECRET` (ingestion)
- `DATABASE_URL` / `REDIS_URL` (legacy backend only)
