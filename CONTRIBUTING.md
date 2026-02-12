# Contributing

Thanks for contributing — BetterMan is built to be a sharp, reliable tool, and small improvements compound quickly.

If you’re new here:

- Support / questions: `SUPPORT.md`
- Product + architecture spec: `SPEC.md`
- Current execution plan: `PLAN.md`

## What we value

- **Small/medium diffs** (easy to review, easy to revert)
- **Root-cause fixes** over band-aids
- **Keyboard + accessibility** as first-class UX
- **Docs updated** when behavior changes

## Repo structure

This is a multi-service monorepo:

- `nextjs/` — public website (Next.js App Router)
- `backend/` — API-only FastAPI (private networking in prod)
- `ingestion/` — dataset pipeline (scheduled via GitHub Actions)
- `frontend/` — legacy Vite SPA (kept for CI/E2E harness; don’t add features)

## Prerequisites

- Node.js (CI uses Node `25`)
- pnpm (see `package.json` → `packageManager`)
- Python (CI uses Python `3.14`) + `uv`
- Docker (for local Postgres + Redis via `docker-compose.yml`)

## Quick start (local)

```bash
pnpm install
pnpm db:up
pnpm backend:dev
pnpm next:dev
```

## Common workflows

### Run checks

- Next.js: `pnpm next:lint` / `pnpm next:build`
- Backend: `pnpm backend:lint` / `pnpm backend:test`
- Ingestion: `pnpm ingest:lint` / `pnpm ingest:test`

### E2E (Playwright)

E2E expects backend + Next.js running (see `.github/workflows/ci.yml` for the exact CI sequence).

## PR expectations

- Use Conventional Commits for PR titles / commit messages (e.g. `feat: …`, `fix: …`, `docs: …`).
- Keep changes scoped; avoid drive-by refactors.
- Update `SPEC.md` when behavior/API decisions change.
- Add/adjust tests alongside bug fixes where practical.

Thanks again — shipping small, sharp improvements is the fastest way to make this project great.
