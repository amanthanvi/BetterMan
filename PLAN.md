# BetterMan — PLAN (v0.1.1)

Living execution plan for shipping `v0.1.1` from `SPEC.md`.

- Branch: `main` (commit + push frequently)
- Principle: small/medium diffs; no drive‑by refactors
- Source of truth: `SPEC.md` (updated when reality changes)

## Status

- [x] v0.1.0 shipped (tag `v0.1.0`)
- [x] v0.1.1 shipped (tag `v0.1.1`)

## Golden Commands (kept current)

- `pnpm db:up`
- `pnpm db:down`
- `pnpm backend:dev`
- `pnpm backend:test`
- `pnpm backend:lint`
- `pnpm frontend:dev`
- `pnpm frontend:build`
- `pnpm frontend:lint`
- `pnpm ingest:sample`
- `pnpm ingest:run`
- `pnpm ingest:lint`
- `pnpm ingest:test`

## Milestones

### M8 — Frontend overhaul (design + perf) for v0.1.1

- [x] Update `SPEC.md` v0.1.1 delta + acceptance criteria
- [x] New visual system (tokens, typography, motion) + self-hosted fonts
- [x] Layout refresh: header/footer, spacing, navigation affordances
- [x] “User-friendly” info surfaces (dataset freshness, page counts, metadata)
- [x] Man page “Navigator” rail: sticky TOC + sticky Find + quick jumps + scroll-spy
- [x] Performance: route-level code splitting + lazy highlight.js + debounced Find highlighting
- [x] Validate: `pnpm frontend:lint` + `pnpm frontend:build`
- [x] Tag `v0.1.1`

### M0 — Repo scaffold + dev loop

- [x] Monorepo layout per `SPEC.md` Section 18
- [x] `README.md` (setup + golden commands)
- [x] `CONTRIBUTING.md`
- [x] `docker-compose.yml` for Postgres + Redis
- [x] Baseline CI (`.github/workflows/ci.yml`)

### M1 — Backend foundation (FastAPI + DB)

- [x] FastAPI app skeleton (health, error envelope, request ids)
- [x] SQLAlchemy models + Alembic migrations for Section 14 tables
- [x] Postgres extensions (`pg_trgm`)
- [x] Rate limiting (Redis) + abuse guards (Section 11)
- [x] Static asset serving + SPA fallback (single deployable service)

### M2 — Ingestion pipeline (Debian stable → DB)

- [x] Debian stable container-based ingestion runner (Section 9/10)
- [x] `mandoc` render → safe internal document model JSON (no raw HTML)
- [x] Extract metadata: title/description/TOC/options/see_also/plain_text
- [x] Validation thresholds:
  - [x] publish allowed if `success_rate >= 80%` and `hard_fail_rate <= 2%`
  - [x] `has_parse_warnings` captured but does not block publish
- [x] Dataset releases: staging-first flow (Section 18)
- [x] Golden/contract tests for parsing + link resolution (Section 19)

### M3 — Core API (read-only) + search

- [x] `GET /api/v1/info`
- [x] `GET /api/v1/man/{name}` (409 ambiguous)
- [x] `GET /api/v1/man/{name}/{section}`
- [x] `GET /api/v1/man/{name}/{section}/related`
- [x] `GET /api/v1/search` (FTS + trigram; ranking rules Section 11)
- [x] `GET /api/v1/sections`
- [x] `GET /api/v1/section/{section}`
- [x] HTTP caching (ETag + Cache-Control) keyed to dataset release
- [x] Security headers (CSP etc.)

### M4 — Frontend UX (SPA)

- [x] Vite + React + TS SPA
- [x] Routing + layouts per Section 6 URL scheme
- [x] Search results UX (20 + load more), empty/no-results states
- [x] Man page view: TOC + anchored headings + typography
- [x] Disambiguation interstitial for `/man/{name}`
- [x] Section browse UX (A–Z groups + search-within-section)
- [x] Missing page UX w/ suggestions
- [x] Search page filters (section dropdown)

### M5 — Power features + a11y

- [x] Command palette (Cmd/Ctrl+K) + recent history
- [x] Keyboard-first UX + focus management (WCAG 2.2 AA baseline)
- [x] Syntax highlighting + copy-to-clipboard for code blocks
- [x] Custom in-page search with highlights + next/prev
- [x] Option highlighting (interactive) with accessible styling
- [x] Search results list keyboard nav (j/k + Enter; Esc refocus)
- [x] Related panel collapsible (5 default, expand)

### M6 — Licenses + production hardening

- [x] `/licenses` UI route
- [x] Package manifest storage + license/copyright text storage
- [x] Logging redaction policy
- [x] Backups/restore runbook
- [x] Runbooks (top 5 incidents) captured in `docs/runbooks/`

### M7 — CI/CD + release

- [x] `.github/workflows/ci.yml` (lint/test/build for FE/BE/ingestion)
- [x] `.github/workflows/codeql.yml` (CodeQL code scanning)
- [x] `.github/workflows/scorecards.yml` (OSSF Scorecards)
- [x] `.github/workflows/deploy.yml` (staging → promote) *(scaffold)*
- [x] `.github/workflows/update-docs.yml` (monthly ingestion staging → validate → promote)
- [x] `.github/dependabot.yml` (dependency update PRs)
- [x] Tag `v0.1.0`
