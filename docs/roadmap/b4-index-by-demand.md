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
- `views` is the route's aggregate pageviews over the exporter's last 30 complete
  UTC days, or zero without a snapshot.
- `popularityScore = round(1000 × log10(1 + installed) + 2000 × log10(1 + views))`.
- `indexable` is true when the primary section is **1, 5, 7 or 8** (including
  suffixes such as 1p), **installed ≥10,000**, or **views ≥100**.

These are explicit initial thresholds, not fitted predictions of search quality.
The logarithms give generation a stable priority without letting large packages
or traffic counts dominate linearly. Membership uses the raw counts, avoiding
rounding at thresholds. All pages remain in browsing, search and direct reads.
No score is computed during a page view, and this change does not modify search ranking.

Only Debian has measured tier numbers. Ubuntu, Fedora, Arch, Alpine and FreeBSD
use exact package-name matches to Debian popcon as proxies, stripping only a
Debian multiarch suffix. No tier-size claim is made for those systems. macOS has
no package ownership and therefore gets sections 1/5/7/8 only with today's
popcon-only input; optional route traffic could later promote other sections. Package renames (e.g. `openssh-clients` vs `openssh-client`),
base-system pages without package ownership and `-devel`/`-dev` differences get
zero package prior; they still get the section rule and measured route demand.
This proxy is useful for common command packages, weak for libraries and other
systems' package splits, and is not a measure of their installed populations.
There is no fuzzy name matching or guessed mapping.

A8 deliberately removes distro/query parameters from analytics. Demand for
`/man/name/section` therefore applies to every distro edition of that route.
It cannot establish which edition was used. Encoded names and query variants
collapse to one route; search, API and short-name paths do not promote a page.

The release's storage-backed provenance manifest records policy version,
thresholds, popcon digest, traffic snapshot digest, generation timestamp and route
count. The source snapshot is an aggregate-only local file. It is not uploaded
as an array into Convex or read by Next.js.

## Storage, sitemap and representation contracts

Ingest contract **v7** retains v6's CAS request, fixed promotion-source read
and exact-version header fence, and adds `indexable` and `popularityScore` to canonical page
payloads and `indexablePageCount` to release declarations. Python's
`require_deployed_contract()` rejects v6, and older clients reject v7. The
cross-language alignment test and both mismatch directions remain covered.
The small internal legacy mutation interface remains for queued jobs/fixtures;
legacy releases have no computed tier and retain all-page indexing and sitemaps.

`manPages` stores the two scalar fields alongside the metadata already read by
HTML, JSON and text. `page.indexable` and `page.popularityScore` are plain data
for C4's server-HTML implementation to retain. The metadata query also exposes
`indexable`. Canonical HTML sets `robots: index|noindex, follow`; text GET/HEAD
sets `X-Robots-Tag` and an HTML canonical Link; OG follows the tier; JSON APIs
carry `noindex, follow` only for explicitly nonindexable page payloads. Legacy
JSON retains main's headers. Package-qualified alternate providers in scored
releases remain noindex and canonicalize to the unqualified route. Unscored
releases retain indexability for HTML, text, JSON and OG, including older cached
payloads without the new signal.

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
its existing 5 calls / 29 documents / 1 storage read budget.

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
1st. Each new release recomputes every page's score/tier before uploading. Pages
can promote at 100 views and demote below it if neither package nor section
qualifies; the active immutable release does not change between refreshes.
Full-Debian opt-in and its separate owner authorization remain required.

1. **Merge only after the November 1, 2026 05:00 UTC monthly run completes.**
   That run uses today's code and promotes unscored curated releases as usual.
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
   Missing tier data throws **`FULL_DEBIAN_TIER_REQUIRED`** (HTTP 409) even when
   `allowFullDebian` is true. Workflow, HTTP and CLI inputs cannot lift this gate.
   A failed multi-distro promotion rolls back the entire transaction. The v5
   full-Debian run started on 614714a6 may finish/activate staging, but can never
   reach prod; ingest a fresh scored release to replace it. There is no mutable
   backfill of a sealed release. A scored full-Debian release still requires
   owner authorization to lift `FULL_DEBIAN_PROMOTION_HELD`.
3. Optional: create a Plausible **Stats API read key** for the `betterman.sh`
   site/account with API access. Put it in the GitHub **production environment
   secret `PLAUSIBLE_API_KEY`** used by `update-docs.yml`. It belongs only to
   the export step, never Convex, Vercel runtime or a `NEXT_PUBLIC_*` variable.
   Use the narrowest site access supported by the account. No key exists today;
   absence is a successful popcon-only run. No owner configuration is performed
   by this change.
