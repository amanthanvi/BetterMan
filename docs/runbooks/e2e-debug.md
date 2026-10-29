# E2E test failures (Playwright)

BetterMan E2E tests live in `nextjs/e2e/` and run in CI in `.github/workflows/ci.yml` (`e2e` job).

## Triage in CI

1. Open the failing workflow run.
2. If browser setup failed, run `bash scripts/test-install-playwright-ci.sh`; its fourteen scenarios distinguish GNU-timeout resolution (`timeout`, then Ubuntu 26.04's `gnutimeout`) and dependency timeout/kill handling from safe browser-download retries. A dependency step that exits 124 after slow apt `Get:` lines is a mirror stall rather than a test failure. Check the "Prefetch Playwright system packages" step first. It restores those packages from the Actions cache and downloads the rest with a 15-minute budget; if it also ran out of time, re-run the job.
3. Check the failed test name and the step output.
4. If Playwright traces/screenshots are present, use them to pinpoint the failure cause (timing, selector ambiguity, missing seed data).

## Run locally (match CI)

Follow the exact Convex seed + Next.js startup sequence in CI’s `e2e` job. After the app is ready on port 3000, run:

- `E2E_BASE_URL=http://127.0.0.1:3000 pnpm next:e2e`


## Common causes

- Duplicate accessible names (strict mode selector collisions).
- Deferred UI updates (find-in-page) not awaited.
- Seed data drift (test expects a page that isn’t in the deterministic seed).

## Interactive shell contract

The site sets `data-bm-hydrated="true"` on the document element once per document load, after the shell's client runtime has attached its keyboard and click handlers (shortcuts, palette, find bar, theme). It is not reset on client-side navigation, and it does not cover page content under a loading boundary (`(site)/loading.tsx`), which can hydrate later: wait on that content itself before clicking it. E2E tests wait for this signal with `waitForInteractiveShell`; server HTML must not include it. Any future client runtime, including the standalone man-page bundle, must set the same attribute after attaching its handlers.
