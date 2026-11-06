# B4: index what people use

Implementation of [#396](https://github.com/amanthanvi/BetterMan/issues/396).
Legacy releases keep main's indexable serving behavior. Full-Debian production
promotion requires a stored tier; no request-time popularity lookup is added.
No shared deployment, data, secret, repository variable or workflow was changed
while implementing this PR. Independent review and deployment remain with the lead.

## One ingest-time policy

`ingestion/ingestion/popularity.py` owns policy version 1. For each canonical page:

- `installed` is the binary package's installed count from the **checksum-verified,
  pinned popcon by_inst** snapshot in `ingestion/data/debian-trixie.json`.
- `popularityScore = round(1000 × log10(1 + installed))`.
- `indexable` is true when the primary section is **1, 5, 7 or 8** (including
  suffixes such as 1p) or **installed ≥10,000**.

These are explicit initial thresholds, not fitted predictions of search quality.
The logarithm gives generation a stable priority without letting large packages
dominate linearly. Membership uses the raw counts, avoiding
rounding at thresholds. All pages remain in browsing, search and direct reads.
No score is computed during a page view, and this change does not modify search ranking.

Only Debian has measured tier numbers. Ubuntu, Fedora, Arch, Alpine and FreeBSD
use exact package-name matches to Debian popcon as proxies, stripping only a
Debian multiarch suffix. No tier-size claim is made for those systems. macOS has
no package ownership and therefore gets sections 1/5/7/8 only with today's
popcon-only input. Package renames (e.g. `openssh-clients` vs `openssh-client`),
base-system pages without package ownership and `-devel`/`-dev` differences get
zero package prior; they still get the section rule.
This proxy is useful for common command packages, weak for libraries and other
systems' package splits, and is not a measure of their installed populations.
There is no fuzzy name matching or guessed mapping.

Page analytics are not an input. The owner dropped the planned Plausible
pageview signal on 2026-10-30, before rollout, and site analytics moved to Vercel
Web Analytics ([analytics.md](../analytics.md)). Popcon and sections drive the tier.

The release's storage-backed provenance manifest records the policy version,
the installation threshold and the popcon digest.

## Storage, sitemap and representation contracts

Ingest contract **v7** retains v6's CAS request, fixed promotion-source read
and exact-version header fence, and adds `indexable` and `popularityScore` to canonical page
payloads and `indexablePageCount` to release declarations. Python's
`require_deployed_contract()` rejects v6, and older clients reject v7. The
cross-language alignment test and both mismatch directions remain covered.
The small internal legacy mutation interface remains for queued jobs/fixtures;
legacy releases have no computed tier and retain all-page indexing and sitemaps.

`manPages` stores the two scalar fields alongside the metadata already read by
HTML, JSON and text. The page serializer combines the demand tier with B10's
provider identity: a canonical page qualifies when the release is unscored or
its stored tier flag is true; a provider-only row never qualifies, including
identical-content alternates. The internal provider marker is not public data.
The response carries one `page.indexable` flag and `page.popularityScore`.
The metadata query exposes the same decision; all formats use `isIndexable`.

HTML emits meta robots and `X-Robots-Tag: noindex` for a nonindexable page.
Text GET/HEAD, JSON (including metadata) and OG emit `X-Robots-Tag: noindex`
from the same selected row. Indexable and legacy canonical pages retain main's
headers. Noindex pages omit HTML canonical links and text canonical Link headers,
so no canonical declaration targets a noindex page. Indexable pages and share
image URLs retain B10's `manCanonicalPath` selection rules. The page-data cache
moves to **v7**, discarding both old B4 and B10 response shapes.

The section picker uses an aggregate flag computed from the same name-resolution
page read: it is noindex only when the release is scored and none of the listed
sections are indexable. It also omits its canonical when noindex. No extra reads
are needed. Unscored canonical pages retain indexability, including cached
payloads without a signal; B10's provider exclusion applies to unscored releases
as well.

Ingestion assigns dense positive `sitemapPage` numbers to the tier, at most
10,000 URLs/file, and **zero** to the long tail. The existing
`by_releaseId_and_sitemapPage_and_name` index isolates each file; the Convex
query paginates at **5,000 rows** per call, below the 8,192-element value limit.
The Next.js layer assembles those bounded chunks into XML outside Convex.
For scored releases, sitemap indexes use `indexablePageCount`; a scored zero
count produces no leaf sitemap, and its distro sitemap index returns 404.
For unscored releases they use the original
`pageCount` and existing sitemap assignments, with no page filtering, exactly
as on main. A defensive post-pagination check in scored releases rejects
missing/long-tail signals without losing the continuation cursor. Updated cache
keys and ETag namespaces prevent stale indexing decisions from being reused.

Sixteen existing upload-counter shards count newly inserted canonical tier
members. Replays do not increment them; seal requires the declared tier count
alongside existing page/section/provider/package/license completeness checks.
No per-page arrays live on the release. **No new tables or indexes** were added;
`confirm_large_indexes` and release-child registration are unnecessary. Existing
prune/orphan registry coverage still applies. The man-page path adds **zero
calls, document reads or storage reads**; performance validation must retain
the Pages Router path's existing 4 calls / 26 documents / 1 storage read budget.

Generated contract **v3** adds nullable section selection and persisted demand
signals. By default generation paginates all sections. Scored releases select
only the stored tier, ordered by descending demand score. Unscored releases
return `indexable: null`; by default the selector admits only main's exact
sections **1, 8, 5 and 7**, not suffixes or popular-package library pages. Their stored
scores remain zero. This keeps #442's `refresh_page` within its original scope
without spending Go budget on a new long tail. Cached-source candidates without
a tier use the same legacy rule. `--priority` only reorders eligible pages;
`--sections` retains main's explicit legacy section override; it never overrides
a scored page's stored false membership.

## Monthly re-evaluation and owner runbook

The existing dataset workflow retains exactly **`0 5 1 * *`**, 05:00 UTC on the
1st. Each new release recomputes every page's score/tier from the pinned popcon
snapshot before uploading; the active immutable release does not change between
refreshes.
Full-Debian opt-in and its separate owner authorization remain required.

1. **Originally gated on the November 1, 2026 05:00 UTC monthly run.** On
   2026-10-31 the owner asked to run the rollout early, so B4 merges first and
   that cron runs on v7 code like any later refresh.
   #443 is integrated in contract v7; its CAS pins and header fence remain intact.
   Once B4 is deployed, the lead runs an **all-distro staging-only ingest**
   (`ingest=true`, `promote=false`, not a sample), inspects each distro's declared
   `indexablePageCount`, then dispatches promotion with `ingest=false`,
   `promote=true` and an `expected_release_ids` JSON map containing all seven
   inspected staging IDs. These are the #443 CAS pins; do not leave an unlisted
   distro to capture an uninspected source at job time. Full Debian retains its
   separate ingestion/owner-promotion opt-ins. Do not run or dispatch this
   sequence as part of this implementation task.
   Existing unscored prod editions remain indexable throughout deployment;
   measured Debian counts do not establish the other distros' tier sizes.
2. **Full-Debian releases require a scored replacement before prod promotion.**
   Both direct activation and stage promotion check persisted
   `acquisition: "deb-extraction"` and `indexablePageCount` inside the mutation
   that inserts/replaces the prod pointer, next to the existing owner hold.
   Missing tier data blocks the pointer even when `allowFullDebian` is true.
   Direct activation throws **`FULL_DEBIAN_TIER_REQUIRED`** (HTTP 409); stage
   promotion returns that reason in its per-distro `skipped` array (HTTP 200),
   so other eligible distros still promote. Workflow, HTTP and CLI inputs cannot
   lift the gate. A CAS mismatch still rolls back the entire transaction. The v5
   full-Debian run started on 614714a6 may finish/activate staging, but can never
   reach prod; ingest a fresh scored release to replace it. There is no mutable
   backfill of a sealed release. A scored full-Debian release still requires
   owner authorization to lift `FULL_DEBIAN_PROMOTION_HELD`.
3. Before the lead promotes, inspect the release manifest's `indexPolicy`, the
   declared tier count, the sitemap's count/URLs, an indexed HTML page and a
   long-tail HTML/text/JSON/OG page. Review tier growth and staging costs.
   Re-evaluation does not authorize a spend increase or a full-Debian promotion.
   To change the popcon prior, use the existing reviewed pinning process and
   commit the new checksum; the monthly job never trusts an unpinned download.

### Inspect staging tier counts without a deploy key

There is **no existing programmatic read-only path exposing a staging release's
stored `indexablePageCount` without a deploy key**. Public SEO queries expose
only prod; #443's authenticated `/ingest/promotion-source` verifies the fixed
staging source but returns only its distro and release ID. Generated candidates
are not the declared release count. Do not use those as a substitute.

Take each staging ID from its `dataset-result-<distro>` artifact
(`releaseId`), then find the `datasetReleases` row with that `datasetReleaseId`
in the Convex dashboard and read `indexablePageCount` using normal account/data
access, or use
existing privileged read access. The ingestion request declares the count, but
it is not currently emitted as a retained workflow result artifact. If the lead
has no way to inspect the stored declarations, that inspection step remains
unavailable; this PR does not add a new endpoint or grant credentials.

### Accepted robots cache lag

After #449, man HTML and its page-data cache are keyed by release. Every lookup
outcome reports the release that answered; a mismatch stays **private, no-store**.
The proxy refreshes the serving release within its **60-second** TTL. The tier
travels on the existing page payload, so these checks require no additional reads.
Only `indexable === false` emits `<meta name="robots" content="noindex">`;
unscored canonical pages emit no robots meta and existing man 404s remain noindex.

The text route retains #462's trusted proxy release, authenticated unknown-release
marker/null key, and private/no-store mismatches. Its promotion/rollback regression
is run separately on the dedicated local backend. Metadata and JSON caches can
retain a prior robots signal for **one hour**. OG responses have a one-day fresh
cache plus seven-day stale window, so their robots signal can lag by **about eight days**. Sitemap
and representation caches can refresh at different times after a release switch.
The lead accepts this lag; this PR does not add invalidation or change cache TTLs.

## Tier measurement and projection

The reproducible metadata-only command is:

```bash
pnpm ingest:popularity-report --indexes ../.cache/debian/b4-indexes --output ../.perf-results/b4-index-demand.json
```

It uses B1's catalog downloader and digest checks, downloads metadata only and
never reads/writes Convex or downloads package archives. With the checked-in
popcon pin, this run measured:

| Corpus | Indexable | Total | Interpretation |
| --- | ---: | ---: | --- |
| Curated Debian explicit-package Contents fixture | 4,003 | 4,003 | All qualify; includes aliases, excludes dependency packages |
| Full Debian English Contents routes | 57,935 | 142,930 | 40.53% of normalized routes, aliases included |
| Projected 115,000 canonical-page release | about 46,614 | 115,000 | Route-fraction projection, not a canonical-page measurement |

The curated fixture uses `FULL_PACKAGE_SET_DEBIAN`'s explicit binary names.
It is not the live ~4,700-page release: dependencies and extracted aliases differ.
The full estimate elects the most-installed package for collisions. B1's actual
election, alias concentration and parse rejections can change the canonical
ratio, so inspect the actual scored declaration before promotion. This is not an
SEO quality guarantee or a cloud billing benchmark.
A separate 115,000-page synthetic test yields 38,334 tier members with dense
10,000/10,000/10,000/8,334 leaf assignments and 76,666 zero assignments.

## Delivery state

The lead's rollout correction preserves legacy indexability and moves the hard
safety gate to full-Debian promotion. Revision checks and the final head are
recorded in the PR. On main d7bca515, validation passed: 3,277 Convex tests
and typecheck; 945 ingestion tests and lint; 689 Next unit tests, lint, grammar
and production build; 172 browser tests plus the separately executed text
promotion/rollback test; 126 ops tests; and an isolated Python 3.14 pip dry-run.
The text race is skipped only in the ordinary suite because it changes local
release pointers, then run by itself with the dedicated local backend.
Convex codegen is regenerated and checked against the committed generated files.
Performance passed at 4 calls / 26 documents / 1 storage read for both the
original manual and provider default, and 4 / 11 / 1 for the alternate. No budgets,
runner configuration or shared infrastructure are changed. The local backend
uses isolated ports 3416/3417.

### Merge dependencies

Rebased onto main d7bca515, including [#443](https://github.com/amanthanvi/BetterMan/pull/443),
#444's hydration signal, #449's plain server HTML man renderer and #450's
In brief/options changes, plus #451's composer/previews/tables. Contract **v7**
carries both the complete B4 upload
payload and #443's fixed-staging promotion-source read, `expectedDatasetReleaseId`
CAS map, `expected_release_ids` dispatch behavior and exact-version promotion
header fence. Version 6 promotion requests are rejected before pointer writes.
The B4 tier-required workflow skip applies only after source verification and
pinned-ID comparison reach the actual promote request: a mismatched operator
pin stays `STAGING_RELEASE_CONFLICT`, with no request/skip output. Matching pins
may get the clean replacement-required skip; the server never writes the
unscored full-Debian pointer, including with owner authorization. Both tier and
owner gates apply only to Debian with persisted `deb-extraction` acquisition.
Batch promotion skips that distro and can promote eligible siblings, while a
CAS mismatch still rolls back all writes. The workflow validates the skipped
distro and release ID before reporting success; the older 409 response remains
supported during deployment skew.

#442's generated-layer and `refresh_page` changes are retained. B4 uses #449's
Pages Router `ManHeadTags`/`isIndexable` hook and preserves its release-key checks
for pages, aliases, misses and name resolution. No deleted App Router man page
is restored. #450 and #451 are retained with their fixtures; robots and cache
isolation remain intact. The B1 ingestion/packaging fixes, Next.js 16.4.3,
#457 generated-code guard, #462 text isolation and #463 provider switch are retained.
The owner lifted the post-November-1-run merge gate on 2026-10-31.

Implementation and tests cover scoring, raw-count thresholds, section suffixes,
exact package proxies, generated selection, sitemap filtering,
HTML robots and alternate headers. Required checks and final head/PR evidence
are reported in the PR; independent review, CI completion and merge belong to
the lead. Production configuration/data were not changed and no workflows were
dispatched.
