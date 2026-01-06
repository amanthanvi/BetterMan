# Man page fetch returning 500

**Symptoms**

- `/api/v1/man/{name}/{section}` returns 500 for specific pages.
- Errors correlate with specific `datasetReleaseId`.

**Immediate checks**

- App logs for the request id (`X-Request-ID`) and exception traces.
- Confirm whether failures are isolated (single page) or broad.
- Check DB health (timeouts / connection errors).

**Mitigations**

- If isolated to a few pages: mark as known-bad in ingestion validation and re-run ingest.
- If broad / release-correlated: roll back dataset release (set previous release `is_active = true`).

**Follow-ups**

- Add a golden test for the failing page(s) under `SPEC.md` Section 19.
- Improve ingestion parser to hard-fail unsafe/invalid document models.
