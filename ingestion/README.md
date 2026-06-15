# Ingestion

Ingestion pipeline that builds BetterMan dataset releases and posts them to Convex.

Required environment:

- `CONVEX_HTTP_URL` or `CONVEX_URL` — Convex HTTP actions URL. `.convex.cloud` URLs are converted to `.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex ingest HTTP actions.
- `BETTERMAN_DATASET_STAGE` — `staging` for scheduled imports, `prod` for direct local/E2E seeds.

The ingest command parses man pages locally/in-container, creates a Convex release, stores full page content in Convex file storage, batch-inserts page metadata/search documents, and activates the release pointer for the configured stage when `--activate` is set.
