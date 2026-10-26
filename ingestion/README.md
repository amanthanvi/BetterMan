# Ingestion

Ingestion pipeline that builds BetterMan dataset releases and posts them to Convex.

Required environment:

- `CONVEX_HTTP_URL` or `CONVEX_URL` — Convex HTTP actions URL. `.convex.cloud` URLs are converted to `.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex ingest HTTP actions.
- `BETTERMAN_DATASET_STAGE` — `staging` for scheduled imports, `prod` for direct local/E2E seeds.

Optional: `BETTERMAN_INGEST_PAGE_BATCH_ITEMS` (default 20) and `BETTERMAN_INGEST_PAGE_BATCH_BYTES` (default 8 MiB) bound each page upload request. The Linux container receives each one, by name, when it is set on the host.

The ingest command parses man pages locally/in-container, creates a Convex release, stores full page content in Convex file storage, batch-inserts page metadata/search documents, and activates the release pointer for the configured stage when `--activate` is set.

Optional: `BETTERMAN_INGEST_WORKERS` sets the number of parse processes, clamped to 1–8 and defaulting to the CPU count up to 8. `1` parses sequentially. Output order and page ids do not depend on it.

## Parser fixtures

`tests/fixtures/roff/` holds roff sources captured from Debian trixie plus one mdoc page from macOS. `tests/test_golden.py` renders each with the host `mandoc` and compares the parsed result to `tests/fixtures/golden/`. After a deliberate parser change:

```bash
uv run python -m pytest tests/test_golden.py --update-golden
cp tests/fixtures/golden/*.json ../nextjs/components/doc/__fixtures__/
```

The Next.js test `components/doc/DocRenderer.golden.test.tsx` renders the same JSON, so the two copies must match.

The curated command-page check runs after parsing and alias resolution, before any
release upload. Arch reinstalls requested packages to restore man pages omitted
by its container image; Alpine requires `tar-doc` alongside `tar`. New package
sets should extend the representative command expectations in `ingest_runner.py`.

Fedora, Arch, and Alpine collect package notices from `/usr/share/licenses`.
Arch also resolves declared SPDX licenses there; Alpine installs
`spdx-licenses-text` and resolves declarations from `/usr/share/spdx/text` because
many `-doc` packages ship no license copy. FreeBSD and the filtered macOS corpus
record base-system package/version provenance and upstream source links.
These dataset corrections take effect at the next monthly ingest.

`git-commit.1` was captured from
<https://manpages.debian.org/trixie/git-man/git-commit.1.en.gz> (Git 2.47.3).
`dash-prose.1` is a synthetic negative fixture for option extraction.
