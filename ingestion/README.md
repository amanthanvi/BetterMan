# Ingestion

Ingestion pipeline that builds BetterMan dataset releases and posts them to Convex.

Required environment:

- `CONVEX_HTTP_URL` or `CONVEX_URL` — Convex HTTP actions URL. `.convex.cloud` URLs are converted to `.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex ingest HTTP actions.
- `BETTERMAN_DATASET_STAGE` — `staging` for scheduled imports, `prod` for direct local/E2E seeds.

The ingest command parses man pages locally/in-container, creates a Convex release, stores full page content in Convex file storage, batch-inserts page metadata/search documents, and activates the release pointer for the configured stage when `--activate` is set.

## Parse workers

Parsing runs in a process pool with `min(8, CPU count)` workers by default.
Set `BETTERMAN_INGEST_WORKERS` to a positive integer to tune CPU and memory use;
`BETTERMAN_INGEST_WORKERS=1` parses sequentially without child processes. The
setting is forwarded to Linux Docker runners and applies directly on FreeBSD
and macOS. Worker count is validated before package installation starts.

Workers only read local source files and immutable package attribution inputs.
Results are collected in source order, including aliases and individual page
errors, so worker scheduling does not change document, link, or sitemap order.
Progress logs include handled sources (pages, aliases and failures), throughput,
and ETA at every 100 sources and when parsing finishes.

## Restarting an upload

Choose a unique, distro-qualified `--release-id` **on the first attempt** and
repeat that command to resume. For example, with the required Convex environment
already configured:

```bash
export BETTERMAN_INGEST_STATE_DIR="$HOME/.cache/betterman/ingestion"
pnpm ingest:run --distro debian --release-id monthly-2026-10-debian --activate
# After an interruption, run the same command again.
pnpm ingest:run --distro debian --release-id monthly-2026-10-debian --activate
```

Without the flag, release IDs still include the current timestamp and each
command builds a new release. `--resume SECONDS` is not supported.

The explicit-ID path writes a durable SQLite checkpoint before the first release
POST. It freezes the full declaration (including `ingestedAt`, manifest
`generatedAt`, package versions, counts, licenses and section totals), all page
payloads, links and sitemap assignments. Successful batch responses are recorded
as upload acknowledgements. On retry, the pipeline reuses that exact snapshot,
skips content-package installation, scanning and parsing, and never loads or
POSTs acknowledged page documents. Already uploaded work therefore costs a small
local checkpoint read plus the matching release-declaration POST; it does not
repeat `mandoc` or page-content transfer. Activation, if requested, still performs
the server's completeness, sealing and related-metadata hydration checks.

Keep the checkpoint directory: it defaults to `~/.cache/betterman/ingestion` and
can be moved with `BETTERMAN_INGEST_STATE_DIR`. Docker mounts this directory
writable outside its ephemeral `/work` tree; checkpoint files retain the host
user's ownership. Container image pull and Python bootstrap still run on each
invocation. Docker retries automatically pull the checkpoint's original image
digest, so a moved distro tag cannot change or strand the prepared release.
Pinning the first attempt's image is still useful for reproducible new builds. The checkpoint
checks the normalized Convex destination, distro, locale, stage, sample choice,
image reference/digest and git SHA. A mismatch stops before parsing or upload.
Worker count and `--activate` may change on retry because they do not change the
frozen dataset. Changes to local man files or package repositories are deliberately
not incorporated into a resumed snapshot: use a **new** ID to rebuild content.

Monthly workflow ingests use `gha-<run_id>-<distro>` IDs and save checkpoints after
failed uploads. Rerun the failed workflow job to restore that run's checkpoint;
starting a new workflow run builds a new release. A checkpoint only exists after
the complete parse/prepare stage commits, so an interruption during parsing must
parse again. Cache eviction or loss of the local checkpoint removes the fast
resume path; start a new ID rather than rebuilding an existing release in place.
An abrupt runner/VM loss before the cache-save or FreeBSD copyback step can lose
the current attempt's progress; ordinary upload failures that reach those steps
are recoverable. If the original image digest is no longer available from its
registry, start a new workflow run/release rather than switching provenance.

Server protocol, confirmed in `convex/ingest.ts`, `convex/http.ts` and
`convex/_releaseManifest.ts`:

- Page `externalId` is `sha256("<distro>/<name>/<section>")[:32]`. It is a stable
  route identity; the source hash and rendered-payload digest are separate content
  identities. The server accepts nonempty strings, with no UUID requirement.
- `createRelease` returns `{releaseId, existed: true}` for an identical declaration.
  It rejects changed declarations with `RELEASE_MANIFEST_CONFLICT`; the client
  propagates that error. No duplicate-release exception needs to be swallowed.
- Both insert paths skip existing `(releaseId, externalId)` entries before route
  validation or the sealed-write guard. New IDs claiming an existing name/section
  raise `DUPLICATE_MAN_PAGE_ROUTE`. A skip does **not** compare changed content,
  which is why retries use frozen payloads rather than rebuilding them.
- If a POST committed but its response/receipt was lost, the unacknowledged batch
  is replayed. That replay transfers the full batch, serializes/hashes its rendered
  fields, queries stored digests and external IDs, and skips metadata insertion.
  Identical payloads reuse existing stored files; declaration/upload counters do
  not increase twice. This is safe, but costs more than an acknowledged batch.
- Missing checkpoints cannot adopt an already-existing release. Checkpoints also
  reject a changed server release identity after pruning/recreation. Keep
  checkpoints until recovery is finished; they contain public page/license data,
  not the ingest secret.

## Page batches and upload failures

Page batches accumulate in source order up to **8 MiB of UTF-8 JSON**, including
the release envelope, commas and JSON escaping. A 512-page transaction cap also
bounds batches of tiny pages. A page whose complete payload exceeds the byte
budget is logged as a failed singleton without sending an oversized request.
Alias and license batches retain their existing limits.

After the client's bounded transient retries, a failed page batch is bisected
in order until good sub-batches succeed or the rejected singleton is identified.
`page_batch_split` and `page_upload_failed` logs identify the failure; later pages,
licenses and unaffected aliases continue uploading. Successful sub-batches gain
checkpoint acknowledgements; failed pages and aliases targeting them stay pending.
The summary excludes rejected pages from `succeeded` and adds them to hard
failures alongside parse failures, with separate `parseFailed` and `uploadFailed`
fields. They count against the existing 2% hard-failure and 80% success gates.

The release declaration was frozen **before** upload, and Convex requires exact
page/section/alias/license counts to activate it. Changing those declared counts
after a poison page would conflict with exact resume and undermine manifest
verification. The conservative fallback keeps the declared totals, records the
upload failure as a hard page failure, and **blocks activation whenever any
declared page is missing**, even below 2%. The incomplete draft can be retried
under the same ID after a transient/server fault is resolved. If the frozen page
payload itself needs correction, fix the producer and start a new release ID;
do not edit the checkpoint or lower declaration counts. Existing active pointers
are never changed by a failed run.

## Parser fixtures

`tests/fixtures/roff/` holds roff sources captured from Debian trixie plus one mdoc page from macOS. `tests/test_golden.py` renders each with the host `mandoc` and compares the parsed result to `tests/fixtures/golden/`. After a deliberate parser change:

```bash
uv run python -m pytest tests/test_golden.py --update-golden
cp tests/fixtures/golden/*.json ../nextjs/components/doc/__fixtures__/
```

The Next.js test `components/doc/DocRenderer.golden.test.tsx` renders the same JSON, so the two copies must match.
