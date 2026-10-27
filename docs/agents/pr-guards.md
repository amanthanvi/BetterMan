# Pull request guards

`.github/workflows/pr-diff-guards.yml` and `.github/workflows/pr-proof.yml`
check every pull request. Both listen for `edited`: correcting the Proof or
Budget section reruns the relevant body checks without another commit.

## Whitespace

`scripts/check-pr-whitespace.sh <base-sha> [head-sha]` runs `git diff --check`
on the three-dot diff from the merge base of those commits. That is the pull
request change set. It fails on trailing whitespace, a new blank line at end
of file, and conflict markers. A Markdown hard line break is two trailing
spaces, so `git diff --check` flags those too.

```bash
bash scripts/check-pr-whitespace.sh origin/main HEAD
```

The workflow passes `github.event.pull_request.base.sha` and
`github.event.pull_request.head.sha`. The head SHA is the branch tip, not the
merge commit GitHub checks out for the job.

## Test-runner config mixed with application code

`scripts/check-mixed-test-config.mjs` fails when one diff touches both of these:

- Test-runner config: `vitest.config.*`, `vitest.workspace.*`, `playwright.config.*`, `jest.config.*`, `jest.setup.*`, `karma.conf.*`, `cypress.config.*`, `pytest.ini`, `tox.ini`, `.mocharc.*`, `conftest.py`, a changed `[tool.pytest*]` or `[tool.coverage*]` section in `pyproject.toml` (the rest of that file, including a dependency bump, is not test-runner config), a changed test script in `package.json` (`test`, `e2e`, `ops:test`, `*:test`, `*:e2e`, or `test:*`, including extra colons such as `test:unit:watch` and `next:unit:test`; `next:lint` is not one), or a changed line in `.github/workflows/ci.yml` that invokes `vitest`, `playwright`, `pytest`, `jest`, or `pnpm convex:test`, `pnpm next:test`, `pnpm next:e2e`, `pnpm ingest:test`, `pnpm ops:test`, `pnpm -C nextjs e2e`, or `pnpm -C nextjs test`.
- Application code: `convex/` outside `*.test.ts` and `*.spec.ts`, `ingestion/ingestion/`, or `nextjs/` outside `e2e/`, `*.test.*`, `*.spec.*`, and markdown. A `nextjs/README.md` edit is documentation. `package.json` and `pyproject.toml` are manifests, including `nextjs/package.json`, so they are not application code.

The extracted Playwright setup also counts as test-runner config:
`.github/actions/setup-playwright/action.yml`, `scripts/prefetch-playwright-ci.sh`,
and `scripts/install-playwright-ci.sh`. Additions, deletions, and renames count.
An action pin-only update in the composite action stays allowed when it keeps
the same action names and changes only their refs and version comments. Changes
to inputs, commands, or the actions being called count as setup changes.

A harness-only change, a test-only change, and an action pin bump in `ci.yml` stay allowed. Docs are not application code.

`pyproject.toml` and `package.json` are compared from the merge base of the base and head commits, the same commit as `git diff base...head`, not from the base ref alone.

Not detected: a top-level TOML dotted key (`tool.pytest.ini_options` or `tool.coverage.run` under `[tool]` or at the root), and a helper script that a test script calls. `"test": "node scripts/run-tests.mjs"` does not make `scripts/run-tests.mjs` test-runner config. Only a changed script whose name is `test`, `e2e`, `ops:test`, `*:test`, `*:e2e`, or `test:*` counts.

The label `test-config-change` skips this failure. Apply it only when the mix is intentional, and say why in the pull request body. The label has to exist on the repository before GitHub will accept it.

Labels are passed as `PR_LABELS_JSON` (`toJSON` of the label names) so a label cannot be split on a comma.

## Performance budget changes

`scripts/check-perf-budget-changes.mjs --base <sha> [--head <sha>]` checks the
three-dot PR diff and reads old values from its merge base. Committing a newly
recorded baseline does not approve it: every edit to `perf-budgets.json`,
including its initial addition, metadata changes, formatting, or tighter limits,
requires explicit acknowledgement. Diagnostics identify baseline increases,
relative or absolute tolerance increases, cap increases or removal, hard metrics
becoming report-only, `combine: "max"` changing to a sum when that widens the
limit, removed metrics, and invalid or removed metric fields.

These measurement and enforcement changes require the same acknowledgement:

- Any added, edited, deleted, or renamed `scripts/perf-*` path or
  `scripts/check-perf-budgets.mjs`. A rename out of a protected path still counts.
- A change to the root `package.json` script `perf:check`, including removal.
  Unrelated manifest edits do not count.
- A changed line mentioning `perf:check` in `.github/workflows/ci.yml`, including
  removal of its invocation, or any change to the `performance_budgets` job
  (including conditions and `continue-on-error`). Changes in other jobs do not count.
- Changes to the guard itself, its test, or `.github/workflows/pr-diff-guards.yml`,
  which could otherwise remove the gate.

The PR must have both the exact label `perf-budget-change` and an exact,
case-sensitive `## Budget` heading in its body. In that section, explain the
cost being accepted and why it is justified. The automated minimum is eight
words and 40 letters, without TODO, TBD, or FIXME placeholders. Empty sections,
HTML comments, fenced examples, and text in another section do not qualify.
Reviewers assess the explanation's substance; a length check cannot establish
that the trade-off is justified.

```markdown
## Budget

The larger fixture covers realistic manuals and accepts extra bytes to preserve representative coverage.
```

`PR_LABELS_JSON` carries the JSON array of label names and `PR_BODY` carries the
body through structured workflow environment values, without shell interpolation.
Label and body edits rerun `diff_guards`. The ordinary performance measurement
check still runs; this guard makes changes to its rules explicit.

## Proof section

`scripts/check-proof-sha.mjs` reads the pull request body from the `PR_BODY` environment variable. That avoids interpolating the body into the shell. The check fails unless all of the following are true:

- The author is not `dependabot[bot]`. That login is skipped even when the body has no Proof section. Other dependency updates are not skipped.
- A markdown ATX heading at any level has the text `Proof` and nothing else. Case does not matter. Up to three leading spaces are allowed before the hashes. `## Proof of work` does not count.
- That section contains the full 40-character head SHA. The match is case-insensitive and the digest must be its own token, so a 7-character prefix or the same digits inside a longer hex string do not count. A SHA on a nested heading line counts. Lines inside a fenced code block are not headings, so a shell comment does not end the section.
- The SHA sits in the Proof section. A copy in another section does not count. Nested headings stay inside the section until the next heading of the same or higher level outside a fence.

The SHA is `github.event.pull_request.head.sha`. After another commit, update the body. The Proof workflow runs on `edited`, so that update does not need a commit. The squash commit on `main` is a different SHA and is not what this check compares.

```markdown
## Proof

0123456789abcdef0123456789abcdef01234567
```
