# BetterMan 2: decisions and roadmap

Decided 2026-10-26 in a structured product review with the owner. Independent brainstorms from GPT-6.1 Sol, Gemini 4 Argon, and Grok 4.7 informed it, and so did two research passes, one on full-Debian feasibility and one on generation-provider terms. This file records what was decided and why, then lists the workstreams. Each workstream has a GitHub issue with acceptance criteria.

## Why

The site felt bland and underwhelming on three axes:

- **Capability.** It renders pages well but does little that man7.org, manpages.debian.org, tldr, or explainshell don't.
- **Coverage.** About 35 curated packages per distro (4,712 Debian pages). `tmux`, `jq`, `zsh`, `strace`, `tcpdump`, and `cron` 404.
- **Looks.** A first visit shows two empty states. The man page has no signature moment.

## Goals

In priority order. Tie-breakers come from the later goals.

1. **Default lookup.** Someone who searches the web for a command, flag, syscall, or config directive clicks BetterMan and prefers it.
2. **Daily driver.** Developers return through the address bar (`betterman.sh/tar`, `betterman.sh/tar/-x`).
3. **Learning resource.** Unix gets more approachable without the manual being dumbed down.

A craft showcase is explicitly not a goal. Restraint applies throughout: nothing that bloats or clutters ships.

## Decisions

### Coverage and data

- **All of Debian, at once.** About 141k English pages from 17.3k packages in trixie main, roughly 30× today. They are extracted from `.deb` archives the way debiman does it; installing everything in Docker is infeasible (18 GB to download, 74 GB installed, 1,051 packages with conflicts). Every scale blocker listed under workstream B1 has to land first.
- **Ubuntu, Fedora, Arch, and Alpine also go full**, so portability data covers the commands people use. FreeBSD base and the license-filtered macOS set stay as they are.
- **Current release per distro only.** No multi-release history.
- **All available languages**, chosen with an explicit language switch. English stays canonical. Pages declare `hreflang` alternates and there are no auto-redirects. The UI itself is localized. Translations that lag the English page get a one-line drift note.
- **Collisions.** When several packages ship the same page, the most-installed package gets the clean URL and a "provided by" switch offers the rest. Curated alternatives keep today's behavior (e.g. `awk(1)` → gawk).
- **Index by demand.** Sections 1, 5, 7, and 8 and popular packages are indexable. Long-tail pages are served and searchable on-site but `noindex` until real traffic promotes them.
- **Popularity signals.** Ranking and promotion use popcon install counts plus first-party Plausible pageviews, both aggregated at build time.
- **Hosting.** Convex Professional with modest overage spend. Spend changes need owner sign-off.

### Generated layer

Decided: deterministic features computed from the corpus, plus build-time generation. No runtime LLM.

- **What gets generated.** Plain-English summaries, gap-fill examples, and task phrases. The indexed tier gets them first; long-tail pages get them when promoted. Generation runs only when a page's content hash changes.
- **Examples hybrid.** The page's own EXAMPLES come first. Then tldr-pages (CC BY 4.0, attributed). LLM-generated examples fill the remaining gaps, and every flag in them is machine-checked against that page's options table.
- **Model.** DeepSeek V4.1 Flash through OpenCode Go, behind a swappable OpenAI-compatible client. Go caps usage at $16 per 5 h and $40 per week, so a full pass spans several windows. Go's terms describe "coding agent traffic" and "your own internal use", which leaves batch use ambiguous. The direct DeepSeek API (about $8–30 per full off-peak pass) is the fallback.
- **Provenance.** Generated content is English only. It carries a quiet "generated" mark with the model and date.
- **Concept explainers.** They are anchored to the manual's own section 7 pages: signals → signal(7), globbing → glob(7), regex → regex(7). Gaps such as exit codes or pipes get standalone explainers. A model panel reviews them first, then the owner skims.
- **UI strings.** Translated by an LLM, reviewed by a model panel, and corrected by the community through a prefilled issue link.

### Product

