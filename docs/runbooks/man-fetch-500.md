# Man page fetch returning 500

> **Current topology note.** Production man-page requests run through Next.js on Vercel and Convex content actions/file storage. Current dataset rollback follows the `Rollback` section in `docs/runbooks/convex-production-cutover.md`; application rollback follows `docs/runbooks/vercel-ops.md`.

**Symptoms**

- `/api/v1/man/{name}/{section}` returns 500 for specific pages.
- Errors correlate with specific `datasetReleaseId`.

**Immediate checks**

- Vercel request logs and Convex function logs for the active dataset stage, correlated by request time and route.
- Confirm whether failures are isolated (single page) or broad.
- Check `/api/v1/info` for the active `datasetReleaseId` and compare failures across distros.

**Mitigations**

- If isolated to a few pages: mark as known-bad in ingestion validation and re-run ingest.
- If broad and release-correlated: re-promote the previous known-good Convex release pointer using `docs/runbooks/convex-production-cutover.md`; do not delete the failing release during response.
- If code/deployment-correlated: roll back the application with `docs/runbooks/vercel-ops.md`.

## Legacy FastAPI/Railway path

For a deliberately retained legacy service, also inspect database health and set the previous release `is_active = true` when rolling back its PostgreSQL data. These instructions do not apply to the active Convex data plane.

**Follow-ups**

- Add a golden test for the failing page(s) under `SPEC.md` Section 19.
- Improve ingestion parser to hard-fail unsafe/invalid document models.
