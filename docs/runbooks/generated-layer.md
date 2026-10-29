# Generated layer operations

How to run, pause, correct and switch the generated layer. Background,
limits and the cost model are in `docs/generated-layer.md`.

## One-time owner setup

1. Create an OpenCode Go API key for this purpose in the workspace that holds
   the Go subscription. Keep other heavy Go work off the schedule below.
2. Add it as the secret `OPENCODE_GO_API_KEY` in the `production` environment
   (Settings → Environments → production → Environment secrets). The workflow
   already uses `BETTERMAN_CONVEX_HTTP_URL` and `BETTERMAN_CONVEX_INGEST_SECRET`
   from the same environment.
3. Optional environment variables (Settings → Environments → production →
   Environment variables):
   - `BETTERMAN_GEN_BUDGET_FRACTION`: share of each Go cap, default `0.5`.
   - `BETTERMAN_GEN_RUN_CAP_USD`: ceiling per run, default `8`.
   - `BETTERMAN_GEN_RPM`: requests per minute, default `20`.
4. Deploy Convex from `main` so `GET /ingest/generated/contract` answers
   version 2 (the generated-layer contract; the release ingest contract is
   separate). The CLI refuses to run against any other version.

Without the secret, every run is a dry run: it reads a 50-page sample,
extrapolates the cost and writes nothing.

## Running

Actions → generated-layer → Run workflow:

- First run: `dry_run` on (the default). Read the `generation_summary` line:
  pages selected, pages that would be generated and the estimated off-peak
  cost.
- First live run: `dry_run` off, `limit` 50. Skim the records it wrote (see
  "Checking output") before running the whole tier.
- Then: `dry_run` off, `limit` empty. A run stops model calls when a budget
  window, the run cap or Go's own limit is reached, still writes page and tldr
  examples, and saves the ledger for the next run.

The schedule runs at 12:00 UTC on the 2nd and 9th of each month, after the
monthly ingest, and writes when the secret exists. It reads the `staging`
release; rows are keyed by content hash, so they serve the same pages once
promoted.

Locally, with a local Convex deployment only:

```bash
cd ingestion
uv run python -m ingestion.generated.cli fetch-tldr --dest /tmp/tldr
uv run python -m ingestion.generated.cli run --source convex --distro debian \
  --stage prod --tldr /tmp/tldr --limit 20 --dry-run
```

`--source cache --cache DIR` runs over cached mandoc HTML
(`DIR/<distro>/html/*.html.gz`) without Convex; add `--out records.jsonl` to
inspect the records. `coverage` reports tldr coverage and verifier rejections
for the same cache.

## Ledger recovery failed

The `Restore the budget ledger` step exits non-zero when the newest trusted
ledger from the last 30 days cannot be downloaded or validated, or when the
artifact listing cannot be read. It never falls back to an older ledger. Nothing is generated. Re-run the workflow once (a download can
fail transiently). If it still fails, look at the step log, which names each
artifact and why it was rejected, and the `generated-layer-state` artifacts
in recent default-branch runs. Do not delete artifacts to force a fresh
ledger: that forgets spend Go still counts. If the ledger is truly lost, wait
until the 30-day window has passed since the last run that spent money.

## Checking output

The summary line counts requests, spend, rejected examples by reason, invalid
model responses and failed pages. A jump in rejections or invalid responses
after a model or prompt change means stop and review. `finishReasons` and
`contentShapes` count completed responses, and invalid JSON reasons include both.
`length` suggests truncation; `empty_with_reasoning` indicates reasoning was
present without final content, not that it contained an answer. `text_before_object`
indicates a prefix; it is rejected, not stripped. These are bounded categories:
never log model text, reasoning, page text, or arbitrary provider values. The old
run had none of these diagnostics, so its causes cannot be reconstructed.

For a sample of pages, open the man page API response
(`/api/v1/man/<name>/<section>`) and read `brief`.

## Refreshing page examples

Unchanged rows are skipped, so a fix to page-example or tldr extraction
reaches stored rows only through a refresh. Run the workflow with
`refresh_page` on, `llm` off and `dry_run` off: it rebuilds page and tldr
examples on existing rows, keeps their model text and makes no model calls.
Locally, the CLI flags are `--refresh-page --no-llm`.

## Pausing and resuming

A pause is normal. The log line `generation_paused` names the reason and the
resume time: a 5 h, 7 d or 30 d window, peak hours, the run cap, or Go's
"usage limit exceeded" (which waits at least an hour). The next scheduled or
manual run resumes from the ledger. To stop entirely, disable the workflow.

## Removing a bad item

Find the page's content hash (`manPages.contentSha256`), then, with a deploy
key for the target deployment:

```bash
npx convex run generated:suppressParts \
  '{"contentSha256": "<hash>", "parts": ["generated"]}'
```

Use `"tldr"` or `"page"` for the other parts. The part disappears from the page
at once (after the Next.js data cache expires) and is never uploaded again for
that hash. A changed page gets a new hash and starts clean.

## Switching provider

The client is OpenAI-compatible. `BETTERMAN_GEN_BASE_URL`,
`BETTERMAN_GEN_MODEL`, `BETTERMAN_GEN_PROVIDER` and `BETTERMAN_GEN_API_KEY`
select another endpoint without code changes. Moving from OpenCode Go to the
direct DeepSeek API or anything else is a spend change: get the owner's
sign-off first, and recheck the prices in `budget.py`, which assume Go's.

## Upgrading tldr-pages

Pick an upstream commit, fetch it with `fetch-tldr --dest` after updating
`TLDR_COMMIT`, compute `pages_digest` and update `TLDR_PAGES_SHA256`. Rerun
`coverage` and compare rejection counts. The next run refreshes every page
whose stored tldr commit differs; model text is kept.
