# BetterMan 2 launch checklist

Draft for [#410](https://github.com/amanthanvi/BetterMan/issues/410) (BM2 D1). Nothing here has been run, posted or published. The owner executes it.

The launch is one coordinated day after full Debian (about 115,000 manuals) is live in production. It waits on the owner's sign-off after the Nov 1 staging measurement ([b1-debian-evidence.md](../roadmap/b1-debian-evidence.md), [multi-distro-ops.md](../runbooks/multi-distro-ops.md#debian-archive-imports-explicit-approval-switches)). Until then the drafts in this folder stay drafts.

Steps marked **OWNER** need the owner's account, secret or authority. An agent must not do them.

## Placeholders

Fill these once, then search the four drafts for `{{`. No draft should contain one when posted.

| Placeholder | Meaning | Source |
| --- | --- | --- |
| `{{DEBIAN_PAGES}}` | Manual pages in the live Debian release (the plan says about 115,000) | `pageCount` from `/api/v1/info` after promotion |
| `{{DEBIAN_PACKAGES}}` | Debian packages those pages come from | The inspected release's evidence (see step 3) |
| `{{DEBIAN_RELEASE}}` | Debian release name (the roadmap says trixie) | The release record |
| `{{UBUNTU_PAGES}}`, `{{FEDORA_PAGES}}`, `{{ARCH_PAGES}}`, `{{ALPINE_PAGES}}`, `{{FREEBSD_PAGES}}`, `{{MACOS_PAGES}}` | Per-distro page counts | `pageCount` from `/api/v1/info?distro=…` |
| `{{OTHER_LINUX_COVERAGE}}` | One sentence on how deep Ubuntu, Fedora, Arch and Alpine go at launch (see the warning below) | Step 2 |
| `{{GENERATION_MODEL}}` | Model that wrote the generated text, as shown on the pages | A page's generated mark |
| `{{INDEXING_POLICY}}` | What search engines may index at launch (see step 6) | Step 6 |
| `{{LAUNCH_DATE}}` | Launch day (UTC) | Owner |
| `{{CHANGELOG_URL}}` | Where the on-site post lives, if built | Follow-up in `changelog-post.md` |
| `{{HN_URL}}` | The posted Show HN | Owner, after posting |

**Warning on Ubuntu, Fedora, Arch and Alpine.** The roadmap makes them full too, but that is [B2 (#394)](https://github.com/amanthanvi/BetterMan/issues/394), still open on 2026-10-30. Today they are curated sets. Write `{{OTHER_LINUX_COVERAGE}}` from what production reports at launch, never from the plan.

## 0. Gate: confirm the launch conditions

- [ ] [#410](https://github.com/amanthanvi/BetterMan/issues/410) names B1, C3–C5 and the core of B5–B7 as prerequisites. Check each is closed or consciously deferred: `gh issue list --state all --search 'BM2 in:title' --json number,title,state`.
- [ ] **OWNER:** sign-off on the full-Debian staging measurement (storage, reads, license coverage, cost). Convex spend changes need owner sign-off per [betterman-2.md](../roadmap/betterman-2.md).

## 1. Performance budgets green

- [ ] CI on `main` is green, including the `performance_budgets` job in `.github/workflows/ci.yml`: `gh run list --workflow ci.yml --branch main --limit 3`.
- [ ] Run the same check locally from a clean `main`: `pnpm install --frozen-lockfile && pnpm ops:test && pnpm perf:check`. It builds production Next and overwrites `nextjs/.next`; see [performance-budgets.md](../performance-budgets.md).
- [ ] Optional, for the paint regression loop: `pnpm perf:check --stress`.
- [ ] Download the `performance-budgets` artifact (`.perf-results/measurements.json`) from the last green `main` run and keep it as the launch baseline: `gh run download <RUN_ID> -n performance-budgets`.
- [ ] No budget was raised to get here: `git log -p --follow -- perf-budgets.json` since the last release. The `diff_guards` job (`scripts/check-perf-budget-changes.mjs`) requires an explanation for any change.
- [ ] Other required gates are green: `pnpm next:lint`, `pnpm next:grammar`, `pnpm next:test`, `pnpm convex:test`, `pnpm ingest:test`.

Budgets use fixture data, not 115,000 pages. They do not prove that the full corpus is cheap to read. The staging measurement and step 6 cover that.

## 2. Staging and production parity, per distro

Goal: know which release each distro serves in production, which one waits in staging, and that nothing is half-promoted. Public Convex functions cannot read `staging` (CI checks this), so staging IDs come from authenticated tools only.

- [ ] **Production, public.** Record each distro's active release and page count. Use `vercel curl` if an anonymous request gets `429` with `x-vercel-mitigated: challenge` ([vercel-ops.md](../runbooks/vercel-ops.md#verification)):

  ```bash
  for d in debian ubuntu fedora arch alpine freebsd macos; do
    curl -fsS "https://betterman.sh/api/v1/info?distro=$d"; echo
  done
  ```

  `datasetReleaseId: "uninitialized"` means the distro has no active release ([multi-distro-ops.md](../runbooks/multi-distro-ops.md#ubuntufedora-uninitialized-in-prod)).
- [ ] **Production, read-only golden check.** With the production Convex URL in `CONVEX_URL`:

  ```bash
  CONVEX_URL=<production-url> \
  BETTERMAN_CHECK_DISTROS=debian,ubuntu,fedora,arch,alpine,freebsd,macos \
  BETTERMAN_MIN_PAGE_COUNT=1 \
  pnpm convex:prod-check
  ```

  Each distro must pass the golden search, page, name and metadata checks in `scripts/check-convex-production.mjs`. After promotion, pin the release with `BETTERMAN_EXPECTED_RELEASE_IDS='{"debian":"<id>", …}'` (every checked distro needs an ID) and raise `BETTERMAN_MIN_PAGE_COUNT` to just under the expected page count, so a curated release cannot pass for a full one. `BETTERMAN_CHECK_JSON=1` prints JSON.
- [ ] **Production status without a local deploy key (read-only).** `gh workflow run ops-status && gh run list --workflow ops-status.yml --limit 1`. It runs `pnpm convex:derived-check --prod` and `pnpm convex:task-check --prod` against production ([ops-status.yml](../../.github/workflows/ops-status.yml)). Both must report `complete` before launch: derived data (portability, backlinks, families) and task-phrase search feed the pages the post talks about.
- [ ] **Staging and production pointers, both stages.** With `CONVEX_DEPLOY_KEY` set for the production deployment: `pnpm convex:related-check`. It prints one JSON status line with `stage`, `distro` and `datasetReleaseId` for all 14 pointers and fails if any is unsealed, unverified or still hydrating. This is the only repo tool that shows staging IDs outside a workflow run; the others are the `Dataset summary` job of `update-dataset` and its 14-day per-distro result artifacts.
- [ ] **Fill a table** (keep it in the issue, not in the repo):

  | Distro | Prod release ID | Staging release ID | Pages | Same? |
  | --- | --- | --- | --- | --- |
  | debian | | | | |
  | ubuntu | | | | |
  | fedora | | | | |
  | arch | | | | |
  | alpine | | | | |
  | freebsd | | | | |
  | macos | | | | |

  Expected: every distro except Debian has the same ID in both stages. Debian differs until step 3, and its staging release shows the full page count.
- [ ] Sitemaps answer for every distro: `curl -fsS https://betterman.sh/sitemap.xml | head` and `curl -fsS https://betterman.sh/sitemap-<distro>.xml | head`.
- [ ] No ingest or prune is running: `gh run list --workflow update-docs.yml --limit 5` and `gh run list --workflow prune-releases.yml --limit 3`. Never deploy Convex during a dataset run.

## 3. Promote full Debian

Source: [multi-distro-ops.md](../runbooks/multi-distro-ops.md#debian-archive-imports-explicit-approval-switches). The first full release stays in staging until the owner authorizes a separate promotion-only dispatch. Leave `BETTERMAN_DEBIAN_FULL_PROMOTE` unset.

- [ ] **Save the rollback target first.** The current Debian prod ID from step 2 (the curated release) goes in the issue. Without it step 8 cannot run. The workflow also records it in its summary, but save your own copy.
- [ ] Do not prune before launch. If a prune is unavoidable, preview first (`gh workflow run prune-releases`, no `apply`) and use `-f apply=true -f keep_per_distro=2` so the curated Debian release survives as a rollback target ([multi-distro-ops.md](../runbooks/multi-distro-ops.md#prune-superseded-releases-github-actions)).
- [ ] **Inspect the staging release** against the run's evidence: page count, packages, storage, reads, license coverage and cost, in the format of [b1-debian-evidence.md](../roadmap/b1-debian-evidence.md). Record the exact staging ID. Fill `{{DEBIAN_PAGES}}`, `{{DEBIAN_PACKAGES}}` and `{{DEBIAN_RELEASE}}` from it.
- [ ] **nc policy.** Full Debian switches `nc(1)` from netcat-openbsd to netcat-traditional. The OpenBSD manual must stay reachable at `/man/nc_openbsd/1` and `/man/nc/1?pkg=netcat-openbsd`. The runbook asks for this check before approval; see [b1-debian-nc-owner.md](../roadmap/b1-debian-nc-owner.md). Since staging is not publicly readable, verify the audit evidence before promotion and the two URLs on prod immediately after.
- [ ] **Inspect all seven staging pointers.** Promote-only dispatches attempt every distro and ignore selectors ([multi-distro-ops.md](../runbooks/multi-distro-ops.md)). Use the `convex:related-check` output from step 2.
- [ ] **OWNER:** authorize the promotion. Then dispatch with the release you inspected:

  ```bash
  gh workflow run update-dataset -f ingest=false -f promote=true -f debian_full_promote=true \
    -f 'expected_release_ids={"debian":"{{STAGING_DEBIAN_RELEASE_ID}}"}'
  ```

  `{{STAGING_DEBIAN_RELEASE_ID}}` is the ID you recorded. Supply the other six IDs too if you want the whole dispatch pinned.
- [ ] Watch it: `gh run list --workflow update-docs.yml --limit 5`, then `gh run watch <RUN_ID>`. A `409 STAGING_RELEASE_CONFLICT` means staging changed; stop, verify, and start a new dispatch. Do not retry blindly.
- [ ] Confirm the new prod ID equals the pinned one: `curl -fsS https://betterman.sh/api/v1/info`. Re-run `pnpm convex:prod-check` with `BETTERMAN_EXPECTED_RELEASE_IDS` and `pnpm convex:related-check`.
- [ ] Spot-check (pages, short URLs, plain text, search, explain):
  - `/man/tar/1`, `/man/jq/1`, `/man/tmux/1` (these three 404ed before full Debian), `/man/nc_openbsd/1`, `/man/nc/1?pkg=netcat-openbsd`
  - `/tar`, `/tar.1`, `/tar/-x`, `/tar.txt`, `/man/tar/1.txt`
  - `/explain?cmd=tar%20-xzvf%20a.tgz`, `/search?q=extract%20a%20tarball`, `/pkg/…` for a package page
- [ ] Only after the owner is satisfied: decide whether to set `BETTERMAN_DEBIAN_FULL_PROMOTE=1` for recurring monthly promotions. Setting it is a separate **OWNER** decision and is not part of launch.

## 4. Vercel cache-key check

Source: [vercel-ops.md](../runbooks/vercel-ops.md#man-page-edge-caching-c4-406). Man pages send `CDN-Cache-Control` and the proxy rewrites each to `?__bm_release=<active release id>`, so a promotion changes the cache key.

- [ ] Hit: `curl -sI https://betterman.sh/man/tar/1` twice. The second response shows `x-vercel-cache: HIT`, and `content-security-policy` has a `sha256-` source in `script-src` and no nonce.
- [ ] Distro cookie: `curl -sI -H 'Cookie: bm-distro=ubuntu' https://betterman.sh/man/tar/1` answers `307` to `/man/tar/1?distro=ubuntu` with `cache-control: private, no-store`, even right after the HIT.
- [ ] **Across the Debian promotion (step 3).** Request a page before and after it. The first request after promotion must be `x-vercel-cache: MISS`, and its footer must name the new release. If it HITs the old entry, the CDN is keying on the original URL: roll back (step 8) and open an issue. The runbook's fallback is a cache tag plus a purge on promotion.
- [ ] If the anonymous request is challenged (`429`, `x-vercel-mitigated: challenge`), use `vercel curl /man/tar/1` as the runbook describes. Do not weaken the challenge.

## 5. Owner-only setup

- [x] **Vercel Firewall bypass rules for non-browser access (#388).** Applied 2026-10-30 through the Vercel API with the owner's approval, after the `Cost guard: API rate limit` rule so `/api/v1/suggest` keeps it. Four custom **Bypass** rules, each also **Method is any of GET, HEAD**, placed after abusive-IP blocks and before challenge rules ([abuse-scraping.md](../runbooks/abuse-scraping.md#non-browser-reads-and-vercel-challenges-388)):

  | Rule | Request Path |
  | --- | --- |
  | Root text, including robots.txt | Matches expression `^/[^/]+\.txt$` |
  | Canonical text manuals | Matches expression `^/man/[^/]+/[^/]+\.txt$` |
  | OpenSearch descriptor | Equals `/opensearch.xml` |
  | OpenSearch suggestions | Equals `/api/v1/suggest` |

  First identify the challenge source in Firewall events. Add no broad `/man/` HTML bypass. Then verify anonymously, with no challenge cookie: `/tar.txt`, `/tar.1.txt`, `/man/tar/1.txt`, `/opensearch.xml`, `/api/v1/suggest?q=ta&format=opensearch`. Add BetterMan as a search engine in real Chrome and Firefox and type `ta`. The post and Show HN claim `curl betterman.sh/tar.txt` works, so this must pass before posting. The challenge came from the managed **Bot Protection** ruleset (action: challenge). Before the rules, an anonymous `curl -I https://betterman.sh/tar.txt` returned `429` with `x-vercel-mitigated: challenge`. After them, anonymous GET/HEAD on all five URLs answer with no challenge: `/tar.txt` 308 to `/man/tar/1.txt`, the rest 200 with `nosniff`, and a missing page gives 404. HTML (`/man/tar/1`), sitemaps and POST stay challenged. Still to do on launch day: add BetterMan as a search engine in real Chrome and Firefox and type `ta`.
- [ ] **OWNER, optional: Plausible Stats API key for B4 traffic demand.** `pnpm analytics:counts` exports 30 days of aggregate pageviews and is a no-op without `PLAUSIBLE_API_KEY` ([analytics.md](../analytics.md#buildops-page-count-export-for-b4)). Create the key in Plausible, set it only in an operator environment (never `NEXT_PUBLIC_`), and run it after the first few days of launch traffic. Wiring it into the pipeline belongs to [#396 (B4)](https://github.com/amanthanvi/BetterMan/issues/396).
- [ ] **OWNER:** confirm `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and `NEXT_PUBLIC_SENTRY_DSN` are set in the production Vercel environment, and that the Plausible custom-event goals (`palette opened`, `pref changed`, `explain used`) exist ([analytics.md](../analytics.md#custom-events)).
- [ ] **OWNER:** confirm the Convex plan and spend limit cover the full-Debian storage and read numbers from step 3.
- [ ] **OWNER: posting.** Show HN, the submissions and any on-site post. Drafts are in this folder. Agents do not post, submit, email or create accounts.

## 6. Pre-launch claim check

The drafts make factual claims. Re-verify each on production on launch day, and delete or soften any that fails.

- [ ] Page counts and the distro list match `/api/v1/info` for each distro.
- [ ] `curl -fsSL https://betterman.sh/tar.txt | head` returns plain text.
- [ ] A man page shows its "In brief" block, and every generated item carries its "generated" mark with model and date. tldr-pages examples are labelled and linked, and `/licenses` credits tldr-pages.
- [ ] Portability markers appear on a flag that differs between distros (for example in `/explain?cmd=…`).
- [ ] Page weight and cost claims match a fresh `pnpm perf:check`, not an old number.
- [ ] No claim about languages, concept explainers or a CLI. None of these ship yet (B3 #395, B8 #400; roadmap: no CLI). Share cards, per-flag cards and the print stylesheet ship with C6 (#408).
- [ ] **Indexing.** The roadmap's index-by-demand policy (long tail `noindex`) is B4 ([#396](https://github.com/amanthanvi/BetterMan/issues/396)), open when this was drafted. Until a release carries the `indexable` flag, `nextjs/lib/manRobots.ts` indexes every page, so about 115,000 pages would be indexable. Check a long-tail page's `robots` meta and `/sitemap-debian.xml` on production, then decide: **OWNER**, ship B4 first, or launch with the open policy and accept the thin-page risk in [betterman-2.md](../roadmap/betterman-2.md). Write `{{INDEXING_POLICY}}` in `show-hn.md` to match.
- [ ] The cold-cache path survives launch traffic: request a page with a name not requested before and confirm it renders.

## 7. Rollback plan

Decide thresholds before posting. Suggested triggers: widespread 404 or 500 on pages that worked before launch, a promotion that served the wrong release, a runaway Convex bill, or abuse the rate limits do not contain.

**Frontend.** The Convex deploy is backward compatible with the previous frontend by policy ([vercel-ops.md](../runbooks/vercel-ops.md#automatic-deployment)), so a frontend rollback is safe.

- [ ] Record the current production deployment before launch: `vercel inspect betterman.sh --json --token="$VERCEL_TOKEN"` (**OWNER** token), and the `main` head SHA.
- [ ] Roll back with the reproducible path: `gh workflow run deploy-vercel -f sha=<known-good-40-char-sha>`. The SHA must be reachable from `main` and compatible with the current Convex API. A newer successful `main` deploy takes precedence over a pending rollback.
- [ ] Urgent platform-level alternative: `vercel rollback <known-good-deployment-url-or-id>`.

**Convex functions.** Running `deploy-vercel` for an older SHA does not roll Convex functions backward. The repo documents no Convex-functions rollback. The plan is therefore to fix forward on `main` (the automatic deploy pushes Convex before Vercel). This is a gap; the owner should decide whether that is acceptable for launch.

**Data.** Source: [bad-ingestion-release.md](../runbooks/bad-ingestion-release.md).

- [ ] Rolling Debian back from full to the old curated release (or any curated distro): activate the saved previous prod ID directly on `prod` with the runbook's `ConvexIngestClient.activate_release` snippet ("Manual rollback command"). Run once per distro with its own saved ID, with no workflow refresh or prune running, and wait for `pending: false`.
- [ ] Rolling back to an earlier **full** Debian release (for example after a bad second full release): `/ingest/activate` refuses a full-Debian release on prod with `409 FULL_DEBIAN_PROMOTION_HELD`. Activate the saved ID on staging, wait for `pending: false`, inspect all seven staging pointers, then, with the **OWNER's** authorization:

  ```bash
  pnpm ingest:activate --release-id '<previous-full-debian-prod-id>' --stage staging
  gh workflow run update-dataset -f ingest=false -f promote=true -f debian_full_promote=true \
    -f 'expected_release_ids={"debian":"<previous-full-debian-prod-id>"}'
  ```

- [ ] After either path: `curl -fsS https://betterman.sh/api/v1/info`, then `pnpm convex:prod-check` with `BETTERMAN_EXPECTED_RELEASE_IDS`, then the spot-check list in step 3.
- [ ] Rollback targets must still exist. Do not run `prune-releases -f apply=true` until after the rollback window ends.
- [ ] If hydration stalls with `RELATED_METADATA_BACKFILL_FAILED`, follow the re-arm commands in [multi-distro-ops.md](../runbooks/multi-distro-ops.md#deploy-and-activation-recovery).

## 8. First 48 hours

Open these dashboards before posting and keep them open. Suggested checks, hourly for the first 6 hours, then every 4–6 hours.

- [ ] **Sentry** (**OWNER** account). Filter to `environment:production`. Watch new issues and the rate of any single issue. The browser reports the environment from `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (see CHANGELOG). Event payloads strip `cmd`, `q` and `name` query params (`nextjs/lib/sentryScrub.ts`), so shell lines should not appear in reports. If one does, treat it as a privacy bug.
- [ ] **Plausible** (**OWNER** account). Pageviews, top pages, sources (HN, Reddit, search), country. Custom events: `explain used`, `palette opened`, `pref changed`. Search text is never sent. Note which pages the traffic lands on and which return 404.
- [ ] **Convex usage** (**OWNER** dashboard). Function calls, database bandwidth and storage against plan limits. Pay attention to `queries:search` bytes per call ([abuse-scraping.md](../runbooks/abuse-scraping.md#search-index-cost)) and whether the edge cache is absorbing man-page reads.
- [ ] **Vercel** (**OWNER** account). Firewall events for challenges and 429s, function invocations and errors, and the cache hit ratio for `/man/*`.
- [ ] **Abuse and rate limits.** [abuse-scraping.md](../runbooks/abuse-scraping.md). Origin limits are 300 page reads and 60 searches per IP per minute (from that runbook). Tighten, or block abusive IPs at the edge, if a scraper appears.
- [ ] **Smoke test** every few hours: `pnpm convex:prod-check` (with the pinned IDs), `curl -sI https://betterman.sh/man/tar/1` (still `HIT`), `/search?q=tar`, `/explain?cmd=ls%20-la`.
- [ ] **Issues.** Watch `gh issue list --state open --limit 20` for "report a problem" reports (prefilled GitHub issues) and triage. Reply on the posts, but do not ask anyone to upvote.
- [ ] End of day 2: write a short retro in #410 (traffic, errors, Convex cost, rollbacks, claims that turned out wrong). Close #410 only when the owner decides.
