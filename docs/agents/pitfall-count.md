# Pitfall count

Concrete occurrences in the last 60 commits on `main`, from
[`d117057`](https://github.com/amanthanvi/BetterMan/commit/d1170572a2a29865ce96645eb8d79d8f3588c60f)
([#237](https://github.com/amanthanvi/BetterMan/pull/237)) through
[`a6223d8`](https://github.com/amanthanvi/BetterMan/commit/a6223d8cb0d7b1a65ffedf746b3d35982ea2ebf7)
([#328](https://github.com/amanthanvi/BetterMan/pull/328)).
Counted 2026-10-16 from `git log -60` after the
[feedback census](feedback-census.md) merged.
Those 60 commits link to 58 pull requests.
[#246](https://github.com/amanthanvi/BetterMan/pull/246) and
[#250](https://github.com/amanthanvi/BetterMan/pull/250) each landed as two commits.

Rows are separate counts. Do not add them. [#250](https://github.com/amanthanvi/BetterMan/pull/250)
and [#251](https://github.com/amanthanvi/BetterMan/pull/251) appear in two rows.
Census pull requests [#306](https://github.com/amanthanvi/BetterMan/pull/306) and
[#318](https://github.com/amanthanvi/BetterMan/pull/318) through
[#326](https://github.com/amanthanvi/BetterMan/pull/326) are still open, so they are
outside this window and are not counted.

## Commands

Taken on `main` at
[`a6223d8`](https://github.com/amanthanvi/BetterMan/commit/a6223d8cb0d7b1a65ffedf746b3d35982ea2ebf7),
where `git log -60` is exactly this window. `git log -60` with no revision
follows whatever `main` is now, so the revision is pinned.

```bash
git log -60 --format='%H %an %s' a6223d8cb0d7b1a65ffedf746b3d35982ea2ebf7

git log -60 --format='%an' a6223d8cb0d7b1a65ffedf746b3d35982ea2ebf7 | sort | uniq -c

git log -60 --format='%H' a6223d8cb0d7b1a65ffedf746b3d35982ea2ebf7 | while read -r sha; do
  git diff --check "${sha}^" "$sha"
done
```

The author tally is 43 `dependabot[bot]` commits. [#289](https://github.com/amanthanvi/BetterMan/pull/289)
([`f3f7a24`](https://github.com/amanthanvi/BetterMan/commit/f3f7a2443022af76092a852d8b33a14861ec32df))
is the extra dependency bump, opened by amanthanvi. The `git diff --check`
loop prints nothing.

## Ranking

| Rank | Pitfall | Count | Proposed automated guard |
| --- | --- | ---: | --- |
| 1 | Proof section missing on a non-dependency pull request | 13 | Proof must cite the head SHA |
| 2 | Test config edited in the same commit as application code | 2 | Protected-path rule for test-config plus code |
| 3 | Ingest runner assumes Convex functions that are not deployed yet | 2 | Convex-before-ingest invariant in code |
| 4 | Trailing blank lines or other `git diff --check` whitespace | 0 | CI `git diff --check` |
| 5 | Chunk-size or count text drift between docs, UI copy, and code | 0 | Doc-render verify skill |
| 6 | Stale Proof head SHA | 0 | Proof must cite the head SHA |

## 1. Proof section missing

| | |
| --- | --- |
| Count | 13 pull requests |
| Examples | [#237](https://github.com/amanthanvi/BetterMan/pull/237) [`d117057`](https://github.com/amanthanvi/BetterMan/commit/d1170572a2a29865ce96645eb8d79d8f3588c60f), [#238](https://github.com/amanthanvi/BetterMan/pull/238) [`eb5b745`](https://github.com/amanthanvi/BetterMan/commit/eb5b74578c3fc02b948ad992d7a7ff6619353f0d), [#246](https://github.com/amanthanvi/BetterMan/pull/246) [`8d1c012`](https://github.com/amanthanvi/BetterMan/commit/8d1c0125c0843830d17f3fb5fa3a0a6ff232f8b6), [#248](https://github.com/amanthanvi/BetterMan/pull/248) [`c1937f1`](https://github.com/amanthanvi/BetterMan/commit/c1937f14d45880dd8d30885e68ddef3938144ad0), [#249](https://github.com/amanthanvi/BetterMan/pull/249) [`92bfefa`](https://github.com/amanthanvi/BetterMan/commit/92bfefaa71a1ea7856b0f5de0fe708d7701091a6), [#250](https://github.com/amanthanvi/BetterMan/pull/250) [`c24bc7e`](https://github.com/amanthanvi/BetterMan/commit/c24bc7e878367c73c7cb193bb8ae3b0acd306234), [#251](https://github.com/amanthanvi/BetterMan/pull/251) [`6332fbf`](https://github.com/amanthanvi/BetterMan/commit/6332fbfc23d51c19c82e54ca2a86744d4fb7df4b), [#252](https://github.com/amanthanvi/BetterMan/pull/252) [`0b7e572`](https://github.com/amanthanvi/BetterMan/commit/0b7e572a944b952c72dc53c7a50a5e1fcb7908f8), [#265](https://github.com/amanthanvi/BetterMan/pull/265) [`663b224`](https://github.com/amanthanvi/BetterMan/commit/663b2248c82b5db1a8a6637de94b73b52b53382a), [#278](https://github.com/amanthanvi/BetterMan/pull/278) [`e0438b1`](https://github.com/amanthanvi/BetterMan/commit/e0438b148fc21669a555143ee3f73f9667cce698), [#290](https://github.com/amanthanvi/BetterMan/pull/290) [`72b99e2`](https://github.com/amanthanvi/BetterMan/commit/72b99e2f12a94a2299732e088d29bb060ae00199), [#291](https://github.com/amanthanvi/BetterMan/pull/291) [`45094e7`](https://github.com/amanthanvi/BetterMan/commit/45094e7b7f4d6661e76990549c2d91d56d73ab86), [#292](https://github.com/amanthanvi/BetterMan/pull/292) [`41e6c66`](https://github.com/amanthanvi/BetterMan/commit/41e6c669ce11135309822e00a195719a85b93dd5) |
| Root cause | The Proof section is free text added by hand. CI never reads the pull request body, so a non-dependency change merges with no head SHA recorded. The 44 dependency-bump PRs (43 Dependabot plus [#289](https://github.com/amanthanvi/BetterMan/pull/289)) in this window also have no Proof section. They are excluded. Dependency bumps are not the population the census describes. [#328](https://github.com/amanthanvi/BetterMan/pull/328) is the one non-dependency pull request in the window that has a Proof section, and that section cites the head (see row 6). |
| Proposed automated guard | Proof must cite the head SHA. Fail the pull request when a non-dependency change has no Proof line, or when the cited SHA is not the pull request head. |

## 2. Test config edited with application code

| | |
| --- | --- |
| Count | 2 commits (2 pull requests) |
| Examples | [#248](https://github.com/amanthanvi/BetterMan/pull/248) [`c1937f1`](https://github.com/amanthanvi/BetterMan/commit/c1937f14d45880dd8d30885e68ddef3938144ad0) adds `vitest.config.ts` and `pnpm convex:test` / `pnpm convex:typecheck` steps in `.github/workflows/ci.yml` in the same commit as `convex/queries.ts`, `convex/schema.ts`, and the Next.js section page. [#249](https://github.com/amanthanvi/BetterMan/pull/249) [`92bfefa`](https://github.com/amanthanvi/BetterMan/commit/92bfefaa71a1ea7856b0f5de0fe708d7701091a6) adds a `pnpm ops:test` step in `.github/workflows/ci.yml` in the same commit as `convex/related.ts`. |
| Root cause | Test-runner config and product behavior land in one squash commit. A reviewer cannot tell a harness change from the feature, which is the mix the census recorded on `vitest.config.ts` and `ci.yml`. `nextjs/playwright.config.ts` is not edited in this window. Four Dependabot commits that only bump an action pin inside `ci.yml` are not counted: [#262](https://github.com/amanthanvi/BetterMan/pull/262), [#269](https://github.com/amanthanvi/BetterMan/pull/269), [#270](https://github.com/amanthanvi/BetterMan/pull/270), [#313](https://github.com/amanthanvi/BetterMan/pull/313) [`b80c5f6`](https://github.com/amanthanvi/BetterMan/commit/b80c5f68631b0046d19f6f2b1fa553266364dca5). |
| Proposed automated guard | Protected-path rule for test-config plus code. Fail a diff that touches `vitest.config.ts`, `nextjs/playwright.config.ts`, or a test-step line in `.github/workflows/ci.yml` and also touches application code under `convex/`, `ingestion/ingestion/`, or `nextjs/` outside tests. A commit that only retunes the harness, and a commit that only bumps an action pin, stay allowed. |

## 3. Ingest runner ahead of Convex

| | |
| --- | --- |
| Count | 2 pull requests |
| Examples | [#250](https://github.com/amanthanvi/BetterMan/pull/250) [`22cbbc7`](https://github.com/amanthanvi/BetterMan/commit/22cbbc7a0bd1568273a56f83bf33819017cb8dd6) teaches `ingestion/ingestion/convex_client.py` to poll `/ingest/activate` until the body says `pending: false`, and teaches `convex/http.ts` to answer HTTP 409 while `pending` is true. The same pull request's follow-up [`c24bc7e`](https://github.com/amanthanvi/BetterMan/commit/c24bc7e878367c73c7cb193bb8ae3b0acd306234) only adjusts that client. [#251](https://github.com/amanthanvi/BetterMan/pull/251) [`6332fbf`](https://github.com/amanthanvi/BetterMan/commit/6332fbfc23d51c19c82e54ca2a86744d4fb7df4b) posts `aliasCount` and `licenseCount` from `ingestion/ingestion/ingest_runner.py`, and `convex/ingest.ts` `createRelease` starts requiring both as numbers. Before that commit, `createRelease` had `pageCount` only. |
| Root cause | The runner and the Convex functions change in one commit, then deploy on different workflows. `.github/workflows/update-docs.yml` checks out `main` and runs the runner against the already deployed Convex HTTP endpoint. It never runs `convex deploy`. `.github/workflows/deploy.yml` publishes Convex later, on a successful `main` CI `workflow_run`. A scheduled or manual ingest can therefore run the new client against the previous functions. The new client rejects an activate body that omits `pending`, and the new `createRelease` rejects a declaration that omits the two counts. |
| Proposed automated guard | Convex-before-ingest invariant in code. Before `ingest_runner` posts `/ingest/release` or `/ingest/activate`, require the deployed Convex revision to advertise this client's contract (declaration counts and the `pending` activate status). Shipping both sides in one commit does not satisfy the invariant. |

## 4. Trailing whitespace

| | |
| --- | --- |
| Count | 0 |
| Examples | None. The per-commit `git diff --check` loop in Commands produced no output. That flags trailing whitespace, a new blank line at end of file, and conflict markers. |
| Root cause | The census records this once, on unmerged [#321](https://github.com/amanthanvi/BetterMan/pull/321), where two files ended in a trailing blank line. Nothing in CI runs `git diff --check` on pull requests into `main`, so the same miss can land later. It did not land in this window. |
| Proposed automated guard | CI `git diff --check` on the pull request diff. |

## 5. Chunk-size or count text drift

| | |
| --- | --- |
| Count | 0 |
| Examples | None in this window. The string `(20 chunks)` appears only where the census quotes unmerged [#318](https://github.com/amanthanvi/BetterMan/pull/318) and [#325](https://github.com/amanthanvi/BetterMan/pull/325). Counts that this window did change still match the code. [#248](https://github.com/amanthanvi/BetterMan/pull/248) documents a section offset cap of 5,000 and a `limit` of 1 to 500, default 200, in `nextjs/README.md`. That matches `nextjs/app/api/[...path]/route.ts` and `MAX_SECTION_OFFSET` in `convex/queries.ts`. [#250](https://github.com/amanthanvi/BetterMan/pull/250) documents a five-minute activation deadline. `activate_release` defaults `timeout_seconds` to 300. [#238](https://github.com/amanthanvi/BetterMan/pull/238) documents motion of 150 to 200 ms. `nextjs/app/globals.css` uses 150ms and 200ms. `ingest_runner.py` still posts pages with `batch_size = 20`. The later 512-page batch is not in this window. |
| Root cause | Docs, UI copy, and constants are edited by hand in the same pull request. Nothing re-reads the rendered sentence against the constant. The census failure mode is copy left on an old chunk count after the code moves to a byte budget. This window did not repeat that mismatch. |
| Proposed automated guard | Doc-render verify skill. Fail when a documented or UI count (chunk budget, page batch, section limit, activation deadline) disagrees with the constant the code ships. |

## 6. Stale Proof head SHA

| | |
| --- | --- |
| Count | 0 |
| Examples | The only Proof section in the window is [#328](https://github.com/amanthanvi/BetterMan/pull/328). It cites `8b22e52127b819cdffe4aa047a47b5d39eaf5078`, which is that pull request's head. The squash commit on `main` is [`a6223d8`](https://github.com/amanthanvi/BetterMan/commit/a6223d8cb0d7b1a65ffedf746b3d35982ea2ebf7), a different SHA, as squash merges always produce. The Proof line matches the head that was merged. No other linked pull request body has a Proof section, so none of them cite a stale head. [#249](https://github.com/amanthanvi/BetterMan/pull/249) names `6331571e2fe14de31a01d00deead9e7a349e53a6` as a Vercel CLI commit, not as a BetterMan head. |
| Root cause | A Proof line is free text. A later commit moves the head and the line is left on the SHA that was reviewed earlier. The census records that lag on open pull requests. In this window the single Proof line was updated to the final head before merge. |
| Proposed automated guard | Proof must cite the head SHA. The cited SHA, the pull request head, and Greptile's last reviewed commit are the same commit. |
