# BetterMan 2 launch checklist

Draft for [#410](https://github.com/amanthanvi/BetterMan/issues/410) (BM2 D1). Items ticked below are done; nothing has been posted or published. The owner executes the rest.

Full Debian (107,143 manuals) was promoted to production on 2026-10-31, after the staging checks and within the cost estimates ([b1-debian-evidence.md](../roadmap/b1-debian-evidence.md), [multi-distro-ops.md](../runbooks/multi-distro-ops.md#debian-archive-imports-explicit-approval-switches)). The launch is one coordinated day after that.

Steps marked **OWNER** need the owner's account, secret or authority. An agent must not do them.

## Placeholders

The production numbers below were filled into the drafts on 2026-11-01. They were verified on production at 08:30 UTC that day from `/api/v1/info`. Re-check them on launch day (step 6).

| Value | Filled with | Where it is used |
| --- | --- | --- |
| Debian pages, release | 107,143 pages from about 17,300 packages (17,325 per-package license records), trixie (13), the full main archive | `show-hn.md`, `changelog-post.md` |
| Ubuntu | 104,763 pages, 24.04 noble, full main and universe archive | same |
| Fedora | 10,271 pages, release 44, curated set | same |
| Arch | 12,789 pages, curated set | same |
| Alpine | 12,163 pages, 3.23, curated set | same |
| FreeBSD | 12,096 pages, 15.1, base system | same |
| macOS | 447 pages | same |
| Other Linux coverage | Ubuntu is a full import like Debian; Fedora, Arch and Alpine are curated sets for now, with full imports in progress | same |
| Generation model | DeepSeek V4.1 Flash (`deepseek-v4.1-flash`), as the page's generated mark shows it | same |
| Indexing policy | See step 6 | `show-hn.md` |
| Translations | 6 languages, 9,552 pages from Debian's manpages-l10n packages | same |

Three values are still open. They are filled at posting time:

| Placeholder | Meaning | Source |
| --- | --- | --- |
| `{{LAUNCH_DATE}}` | Launch day (UTC) | Owner |
| `{{CHANGELOG_URL}}` | Where the on-site post lives, if built | Follow-up in `changelog-post.md` |
| `{{HN_URL}}` | The posted Show HN | Owner, after posting |

Before posting, search the drafts for two opening curly braces; only these three may remain.

**Ubuntu, Fedora, Arch and Alpine.** The roadmap makes all four full; that is [B2 (#394)](https://github.com/amanthanvi/BetterMan/issues/394). On 2026-11-01 production reported Ubuntu as a full import and Fedora, Arch and Alpine as curated sets. The drafts say that. Re-read the counts on launch day and change the sentence if a full import has landed, never from the plan.

## 0. Gate: confirm the launch conditions

- [ ] [#410](https://github.com/amanthanvi/BetterMan/issues/410) names B1, C3–C5 and the core of B5–B7 as prerequisites. Check each is closed or consciously deferred: `gh issue list --state all --search 'BM2 in:title' --json number,title,state`.
- [x] **OWNER:** sign-off on the full-Debian staging measurement (storage, reads, license coverage, cost). Done: full Debian was promoted on 2026-10-31 after the staging checks, within the cost estimates. Convex spend changes need owner sign-off per [betterman-2.md](../roadmap/betterman-2.md).

## 1. Performance budgets green

- [ ] CI on `main` is green, including the `performance_budgets` job in `.github/workflows/ci.yml`: `gh run list --workflow ci.yml --branch main --limit 3`.
- [ ] Run the same check locally from a clean `main`: `pnpm install --frozen-lockfile && pnpm ops:test && pnpm perf:check`. It builds production Next and overwrites `nextjs/.next`; see [performance-budgets.md](../performance-budgets.md).
- [ ] Optional, for the paint regression loop: `pnpm perf:check --stress`.
- [ ] Download the `performance-budgets` artifact (`.perf-results/measurements.json`) from the last green `main` run and keep it as the launch baseline: `gh run download <RUN_ID> -n performance-budgets`.
- [ ] No budget was raised to get here: `git log -p --follow -- perf-budgets.json` since the last release. The `diff_guards` job (`scripts/check-perf-budget-changes.mjs`) requires an explanation for any change.
- [ ] Other required gates are green: `pnpm next:lint`, `pnpm next:grammar`, `pnpm next:test`, `pnpm convex:test`, `pnpm ingest:test`.

Budgets use fixture data, not 107,143 pages. They do not prove that the full corpus is cheap to read. The staging measurement and step 6 cover that.

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

  Expected: every distro has the same ID in both stages, except one with a newer release waiting in staging. Record why for each difference. Debian was promoted on 2026-10-31, so its production release shows the full page count.
- [ ] Sitemaps answer for every distro: `curl -fsS https://betterman.sh/sitemap.xml | head` and `curl -fsS https://betterman.sh/sitemap-<distro>.xml | head`.
- [ ] No ingest or prune is running: `gh run list --workflow update-docs.yml --limit 5` and `gh run list --workflow prune-releases.yml --limit 3`. Never deploy Convex during a dataset run.

## 3. Promote full Debian

**Done on 2026-10-31:** the owner authorized the promotion after the staging checks and full Debian is live. The steps below stay as the record and as the recipe for a later full release or a rollback. Their other boxes are not ticked because the evidence lives in #410, not here.

Source: [multi-distro-ops.md](../runbooks/multi-distro-ops.md#debian-archive-imports-explicit-approval-switches). A full release stays in staging until the owner authorizes a separate promotion-only dispatch. Leave `BETTERMAN_DEBIAN_FULL_PROMOTE` unset.

- [ ] **Save the rollback target first.** The current Debian prod ID from step 2 (the curated release) goes in the issue. Without it step 8 cannot run. The workflow also records it in its summary, but save your own copy.
- [ ] Do not prune before launch. If a prune is unavoidable, preview first (`gh workflow run prune-releases`, no `apply`) and use `-f apply=true -f keep_per_distro=2` so the curated Debian release survives as a rollback target ([multi-distro-ops.md](../runbooks/multi-distro-ops.md#prune-superseded-releases-github-actions)).
- [ ] **Inspect the staging release** against the run's evidence: page count, packages, storage, reads, license coverage and cost, in the format of [b1-debian-evidence.md](../roadmap/b1-debian-evidence.md). Record the exact staging ID. The Debian figures in the placeholders table above came from this inspection and the live `/api/v1/info`.
- [ ] **nc policy.** Full Debian switches `nc(1)` from netcat-openbsd to netcat-traditional. The OpenBSD manual must stay reachable at `/man/nc_openbsd/1` and `/man/nc/1?pkg=netcat-openbsd`. The runbook asks for this check before approval; see [b1-debian-nc-owner.md](../roadmap/b1-debian-nc-owner.md). Since staging is not publicly readable, verify the audit evidence before promotion and the two URLs on prod immediately after.
- [ ] **Inspect all seven staging pointers.** Promote-only dispatches attempt every distro and ignore selectors ([multi-distro-ops.md](../runbooks/multi-distro-ops.md)). Use the `convex:related-check` output from step 2.
- [x] **OWNER:** authorize the promotion. Done 2026-10-31. Then dispatch with the release you inspected:

  ```bash
  gh workflow run update-dataset -f ingest=false -f promote=true -f debian_full_promote=true \
    -f 'expected_release_ids={"debian":"<staging-debian-release-id>"}'
  ```

  `<staging-debian-release-id>` is the ID you recorded. Supply the other six IDs too if you want the whole dispatch pinned.
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

  First identify the challenge source in Firewall events. Add no broad `/man/` HTML bypass. Then verify anonymously, with no challenge cookie: `/tar.txt`, `/tar.1.txt`, `/man/tar/1.txt`, `/opensearch.xml`, `/api/v1/suggest?q=ta&format=opensearch`. Add BetterMan as a search engine in real Chrome and Firefox and type `ta`. The post and Show HN claim `curl betterman.sh/tar.txt` works, so this must pass before posting. The challenge came from the managed **Bot Protection** ruleset (action: challenge). Before the rules, an anonymous `curl -I https://betterman.sh/tar.txt` returned `429` with `x-vercel-mitigated: challenge`. After them, anonymous GET/HEAD on all five URLs answer with no challenge: `/tar.txt` 308 to `/man/tar/1.txt`, the rest 200 with `nosniff`, and a missing page gives 404. HTML (`/man/tar/1`), sitemaps and POST stay challenged. Re-checked on 2026-11-01: `/tar.txt` answered 308 to `/man/tar/1.txt`, which answered 200. Full Debian then made most names ambiguous, and `/tar.txt` answered 409 until #505 resolved a bare name by `man`'s own section order. Since #505, a name-only redirect is `307` (the target can change with a release) and an explicit section stays `308`: `/tar.txt` answers 307 to `/man/tar/1.txt`, so `curl -L betterman.sh/tar.txt` works. Still to do on launch day: add BetterMan as a search engine in real Chrome and Firefox and type `ta`.
- [x] **Chromium fingerprint challenge (#503, review by 2026-11-20).** A custom rule challenges HTML requests from one common Chromium TLS fingerprint ([abuse-scraping.md](../runbooks/abuse-scraping.md#chromium-fingerprint-challenge-2026-11-06-review-by-2026-11-20)). Chrome visitors on it see the Vercel checkpoint once, then the page; text routes, OpenSearch and suggestions are bypassed. The owner chose on 2026-11-08 to keep it unchanged for the launch. Read its challenge outcomes 24 hours after posting.
- [x] **OWNER:** enable **Web Analytics** in the BetterMan Vercel project (done 2026-10-30; the API confirms it is enabled). Collection starts with the first production deploy after enablement ([analytics.md](../analytics.md)).
- [ ] **OWNER:** after the first production deploy, verify `/` and `/man/tar/1` include the analytics bootstrap/script and the Web Analytics dashboard shows pageviews. A deploy built before enablement needs a redeploy because the configuration is baked at build time.
- [x] **OWNER (lead, after merge):** delete `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` from the Vercel project environment. Done; it is deleted.
- [ ] **OWNER, optional (skipped for now):** set `NEXT_PUBLIC_SENTRY_DSN` in the production Vercel environment. The owner passed on this for launch, so do not treat an unset DSN as a blocker. See the Sentry item in step 8.
- [x] **OWNER:** confirm the Convex plan and spend limit cover the full-Debian storage and read numbers from step 3. Done: the team is on **Professional**, and a **$10/month warning-only** spending limit is set, with no disable threshold, because a disable threshold would take every project offline. The Convex usage page shows all usage within Pro's included amounts.
- [ ] **OWNER: posting.** Show HN, the submissions and any on-site post. Drafts are in this folder. The owner approved posting the filled drafts from the owner's own accounts, and chose (2026-11-08) to post Show HN after the short-URL fix (#505) is live and these drafts merge, confirming sign-in and availability right before posting. Agents create no accounts and send no email.

## 6. Pre-launch claim check

The drafts make factual claims. Re-verify each on production on launch day, and delete or soften any that fails.

- [ ] Page counts and the distro list match `/api/v1/info` for each distro.
- [ ] `curl -fsSL https://betterman.sh/tar.txt | head` returns plain text.
- [ ] A man page shows its "In brief" block, and every generated item carries its "generated" mark with model and date. tldr-pages examples are labelled and linked, and `/licenses` credits tldr-pages.
- [ ] Portability markers appear on a flag that differs between distros (for example in `/explain?cmd=…`).
- [ ] Page weight and cost claims match a fresh `pnpm perf:check`, not an old number.
- [ ] Claims about languages and concept explainers match production: six languages (de, fr, es, pt-BR, ja, ru) with 9,552 translated pages (B3 #395), and twenty concept explainers at `/concept/<slug>` (B8 #400). Checked on production on 2026-11-08 in a browser past the Vercel checkpoint: all twenty concept pages answer 200, `/man/tar/1?distro=debian&lang=de` is the German translation crediting manpages-l10n with the English page as canonical, and `/man/rsync/1?distro=debian&lang=de` falls back to English. Check `?lang=de` on a page with a translation and one without (English fallback), and `/concept/signals`. Still no claim about a CLI (roadmap: none). Share cards, per-flag cards and the print stylesheet ship with C6 (#408).
- [ ] **Indexing.** The index-by-demand policy is B4 ([#396](https://github.com/amanthanvi/BetterMan/issues/396)), and it is live. Search engines may index pages in sections 1, 5, 7 and 8, plus pages from packages with at least 10,000 installations in Debian's popularity contest. That makes 48,416 of Debian's 107,143 pages and 49,744 of Ubuntu's 104,763 indexable. Every other page is served and searchable, but marked `noindex` and left out of sitemaps. Translated pages are `noindex`, with the English page as canonical. Check a long-tail page's `robots` meta and `/sitemap-debian.xml` on production, and keep the line in `show-hn.md` in step with what you see.
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

- [ ] **Sentry** (optional; skipped for launch, so there may be nothing to watch unless the owner sets the DSN, see step 5; rely on the Vercel item below otherwise). If it is on: (**OWNER** account) filter to `environment:production`. Watch new issues and the rate of any single issue. The browser reports the environment from `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (see CHANGELOG). Event payloads strip `cmd`, `q` and `name` query params (`nextjs/lib/sentryScrub.ts`), so shell lines should not appear in reports. If one does, treat it as a privacy bug.
- [ ] **Vercel Web Analytics** (**OWNER** project access; production only). Pageviews, top pages, sources (HN, Reddit, search), country. Custom events: `explain used`, `palette opened`, `pref changed`. Search text is never sent. C7 (#409) evidence restarts from this deploy. Note which pages the traffic lands on and which return 404.
- [ ] **Convex usage** (**OWNER** dashboard). Function calls, database bandwidth and storage against plan limits. The spending limit is $10/month and warns only; it disables nothing, so watch the dashboard yourself. Pay attention to `queries:search` bytes per call ([abuse-scraping.md](../runbooks/abuse-scraping.md#search-index-cost)) and whether the edge cache is absorbing man-page reads.
- [ ] **Vercel** (**OWNER** account). Firewall events for challenges and 429s, function invocations and errors, and the cache hit ratio for `/man/*`.
- [ ] **Abuse and rate limits.** [abuse-scraping.md](../runbooks/abuse-scraping.md). Origin limits are 300 page reads and 60 searches per IP per minute (from that runbook). Tighten, or block abusive IPs at the edge, if a scraper appears.
- [ ] **Smoke test** every few hours: `pnpm convex:prod-check` (with the pinned IDs), `curl -sI https://betterman.sh/man/tar/1` (still `HIT`), `/search?q=tar`, `/explain?cmd=ls%20-la`.
- [ ] **Issues.** Watch `gh issue list --state open --limit 20` for "report a problem" reports (prefilled GitHub issues) and triage. Reply on the posts, but do not ask anyone to upvote.
- [ ] End of day 2: write a short retro in #410 (traffic, errors, Convex cost, rollbacks, claims that turned out wrong). Close #410 only when the owner decides.
