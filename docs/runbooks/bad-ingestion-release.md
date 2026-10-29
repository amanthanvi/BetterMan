# Bad ingestion release published

**Symptoms**

- Many pages missing or malformed after a dataset update.
- Spike in 404s for previously-valid URLs.

**Immediate checks**

- Confirm each affected distro's active `datasetReleaseId` via public `getInfo` (exposed at `/api/v1/info?distro=…`) and compare it with the previous prod ID saved before promotion. A failed promotion may already have changed prod if the response was lost; rollback is always manual.
- Compare success/hard-fail rates from ingestion logs against thresholds.

**Mitigations**

- Roll back by activating the saved previous known-good release directly on `prod` using the command below. Require manifest verification, sealing, and completed related metadata; wait for `pending: false`. Do not edit active pointers or completeness fields directly.
- Re-run ingestion with fixes; validate on staging first.
- If the previous release lacks its original alias declaration, do not infer completeness from the aliases currently stored. Recover original ingestion evidence and validate it explicitly, or re-ingest under a new release ID. Keep the current data available until a verified replacement is ready.
- Rollback targets must still exist. `prune-releases` retains the newest verified inactive release per distro by default (`keep_per_distro`); raise it before pruning if a longer rollback window is wanted.

## Manual rollback command

From the repository root, with `CONVEX_HTTP_URL` and `CONVEX_INGEST_SECRET` already securely configured for the intended production deployment, replace the placeholder with that distro's saved previous prod `datasetReleaseId`. Ensure no workflow refresh, pruning, or manual ingest is running: this manual operation does not join the workflow concurrency group. Run once per affected distro using its own saved ID; the release determines the distro.

```bash
BETTERMAN_ROLLBACK_RELEASE_ID='<previous-prod-id>' uv run --directory ingestion python -c '
import os
from datetime import UTC, datetime
from ingestion.convex_client import ConvexIngestClient

client = ConvexIngestClient(
    http_url=os.environ["CONVEX_HTTP_URL"],
    ingest_secret=os.environ["CONVEX_INGEST_SECRET"],
)
client.require_deployed_contract()
client.activate_release({
    "stage": "prod",
    "datasetReleaseId": os.environ["BETTERMAN_ROLLBACK_RELEASE_ID"],
    "activatedAt": datetime.now(tz=UTC).isoformat(),
})
'
```

This uses the existing activation endpoint's manifest and seal checks and the client's hydration polling (up to 45 minutes), returning only after `pending: false` for the requested ID. On timeout or a lost response, re-check public `getInfo` before retrying the same saved ID. After success, confirm the prod ID and smoke-test representative pages and search. No staging activation or promotion is required for this rollback.

**Follow-ups**

- Expand golden test coverage for representative pages.
- Add a validation job that renders + searches a fixed smoke test suite before promotion.
