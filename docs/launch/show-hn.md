# Show HN draft

> Drafting notes, delete before posting.
>
> - Not posted. The owner submits it, from their own account, and answers in the thread.
> - The numbers were filled from production on 2026-11-01 (values in [launch-checklist.md](launch-checklist.md#placeholders)). Check each statement against production again on launch day (checklist step 6); remove any that is no longer true.
> - Rules, from [the Show HN page](https://news.ycombinator.com/showhn.html) and the [guidelines](https://news.ycombinator.com/newsguidelines.html): the title starts with "Show HN"; the project must be easy to try with no sign-up; explain how and why you built it; do not ask anyone to upvote or comment; it is a major overhaul, not a minor release, so say so plainly. Do not use a different or shortened URL, and do not post it twice.
> - Link the URL field to `https://betterman.sh`, not to a blog post. Post the comment below right after submitting, as the first comment.

## Title

Pick one (both are ≤80 characters; count checked).

1. `Show HN: BetterMan – man pages for all of Debian, with explain and portability` (78)
2. `Show HN: BetterMan – Unix man pages with answers first, explain and portability` (79)

Option 1 is the more concrete one. Full Debian was promoted on 2026-10-31, so it is accurate. "All of Debian" means the full main archive of trixie (about 17,300 packages), not contrib or non-free; say so if asked. Use option 2 if you'd rather not make that claim.

URL: `https://betterman.sh`

## First comment

Hi HN. BetterMan is a web reader for Unix manual pages. I've been working on it for a while; version 2 is a large rework, which is why I'm posting it now. It has 107,143 pages from about 17,300 Debian trixie (13) packages, plus full archive imports of Ubuntu (104,763), Fedora (87,890), Arch (49,306) and Alpine (41,920), FreeBSD (12,096) and macOS (447). There are no accounts. Bookmarks, history and reading preferences stay in your browser.

**Why.** I look up flags constantly, and the existing options each do part of the job. man7.org and manpages.debian.org are faithful but plain. tldr shows the examples but not the manual. explainshell parses a command line but is a separate tool. I wanted one place where the exact manual is the base, and everything I add sits on top of it, marked as mine.

**What it does.**

- `betterman.sh/tar`, `/tar.1`, `/tar/-x` go to the page or flag. A bare name opens the section `man` itself would pick on that distro. `curl -L betterman.sh/tar.txt` returns plain text: a running header, then NAME, with each option listed once. Browsers can add it as a search engine.
- Each page opens with a one-sentence summary, up to five examples (each labelled with its source) and the most-used flags. The upstream manual follows unchanged, with a filterable options index.
- Search matches task phrases ("extract a tarball" finds tar(1)), manual citations such as `open(2)` and clustered flags.
- *Explain*: paste a shell line, get each command and flag linked to its definition. Clustered flags are split. It is a deterministic parser, not a model. For input it can't parse safely it says so instead of guessing.
- Flags that differ between distros get a marker, computed by diffing the actual manuals. Where several packages ship the same page, a *provided by* switch lists them.
- Translations in six languages (de, fr, es, pt-BR, ja, ru) come from Debian's manpages-l10n packages, 9,552 pages in all. Add `?lang=`; each page credits its source package and notes the options it lacks compared with English, and a page with no translation shows in English. The UI is localized into the same six languages.

**How it's built.**

- Ingestion is Python. `mandoc -Thtml` renders each page, and I convert that into a typed block/inline document model that is mirrored in TypeScript, with golden fixtures keeping the two in sync. Debian pages come from checksum-verified `.deb` archives that are unpacked, not installed (the way debiman does it). Installing everything is not feasible: it would be 18 GB to download and 74 GB installed, with conflicts.
- The data lives in Convex. Releases are immutable once sealed. A dataset update goes ingest, verify, seal, stage, then promote, with a compare-and-swap on the release ID, so a bad release can be rolled back by pointing at the previous one. Next.js reads Convex server-side only; there are no client subscriptions.
- Man pages are plain server-rendered HTML. The only script is one hashed inline boot script (theme and reading preferences before first paint) plus a small static bundle. The CSP is hash-based, with no per-request nonce, which lets Vercel's CDN cache pages. The cache key includes the active release, so a promotion changes it.
- CI enforces budgets (`pnpm perf:check`): JS and HTML bytes per route, Convex calls and documents read per page view, and a cap on LCP minus FCP. A change that raises one needs an explanation in the PR.

**What's generated and what isn't.** The manual text is upstream, parsed, not rewritten. Generated at build time by DeepSeek V4.1 Flash (`deepseek-v4.1-flash`): the one-sentence summaries, task phrases, and some examples when a page has fewer than three. There is no model call when you load a page. Generated text is labelled with the model and date. A generated example must be one simple command, and every flag in it is checked against that page's options table; if a flag isn't there, the example is dropped. Pages for commands that destroy data (`rm`, `dd`, `mkfs` and the like) get no generated text. Examples from tldr-pages (CC BY 4.0) are credited and link to the exact upstream file.

**Limits.**

- Translations cover 9,552 pages, so most pages are English only.
- Ubuntu 24.04, Fedora 44, Arch and Alpine 3.23 are full archive imports like Debian. FreeBSD (15.1) is base-system manuals. macOS is limited to pages whose license allows it.
- One current release per distro. There is no history, so you can't read what tar(1) said in an older release.
- Portability compares distros, not versions of a distro.
- Explain covers a defined shell grammar. It will refuse some valid lines.
- Generated summaries can be wrong or flat. Every page has a *report a problem* link that opens a prefilled GitHub issue.
- Search engines may index pages in sections 1, 5, 7 and 8, plus pages from packages with at least 10,000 installations in Debian's popularity contest. That is 48,416 of Debian's 107,143 pages and 49,744 of Ubuntu's 104,763. Every other page is served and searchable but marked `noindex` and left out of sitemaps, to avoid 100k thin pages. Translated pages are `noindex`, with the English page as canonical when that page is indexable. (Delete this line if you'd rather not discuss it.)
- Parsing man pages is messy. Pages that mandoc warned about carry a note, and some will still render badly.
- No CLI, API or editor extension for now. `/api/` is disallowed for crawlers.

**Feedback I'd like.** Pages that render wrongly, or flags missing from the options index. Explain results that are wrong or too cautious. Portability markers that don't match what you see on your machine. A package that owns the wrong clean URL (`nc`, `awk`, `vi` were the hard ones). And whether the answer-first layout helps or just gets in your way.

It's MIT licensed: https://github.com/amanthanvi/BetterMan. I'll be around to answer questions.

## Anticipated questions (for the owner, not for posting)

- *"Why not just `man`?"* Because you can't link to a flag, search by task, or compare distros in a terminal. `man` stays the better tool locally. Say so.
- *"Does it send my commands to a model?"* No. Explain runs a parser on the server, with no model. Sentry setup was skipped for launch (see [launch-checklist.md](launch-checklist.md) step 5); if it is on, events strip `cmd`, `q` and `name` (`nextjs/lib/sentryScrub.ts`). Vercel Web Analytics loads only in production, uses same-origin intake without cookies, and receives no search text ([analytics.md](../analytics.md)).
- *"AI-generated content on a reference site?"* Lead with the labelling and the flag check. Do not claim the summaries are always right.
- *"Cost and traffic?"* Convex Professional, with a $10/month warning-only spending limit. After the full Debian promotion on 2026-10-31 the Convex usage page showed all usage within Pro's included amounts. Don't give other numbers that aren't in the issue; take the real ones from the first 48 hours.
- *"Scraping?"* Answer engines may crawl `/man/*`. Bytespider and CCBot are disallowed. See [abuse-scraping.md](../runbooks/abuse-scraping.md).
