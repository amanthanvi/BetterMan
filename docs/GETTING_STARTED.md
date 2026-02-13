# Getting started (local)

This doc is for running BetterMan locally.

- Want to contribute? Read `CONTRIBUTING.md`.
- Want the architecture deep dive? Read `SPEC.md` (or `docs/ARCHITECTURE.md` first).

## Prerequisites

- Node.js + pnpm (see `package.json` → `packageManager`)
- Python + `uv`
- Docker (for local Postgres + Redis)

## Run it

In one terminal:

```bash
pnpm db:up
pnpm backend:dev
```

In another terminal:

```bash
pnpm next:dev
```

By default:

- Next.js runs on `http://localhost:3000`
- FastAPI runs on `http://127.0.0.1:8000`

## Environment variables (optional)

Defaults are sensible for local dev, but you can customize via env vars.

- Copy the repo template: `cp .env.example .env`
  - `backend/` will load `../.env` automatically.

Useful vars:

- `DATABASE_URL` / `REDIS_URL` (backend)
- `FASTAPI_INTERNAL_URL` (Next.js → FastAPI base URL; defaults to `http://127.0.0.1:8000`)

