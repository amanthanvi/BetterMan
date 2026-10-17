---
name: render-man-page
description: "Render a seeded man page in the local BetterMan app and compare documented counts with the constants the code ships. Use when changing man-page rendering, the document model, or copy that states a chunk budget, page batch, section limit, or activation deadline."
---

# Render a man page

Open one seeded page in the running app and confirm the document that was uploaded is the document on screen. Then compare any count in the docs or UI with the constant the code ships. Stop when a count disagrees.

## When to use

- A change touches man-page rendering, the document model, or the seeded page fixture.
- Docs, UI copy, or a test name state a chunk budget, page batch, section limit, or activation deadline.

## Render

From the repository root, with Node 26 and pnpm 10.34:

```bash
pnpm install
pnpm convex:check
```

Start the app and leave it running:

```bash
set -a; . ./.env.local; set +a
export CONVEX_URL="${CONVEX_URL:-$VITE_CONVEX_URL}"
export NEXT_PUBLIC_CONVEX_URL="$CONVEX_URL"
CONVEX_AGENT_MODE=anonymous pnpm next:dev
```

If port 3000 is already serving, use it only when that process was started from this checkout. Another checkout can make this page look fine while the files you changed are not what is running.

Seed the fixture while the app is up:

```bash
npx convex env set CONVEX_INGEST_SECRET dev
set -a; . ./.env.local; set +a
BETTERMAN_E2E_SEED=1 CONVEX_INGEST_SECRET=dev CONVEX_HTTP_URL="${CONVEX_SITE_URL:-$VITE_CONVEX_SITE_URL}" node scripts/seed-convex-e2e.mjs
```

Open these URLs and check each point in the browser:

1. `http://localhost:3000/man/tar/1`
   - The accessible heading contains `tar(1)`.
   - The visible description is `an archiving utility`.
   - The running head is hidden from assistive tech and shows `TAR(1)` on both sides, with `User Commands` between them on a wide viewport.
   - The page does not add a second `NAME` heading in the body.
   - The options table is named `Command-line options` and includes `--create`.
   - `SEE ALSO` links to `gzip(1)`.
   - The `Related commands` region is present.
   - `Find in page` focuses the find textbox.
2. `http://localhost:3000/man/gunzip/1` ends on `/man/gzip/1`.
3. `http://localhost:3000/man/printf` offers both `printf(1)` and `printf(3)`.

`pnpm next:e2e` asserts the same hooks. Use it when the manual pass is unclear. It does not replace opening the page.

## Counts

Read the constants and the sentences that quote them. Fail this verification when a documented or on-screen number disagrees with the constant.

| What a reader sees | Constant |
| --- | --- |
| Section offset cap of 5,000 in `nextjs/README.md` | `MAX_SECTION_OFFSET` in `convex/queries.ts`, and the cursor-less offset max in `nextjs/app/api/[...path]/route.ts` |
| Section `limit` of 1 to 500, default 200, in `nextjs/README.md` | `MAX_SECTION_LIMIT` in `convex/queries.ts`, and the limit default and max in `nextjs/app/api/[...path]/route.ts` |
| Page batch size, including any "(N chunks)" or "(N pages)" sentence | `batch_size` in `ingestion/ingestion/ingest_runner.py` |
| Activation deadline, including "five minutes" | `timeout_seconds` default on `activate_release` in `ingestion/ingestion/convex_client.py` |
| Chunk budget | `CONTENT_CHUNK_CHARS` in `convex/ingest.ts` |

```bash
rg -n 'MAX_SECTION_OFFSET|MAX_SECTION_LIMIT|batch_size|timeout_seconds|CONTENT_CHUNK_CHARS|chunks\)|pages\)' \
  nextjs/README.md convex/queries.ts convex/ingest.ts \
  'nextjs/app/api/[...path]/route.ts' \
  ingestion/ingestion/ingest_runner.py ingestion/ingestion/convex_client.py
```

A sentence left on an old chunk count after the code moved to a byte budget is a failure, even when the page itself renders.

## Report

Say which URL you opened, the heading and description you saw, whether the alias redirect and the printf picker matched, and each count pair as match or mismatch. Name the constant and the sentence when they disagree.
