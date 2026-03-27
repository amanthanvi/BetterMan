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

## Cursor Cloud specific instructions

### Services overview

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| PostgreSQL + Redis | `pnpm db:up` | `54320` / `6379` | Docker Compose; must start before backend |
| FastAPI backend | `pnpm backend:dev` | `8000` | Requires DB running; auto-reloads |
| Next.js frontend | `pnpm next:dev` | `3000` | Connects to backend via `FASTAPI_INTERNAL_URL` (defaults to `http://127.0.0.1:8000`) |

### Startup sequence

1. Start Docker daemon: `sudo dockerd &>/tmp/dockerd.log &` (wait ~5 s), then `sudo chmod 666 /var/run/docker.sock`
2. `pnpm db:up` — start Postgres 16 + Redis 7
3. `cd backend && uv run python -m app.db.migrate` — run migrations (idempotent)
4. `BETTERMAN_E2E_SEED=1 uv run python scripts/seed_e2e.py` — seed E2E test data (from `backend/`)
5. `pnpm backend:dev` — start FastAPI on `:8000`
6. `pnpm next:dev` — start Next.js on `:3000`

### Non-obvious caveats

- **Node.js 25** is required (not 22). Install via `nvm install 25 && nvm alias default 25`.
- **Python 3.14** is required. Install via `uv python install 3.14`.
- **pnpm 10.27.0** is pinned in `package.json`; install via `npm install -g pnpm@10.27.0` after switching to Node 25.
- **Docker in Cloud VM** needs `fuse-overlayfs` storage driver and `iptables-legacy`; see the one-time setup in the environment snapshot.
- `pnpm install` emits warnings about ignored build scripts (`@sentry/cli`, `sharp`, `unrs-resolver`). These are transitive deps with JS/WASM fallbacks; the warning is safe to ignore.
- Backend Python deps use `uv sync --frozen` (in `backend/` and `ingestion/` directories); each has its own `.venv`.
- All golden commands are in `README.md` and the root `package.json` scripts. Refer to those rather than inventing commands.
- `next lint` shows a deprecation warning about migrating to ESLint CLI — this is cosmetic and can be ignored.

## Self-Correction Log

- 2026-03-26: E2E local bring-up: keep `app.db.migrate` and `seed_e2e.py` sequential; parallel runs can race the schema creation.