4. One dedicated `demand` job runs `pnpm analytics:counts` for the workflow,
   with at most three attempts (2 s then 4 s backoff). It exports only aggregate
   pageviews and uploads one `page-demand` artifact for all distro jobs. Each
   manifest records the digest of those same bytes. No key means no artifact
   and popcon-only scoring everywhere. Exhausted retries fail the shared job
   before any distro ingests, rather than mixing partial snapshots. A
   promote-only dispatch does not export analytics. The artifact is retained
   for 14 days; Linux receives a read-only file mount, hosts receive its path,
   and FreeBSD receives the checkout file. No API key enters ingestion.
5. For an authorized local/operator run, export with `PLAUSIBLE_API_KEY`,
   `PLAUSIBLE_SITE_ID=betterman.sh` and `PLAUSIBLE_COUNTS_OUTPUT=<absolute-path>`
   using `pnpm analytics:counts`, then set
   `BETTERMAN_PLAUSIBLE_COUNTS=<same-absolute-path>` for `pnpm ingest:run`.
   Omit the variable for popcon only. A supplied missing/malformed snapshot
   fails before release creation. Use a fresh export; manual paths are explicit
   snapshots, not live analytics connections. The exporter preserves an old
   file when a key is absent, so do not explicitly reuse that path by accident.
6. Before the lead promotes, inspect the release manifest's `indexPolicy`, the
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

Page and metadata caches are not keyed by release and can retain a prior robots
signal for **one hour**. OG responses have a one-day fresh cache plus seven-day
stale window, so their robots signal can lag by **about eight days**. Sitemap
and representation caches can refresh at different times after a release switch.
The lead accepts this lag; this PR does not add invalidation or change cache TTLs.

## Tier measurement and projection

The reproducible metadata-only command is:

```bash
pnpm ingest:popularity-report --indexes ../.cache/debian/b4-indexes --output ../.perf-results/b4-index-demand.json
```

It uses B1's catalog downloader and digest checks, downloads metadata only and
never reads/writes Convex or downloads package archives. With the checked-in
popcon pin and **no Plausible input**, this run measured:

| Corpus | Indexable | Total | Interpretation |
| --- | ---: | ---: | --- |
| Curated Debian explicit-package Contents fixture | 4,003 | 4,003 | All qualify; includes aliases, excludes dependency packages |
| Full Debian English Contents routes | 57,688 | 142,608 | 40.45% of normalized routes, aliases included |
| Projected 115,000 canonical-page release | about 46,520 | 115,000 | Route-fraction projection, not a canonical-page measurement |

The curated fixture uses `FULL_PACKAGE_SET_DEBIAN`'s explicit binary names.
It is not the live ~4,700-page release: dependencies and extracted aliases differ.
The full estimate elects the most-installed package for collisions. B1's actual
election, alias concentration and parse rejections can change the canonical
ratio, so inspect the actual scored declaration before promotion. This is not an
SEO quality guarantee or a cloud billing benchmark. Traffic promotion is tested
with synthetic aggregates; no real Stats API secret or live Stats query was used.
A separate 115,000-page synthetic test yields 38,334 tier members with dense
10,000/10,000/10,000/8,334 leaf assignments and 76,666 zero assignments.

## Delivery state

The lead's rollout correction preserves legacy indexability and moves the hard
safety gate to full-Debian promotion. Revision checks and the final head are
recorded in the PR. Validation passed: 3,263 Convex tests and typecheck;
880 ingestion tests; 582 Next unit tests, lint, grammar
and build; 138 E2E tests (scored and legacy serving); 123 ops tests; performance
budgets with 5 calls / 29 documents / 1 storage read. The local backend used
isolated ports 3416/3417. No budgets, runner configuration or shared
infrastructure were changed.

### Merge dependencies

Rebased onto main 54b95eb7, including [#443](https://github.com/amanthanvi/BetterMan/pull/443)
and #444's hydration signal. Contract **v7** carries both the complete B4 upload
payload and #443's fixed-staging promotion-source read, `expectedDatasetReleaseId`
CAS map, `expected_release_ids` dispatch behavior and exact-version promotion
header fence. Version 6 promotion requests are rejected before pointer writes.
The B4 tier-required workflow skip applies only after source verification and
pinned-ID comparison reach the actual promote request: a mismatched operator
pin stays `STAGING_RELEASE_CONFLICT`, with no request/skip output. Matching pins
may get the clean replacement-required skip; the server refuses every pointer
write, including owner-authorized ones.

#442's generated-layer and `refresh_page` changes are retained. The open man-page
stack #449–#451 moves the renderer to Pages Router; whichever stack lands second
must retain the other's changes. Its renderer uses `indexable === false` for
noindex, matching B4's payload. Do not wait for that stack or merge this PR as
part of this task. The post-November-1-run merge gate remains in force.

Implementation and tests cover scoring, raw-count thresholds, section suffixes,
exact package proxies, traffic promotion, generated selection, sitemap filtering,
HTML robots and alternate headers. Required checks and final head/PR evidence
are reported in the PR; independent review, CI completion and merge belong to
the lead. Production configuration/data were not changed and no workflows were
dispatched.
