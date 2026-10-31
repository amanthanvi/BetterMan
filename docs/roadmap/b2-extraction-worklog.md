# B2 extraction worklog

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
Perf passes with standard/default 4/26/1 and alternate 5/13/1. Remaining: commit/
push #470; restack/check/push #473/#476, final combined E2E, refresh/recheck Proof.

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
