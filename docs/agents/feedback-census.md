# Feedback census (AP-20261016-01)

Recall of CodeRabbit and Greptile review feedback on BetterMan pull requests
[#306](https://github.com/amanthanvi/BetterMan/pull/306) and
[#318](https://github.com/amanthanvi/BetterMan/pull/318) through
[#326](https://github.com/amanthanvi/BetterMan/pull/326). Taken 2026-10-16 from
GitHub review threads and issue comments. Counts below are that corpus only.

## Sources

Read with `gh pr view --json comments,reviews` and
`gh api graphql` `reviewThreads` (inline threads, resolved state, path).

Not available on this machine, so they are not folded into the counts:

- `/workspace/fleet/pr-verdicts/BetterMan-*.md`
- `fleet/reviews/*betterman*`

No `fleet/` directory exists in this checkout.

The GitHub Project board for this recall was not created. `gh project create
--owner amanthanvi --title "BetterMan cleanup (AP-20261016-01)"` returned:

```text
GraphQL: cursor[bot] does not have permission to create projects on ownerId MDQ6VXNlcjIyMzA2MTA0. (createProjectV2)
```

The token is the Cursor GitHub App (`cursor[bot]`). It can read these pull
requests. It cannot create Projects on `amanthanvi`.

## Coverage

[#319](https://github.com/amanthanvi/BetterMan/pull/319) through
[#326](https://github.com/amanthanvi/BetterMan/pull/326) target
`t3/site-improvement-audit`, not `main`. CodeRabbit skips automatic review on
any base other than the default branch. A later `@coderabbitai review` on each
of those eight pull requests returned `Review rate limited`.

| PR | Base | CodeRabbit | Greptile inline threads | Latest bot SHA vs head |
| --- | --- | ---: | ---: | --- |
| [#306](https://github.com/amanthanvi/BetterMan/pull/306) | `main` | withheld, under 10 stars | 11, all resolved | Greptile matches `fc022b03` |
| [#318](https://github.com/amanthanvi/BetterMan/pull/318) | `main` | 4 actionable comments | 8 (7 resolved, 1 open) | CodeRabbit covered `dc7bb0da`, 1 commit behind `7a5562b8` |
| [#319](https://github.com/amanthanvi/BetterMan/pull/319) | stacked | skipped, then rate-limited | 1 open | Greptile `beca781a`, 1 commit behind `52448091` |
| [#320](https://github.com/amanthanvi/BetterMan/pull/320) | stacked | skipped, then rate-limited | 1 open, outdated hunk | Greptile `abe48b05`, 1 commit behind `3be94bf0` |
| [#321](https://github.com/amanthanvi/BetterMan/pull/321) | stacked | skipped, then rate-limited | 1 open, outdated hunk | Greptile matches `2283e595` |
| [#322](https://github.com/amanthanvi/BetterMan/pull/322) | stacked | reviewed head, 0 actionable; a later request was rate-limited | 3 (2 resolved, 1 open) | both match `3296f6d1` |
| [#323](https://github.com/amanthanvi/BetterMan/pull/323) | stacked | skipped, then rate-limited | 0 | Greptile `6ac3116a`, head `e7372eef` is later |
| [#324](https://github.com/amanthanvi/BetterMan/pull/324) | stacked | skipped, then rate-limited | 2 (1 resolved, 1 open) | Greptile matches `0f4e0e06` |
| [#325](https://github.com/amanthanvi/BetterMan/pull/325) | stacked | skipped, then rate-limited | 5 (3 resolved, 2 open) | Greptile matches `cd672c3c` |
| [#326](https://github.com/amanthanvi/BetterMan/pull/326) | stacked | skipped, then rate-limited | 1 resolved | Greptile matches `bdf88f9e` |

Inline total: 37 threads (4 CodeRabbit, 33 Greptile). 29 are resolved. 8 are
still open. CodeRabbit posted actionable line comments only on #318.

## Themes

Counts are distinct inline threads unless the row says pull requests.

### 1. CodeRabbit does not review the stack (8 pull requests)

[#319](https://github.com/amanthanvi/BetterMan/pull/319#issuecomment-6137003556)
through
[#326](https://github.com/amanthanvi/BetterMan/pull/326#issuecomment-6137387720)
each received `Review skipped`: automatic reviews are disabled when the base is
not the default branch. The follow-up request was then rate-limited, for
example
[#319](https://github.com/amanthanvi/BetterMan/pull/319#issuecomment-6137172075).
The same limit reply is on #320, #321, #322, #323, #324, #325, and #326.
CodeRabbit's own note on #318 says the plan includes one review per hour.

[#306](https://github.com/amanthanvi/BetterMan/pull/306#issuecomment-6116298563)
is a separate gate: automatic review is off because the repository has fewer
than 10 stars. No CodeRabbit line comments were posted there.

Guard: do not treat a green Greptile summary on a stacked pull request as a
CodeRabbit review. Either retarget the pull request at `main` before the Dev
gate, or enable CodeRabbit on non-default bases, and space review requests
instead of fanning eight out in one minute.

### 2. Reviewed SHA lags the pull request head (4 pull requests)

The latest bot summary does not cover the current head:

| PR | Bot | Reviewed | Head | Commits after the review |
| --- | --- | --- | --- | --- |
| [#318](https://github.com/amanthanvi/BetterMan/pull/318#issuecomment-6136929570) | CodeRabbit | `dc7bb0da` | `7a5562b8` | `fix: address CodeRabbit review findings on #318` |
| [#319](https://github.com/amanthanvi/BetterMan/pull/319#issuecomment-6137043447) | Greptile | `beca781a` | `52448091` | `test: cover FreeBSD and macOS distro workflows end to end` |
| [#320](https://github.com/amanthanvi/BetterMan/pull/320#issuecomment-6137131875) | Greptile | `abe48b05` | `3be94bf0` | `test: verify reading preferences persist through SSR` |
| [#323](https://github.com/amanthanvi/BetterMan/pull/323#issuecomment-6137308414) | Greptile | `6ac3116a` | `e7372eef` | merge plus `fix: let prerendered metadata routes resolve origin at build time` |

A fifth lag is author-written, not a bot finding. The Proof section on
[#306](https://github.com/amanthanvi/BetterMan/pull/306) says the `VERIFY_ID=cix`
launch log is from `176da33` and was not re-run on head `fc022b03` (4 commits
later). Greptile's own last-reviewed commit on that pull request does match the
head.

Guard: before the Dev gate, require the Proof line SHA to equal the pull
request head, and require Greptile's "Last reviewed commit" to equal that same
SHA. A summary that names an ancestor is not proof of the head.

### 3. The verify harness can certify the wrong tree or drop the evidence (11 threads, #306)

All 11 are Greptile threads on
[#306](https://github.com/amanthanvi/BetterMan/pull/306). All are resolved on
the thread, which is not the same as a re-run proof (see theme 2).

Wrong tree or clobbered files:

- [Tests use another checkout](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4283095760). A healthy server on port 3000 is reused without checking the checkout.
- [Cleanup erases newer changes](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4284650142). A refused launch restores an old snapshot over later edits.
- [Preserved changes fail the test](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4283665440). `verify:test` requires a clean status for generated files that the test itself restored.
- [Launch scripts can be replaced](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4282603478). `/tmp/betterman-verify` is accepted even when another user owns it.

Evidence never lands:

- [CI proof disappears](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4282603499). Screenshots and the HTML report are not uploaded.
- [Manual smoke never starts](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4283095738). `VERIFY_ID=ci` is shorter than the 3-character minimum.
- [Failed launches escape cleanup](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4282603484). The Convex session is recorded only after Next is ready.

Command and environment:

- [Targeted test instructions fail](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4282603490). `pnpm -C nextjs` resolves the Playwright `--config` inside `nextjs/`, where that config is not.
- [Tests fail as root](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4283733253).
- [IPv6 launch never becomes ready](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4284072992).
- [Browser errors go unnoticed](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4282603510).

Guard: the verification skill should refuse a reused server whose recorded
checkout, pid, and start time do not match, upload the evidence artifact with
`if: always()`, and run the documented Playwright command through the wrapper
so the config path and `NODE_PATH` are absolute.

### 4. Convex read and document budgets (4 threads, 3 pull requests)

- [#318](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254274466) CodeRabbit: chunking can split a surrogate pair or exceed the 1 MiB UTF-8 document limit. Marked addressed.
- [#324](https://github.com/amanthanvi/BetterMan/pull/324#discussion_r4254350353) Greptile: `listSection` reads full legacy rows before the slim fallback. Resolved.
- [#324](https://github.com/amanthanvi/BetterMan/pull/324#discussion_r4254598459) Greptile, still open: one leftover legacy search row skips the slim path, so a deep offset can pass 16 MiB.
- [#325](https://github.com/amanthanvi/BetterMan/pull/325#discussion_r4254623372) Greptile, still open: a mixed flag-and-word query reads two description sets and doubles the stated budget (99 rows vs 75, 324 vs 300).

Guard: one Convex test that fails when a query exceeds its documented row
budget, including a legacy fat row and a mixed `--flag word` query.

### 5. The palette does not share the page's behavior (3 threads, 3 pull requests)

- [#318](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254166536) Greptile: Ctrl/⌘+F is suppressed from the URL alone, including the Not found page that never mounts the find handler. Resolved.
- [#319](https://github.com/amanthanvi/BetterMan/pull/319#discussion_r4254181579) Greptile, still open: FreeBSD or macOS with no release breaks palette search. Server pages fall back to Debian; the palette shows "Search failed."
- [#325](https://github.com/amanthanvi/BetterMan/pull/325#discussion_r4254344944) Greptile: option results drop `anchorId` in the palette, so `--create` does not open the option row. Resolved on the thread; the head was reviewed.

Guard: an end-to-end check that the palette and the page use the same distro
fallback and the same option fragment for one query.

### 6. Ingestion retries multiply a single outage (2 threads, 2 pull requests)

- [#318](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254274473) CodeRabbit: `IncompleteRead` raised while reading a 5xx body skips the retry branch. Marked addressed.
- [#326](https://github.com/amanthanvi/BetterMan/pull/326#discussion_r4254372494) Greptile: a down endpoint splits every error, so a 512-page batch can attempt 1,023 batches. Resolved on the thread.

Guard: a unit test whose connection or 5xx failure stays down and asserts a
bounded attempt count, with splitting reserved for page-specific failures.

### 7. Smaller clusters

Service worker responses wait on cache writes, both on #322:
[navigation](https://github.com/amanthanvi/BetterMan/pull/322#discussion_r4254294409)
(resolved) and
[network-first / cache-first](https://github.com/amanthanvi/BetterMan/pull/322#discussion_r4254599992)
(still open). Guard: a test where one slow `writeCache` does not delay a
second response.

Distro diff drops structure, both on #325 and both about `manDiff`:
[lists](https://github.com/amanthanvi/BetterMan/pull/325#discussion_r4254344941)
(resolved) and
[link targets](https://github.com/amanthanvi/BetterMan/pull/325#discussion_r4254623377)
(still open).

Click behavior, one thread each: [#318 option links cancel modified clicks](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254166529)
and [#321 repeated TOC clicks push duplicate history entries](https://github.com/amanthanvi/BetterMan/pull/321#discussion_r4254255762)
(open, outdated hunk).

Telemetry buffer, four threads on `nextjs/instrumentation-client.ts` in #318
only. Three are resolved. [The unbounded `earlyErrors` buffer](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254606658)
is still open.

## Checked, not a recurring finding

These were searched for in CodeRabbit and Greptile bodies and did not repeat:

- Trailing blank lines. No bot comment.
- Edits to test config. One adjacent defect: the #306 Playwright `--config` path above. On #322 CodeRabbit listed `nextjs/test-results/.last-run.json` under files with no reviewable changes and did not flag it.
- Deploy order between ingestion and Convex. No bot comment.
- Prose drift between docs. One LanguageTool hyphen hit and one markdownlint MD041 warning inside the #318 CodeRabbit review details. Neither was an inline thread, and neither appeared on another pull request.

#323 has no inline thread from either bot. Its Greptile summary still lags the head (theme 2).
