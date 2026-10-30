# Vercel production operations

BetterMan's active public Next.js application runs on Vercel. `betterman.sh` and `www.betterman.sh` must resolve to the `betterman` project's current production deployment. Next.js reads production datasets, search, and rate-limit state from Convex.

## Required GitHub Actions secrets

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `CONVEX_DEPLOY_KEY` (deployment-scoped production deploy key)

Also set the public `CONVEX_URL` GitHub environment variable to the production `.convex.cloud` URL. Keep all four secrets only in the protected `production` GitHub environment. That environment permits deployments only from protected branches; repository-scoped production secrets are prohibited. Never commit `.vercel/project.json`, pulled environment files, or token values.

## Automatic deployment

1. Merge to `main`.
2. `.github/workflows/ci.yml` runs the complete test/build/security matrix.
3. A non-cancelable `workflow_run` in `.github/workflows/deploy.yml` accepts only a successful `push` CI result for `main`, checks out its exact `head_sha`, and confirms that SHA is still current `main` before changing the backend.
4. Under the repository's Node 26 tooling contract, the workflow deploys that exact SHA's Convex schema/functions, then checks production release data, search, page content, and metadata functions. Convex changes must remain backward-compatible with the currently promoted frontend during this handoff.
5. The workflow switches to the Vercel project's Node 24 build/runtime contract, uses the exact Vercel CLI version pinned in the trusted tooling checkout's `package.json` (the version `pnpm deps:provenance` just verified), and runs `scripts/deploy-vercel.sh` from the repository root. Vercel applies the project's `nextjs` root directory exactly once. The script pulls production settings, builds the artifact, and creates a production-targeted deployment with `--skip-domain`, leaving the current site live.
6. It requires the staged deployment to pass all of the following:
   - deployment state is `READY`;
   - deployment metadata SHA equals the checked-out `main` SHA;
   - `/api/v1/info` returns an initialized Convex dataset release;
   - `/robots.txt` is valid;
   - `/sitemap.xml` is valid;
   - `/man/tar/1` renders server-side content.
7. Immediately before promotion, the automatic path confirms the SHA is still current `main` again.
8. Only then does the script promote the deployment and require both `betterman.sh` and `www.betterman.sh` to point to its exact deployment ID and serve initialized API data. A post-promotion failure automatically rolls back to the deployment captured before the run.

The job is not `continue-on-error`. A failed deployment or verification leaves the workflow red.

After an automatic Convex deployment, `related:backfillActiveReleases` validates
active release manifests and schedules bounded hydration batches where needed.
A release stopped after three failed attempts is returned in `stopped` with its
ID and distro; healthy releases still schedule in the same transaction.
`pnpm convex:related-check` detects `backfillStopped` immediately and fails with
that ID and repair instructions instead of waiting five minutes. Convex code is
already deployed at this point; the frontend deployment remains blocked.
Inspect the failed scheduled batch and repair its cause, then run:

```bash
pnpm exec convex run --prod related:retryFailedBackfill '{"datasetReleaseId":"<stopped-id>"}'
pnpm exec convex run --prod related:backfillActiveReleases '{}'
pnpm convex:related-check
```

Use the protected deployment's securely configured CLI credentials. Re-arm each
reported stopped ID; healthy release completion is retained. Retry the deployment
only after readiness passes. Re-arming does not mark metadata complete or move
an active pointer.
Before deploying the frontend, `pnpm convex:related-check` requires every active
pointer to reference a manifest-verified, sealed release with a matching completed
metadata version. Missing or unverified manifests, duplicate pointers, empty status, query failures, or a
five-minute timeout fail the deployment; success is recorded in the job summary.

