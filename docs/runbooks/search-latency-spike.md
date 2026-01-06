# Search latency spike

**Symptoms**

- `/api/v1/search` P95 > 500ms (10+ min), timeouts, elevated 5xx.

**Immediate checks**

- DB CPU/IO saturation, connections near max.
- Slow query log / query plans for `/search` query shape.
- Cache effectiveness: confirm ETag/Cache-Control active at edge/browser.
- 429 rate limit counts (spike = abuse or bots).

**Mitigations (safe first)**

- Increase rate limiting aggressiveness on `/search` (lower per-minute).
- Reduce `limit` default in UI (keep max 50) if necessary for load shedding.
- Verify Postgres `pg_trgm` + `tsvector` indexes exist and are used.

**Follow-ups**

- Add/adjust indexes if query plan regressed.
- Consider caching hot queries at CDN edge (still keyed to `datasetReleaseId`).
