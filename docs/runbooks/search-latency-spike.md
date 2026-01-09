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

## Query plan triage (EXPLAIN ANALYZE)

The `/api/v1/search` query shape is defined in `backend/app/api/v1/routes/search.py`.

### Local (Docker Compose Postgres)

1. Start Postgres:
   - `pnpm db:up`
2. Ensure schema + some data exists (one of):
   - Run ingestion (slowest, most representative): `pnpm ingest:run`
   - Or a smaller sample: `pnpm ingest:sample`
3. Run `EXPLAIN (ANALYZE, BUFFERS)` via psql:
   - `docker compose exec -T postgres psql -U betterman -d betterman`

What to look for:
- Index usage on `man_page_search` (`ix_man_page_search_tsv`, `ix_man_page_search_name_trgm`, `ix_man_page_search_desc_trgm`)
- No sequential scan of `man_page_content` for common queries (should only fetch content for the top-N results)
- Low buffers/IO on warm cache; stable planning time

Note: on very small datasets, Postgres may choose simple nested loops / PK lookups and not use the GIN/trigram indexes. That’s expected; use production-like row counts for meaningful tuning.

### Production (Railway)

Run the same `EXPLAIN (ANALYZE, BUFFERS)` using Railway’s Postgres connection string.

What to capture for an incident:
- The full plan (copy/paste)
- The query params (`q`, `limit`, `offset`, `section`)
- Postgres version + instance size (CPU/RAM)
- Row counts for `man_pages` / `man_page_search`
