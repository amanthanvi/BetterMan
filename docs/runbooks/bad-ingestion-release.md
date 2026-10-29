# Bad ingestion release published

**Symptoms**

- Many pages missing or malformed after a dataset update.
- Spike in 404s for previously-valid URLs.

**Immediate checks**

- Confirm each affected distro's active `datasetReleaseId` via public `getInfo` (exposed at `/api/v1/info?distro=…`) and compare it with the previous prod ID saved before promotion. A failed promotion may already have changed prod if the response was lost; rollback is always manual.
- Compare success/hard-fail rates from ingestion logs against thresholds.

**Mitigations**

- Roll back a curated release by activating the saved previous known-good release directly on `prod` using the command below. For full-Debian archive releases, use staging activation and explicitly gated promotion as described below. Require manifest verification, sealing, and completed related metadata; wait for `pending: false`. Do not edit active pointers or completeness fields directly.
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

This uses the existing activation endpoint's manifest and seal checks and the client's hydration polling (up to 45 minutes), returning only after `pending: false` for the requested ID. On timeout or a lost response, re-check public `getInfo` before retrying the same saved ID. After success, confirm the prod ID and smoke-test representative pages and search. Curated-release rollback does not require staging activation or promotion.

## Full-Debian archive rollback

An earlier full-Debian release still carries `acquisition: "deb-extraction"`.
`/ingest/activate` refuses to activate it directly on prod with
`409 FULL_DEBIAN_PROMOTION_HELD`, including during rollback. Do not change its
identity or bypass the hold by editing pointers.

With the same intended deployment configured, and no refresh, pruning or other
manual activation running, activate the saved full-Debian rollback ID on staging:

```bash
pnpm ingest:activate --release-id '<previous-full-debian-prod-id>' --stage staging
```

Wait for successful completion (`pending: false`) and confirm Debian's staging
ID is the saved rollback target. Inspect **all seven** staging pointers before
the next command: promote-only dispatches attempt all distros and ignore distro
selectors. Once the owner authorizes the rollback, use the explicit promotion
input without enabling a recurring repository switch:

```bash
gh workflow run update-dataset -f ingest=false -f promote=true -f debian_full_promote=true
```

The workflow checks contract v6, reads and verifies the staging ID through the
authenticated promotion-source endpoint, and passes it as
`expectedDatasetReleaseId: {"debian": "<saved-rollback-id>"}` with the required
full-Debian authorization. The transaction checks the persisted acquisition
identity, CAS expectation, seal, manifest and metadata. A concurrent staging
change returns `409 STAGING_RELEASE_CONFLICT` and changes no pointers in that
request; investigate and verify the intended ID before a new dispatch. Confirm
the returned Debian prod ID matches the saved
rollback ID, then smoke-test pages and search. On a lost response, check public
`getInfo` before retrying. Keep the staging pointer unchanged until promotion
finishes; manual activation is outside workflow concurrency protection. A retry
whose prod pointer already equals the expected ID acknowledges it without
rewriting pointers or history, but still requires full-Debian authorization.
`409 INGEST_CONTRACT_MISMATCH` requires matching workflow/Convex versions, never
an unconditional retry. See [deploy recovery](multi-distro-ops.md#deploy-and-activation-recovery).

**Follow-ups**

- Expand golden test coverage for representative pages.
- Add a validation job that renders + searches a fixed smoke test suite before promotion.
