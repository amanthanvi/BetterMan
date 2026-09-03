# E2E test failures (Playwright)

BetterMan E2E tests live in `nextjs/e2e/` and run in CI in `.github/workflows/ci.yml` (`e2e` job).

## Triage in CI

1. Open the failing workflow run.
2. If browser setup failed, run `bash scripts/test-install-playwright-ci.sh`; its eight scenarios distinguish GNU-timeout compatibility and dependency timeout/kill handling from safe browser-download retries.
3. Check the failed test name and the step output.
4. If Playwright traces/screenshots are present, use them to pinpoint the failure cause (timing, selector ambiguity, missing seed data).

## Run locally (match CI)

Follow the exact Convex seed + Next.js startup sequence in CI’s `e2e` job. After the app is ready on port 3000, run:

- `E2E_BASE_URL=http://127.0.0.1:3000 pnpm next:e2e`


## Common causes

- Duplicate accessible names (strict mode selector collisions).
- Deferred UI updates (find-in-page, virtualized rendering) not awaited.
- Seed data drift (test expects a page that isn’t in the deterministic seed).
