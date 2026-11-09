# B2 extraction worklog

## 2026-11-09 Alpine stale-pin recovery

Goal: one non-draft fix PR from origin/main cac144cd, with a complete local
no-upload Alpine rehearsal. No merge, workflow dispatch, Convex/Vercel access,
secrets/environment output, or child agents. Preserve prior histories below.
Verified: traced original full acquisition fails HTTP 404 for apk-tools-doc
3.0.8-r0 and expat-doc 2.9.0-r0 on both mirrors; apk-tools-doc 3.0.9-r0 is present
in matching current indexes. Refreshed snapshots/version election and committed
4,532 native-receipt-checked whole-file pins. Added missing-archive guidance and a
local publisher sink. Both bootstrap and fresh final-lock full rehearsals finish
with zero fatal errors: 43,129 page records, 4,498 licenses, 3,505 standard fills,
115 license gaps, 117 nonfatal source/parse omissions including 3 oversized pages.
Final replay: 351.78 s, zero downloaded bytes, both native and whole-file checks.
Lint, 1,246 ingestion tests and 125 ops tests pass. Evidence/report are committed
with the fix; remaining delivery is one non-draft PR. Independent review belongs
to the lead; this implementation child starts no agents. No merge or dispatch.

## Earlier B2 implementation history

Goal: #394, #467 Ubuntu → #470 Fedora → #473 Arch → #476 Alpine. Pending
#445 v7; all B2 exact v8; translations v9. Main contains #469/#471. No merge,
dispatch, production/shared config/data/secret/variable writes. Lead owns staging,
review and production sign-off; this implementation child starts no agents.

Current lead correction: replace full-default proof and HTML limiter with light
provider metadata, targeting alternate <=5 calls/13 docs/1 storage read and
standard/default unchanged at 4/26/1. On #470, providersFor public query returns
only registered packages + answering release, accepts no stage. Canonical route
uses active pointer + cached page list (2 docs); alias/legacy uses bounded indexed
providers. Internal Next cache keys only distro/name/section/release; mismatches
are not stored. Only proven packages reach release/pkg cache. Invented selectors
skip provider, related and typo reads; the extra HTML limiter is removed.
Index preflight design/immutable-parent safety remains unchanged.

Frontend regressions cover repeated invented selectors (one metadata entry,
zero page actions/pkg entries), unchanged selector case, alias proof and release
mismatch/rollback. Backend tests cover package lists, alias routes, missing route
release identity and stage rejection. Fedora checks pass: 871 frontend / 3,283 Convex / 968 ingestion / 127 ops / 13
workflow tests; lint/grammar/typecheck/public-API/codegen-no-drift/pip all pass.
Perf passes with standard/default 4/26/1 and alternate 5/13/1. Fedora pushed
08b831d0; Arch pushed cbd5d19e with 990 ingestion / 871 frontend / 3,285 Convex /
127 ops / 13 workflow tests and all lint/typecheck/public-API/codegen/pip/perf
checks passing. Arch implementation range-diff unchanged. Alpine code restacked
unchanged; one historical worklog conflict kept this current record. Alpine
passes 1,020 ingestion / 871 frontend / 3,287 Convex / 127 ops / 13 workflow tests
and all lint/typecheck/public-API/codegen/pip/perf checks. All three family perf
runs hit 5/13/1 alternate and 4/26/1 standard/default. Final production build and
22 provider/man-query/short-URL E2E tests pass. Servers stopped after exact PID
verification. Remaining: Alpine docs/push and final remote Proof/guard snapshot;
lead owns updated-head independent review, staging measurement/pins and prod
sign-off. No merge, dispatch, shared/production writes or CI watches.

#477 c8dde155 is OPEN. Applied with cherry-pick --no-commit only for local perf;
patch reversed; exact original bytes verified before committing. Its sole change
ignores desktop bare GET / probes. Preserve exact original in .cache/b2. Adopt
only lead's numeric alternate budget 5/13/1; keep other metrics/tolerances intact.
PR guard requires perf-budget-change + ## Budget on #470; lead numeric target
provides authorization for that acknowledgement. No harness change is delivered.

Prior acquisition samples/projections unchanged: Ubuntu 266/300 min <10 GB;
Fedora 121.34 MB/5.51 s, 225/300 <8 GB; Arch CDN 170.33 MB/20.49 s, 270/300
<10 GB; Alpine 223 packages/168.12 MB, 240/300 <6 GB. Lead commits reviewed Alpine
whole-file pins after staging. Docker absent; full cloud/container run deferred.
Task ports 3432/3433/3460; stop only exact verified task-owned processes. All
original task histories and .cache/b2 evidence retained; no CI watches.
