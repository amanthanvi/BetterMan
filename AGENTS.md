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

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
