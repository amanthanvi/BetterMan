# Bad ingestion release published

**Symptoms**

- Many pages missing or malformed after a dataset update.
- Spike in 404s for previously-valid URLs.

**Immediate checks**

- Confirm the active `datasetReleaseId` via `/api/v1/info`.
- Compare success/hard-fail rates from ingestion logs against thresholds.

**Mitigations**

- Roll back by activating a previous known-good release through `/ingest/activate` for the intended stage, then promoting its validated staging pointer through `/ingest/promote` when appropriate. Require manifest verification, sealing, and completed related metadata; wait for `pending: false`. Do not edit active pointers or completeness fields directly.
- Re-run ingestion with fixes; validate on staging first.
- If the previous release lacks its original alias declaration, do not infer completeness from the aliases currently stored. Recover original ingestion evidence and validate it explicitly, or re-ingest under a new release ID. Keep the current data available until a verified replacement is ready.

**Follow-ups**

- Expand golden test coverage for representative pages.
- Add a validation job that renders + searches a fixed smoke test suite before promotion.
