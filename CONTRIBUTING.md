# Contributing

Thanks for contributing! This repo is bootstrapping from `SPEC.md`.

## Rules of engagement

- Keep diffs small/medium and scoped.
- Update `SPEC.md` when behavior/API decisions change.
- Prefer adding tests alongside bug fixes where practical.
- Use Conventional Commits for PR titles and commit messages (e.g. `feat: …`, `fix: …`, `docs: …`).
- Expect CI + security checks to run on PRs (lint/test/build, dependency review, CodeQL).

## How to contribute

1. Open an issue (bug/feature) or start a discussion if you’re not sure yet.
2. Fork + branch from `main`.
3. Make focused changes with tests/docs where relevant.
4. Open a PR. Please fill out the PR template.

## Prerequisites

This repo is a multi-service monorepo.

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

## Commands

See `README.md` → “Golden commands”.