- **Home: search is the home.** Results appear inline as you type. The placeholder cycles real example queries (static under reduced motion). Recents and bookmarks appear only once they exist. Section and package browse is a quiet link.
- **Man page: answer-first.** The top of the page has a summary, 3–5 sourced examples, and the most-used flags. The faithful upstream manual follows, with a filterable options index.
- **Explain inside search.** Paste a full shell line (pipelines, redirects, quoting, subcommands) and get an explainshell-style breakdown linked to exact definitions. Clustered flags are split and portability is noted. The explanation has a shareable URL.
- **Portability markers** on flags compare against all distros. Identical variants (same content hash) collapse into one choice.
- **Corpus features:**
  - Symbol index: config directives, environment variables, errno names, subcommands.
  - Referenced-by lists.
  - Subcommand maps for families such as `git-*` and `ip-*`.
  - Task-phrase search, so "how do I extract a tarball" finds tar(1).
  - "New in X" marks on recently added flags.
  - Package pages at `/pkg/…`.
- **Interactions:**
  - Command composer: toggle flags while reading to assemble a copyable command, with portability warnings.
  - `less(1)` keys on man pages.
  - Cross-reference previews.
  - Live reference tables such as ascii(7).
  - Concept surfacing: a quiet footer line on man pages that reference the concept, plus search with the `concept` kind; no cards inside the manual text (owner decision, B8 #400).
- **Address bar.** Short URLs (`/tar`, `/tar/-x`) plus OpenSearch with suggestions. No CLI, MCP server, or editor extensions for now.
- **Access.**
  - AI answer engines may crawl `/man/*` HTML; `/api/` stays disallowed.
  - Terminals get a plain-text form (`curl betterman.sh/tar.txt`).
  - Non-browser GETs of `/man/*` are exempt from the Vercel challenge, with rate limits.
- **Speed.** Hash-based CSP replaces per-request nonces so man pages can be cached at the edge per dataset release.
- **Craft:**
  - A 404 page in man's voice with did-you-mean.
  - Per-page share cards.
  - Typographic finesse and a print stylesheet that looks like the manual.
  - A per-page "report a problem" link that opens a prefilled GitHub issue.
- **Measurement.** Plausible is served first-party, plus a few cookieless custom events. Reading-preference axes may be pruned if usage data says so.
- **Zero accounts** stays.

### Design

- **Visuals are fully open**, including the name. A rename happens only if a proposal is clearly better, with permanent redirects from betterman.sh. The DESIGN.md grammar and contracts (keyboard map, accessible names, data hooks) are open as well. The current grammar stays enforced until the replacement lands.
- **Direction is chosen by a bake-off.**
  - **Phase 1:** 11 models, each with and without the impeccable design skill, same open brief, 22 static prototypes. The screens are home, tar(1), explain, search, section, and package, each at desktop and mobile, light and dark, with both concept-link variants. The models are Opus 5.5, Fable 5.1, GPT-6.1 Sol, Gemini 4 Argon, Grok 4.7, DeepSeek V4.1 Flash, Kimi K3.1 Pro, Muse Wonder, Muse Wonder Full, GLM 5.3, and Qwen 3.8 Max.
  - **Phase 2:** the owner's best-rated model builds three assigned directions: print manual all in, terminal-native, and pocket reference.
  - **Judging:** a side-by-side gallery, automated weight, contrast, and a11y checks, and a blind critique by 2–3 models. The owner decides.
- **Decision (owner sign-off, 2026-10-27).** The direction is phase 2's **print manual** (blind panel 66.3/80, ahead of 64.8, 60.3 and 60.2). The name stays **BetterMan**, with the wordmark set like a command, `betterman(1)`. Portability uses a three-cell glyph with a text alternative. Three voices: the upstream manual in the serif BM Text (a Source Serif 4 subset under the OFL), BetterMan's additions in system sans on a tint, and anything typed in system mono. Square corners, hairlines, running heads and foot, true small caps, old-style figures, hanging section numbers, and one red for selection, focus and warnings. The keyboard map adds the pager keys j/k, /, n N, g G and [ ]. `DESIGN.md` records the system.
  - **Required fixes from the panel**, by where they land:
    - **C3:** (1) flags in option terms and the options index are bold mono, while literals in prose stay bold serif; (7) filters act on the options index, never the manual text; (8) the running head drops under ~400px; (16) horizontally scrollable `<pre>` blocks are focusable and labelled; (17) no nested interactive elements, and lists are valid; (18) the theme control is hidden without JS; (19) BM Text covers Latin, Latin Extended, Greek and Cyrillic in unicode-range files, and other scripts fall back through a serif stack.
    - **C4 (man page):** (2) the portability glyph sits beside its flag, only on non-portable flags, with a hollow cell for absent and a half cell for different, a one-line legend, and full words for assistive tech; (3) a dense two-column In brief that fits 1440×900; (4) a source label on every example; (5) each In brief part is omitted when its data is missing; (6) the composer's add control appears only on hover, focus or tap.
    - **C5 (explain and search):** (9) on phones the command, then the reading, then the token grid, with no display heading or running heads on explain and search; (10) flag clusters split into single flags, with one dismissible definition at a time, pinned on mobile; (11) portability cells per explained flag; (12) a safety note only for genuinely destructive stages, naming the effect and a dry run; (13) the top hit leads with a sourced example and its key flags; (14) "explain this line" for task examples; (15) small-caps result kinds.

### Guardrails and process

- **Budgets.** Measure today's JS per route, LCP/CLS, HTML size, and Convex reads per page view, then lock them as CI budgets. A feature that exceeds them pays for itself elsewhere. Precompute at ingest by default.
- **Two tracks.** Look-independent fixes and wins ship now. The data track and design track run in parallel. UI features land once, in the new look.
- **Agents build and merge** after CI and independent review. Owner sign-off is required for spend changes, rename or domain changes, and the final visual direction.
- **One "BetterMan 2" relaunch** when the big pieces ship: Show HN, a short post, and listings.

## Workstreams

Each ID links to its issue.

### A. Look-independent fixes and quick wins (now)

| ID | Workstream |
|---|---|
| [A1](https://github.com/amanthanvi/BetterMan/issues/384) | Reader correctness. Duplicate option/definition IDs (91 on tar(1)). `-e` highlight matching inside words. Find bar skips match 1 and has no shortcut. Opening a `?distro=` link overwrites the default distro, and bare links then 404. SEE ALSO/RELATED duplication. External URLs not linkified. Sections 2/3 code defaults to bash highlighting. Home says "Sections 1–9" but lists 8. |
| [A2](https://github.com/amanthanvi/BetterMan/issues/385) | Search correctness. `name(section)` queries. Clustered short flags (`-xzf`). "Did you mean" shows on successful queries and never on empty ones. Honest copy for non-lookup queries. Real edit-distance typo tolerance. |
| [A3](https://github.com/amanthanvi/BetterMan/issues/386) | Ingestion correctness. Options nested under or outside the OPTIONS heading (tar's operation modes, git-commit's zero options). Arch and Alpine tar(1) missing. Licenses for Fedora, Arch, Alpine, FreeBSD, and macOS. Label macOS as a BSD-licensed subset. |
| [A4](https://github.com/amanthanvi/BetterMan/issues/387) | Short URLs (`/tar`, `/tar.1`, `/tar/-x`) and OpenSearch with suggestions. |
| [A5](https://github.com/amanthanvi/BetterMan/issues/388) | Non-browser access: robots policy for answer engines, a Vercel challenge exemption for `/man/*`, and `.txt` plain-text pages. |
| [A6](https://github.com/amanthanvi/BetterMan/issues/389) | Hash-based CSP and edge caching of man pages. |
| [A7](https://github.com/amanthanvi/BetterMan/issues/390) | Performance and cost budgets measured and enforced in CI. |
| [A8](https://github.com/amanthanvi/BetterMan/issues/391) | First-party Plausible plus a few custom events. |
| [A9](https://github.com/amanthanvi/BetterMan/issues/392) | 404 page in man's voice with did-you-mean; per-page "report a problem" link. |

### B. Data track

| ID | Workstream |
|---|---|
| [B1](https://github.com/amanthanvi/BetterMan/issues/393) | Full-Debian extraction pipeline:<br>• Contents and Packages indexes, `.deb` extraction, symlink and `.so` resolution, alternatives, conflict policy.<br>• Streaming or two-pass memory, parallel upload.<br>• Convex scale fixes: release manifest over 1 MiB, the 8,192-element license array, release-document read cost, section caps (114 sections, the 5,000 offset), Perl `Foo::Bar` names, prune at scale. |
| [B2](https://github.com/amanthanvi/BetterMan/issues/394) | Full extraction for Ubuntu (shares B1), Fedora (rpm), Arch (pkg), and Alpine (apk). |
| [B3](https://github.com/amanthanvi/BetterMan/issues/395) | All languages: language-aware schema, search, and sitemaps; hreflang; drift detection. |
| [B4](https://github.com/amanthanvi/BetterMan/issues/396) | Popularity priors (popcon and Plausible) and the index-by-demand sitemap and `noindex` policy. |
| [B5](https://github.com/amanthanvi/BetterMan/issues/397) | Search: popularity-aware ranking, symbol index, task-phrase index, explain parser (full shell line → tokens → option definitions). |
| [B6](https://github.com/amanthanvi/BetterMan/issues/398) | Generated layer: provider-swappable client, summaries, gap-fill examples, task phrases, tldr-pages ingestion with attribution, flag verifier, provenance, hash-gated regeneration within Go caps. |
| [B7](https://github.com/amanthanvi/BetterMan/issues/399) | Derived data: portability diffs and variant grouping, "new in X" marks, referenced-by index, subcommand families, package pages, most-used flags. |
| [B8](https://github.com/amanthanvi/BetterMan/issues/400) | Concept explainers anchored to section 7, with model-panel review and owner skim. |
| [B9](https://github.com/amanthanvi/BetterMan/issues/401) | UI localization pipeline: string catalog, LLM translation, review, community fixes. |
| [B10](https://github.com/amanthanvi/BetterMan/issues/402) | Provider collisions and the "provided by" switch. |

### C. Design track

| ID | Workstream |
|---|---|
| [C1](https://github.com/amanthanvi/BetterMan/issues/403) | Bake-off phase 1 (22 runs), gallery, checks, and blind critique, then owner pick (sign-off). |
| [C2](https://github.com/amanthanvi/BetterMan/issues/404) | Bake-off phase 2: three assigned directions by the winning model. |
| [C3](https://github.com/amanthanvi/BetterMan/issues/405) | Final direction and name decision (sign-off), then a rewrite of DESIGN.md, tokens, the grammar checker, and the e2e contracts. |
| [C4](https://github.com/amanthanvi/BetterMan/issues/406) | Answer-first man page: options index, composer, xref previews, concept surfacing, `less` keys, live tables, portability, version, language, provider, and distro UI. |
| [C5](https://github.com/amanthanvi/BetterMan/issues/407) | Search as home, living placeholder, explain UI, results, section and package browse. |
| [C6](https://github.com/amanthanvi/BetterMan/issues/408) | Share cards, typographic finesse, print stylesheet. |
| [C7](https://github.com/amanthanvi/BetterMan/issues/409) | Reading-preferences pruning, driven by A8 data. |

### D. Launch

| ID | Workstream |
|---|---|
| [D1](https://github.com/amanthanvi/BetterMan/issues/410) | BetterMan 2 relaunch once B1, C3–C5 and the core of B5–B7 ship. |

## Open risks

- **OpenCode Go terms.** Go is "designed for … coding agents" and limited to "your own internal use". Bulk generation for a public site may not fit. Keep the client swappable; the direct DeepSeek API is the fallback, and switching to it is a spend change.
- **Convex cost.** All five Linux distros full, plus all languages, multiplies storage and writes. Measure on staging before promoting. Raising spend needs sign-off.
- **Search engines and thin pages.** 100k+ thin pages could hurt site-wide reputation. Index by demand mitigates this.
- **Opening the Vercel challenge** invites scraping. Rate limits and the abuse runbook still apply, and `/api/` stays disallowed.
- **Alternatives.** Extraction loses update-alternatives links (`awk`, `vi`, `editor`, `nc`). Run a curated pass first so they win ties.
