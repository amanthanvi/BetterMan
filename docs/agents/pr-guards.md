# Pull request guards

`.github/workflows/pr-diff-guards.yml` and `.github/workflows/pr-proof.yml`
check every pull request. Correcting the Proof section re-runs only the Proof
workflow, because that workflow also listens for `edited`.

## Whitespace

`scripts/check-pr-whitespace.sh <base-sha> [head-sha]` runs `git diff --check`
on the three-dot diff from the merge base of those commits. That is the pull
request change set. It fails on trailing whitespace, a new blank line at end
of file, and conflict markers.

```bash
bash scripts/check-pr-whitespace.sh origin/main HEAD
```

The workflow passes `github.event.pull_request.base.sha` and
`github.event.pull_request.head.sha`. The head SHA is the branch tip, not the
merge commit GitHub checks out for the job.

## Test-runner config mixed with application code

`scripts/check-mixed-test-config.mjs` fails when one diff touches both of these:

- Test-runner config: `vitest.config.*`, `vitest.workspace.*`, `playwright.config.*`, `jest.config.*`, `jest.setup.*`, `karma.conf.*`, `cypress.config.*`, `pytest.ini`, `tox.ini`, `.mocharc.*`, or a changed line in `.github/workflows/ci.yml` that invokes `vitest`, `playwright`, `pytest`, `jest`, or `pnpm convex:test`, `pnpm next:test`, `pnpm next:e2e`, `pnpm ingest:test`, `pnpm ops:test`, `pnpm -C nextjs e2e`, or `pnpm -C nextjs test`.
- Application code: `convex/` outside `*.test.ts` and `*.spec.ts`, `ingestion/ingestion/`, or `nextjs/` outside `e2e/`, `*.test.*`, `*.spec.*`, and markdown. A `nextjs/README.md` edit is documentation.

A harness-only change, a test-only change, and an action pin bump in `ci.yml` stay allowed. Docs are not application code.

The label `test-config-change` skips this failure. Apply it only when the mix is intentional, and say why in the pull request body. The label has to exist on the repository before GitHub will accept it.

Labels are passed as `PR_LABELS_JSON` (`toJSON` of the label names) so a label cannot be split on a comma.

## Proof section

`scripts/check-proof-sha.mjs` reads the pull request body from the `PR_BODY` environment variable. That avoids interpolating the body into the shell. The check fails unless all of the following are true:

- The author is not `dependabot[bot]`. That login is skipped even when the body has no Proof section. Other dependency updates are not skipped.
- A markdown ATX heading at any level has the text `Proof` and nothing else. Case does not matter. `## Proof of work` does not count.
- That section contains the full 40-character head SHA. The match is case-insensitive and the digest must be its own token, so a 7-character prefix or the same digits inside a longer hex string do not count. A SHA on a nested heading line counts. Lines inside a fenced code block are not headings, so a shell comment does not end the section.
- The SHA sits in the Proof section. A copy in another section does not count. Nested headings stay inside the section until the next heading of the same or higher level outside a fence.

The SHA is `github.event.pull_request.head.sha`. After another commit, update the body. The Proof workflow runs on `edited`, so that update does not need a commit. The squash commit on `main` is a different SHA and is not what this check compares.

```markdown
## Proof

0123456789abcdef0123456789abcdef01234567
```

## Ingest contract

`ingest()` calls `ConvexIngestClient.require_deployed_contract()` before it installs packages or posts `/ingest/release`. The client sends `GET /ingest/contract` with the ingest secret. The deployed Convex app must advertise the schema version, function names, declaration counts (`pageCount`, `aliasCount`, `licenseCount`), and `activatePending: true` from `convex/ingestContract.ts`. Those values are duplicated in `ingestion/ingestion/convex_client.py`, and `ingestion/tests/test_convex_client.py` fails if they drift.

A missing route, a mismatched contract, a rejected secret, or an unreachable deployment raises `ConvexContractError` and does not write. Deploy Convex before the ingestion workflow runs the new client.
