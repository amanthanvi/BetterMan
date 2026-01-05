# BetterMan — PLAN (v0.1.0)

Living execution plan for shipping `v0.1.0` from `SPEC.md`.

- Branch: `refresh` (commit + push frequently)
- Principle: small/medium diffs; no drive‑by refactors
- Source of truth: `SPEC.md` (updated when reality changes)

## Status

- [ ] v0.1.0 shipped (tag `v0.1.0`)

## Golden Commands (kept current)

TBD (added during scaffolding)

## Milestones

### M0 — Repo scaffold + dev loop

- [ ] Monorepo layout per `SPEC.md` Section 18
- [ ] `README.md` (setup + golden commands)
- [ ] `CONTRIBUTING.md`
- [ ] `docker-compose.yml` for Postgres + Redis
- [ ] Baseline CI (`.github/workflows/ci.yml`)

### M1 — Backend foundation (FastAPI + DB)

- [ ] FastAPI app skeleton (health, error envelope, request ids)
- [ ] SQLAlchemy models + Alembic migrations for Section 14 tables
- [ ] Postgres extensions (`pg_trgm`)
- [ ] Rate limiting (Redis) + abuse guards (Section 11)
- [ ] Static asset serving + SPA fallback (single deployable service)

### M2 — Ingestion pipeline (Debian stable → DB)

- [ ] Debian stable container-based ingestion runner (Section 9/10)
- [ ] `mandoc` render → safe internal document model JSON (no raw HTML)
- [ ] Extract metadata: title/description/TOC/options/see_also/plain_text
- [ ] Validation thresholds:
  - [ ] publish allowed if `success_rate >= 80%` and `hard_fail_rate <= 2%`
  - [ ] `has_parse_warnings` captured but does not block publish
- [ ] Dataset releases: staging-first flow (Section 18)
- [ ] Golden tests for representative pages (Section 19)

### M3 — Core API (read-only) + search

- [ ] `GET /api/v1/info`
- [ ] `GET /api/v1/man/{name}` (409 ambiguous)
- [ ] `GET /api/v1/man/{name}/{section}`
- [ ] `GET /api/v1/man/{name}/{section}/related`
- [ ] `GET /api/v1/search` (FTS + trigram; ranking rules Section 11)
- [ ] `GET /api/v1/sections`
- [ ] `GET /api/v1/section/{section}`
- [ ] HTTP caching (ETag + Cache-Control) keyed to dataset release

### M4 — Frontend UX (SPA)

- [ ] Vite + React + TS SPA
- [ ] Routing + layouts per Section 6 URL scheme
- [ ] Search results UX (20 + load more), empty/no-results states
- [ ] Man page view: TOC + anchored headings + typography
- [ ] Disambiguation interstitial for `/man/{name}`
- [ ] Missing page UX w/ suggestions

### M5 — Power features + a11y

- [ ] Command palette (Cmd/Ctrl+K) + recent history
- [ ] Keyboard-first UX + focus management (WCAG 2.2 AA baseline)
- [ ] Syntax highlighting + copy-to-clipboard for code blocks
- [ ] Custom in-page search with highlights + next/prev
- [ ] Option highlighting (interactive) with accessible styling

### M6 — Licenses + production hardening

- [ ] `/licenses` UI route
- [ ] Package manifest storage + license/copyright text storage
- [ ] Security headers (CSP etc.) + logging redaction policy
- [ ] Backups/restore runbook
- [ ] Runbooks (top 5 incidents) captured in `docs/runbooks/`

### M7 — CI/CD + release

- [ ] `.github/workflows/ci.yml` (lint/test/build for FE/BE/ingestion)
- [ ] `.github/workflows/deploy.yml` (staging → promote)
- [ ] `.github/workflows/update-docs.yml` (monthly ingestion staging → validate → promote)
- [ ] Release checklist complete (SPEC Section 21)
- [ ] Tag `v0.1.0`

