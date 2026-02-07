# BetterMan — Agent Notes (Repo)

This repo follows the global agent guidance in:
- `/Users/amanthanvi/GitRepos/_factory/agent-scripts/AGENTS.MD`

## Read-first docs (always)

- `SPEC.md` (source-of-truth product + architecture spec)
- `PLAN.md` (living execution plan)
- `README.md` (golden commands + ops notes)
- `CONTRIBUTING.md` (conventions)
- `docs/runbooks/*` (ops + debugging)

## Repo layout (current → target)

- Current (`v0.4.0`): `frontend/` (Vite SPA) + `backend/` (FastAPI serving API + built SPA)
- Target (`v0.5.0`): **two services**
  - `nextjs/` (Next.js App Router; public-facing)
  - `backend/` (FastAPI API-only; internal)
  - `ingestion/` (dataset pipeline; scheduled via GitHub Actions)

## Golden commands (proven)

- Local services:
  - `pnpm db:up`
  - `pnpm db:down`
- Backend:
  - `pnpm backend:dev`
  - `pnpm backend:test`
  - `pnpm backend:lint`
- Frontend (current SPA):
  - `pnpm frontend:dev`
  - `pnpm frontend:build`
  - `pnpm frontend:lint`
  - `pnpm frontend:test`
  - `pnpm frontend:e2e` (expects app running; see `.github/workflows/ci.yml` e2e job)
- Ingestion:
  - `pnpm ingest:sample`
  - `pnpm ingest:run`
  - `pnpm ingest:lint`
  - `pnpm ingest:test`

## CI / contracts

- CI workflow: `.github/workflows/ci.yml`
- OpenAPI → TypeScript generation is enforced in CI.
  - Regeneration runbook: `docs/runbooks/type-gen.md`

## Work rules (repo-specific)

- Keep diffs small/medium and scoped; avoid drive-by refactors.
- Don’t invent commands — only run scripts/targets that exist in `package.json`, Makefiles, CI, or docs.
- Use Conventional Commits (`feat|fix|refactor|docs|chore|test|perf|ci|build|style`).
- Update `SPEC.md` when behavior/architecture changes.
- Update `PLAN.md` as work progresses (it’s the central “living” checklist).