Activation first verifies declared page, per-section, alias, and license counts
against successful uploads. License package declarations identify exactly which
packages require nonblank text. It seals only a complete upload before starting hydration. Until hydration is
complete, it returns HTTP 409 with `pending: true` and leaves the previous active
pointer untouched. The ingestion client polls the same idempotent activation
request until HTTP 200 with `pending: false`. The final pointer swap and readiness
check occur in one mutation. Older clients fail on 409 rather than incorrectly
reporting publication. Promotion likewise requires all requested source
releases to be manifest-verified, sealed, and complete in the pointer-copy transaction.

All ingestion paths reject new rows on sealed releases, including retired ones;
existing-row replays remain no-ops. Legacy active releases are protected even
before their seal is persisted. New data requires a new release ID. Pruning
permanently marks a release before deleting its first child, so partially pruned
releases cannot be reactivated or hydrated. Administrative search/content
maintenance must obey the same immutability boundary, including shared blobs
referenced by protected releases; it is not an override. Lookup fallback remains for unresolved references, not as a
substitute for completing hydration before activation.

Legacy releases with no original alias declaration remain unverified. Counting
the aliases currently stored cannot distinguish a complete upload from an
interrupted one. Recover original ingestion evidence and validate the declaration
through an explicitly reviewed recovery path, or re-ingest under a new release
ID and activate the verified replacement. Do not manufacture zero alias counts
or patch verification flags to unblock deployment. Existing data can remain
available while the deployment completion gate fails closed.

Historical frontend rollbacks neither restart migration nor roll the backend
schema backward. Concurrent ingestion may build a new inactive release during a
frontend build, but cannot invalidate an active release's completed metadata or
replace its pointer with an incomplete release.

## CLI provenance

`pnpm deps:provenance` runs `npm audit signatures` against the installed frozen
dependency tree, then requires verified SLSA provenance for the exact Vercel CLI
pin from `vercel/vercel`'s `.github/workflows/release.yml`. It runs in PR CI and
again against trusted deployment tooling before any deployment credentials are
passed to the CLI. Sigstore verification additionally requires the exact release
workflow certificate identity on `main` and the GitHub Actions OIDC issuer.
Missing attestations fail even if registry signatures pass.
Operational contract tests also require the gate to run unconditionally after
installation and before deployment-secret exposure, and require the deploy step
to refuse any `vercel --version` other than the exact pin in the trusted tooling
`package.json` that the gate verified. Dependabot vulnerability alerts and weekly
update PRs remain enabled; an upgrade cannot silently bypass the same provenance
and dependency-review gates.

