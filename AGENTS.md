# Agent notes

BetterMan is a Next.js app on Vercel that reads man page data from Convex. A Python pipeline in `ingestion/` turns roff into a JSON document model and uploads dataset releases. There is no other backend.

## Read first

- `README.md` for layout and commands
- `DESIGN.md` for the visual grammar and the contracts the E2E tests assert
- `PRODUCT.md` for who the product is for and what it will not become
- `convex/_generated/ai/guidelines.md` before touching anything in `convex/`

## Rules

- Only run scripts that exist in `package.json` or CI.
- The visual grammar is enforced by `pnpm next:grammar`: square corners; no enclosing borders, raised fills or shadows outside the overlay files it allowlists; the added tint only in BetterMan-voice components; colours only from the tokens, with the red never a fill; BM Text as the only web font. See `DESIGN.md`.
- The document model is defined twice on purpose: `ingestion/ingestion/doc_model.py` and `nextjs/lib/docModel.ts`. Golden fixtures keep them aligned. Change both together.
- Public Convex functions must never accept a caller-chosen dataset stage. `scripts/check-convex-public-api.mjs` enforces this in CI.
- Pull request guards are documented in `docs/agents/pr-guards.md`: whitespace, test-runner config mixed with application code, and a Proof heading that cites the head SHA.
- Ingestion checks `GET /ingest/contract` before it writes. A missing route, a mismatched contract, a read timeout, a non-UTF-8 body, or a broken read raises `ConvexContractError` and does not write.
- `nextjs/e2e/` is the behavioral contract. Accessible names and `data-bm-*` hooks listed in `DESIGN.md` are asserted there.
- `next build` and `next dev` stop with `SecurityFatalError` when an AI agent runs them on a Next.js release that has a known advisory (Next's `experimental.agentUpgrade` defaults to `security`). Treat that as a blocker, not a flake: bump `next` and `eslint-config-next` to the fixed release in their own pull request instead of retrying past the stop or running the `next upgrade --agent` command the message suggests.
- Keep diffs scoped. Use Conventional Commits.
- Add a line under Unreleased in `CHANGELOG.md` when behavior changes.

## Environment

- Node 26, pnpm 10.34.4, Python 3.14, `uv`.
- `pnpm convex:check` provisions a local Convex deployment and writes `.env.local`.
- Ingestion for Linux distros runs inside Docker. FreeBSD and macOS run on the host.

## Cursor Cloud specific instructions

- Toolchain on Cloud Agent VMs: put Node **26.5.1** (nvm) and `uv`/`python3.14` on `PATH` ahead of `/exec-daemon/node` (`export PATH="$NVM_DIR/versions/node/v26.5.1/bin:$HOME/.local/bin:$PATH"`). Install `mandoc` (`sudo apt-get install -y --no-install-recommends mandoc`) so `pnpm ingest:test` runs the golden parser fixtures instead of skipping them outside CI.
- Bootstrap: `pnpm install --frozen-lockfile`, then `(cd ingestion && uv sync --frozen)`. Playwright Chromium: `bash scripts/install-playwright-ci.sh` (or `pnpm -C nextjs exec playwright install chromium` once system deps exist).
- Local Convex needs no deploy key: use `CONVEX_AGENT_MODE=anonymous` with `pnpm convex:check`. Seed fixture data while the app is up:

```bash
npx convex env set CONVEX_INGEST_SECRET dev
npx convex env set RATE_LIMIT_TAG_KEY dev
set -a; . ./.env.local; set +a
BETTERMAN_E2E_SEED=1 CONVEX_INGEST_SECRET=dev CONVEX_HTTP_URL="${CONVEX_SITE_URL:-$VITE_CONVEX_SITE_URL}" node scripts/seed-convex-e2e.mjs
```

- Dev server: run `pnpm convex:check`, then source `.env.local` and export Convex URLs the same way CI does before relying on Next API routes:

```bash
set -a; . ./.env.local; set +a
export CONVEX_URL="${CONVEX_URL:-$VITE_CONVEX_URL}"
export NEXT_PUBLIC_CONVEX_URL="$CONVEX_URL"
export RATE_LIMIT_TAG_KEY=dev  # must match Convex, or rate-limited routes return 429
CONVEX_AGENT_MODE=anonymous pnpm next:dev
```

  App: http://localhost:3000. Representative checks: `pnpm next:lint`, `pnpm next:grammar`, `pnpm next:test`, `pnpm convex:typecheck`, `pnpm convex:test`, `pnpm ingest:lint`, `pnpm ingest:test`. E2E expects the app on port 3000 (`pnpm next:e2e`).
- Docker is not required for app/unit/e2e work. Full Linux distro ingestion still needs Docker (not provisioned by default on Cloud Agents).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
