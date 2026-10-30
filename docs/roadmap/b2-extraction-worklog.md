# B2 extraction worklog

Goal: #394, #467 Ubuntu → #470 Fedora → #473 Arch → #476 Alpine. Pending
#445 is v7; all B2 families exact v8; translations v9. No merges, dispatches,
production/shared config/data/secret/variable writes. Lead owns independent
review, staging measurement and production sign-off. This child starts no agents.

Latest #470 P1s implemented: default-first release-cached provider proof, including
alias-owned routes; early page limiter/private 429 before explicit HTML lookups;
invented selectors cause no provider lookup/cache entry and skip typo reads.
Removed editable index policy; trusted tooling compares immutable target/parent
schemas for every table. New tables pass; added/changed indexes on existing tables
require confirmation. Malformed input/history fails even confirmed. Audits of
main f16e8828, #445 82cd2228, #465 4706f03e and translation heads
05f376a3/dc26540e/6a68d015 all require no confirmation. Full SHAs/bases in Fedora
evidence. Main already contains #469/#471; pending #445 carried without modifying
its branch. Prior storedLicenseFiles lifecycle, contract/holds/tier/CAS, archive
fallbacks, strict redirects, package grammar and Alpine pin behavior preserved.

Fedora: 968 ingestion / 869 frontend / 3,283 Convex / 127 ops / 13 workflow tests
pass; lint/grammar/typecheck/public-API/codegen-no-drift/pip dry-run pass. Ops also
passes with bare imports disabled. Production provider/man-query/short-URL E2E:
22 pass. Cold performance man/default 4/26/1; alternate 7/31/2 vs 4/11/1. Default
proof plus page limiter costs +3 calls/+20 docs/+1 storage read. Performance check
fails only these three alternate limits; baseline/harness unchanged. Report for
lead review. Evidence and original ignored .cache/b2 artifacts preserved.

Remaining: final perf repeat, commit/push Fedora; restack/check/push Arch and
Alpine; refresh/recheck each Proof. Preserve acquisition measurements/projections:
Ubuntu 266/300 min <10 GB; Fedora 225/300 <8 GB; Arch CDN cold 170.33 MB/20.49 s,
270/300 <10 GB; Alpine 240/300 <6 GB and all 223 cached package hashes exported.
Lead commits reviewed Alpine pins after first staging acquisition; required once
present. Docker absent; full container/cloud rehearsal stays with CI/lead.

Task-local backend 3432/3433 and Next 3460 were started for E2E and stopped via
owned sessions after exact PID verification. No task server remains.