The CLI is pinned to 58.4.4, the newest attested stable release. Its verified
source commit is `6331571e2fe14de31a01d00deead9e7a349e53a6`. Vercel moved later
CLI publication to private source (see
https://github.com/vercel/vercel/issues/17408), and npm does not generate
provenance for publishes from a private repository: every release from 58.5.1
onward has registry signatures but no attestation (rechecked through 64.5.0 on
October 18, 2026). Vercel's suggested substitute, comparing
`https://vercel.com/docs/cli/release-notes/npm/<version>/integrity` with npm's
`dist.integrity`, is an unsigned vendor assertion with no source binding. That
is not evidence of compromise, but does not meet this gate.
Do not remove the provenance gate to accept an automated upgrade. Re-evaluate
the pin when attested releases become available, or explicitly review an
alternative verification policy if security or compatibility fixes require it.

The Vercel CLI depends on Vercel's `sandbox` package, which osv-scanner matches
against two advisories for the unrelated legacy `sandbox` package below 1.0.0.
`scripts/check-osv-exceptions.mjs` checks the `osv-scanner.toml` exceptions
against that condition rather than the CLI version: it fails if the lockfile
gains a `sandbox` release below 1.0.0 (or a prerelease), reaches `sandbox`
through anything other than the root Vercel CLI dependency, or no longer
contains `sandbox` at all. Each exception must expire between 30 days and one
year out. A CLI upgrade that keeps these conditions needs no exception edit.

## Manual deployment or rollback

Run `.github/workflows/deploy.yml` (`deploy-vercel`) from the default `main` workflow definition with a full lowercase 40-character commit SHA. The no-secret validation job requires that commit to be reachable from protected `main`. The deploy job checks out current trusted deployment tooling separately from the selected application revision. A run for the current `main` head also deploys that revision's Convex functions, as an automatic deploy would. A run for an older SHA does not roll Convex functions backward: the current production contract is checked first, then the historical app receives the same build, metadata, smoke, promotion, alias, and rollback gates. Only select revisions compatible with the current Convex API.

GitHub concurrency keeps one production deployment running and only the newest request pending. If a manual rollback is replaced by a newer pending request, rerun it after the active deployment finishes. A new successful `main` request intentionally takes precedence over an older pending rollback.

For an urgent platform-level rollback, Vercel also supports:

```bash
vercel rollback <known-good-deployment-url-or-id>
```

Prefer the workflow with a known-good Git SHA when possible so the production artifact remains reproducible from repository history.

## Verification

Anonymous command-line requests may receive a Vercel bot challenge (`429` with `x-vercel-mitigated: challenge`). Use authenticated Vercel CLI requests rather than weakening production bot controls:

```bash
vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
vercel inspect betterman.sh --json --token="$VERCEL_TOKEN"
vercel curl /api/v1/info
vercel curl /robots.txt
vercel curl /man/tar/1
```

Also verify in a real browser:

- `/` renders without console errors.
- `/search?q=tar` returns results.
- `/man/tar/1` renders content and client interactions hydrate.

## Failure triage

- Build failure: inspect the `deploy_production` job in the `deploy-vercel` workflow and Vercel build logs; reproduce with `pnpm next:build`.
- Convex push stopped at "This push will create the following indexes on large tables": automatic deploys keep Convex's large-index check. After the change has been reviewed, rerun `deploy-vercel` manually for the current `main` head SHA with `confirm_large_indexes` checked (the input is refused for any older SHA). Convex then builds the indexes during the push, while the current functions keep serving, and switches when the backfill completes. That run's job timeout rises from 20 to 90 minutes. For an index too large to build within that time, stage it (`staged: true`) in one release and use it in the next.
- Convex deploy/check failure: verify `CONVEX_DEPLOY_KEY` and the `CONVEX_URL` GitHub environment variable, then run `CONVEX_URL=<production-url> pnpm convex:prod-check` locally. Do not continue to Vercel until the data, search, page, and metadata checks pass.
- Missing environment: verify the protected GitHub `production` environment secrets and `CONVEX_URL` variable, plus the Vercel production Convex URL (`NEXT_PUBLIC_CONVEX_URL` or `CONVEX_URL`). The deploy script enforces `PUBLIC_BASE_URL=https://betterman.sh` on each production deployment.
- Smoke failure: use `vercel curl` against the immutable deployment URL before changing the production alias.
- Alias mismatch: inspect both the immutable deployment and both custom domains; the script attempts automatic rollback and must not declare success until their deployment IDs match.
- Runtime errors: inspect Vercel runtime logs/errors and correlate the deployment ID before rolling back.

## Provider query allowlist

The shared `pkg` validator accepts 1–200 ASCII characters: an initial letter or
number, then letters, numbers, `+`, `_`, `.`, or `-`. It preserves case; Debian,
RPM, Arch and Alpine names share this bounded union. `lsb_release`,
`SDL2_sound-devel` and `R` must reach provider lookup unchanged. Whitespace,
slashes, control/non-ASCII characters and longer values are invalid. Keep these
bounds when applying #469's query allowlist so provider selectors cannot expand
cache keys through arbitrary query strings. The same validator serves HTML,
plain text, metadata, API and OG routes. Explicit valid `pkg` lookups bypass
Next's persistent data cache until resolved, including misses; their syntax alone
is not proof of a real provider. The default lookup remains release-keyed and
cached. #469's renderer rules still keep unproven HTML/text/OG responses private.

## Index deployment safety (#470)

B2 adds **no index to the existing `licenses` table**. Large-notice reverse
references live in the new, initially empty `storedLicenseFiles` table. Its two
indexes are created with that empty table. License rows and reverse references
are linked in the same mutation; replay adds no duplicate reference, and release
pruning removes both. The orphan sweep uses the new table's index, so notice
cleanup does not scan or backfill historical license text.

Do not rely on Convex 1.48's large-index check alone: `schemaEvaluation.ts` can
return null when evaluation fails, and `checkForLargeIndexBackfill.ts` skips its
check in that case. It does not reliably fail closed at the 100,000-row threshold.

Before every current-main Convex deployment, the trusted tooling checkout's
`scripts/check-convex-indexes.mjs` compares the target commit's `convex/schema.ts`
with its parent commit's schema using TypeScript syntax, without executing either.
Main uses squash merges: that parent is the previously deployed revision on both
automatic runs and manual dispatches of main's head. The application checkout
fetches both commits. Missing history/schema or computed/uninspectable definitions
stop deployment even with confirmation. The comparison reads Git objects, not a
working-tree policy or baseline; target edits cannot approve their own indexes.

Any added or changed index on any previously existing table requires the manual
current-main `confirm_large_indexes` input, regardless of table size. New tables
and their indexes pass because they have no existing rows. Removing an index alone
does not backfill. The check runs before `convex deploy`; failures stop the push.
After review, use the current-main confirmation procedure (90-minute budget), or
stage the index in a separate rollout before enabling readers. The SDK guard is
an additional check, not the safety boundary. No production deploy or confirmation
was run by this implementation task.

## Man page edge caching (C4, #406)

Man pages (`/man/<name>`, `/man/<name>/<section>`) send `CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (misses `s-maxage=600`) and `Cache-Control: public, max-age=0, must-revalidate`. The proxy (`nextjs/proxy.ts`) rewrites each one to `…?__bm_release=<active release id>`, so a promotion changes the cache key within a minute. No project setting is needed for this: Vercel's CDN honours `CDN-Cache-Control` from functions. Verify it on the first preview deployment that carries the change, and after the first promotion:

1. `curl -sI https://<preview>/man/tar/1` twice: the second response shows `x-vercel-cache: HIT`, and the CSP's `script-src` has a `sha256-` source and no nonce.
2. `curl -sI -H 'Cookie: bm-distro=ubuntu' https://<preview>/man/tar/1` answers `307` to `/man/tar/1?distro=ubuntu` with `cache-control: private, no-store`, even right after step 1's HIT (the proxy runs before the CDN).
3. After a promotion, the next request misses (`x-vercel-cache: MISS`) and its footer names the new release. If it still hits the old entry, the CDN is keying on the original URL rather than the rewrite. Pages then refresh within the hour (`s-maxage`), and the rewrite key needs replacing with a cache tag and a purge on promotion.
4. **`_rsc` and the cache key.** Next strips its `_rsc` cache-busting parameter before the proxy runs, even without the `rsc` header, so the proxy cannot redirect it. The man renderers see it in `req.url` and answer a request that carries `_rsc` without the `rsc` header with `private, no-store`, so it should never fill the CDN. Check on a preview and after deploy (`HEAD` with `curl -sI`):

   ```bash
   B=https://<preview>
   curl -sI "$B/man/tar/1" >/dev/null; curl -sI "$B/man/tar/1" | grep -i 'x-vercel-cache'          # HIT
   curl -sI "$B/man/tar/1?_rsc=aaaaa" | grep -iE '^(cache-control|cdn-cache-control|x-vercel-cache)'  # private, no-store; no CDN-Cache-Control; MISS
   curl -sI "$B/man/tar/1?_rsc=aaaaa" | grep -i 'x-vercel-cache'                                     # MISS again: nothing was stored
   curl -sI "$B/man/tar/1?_rsc=bbbbb" | grep -i 'x-vercel-cache'                                     # MISS
   curl -sI "$B/man/tar/1.txt?_rsc=aaaaa" | grep -i '^cache-control'                                 # private, no-store
   ```

   If the second `_rsc=aaaaa` request answers `HIT`, or any `_rsc` request returns the page's public `CDN-Cache-Control`, the renderer no longer sees `_rsc`: treat it as a regression of the query allowlist below. If `?_rsc=aaaaa` answers `HIT` straight after the bare URL's `HIT`, Vercel collapses `_rsc` into the page's key, which is harmless, but record it here.

**Query allowlist (#408).** Every man URL that renders can fill the CDN and costs a render plus Convex calls, so the proxy lets only these query parameters through (`nextjs/lib/manQuery.ts`, `MAN_QUERY`):

| Parameter | Valid values | Read on |
|---|---|---|
| `distro` | a known distro, lower case (`debian` too: explicit Debian is its own URL) | pages, section pickers, `.txt` |
| `pkg` | 1–200 ASCII characters, initial alphanumeric then alphanumeric/`+_.-`, case preserved (`packageName`) | pages, section pickers, `.txt` |
| `portability` | `text` (the glyphs are the bare URL) | pages |
| `flag` | one options-index key (`shareFlag`): `-x`, `--extract` | pages |
| `lang` | B9's UI languages except English, which is the bare URL (`MAN_LANGUAGES`) | pages, section pickers, `.txt` |

Share images (`/man/<name>/<section>/og`) take `distro`, `pkg` and `flag` under the same rules: they are cached for a day. Concept explainers (`/concept/<slug>`, B8 #400) are cached per deployment and take only `distro`, under the same redirect and the same private fallback in their renderer.

A request with any other parameter (`utm_*`, `ref`, `_rsc` without a client fetch, a client-sent `__bm_release`), a repeated parameter, an invalid value or another spelling of a valid one (`pkg=g++` for `pkg=g%2B%2B`) gets a `308` to the URL it means, with `cache-control: private, no-store`. The redirect keeps the valid parameters in their order and is decided before the release lookup, so it costs no Convex call; browsers re-apply the fragment. The proxy adds `__bm_release` only to its own rewrite. Headers change nothing: a request with an `rsc` header is normalized like any other. Next has already dropped a client fetch's `_rsc` and decoded unreserved escapes (`%2D` is `-`) before the proxy runs, so real client navigations pass, and the release-keyed rewrite is built from the canonical query even when the original URL was spelled otherwise. As a second line, the renderers (`pages/man/**`, the plain-text and share-image routes) answer `private, no-store` to any query outside the allowlist that reaches them (`isManQuery`), and to a request that arrived with `_rsc` but no `rsc` header (`hasBareRsc`; see step 4 above).

What the allowlist cannot know, the renderer settles: a `flag` the page does not define in the serving release gets a private `307` to the URL without it, and any answer to a `pkg` or `flag` other than the page that has them is `private, no-store`: a miss, an alias, a section picker, and the name-only text redirect (`/tar.txt?pkg=…`), which resolves the name without the package. A share image for a package or flag the page lacks is a private 404. So the cacheable URLs per page are bounded: its real providers × one variant per real option × `portability` × the languages × the distros.

Adding a parameter means adding it to `MAN_QUERY` with a validator over a bounded set and to `manQueryParams` for the URLs that read it, then here. Verify on a preview: `curl -sI 'https://<preview>/man/tar/1?zz=1'` answers `308` to `/man/tar/1` with `private, no-store`; `curl -sI 'https://<preview>/man/tar/1?flag=-Q'` answers `307`; and `/man/tar/1?flag=%2Dc` after `/man/tar/1?flag=-c` shows `x-vercel-cache: HIT` (one entry for both spellings).

**Deploy order.** Man pages need the Convex functions that report the serving release (`reportRelease`). New Convex with old Next is safe. New Next with old Convex answers 500, because the old validator rejects the argument. `deploy.yml` always pushes Convex before Vercel and stops if the Convex deploy fails, so keep that order for any manual deploy too.
