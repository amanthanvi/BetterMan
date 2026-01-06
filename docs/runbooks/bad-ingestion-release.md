# Bad ingestion release published

**Symptoms**

- Many pages missing or malformed after a dataset update.
- Spike in 404s for previously-valid URLs.

**Immediate checks**

- Confirm the active `datasetReleaseId` via `/api/v1/info`.
- Compare success/hard-fail rates from ingestion logs against thresholds.

**Mitigations**

- Roll back: set previous release `is_active = true` and disable the bad release.
- Re-run ingestion with fixes; validate on staging first.

**Follow-ups**

- Expand golden test coverage for representative pages.
- Add a validation job that renders + searches a fixed smoke test suite before promotion.
