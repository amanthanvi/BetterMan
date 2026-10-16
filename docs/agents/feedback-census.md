# Feedback census

Recall of review feedback on BetterMan pull requests
[#306](https://github.com/amanthanvi/BetterMan/pull/306) and
[#318](https://github.com/amanthanvi/BetterMan/pull/318) through
[#326](https://github.com/amanthanvi/BetterMan/pull/326). Taken 2026-10-16.
Bot-thread counts and PR Checker counts are separate. They are not added together.

## Sources

Bot threads and comments were read with `gh pr view` and the `reviewThreads`
GraphQL query. PR Checker verdicts for the same pull requests are summarized
in the checker section. #306's final verdict is APPROVED. The other nine are
CHANGES-NEEDED.

The cleanup board is <https://github.com/users/amanthanvi/projects/5>.

## Coverage

CodeRabbit does not auto-review this repository on any base. The skip reason
on a `main` pull request is that the repository has fewer than 10 stars
([#306](https://github.com/amanthanvi/BetterMan/pull/306#issuecomment-6116298563),
and the same notice on
[#328](https://github.com/amanthanvi/BetterMan/pull/328#issuecomment-6225891344)).
[#319](https://github.com/amanthanvi/BetterMan/pull/319) through
[#326](https://github.com/amanthanvi/BetterMan/pull/326) target
`t3/site-improvement-audit`, so those eight also received the non-default-base
skip, then a rate-limited manual request. The review gate is Greptile.

| PR | Base | CodeRabbit | Greptile inline threads | Latest bot SHA vs head |
| --- | --- | ---: | ---: | --- |
| [#306](https://github.com/amanthanvi/BetterMan/pull/306) | `main` | withheld, under 10 stars | 11, all resolved | Greptile matches `fc022b03` |
| [#318](https://github.com/amanthanvi/BetterMan/pull/318) | `main` | 4 actionable comments on an ancestor | 8 (7 resolved, 1 open) | CodeRabbit covered `dc7bb0da`, 1 commit behind `7a5562b8` |
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

Themes 3 through 7 below are 30 of those threads. The Other list is the
remaining 7. 30 + 7 = 37. Themes 1 and 2 count pull requests, not threads.

## Themes

### 1. CodeRabbit does not auto-review this repository

The star gate is the one that applies on every base, including `main`.
Retargeting a pull request at `main` does not start an automatic CodeRabbit
review. #318 and #322 received a completed manual review only when the hourly
allowance was free
([#322 summary](https://github.com/amanthanvi/BetterMan/pull/322#issuecomment-6137236844),
zero line comments). The other stacked pull requests have no CodeRabbit line
review. Manual requests on #319 through #326 were rate-limited, for example
[#319](https://github.com/amanthanvi/BetterMan/pull/319#issuecomment-6137172075).

The review gate is Greptile. A Greptile pass on the pull request head is the
bot result these changes are held to.

Guard: do not block on a CodeRabbit auto-review, and do not treat a base
change as the way to get one. Request Greptile on the final head.

### 2. Reviewed SHA lags the pull request head (4 pull requests)

The latest bot summary does not cover the current head:

| PR | Bot | Reviewed | Head | Commits after the review |
| --- | --- | --- | --- | --- |
| [#318](https://github.com/amanthanvi/BetterMan/pull/318#issuecomment-6136929570) | CodeRabbit | `dc7bb0da` | `7a5562b8` | `fix: address CodeRabbit review findings on #318` |
| [#319](https://github.com/amanthanvi/BetterMan/pull/319#issuecomment-6137043447) | Greptile | `beca781a` | `52448091` | `test: cover FreeBSD and macOS distro workflows end to end` |
| [#320](https://github.com/amanthanvi/BetterMan/pull/320#issuecomment-6137131875) | Greptile | `abe48b05` | `3be94bf0` | `test: verify reading preferences persist through SSR` |
| [#323](https://github.com/amanthanvi/BetterMan/pull/323#issuecomment-6137308414) | Greptile | `6ac3116a` | `e7372eef` | merge plus `fix: let prerendered metadata routes resolve origin at build time` |

The Proof section on
[#306](https://github.com/amanthanvi/BetterMan/pull/306) once cited a run from
`176da33`, four commits behind the head. The approved verdict says the Proof
section now cites `fc022b03`, which matches Greptile's last reviewed commit.

Guard: before the Dev gate, require the Proof line SHA to equal the pull
request head, and require Greptile's last reviewed commit to equal that same
SHA.

### 3. The verify harness can certify the wrong tree or drop the evidence (11 threads, #306)

All 11 are Greptile threads on
[#306](https://github.com/amanthanvi/BetterMan/pull/306). All are resolved on
the thread. The approved verdict is on head `fc022b03`.

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

- [Targeted test instructions fail](https://github.com/amanthanvi/BetterMan/pull/306#discussion_r4282603490). `pnpm -C nextjs` resolves the Playwright `--config` inside `nextjs/`, where that config is not. This is a test-config finding. See the note under checked claims.
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
- [#326](https://github.com/amanthanvi/BetterMan/pull/326#discussion_r4254372494) Greptile: a down endpoint splits every error, so a 512-page batch can attempt 1,023 batches. Resolved on the thread. The PR Checker verdict says the 5xx half of this is now bounded (9 HTTP attempts) and that 4xx auth errors still bisect. See checker theme B.

Guard: a unit test whose connection or 5xx failure stays down and asserts a
bounded attempt count, with splitting reserved for page-specific failures.
401, 403, and 429 need their own cases.

### 7. Smaller clusters (10 threads)

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

## Other bot threads (7)

These seven are the threads not named in themes 3 through 7.

Pull request 318:

- [Playwright cache key uses the requested range](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254166556) on `.github/workflows/ci.yml`. The key is `^1.63.0` rather than the installed Playwright version, so a lockfile bump inside that range keeps a stale browser archive. This is a test-config finding.
- [Bad ingest bodies still return 500](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254166519) on `convex/http.ts`. `pages: [{}]` passes the shape check and then fails required fields.
- [Footer shows another distro](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254166540) on `AppShell.tsx`. A `?distro=fedora` visit paints Debian counts until the Fedora request finishes.
- [Alias redirect waits for related links](https://github.com/amanthanvi/BetterMan/pull/318#discussion_r4254274478) on `page.tsx`. CodeRabbit. Marked addressed.

Pull request 320:

- [Provider reset goes untested](https://github.com/amanthanvi/BetterMan/pull/320#discussion_r4254220286) on `readingPrefs.test.ts`. The test never mounts `ReadingPrefsProvider`. Still open, outdated hunk.

Pull request 322:

- [Bookmark shortcut promises the wrong action](https://github.com/amanthanvi/BetterMan/pull/322#discussion_r4254294417) on `site.webmanifest`. "New bookmark" opens the list, which has no add action. Resolved.

Pull request 325:

- [Mixed flag searches lose results](https://github.com/amanthanvi/BetterMan/pull/325#discussion_r4254344938) on `convex/queries.ts`. `--create archive` is required as one exact phrase. Resolved.

## PR Checker findings

These are must-fix items from the verdicts. They are not bot threads, so they
are not part of the 37.

### A. Proof section is missing or not tied to the head (9 pull requests)

Pull requests 318, 319, 320, 321, 322, 323, 324, 325, and 326. Each verdict asks for
a Proof section whose SHA is the reviewed head, with commands and counts.
Pull request 306's approved verdict says its Proof section cites `fc022b03`.

### B. Ingest HTTP status is classified by accident (3 findings, #326)

- F1b. Page-specific route errors were feared as HTTP 500, which the client now treats as transport failure and refuses to bisect. A later proof run saw HTTP 400 for `DUPLICATE_MAN_PAGE_ROUTE` and `INVALID_MAN_PAGE_ROUTE` only because the message matches `/validat/i` inside a stack frame. One bad page is isolated today. If that match stops, the bad page strands its 512-page batch. Map the domain codes to 4xx on purpose and test the live status.
- F1c. HTTP 429 is a 4xx, so it still bisects. Treat 429 as transient when the client does not already retry it.
- Auth. A probe that returns 401 on every call still bisects: 1,023 posts for a 512-page batch. Treat 401 and 403 as fatal next to the 429 case.

### C. No proof that a 512-page batch fits one write (1 finding, #326 F2)

The batch size moved from 20 to 512 with no staging or worst-case run showing
that one `insertStoredPages` mutation accepts it. A limit error is a 500, and
500s no longer bisect, so an oversized batch can abort the run. Justify 512
or lower the default and make it configurable.

### D. Checkpoint edge cases (1 finding, 4 cases, #326 F4)

- A deleted upload row is invisible: the client reports success and calls activate with a missing page.
- A zero-length checkpoint reopens as a new database.
- A deleted plan row with remaining upload rows fails with a raw UNIQUE error.
- Worker count 64 is accepted and is not clamped to 8.

### E. Deploy order (2 pull requests)

- [#324](https://github.com/amanthanvi/BetterMan/pull/324) F1. `deploy.yml` deploys Convex before Next while `rateLimit` requires a tag the old frontend does not send. Protected routes error until the new Next is promoted, and a Vercel-only rollback does not recover.
- [#325](https://github.com/amanthanvi/BetterMan/pull/325) F3. Python still sends `optionsText` that Convex recomputes. Drop it from the ingest payload, or enforce Convex deploy before any ingestion run.

No bot thread stated either order. The earlier census missed both because it
only searched bot comments.

### F. Test-config edits called out by PR Checker (2 pull requests)

- #325 F2. `vitest.config.ts` changes the `convex-test` transform inside a feature pull request. Move that to its own change, with evidence that real Convex skips documents that lack the search field.
- #323. The verdict asks the pull request body to call out the `ci.yml` edit and the rewritten test.

Together with the two bot threads (theme 3 Playwright `--config` path, and the
`ci.yml` cache-key thread in Other), test-config edits show up four times.
The claim that they do not recur was wrong. It skipped the `ci.yml` thread.

### G. Trailing blank lines and stale copy

- #321 F1. `nextjs/components/doc/BlockView.tsx` and `nextjs/components/man/stripHeaderSections.ts` end in a trailing blank line and fail `git diff --check`. One pull request, two files. No bot thread mentioned trailing blank lines.
- Stale "(20 chunks)" copy. #318 still says that in `validateContentFieldSize` and in a test name after chunking moved to a UTF-8 byte budget. #325 S6 inherits the same string. Two verdicts. The bot nits were a single LanguageTool hyphen and a single markdownlint MD041 warning, both inside the #318 CodeRabbit review and neither an inline thread.

## Checked claims

- Trailing blank lines. No bot thread. PR Checker #321 F1 is the one hit. See checker theme G.
- Test config. Recurs. Two bot threads and two PR Checker pull requests. See checker theme F and the `ci.yml` item in Other.
- Deploy order between ingestion and Convex, and between Convex and Next. No bot thread. Two PR Checker pull requests. See checker theme E.
- Prose drift. The bot comments do not repeat it. The "(20 chunks)" string does, across two verdicts. See checker theme G.

Pull request 323 has no inline thread from either bot. Its Greptile summary still lags the head (theme 2).
