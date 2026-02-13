# Governance

BetterMan is maintained in public. This document explains how decisions are made, how changes land, and what “maintained” means here.

## Roles

- **Maintainer:** @amanthanvi
- **Contributors:** everyone who opens an issue/PR, reviews, or helps triage.

## How decisions get made

- **Product + architecture decisions live in `SPEC.md`.** If behavior/architecture changes, we update the spec.
- **The shipping checklist lives in `PLAN.md`.** It’s the living source of “what’s next”.
- **Small changes land via PRs.** Prefer small/medium diffs that are easy to review and revert.
- **Bigger changes start with an issue or Discussion.** If it touches UX direction, architecture, or ops, propose first.

## What “done” means

A change is considered done when:

- CI is green (`.github/workflows/ci.yml`).
- Docs are updated when behavior changes (`README.md`, `SPEC.md`, runbooks).
- User-facing changes have sensible empty states and keyboard/a11y doesn’t regress.

## Releases

- `main` is the default branch and auto-deploys when CI passes.
- Releases are **tagged** (e.g. `v0.5.0`) and documented in `CHANGELOG.md`.

## Community health

- Code of conduct: `CODE_OF_CONDUCT.md`
- Security policy: `SECURITY.md`
- Support: `SUPPORT.md`
- Contributing: `CONTRIBUTING.md`

## Becoming a maintainer

Today this is a single-maintainer project. If you’re a frequent contributor and want to help with triage/reviews/releases, open a Discussion and we’ll figure out the right scope and access.
