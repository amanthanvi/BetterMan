# Frontend (legacy Vite harness)

`frontend/` is **not** the production web app anymore.

It remains in the repo for:

- Playwright end-to-end coverage
- the legacy SPA build/lint/test CI jobs
- generated frontend API types in `src/api/openapi.gen.ts`

Production user traffic is served by **`nextjs/`**, while **`backend/`** is the API-only FastAPI service.

## What to use this package for

- `pnpm frontend:test` — legacy Vitest coverage
- `pnpm frontend:e2e` — Playwright tests used in CI
- `pnpm frontend:build` / `pnpm frontend:lint` — legacy compatibility checks

## What not to do

- Do **not** add new product features here
- Do **not** treat this package as the source of truth for the public UI
- Prefer updating `nextjs/` for user-facing behavior

## Related packages

- `nextjs/` — production SSR web app
- `backend/` — FastAPI API-only service
- `ingestion/` — dataset pipeline
