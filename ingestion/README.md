# Ingestion

Ingestion pipeline that builds BetterMan dataset releases and posts them to Convex.

Required environment:

- `CONVEX_HTTP_URL` or `CONVEX_URL` — Convex HTTP actions URL. `.convex.cloud` URLs are converted to `.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex ingest HTTP actions.
- `BETTERMAN_DATASET_STAGE` — `staging` for scheduled imports, `prod` for direct local/E2E seeds.

The ingest command parses man pages locally/in-container, creates a Convex release, stores full page content in Convex file storage, batch-inserts page metadata/search documents, and activates the release pointer for the configured stage when `--activate` is set.

## Parser fixtures

`tests/fixtures/roff/` holds roff sources captured from Debian trixie plus one mdoc page from macOS. `tests/test_golden.py` renders each with the host `mandoc` and compares the parsed result to `tests/fixtures/golden/`. After a deliberate parser change:

```bash
uv run python -m pytest tests/test_golden.py --update-golden
cp tests/fixtures/golden/*.json ../nextjs/components/doc/__fixtures__/
```

The Next.js test `components/doc/DocRenderer.golden.test.tsx` renders the same JSON, so the two copies must match.
