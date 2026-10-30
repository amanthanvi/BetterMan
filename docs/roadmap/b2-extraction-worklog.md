# B2 extraction worklog

Goal: #394, #467 Ubuntu → #470 Fedora → #473 Arch → #476 Alpine. #445 remains
pending v7; B2 exact v8; translations v9. No merge, dispatch, production/shared
config/data/secret/variable writes. Lead handles review/staging and prod sign-off.

Current review: #470 must bypass persistent cache for unproven package selectors;
avoid licenses.by_storageId on legacy data; add a fail-closed deploy index preflight
independent of Convex 1.48's nullable schema evaluation; integrate #469/#471 from
main and keep allowlist/private misses. Rebase/restack/push/Proof every family.

Ubuntu rebased onto main f16e8828 with pending #445 changes carried locally, leaving
#445's branch untouched. Reconciled concept/share metadata and B4 tier robots with
#469 query privacy. 956 ingestion / 3,280 Convex / 850 frontend / 126 ops / 12
workflow tests pass; lint/grammar/typecheck/public API/codegen no-drift/pip pass.
Next: push Ubuntu/Proof; restack Fedora and implement fixes, then Arch/Alpine;
rerun each family's checks and final-stack man-query/short-URL E2E.

Preserve prior cold/cached acquisition measurements and projections: Ubuntu
266/300 min <10 GB; Fedora 225/300 <8 GB; Arch CDN cold 170.33 MB in 20.49 s,
270/300 <10 GB; Alpine 240/300 <6 GB, cached export of all 223 acquired hashes.
Alpine reviewed pin map is required when present; lead commits full staging pins
later. Original evidence and .cache/b2 artifacts remain; no subagents or CI watches.
Task-local Convex ports 3432/3433; stop only freshly verified task-owned processes.
