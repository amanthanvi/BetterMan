# E2E test failures (Playwright)

BetterMan E2E tests live in `frontend/e2e/` and run in CI in `.github/workflows/ci.yml` (`e2e` job).

## Triage in CI

1. Open the failing workflow run.
2. Check the failed test name and the step output.
3. If Playwright traces/screenshots are present, use them to pinpoint the failure cause (timing, selector ambiguity, missing seed data).

## Run locally (match CI)

Follow the same order as CI’s `e2e` job in `.github/workflows/ci.yml`:

1. Start services:
   - `pnpm db:up`
2. Migrate + seed (see CI step “Migrate + seed DB”).
3. Build frontend:
   - `pnpm frontend:build`
4. Start backend (serves SPA + API):
   - `pnpm backend:dev` (or follow CI’s uvicorn command)
5. Run tests:
   - `E2E_BASE_URL=http://127.0.0.1:8000 pnpm frontend:e2e`

## Common causes

- Duplicate accessible names (strict mode selector collisions).
- Deferred UI updates (find-in-page, virtualized rendering) not awaited.
- Seed data drift (test expects a page that isn’t in the deterministic seed).

