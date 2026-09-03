# BetterMan

Unix manual pages, typeset for the screen. Live at [betterman.sh](https://betterman.sh).

[![ci](https://github.com/amanthanvi/BetterMan/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/amanthanvi/BetterMan/actions/workflows/ci.yml)

BetterMan renders man pages from Debian, Ubuntu, Fedora, Arch, Alpine, FreeBSD, and macOS as readable, linked, searchable web pages. It is keyboard-first and has no accounts. Bookmarks, history, and reading preferences stay in the browser.

## Layout

```text
nextjs/      Next.js app: pages, API routes, rendering
convex/      Convex schema and functions: dataset reads, search, rate limits, ingest
ingestion/   Python pipeline: mandoc to document model, uploads releases to Convex
scripts/     CI and deploy helpers
docs/        Architecture, releasing, runbooks
```

## Run it locally

Needs Node 26, pnpm 10.34, Python 3.14, and `uv`.

```bash
pnpm install
pnpm convex:check   # provisions a local Convex deployment and writes .env.local
pnpm next:dev       # Convex watcher plus Next.js on http://localhost:3000
```

The local deployment starts empty. Seed it with the E2E fixture while `pnpm next:dev` is running:

```bash
npx convex env set CONVEX_INGEST_SECRET dev
set -a; . ./.env.local; set +a
BETTERMAN_E2E_SEED=1 CONVEX_INGEST_SECRET=dev CONVEX_HTTP_URL="$CONVEX_SITE_URL" node scripts/seed-convex-e2e.mjs
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm next:lint` | ESLint over the Next.js app |
| `pnpm next:grammar` | Enforces the visual grammar in `DESIGN.md` |
| `pnpm next:test` | Vitest |
| `pnpm next:e2e` | Playwright, expects the app on port 3000 |
| `pnpm next:build` | Production build |
| `pnpm convex:check` | Validates Convex schema and functions |
| `pnpm ingest:test` / `pnpm ingest:lint` | Ingestion tests and Ruff |
| `pnpm ingest:sample` | Ingests five pages into the configured Convex stage |

## Deploy and data

Pushes to `main` that pass CI deploy to Vercel through `.github/workflows/deploy.yml`. The dataset is rebuilt monthly by `.github/workflows/update-docs.yml`, which ingests to a staging pointer in Convex and promotes it to production. Details live in `docs/ARCHITECTURE.md` and `docs/runbooks/`.

## Contributing

See `CONTRIBUTING.md`. Report security issues as described in `SECURITY.md`.

MIT licensed. See `LICENSE`.
