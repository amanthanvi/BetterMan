# Agent notes

BetterMan is a Next.js app on Vercel that reads man page data from Convex. A Python pipeline in `ingestion/` turns roff into a JSON document model and uploads dataset releases. There is no other backend.

## Read first

- `README.md` for layout and commands
- `DESIGN.md` for the visual grammar and the contracts the E2E tests assert
- `PRODUCT.md` for who the product is for and what it will not become
- `convex/_generated/ai/guidelines.md` before touching anything in `convex/`

## Rules

- Only run scripts that exist in `package.json` or CI.
- The visual grammar is enforced by `pnpm next:grammar`: no rounded corners, no enclosing borders or surface fills outside the overlay files it allowlists.
- The document model is defined twice on purpose: `ingestion/ingestion/doc_model.py` and `nextjs/lib/docModel.ts`. Golden fixtures keep them aligned. Change both together.
- Public Convex functions must never accept a caller-chosen dataset stage. `scripts/check-convex-public-api.mjs` enforces this in CI.
- `nextjs/e2e/` is the behavioral contract. Accessible names and `data-bm-*` hooks listed in `DESIGN.md` are asserted there.
- Keep diffs scoped. Use Conventional Commits.
- Add a line under Unreleased in `CHANGELOG.md` when behavior changes.

## Environment

- Node 26, pnpm 10.34.4, Python 3.14, `uv`.
- `pnpm convex:check` provisions a local Convex deployment and writes `.env.local`.
- Ingestion for Linux distros runs inside Docker. FreeBSD and macOS run on the host.

## Cursor Cloud specific instructions

- Toolchain on Cloud Agent VMs: put Node **26.5.1** (nvm) and `uv`/`python3.14` on `PATH` ahead of `/exec-daemon/node` (`export PATH="$NVM_DIR/versions/node/v26.5.1/bin:$HOME/.local/bin:$PATH"`).
- Bootstrap: `pnpm install --frozen-lockfile`, then `cd ingestion && uv sync --frozen`. Playwright Chromium: `bash scripts/install-playwright-ci.sh` (or `pnpm -C nextjs exec playwright install chromium` once system deps exist).
- Local Convex needs no deploy key: use `CONVEX_AGENT_MODE=anonymous` with `pnpm convex:check` or `pnpm next:dev`. Seed fixture data while the app is up:

```bash
npx convex env set CONVEX_INGEST_SECRET dev
set -a; . ./.env.local; set +a
BETTERMAN_E2E_SEED=1 CONVEX_INGEST_SECRET=dev CONVEX_HTTP_URL="${CONVEX_SITE_URL:-$VITE_CONVEX_SITE_URL}" node scripts/seed-convex-e2e.mjs
```

- Dev server: `CONVEX_AGENT_MODE=anonymous pnpm next:dev` → http://localhost:3000. Representative checks: `pnpm next:lint`, `pnpm next:grammar`, `pnpm next:test`, `pnpm convex:typecheck`, `pnpm convex:test`, `pnpm ingest:lint`, `pnpm ingest:test`. E2E expects the app on port 3000 (`pnpm next:e2e`).
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
