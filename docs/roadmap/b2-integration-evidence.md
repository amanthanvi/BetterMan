# B2 integration re-check

All B2 branches contain main `f16e8828` (#469 query/share allowlist and #471
concepts) plus the pending #445 v7 prerequisite. #445's branch was not modified.
B2 retains exact ingest v8; translations follow as v9. No merge, dispatch,
production/shared data, secret, configuration or repository-variable write.

## Final family checks

Every family ran ingest lint/tests, ops tests, dataset/deploy workflow tests,
Convex typecheck/tests, public-API guard, isolated convex:check on 3432/3433 with
no generated drift, Python 3.14 pip install dry-run, frontend lint/grammar/tests,
and PR whitespace/mixed-config/performance/Proof guards.

| Family | Ingestion | Convex | Frontend | Ops | Dataset/deploy workflows |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ubuntu | 956 | 3,280 | 850 | 126 | 12 |
| Fedora | 968 | 3,283 | 865 | 127 | 13 |
| Arch | 990 | 3,285 | 865 | 127 | 13 |
| Alpine | 1,020 | 3,287 | 865 | 127 | 13 |

Fedora and descendants also pass the new index preflight without confirmation.
The only new schema indexes compared with Ubuntu are on the new, initially empty
storedLicenseFiles table. No licenses.by_storageId or other legacy-table index
is added by the Fedora fix. Transactional reverse references, replay, orphan
safety and release pruning pass the Convex lifecycle test.

Three syntactically valid invented package selectors yield zero persistent data
cache writes. All explicit valid selectors use uncached Convex lookups; the
release-keyed default-provider cache remains. #469's allowlist and private misses
are unchanged, and invalid examples now use characters outside the distro grammar.

## Combined production-build E2E

On the final Alpine stack, started an isolated task-owned anonymous Convex backend
on cloud/site ports 3432/3433. Verified loopback URLs before setting only local E2E
environment values and running the repository's seed-convex-e2e script. Built
with pnpm next:build, then started the production server on 3460.

Command:

```bash
E2E_BASE_URL=http://127.0.0.1:3460 pnpm next:e2e e2e/man-query.spec.ts e2e/short-urls.spec.ts
```

**17 passed in 1.5 seconds.** This exercises made-up package private misses on
HTML/text/OG forms, query normalization, bare _rsc, real option redirects, aliases
and canonical short URLs against actual seeded Convex data and the production
Next build. Local unit/cache tests separately establish zero persistent miss
entries; this is not a live Vercel CDN test.

Verified exact launch PID/PPID/start/executable ownership before stopping the task
servers through their own sessions. Ports 3432, 3433 and 3460 have no listeners;
no other anonymous-agent deployment was stopped. Tracked generated files have no
drift. Logs and original acquisition artifacts remain in ignored .cache/b2/.

## Remaining owner work

Updated-head independent review, merge/deploy after #445, full staging runtime,
disk/storage measurement, reviewed Alpine whole-file pin commit after staging,
and explicit owner approval before production promotion. Prior acquisition
measurements/projections remain evidence, not full cloud completion. Deploy index
baseline updates must follow a confirmed rollout, not precede it just to bypass
the fail-closed preflight. See docs/runbooks/vercel-ops.md for the CLI limitation.

CI-specific verification: the lightweight ci_contracts job installs no dependencies.
The four TypeScript parser regressions run in the installed frontend suite, and
ops keeps the deployment-failure test. All 127 ops tests pass with bare dependency
imports disabled by a Node resolve hook (the hook separately rejects TypeScript).
No guard behavior or regressions were removed. Frontend now includes those four
cases, for 865 passing tests. The final production build and 17 E2E tests were
rerun after that test-layout correction. Application/Convex/ingestion/deploy-guard
source is byte-identical across the correction, checked with git diff.

Container build-context correction: the frontend parser test's root guard import
must exist in Next's Docker build stage. The builder now copies that one module.
A source context matching Docker COPY inputs, with its own offline frozen pnpm
install (no external node_modules links), passes the complete Next build and
typecheck. Docker is not installed locally; this does not claim a full image build.
Application, ingest, Convex and deploy-guard behavior is unchanged by the COPY.
