# Contributing

BetterMan is maintained by one person. Small, scoped pull requests get reviewed fastest.

## Before you start

Run the app locally with the steps in `README.md`. Read `DESIGN.md` before changing anything visual, since CI enforces the grammar it describes.

## Pull requests

- Use Conventional Commits in titles: `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `perf:`, `test:`.
- Run the checks that match your change: `pnpm next:lint`, `pnpm next:grammar`, `pnpm next:test` for the app; `pnpm ingest:lint`, `pnpm ingest:test` for ingestion.
- Add or adjust a test alongside a bug fix when practical.
- Add a line under Unreleased in `CHANGELOG.md` when behavior changes.
- CI checks the pull request diff with `git diff --check`, rejects test-runner config mixed with application code unless the pull request has the `test-config-change` label, and requires a `Proof` heading that contains the full head SHA. Dependabot is exempt from the Proof check. Details are in `docs/agents/pr-guards.md`.

## Questions and bugs

Open a GitHub issue. For questions, use Discussions. Security reports go through `SECURITY.md`, not issues.

## Decisions

The maintainer decides what merges. Anything that changes the product's shape, such as accounts, server-side user state, or a new visual grammar, needs a discussion before a pull request.

## Conduct

Be respectful. See `CODE_OF_CONDUCT.md`.
