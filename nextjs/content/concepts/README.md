# Concept explainers (B8, #400)

Short, plain-English explainers that sit over the manual's own concept pages:
signals over signal(7), globbing over glob(7), regular expressions over
regex(7). Topics the manual has no section 7 page for, such as exit status or
redirection, get standalone explainers anchored to the sections of bash(1)
that define them. The manual stays the authority, and every explainer links to
it first.

One file per concept. `pnpm concepts:build` compiles them into
`nextjs/lib/concepts.generated.json`, which the app bundles at build time;
`pnpm next:test` fails when that file is stale or a file breaks the rules below.

## Review and publishing

1. **Generated.** A model drafts the text from the cited pages and records
   itself in `generated-by` and `generated-on`. Status `pending-owner`.
2. **Model panel.** An independent panel checks every claim against the cited
   sections. Fixes land in the file; `panel-review` records the panel and date.
   The first round (GPT-6.1 Sol and Grok 4.7, 2026-10-30) checked all twenty;
   its corrections are applied, and none was rejected or merged.
3. **Owner skim.** The owner reads it and flips `status` to `approved`.

Only `approved` explainers exist on the site: the concept page, the man page
footer line, the search row and `/sitemap-concepts.xml`. Anything else returns
404 and is never listed. To read drafts in place, set
`BETTERMAN_CONCEPT_DRAFTS=1` on `pnpm next:dev`, or on a build started with
`CI=true`; drafts then render with a "not published" note, `noindex` and
`private, no-store`. The flag is a positive opt-in: it also works on a Vercel
development or preview deployment, and is ignored everywhere else, including
`VERCEL_ENV=production` and the Docker image. CI's e2e job sets it to test the
surfaces.

## File format

The `#` comments below explain the fields; the parser does not accept them.

```markdown
---
slug: signals                      # the file name and the URL, /concept/signals
title: Signals                     # page heading and search row
term: signals                      # the footer label, "Concepts: signals"
summary: One sentence for search and the page lede.
status: pending-owner              # draft | pending-owner | approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: (optional) panel models and date
sources:                           # the pages the text was checked against
  - page: signal(7)
    package: manpages 6.9.1-1      # as served on betterman.sh when drafted
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Signal dispositions; Standard signals
related: kill(1), sigaction(2)     # "Related pages" on the explainer
aliases: sigterm, sigkill          # extra search phrases, matched exactly
references: signal(7)              # citations that surface the footer line
headings: EXIT STATUS              # section headings that surface it
pages: bash(1)                     # pages that always surface it
---
Body: paragraphs, `-` or `1.` lists (continuation lines indented two spaces)
and ``` fences. Inline: `code`, *emphasis*, man page citations such as
kill(1), which link automatically, and [[slug]] or [[slug|text]] for another
explainer, which links only once that one is published.
```

Aliases are conceptual phrases (`sigterm`, `exit codes`), never a command's
name such as `nice` or `init`. The body must be 120 to 250 words. The text is data: it renders as React text
nodes, so no HTML in a file can reach the page.

## Where the footer line shows

`conceptsForPage` in `nextjs/lib/concepts.ts` decides from the page data the
man page has already read; it adds no Convex call. A man page shows at most
three concepts, strongest first; ties keep the list's alphabetical order. From
strongest to weakest:

1. the page is one of the concept's section 7 sources (signal(7) shows signals);
2. it is listed in the concept's `pages` (bash(1) for quoting and redirection);
3. its SEE ALSO cites one of the concept's `references` (kill(1) cites
   signal(7));
4. a cross-reference link in its text does;
5. it has a section heading listed in `headings`. Only exit-status uses this,
   for EXIT STATUS, so that heading alone never crowds out a real citation.

A word in the prose alone never counts. The line is BetterMan's text, at the
end of the page beside "Report a problem", never inside the manual.

## Search

`matchConcepts` runs on the server for `/search` and the home results. A query
matches when it is a concept's slug, title, term or alias, singular or plural,
optionally after "what is" or "what are". Command searches such as `kill -9`
never match. A matched explainer appears as a `concept` row after the first
result, so the top hit still leads; a section filter other than 7 hides it.
A match on an alias alone yields when the first result is a page of exactly
that name that is not one of the concept's sources: `stdin` finds stdin(3)
without the redirection explainer, while `glob` keeps globbing beside glob(3).
Only the matched rows reach the browser.

## The page

`/concept/<slug>` is rendered by the Pages Router (`nextjs/pages/concept/`) as
plain HTML, like the man pages: no Next runtime, the hashed boot script for
theme and preferences, the man page script for the palette and keys, and the
same hash-only CSP from `proxy.ts`. It never reads a cookie, so an approved
explainer is sent with `CDN-Cache-Control: public, s-maxage=3600,
stale-while-revalidate=86400` and a 404 with `s-maxage=600`. A deployment
replaces the CDN cache, so a newly approved or edited explainer appears with
the deployment that carries it.

## The initial list and how it was chosen

Evidence: the B7 referenced-by lists (`docs/derived-data.md`) on betterman.sh,
read on 2026-10-30 for every section 7 page in Debian's `manpages` package
(169 pages, of which 98 are not character-set aliases) and the systemd section
7 pages. The public response lists at most 20 referrers per page, so the counts
below are a lower bound: `20+` means the list was full, and *s1/8* counts how
many of those 20 were section 1 or 8 pages.

| Concept | Section 7 anchor | Referrers | s1/8 |
|---|---|---|---|
| [globbing](globbing.md) | glob(7) | 20+ | 16 |
| [regular-expressions](regular-expressions.md) | regex(7), re_format(7) | 20+ | 9 |
| [boot](boot.md) | bootup(7), boot(7); kernel-command-line(7) referrers | 18 / 1 / 20 | 9 / 0 / 13 |
| [signals](signals.md) | signal(7) | 20+ | 8 |
| [environment](environment.md) | environ(7) | 20+ | 8 |
| [locale](locale.md) | locale(7) | 20+ | 6 |
| [character-encoding](character-encoding.md) | utf-8(7), charsets(7), ascii(7) | 20+ each | 0 / 1 / 4 |
| [scheduling](scheduling.md) | sched(7) | 20+ | 4 |
| [capabilities](capabilities.md) | capabilities(7) | 20+ | 3 |
| [namespaces](namespaces.md) | namespaces(7) and the per-type pages | 20+ | 3 (plus 2–3 on each type) |
| [symbolic-links](symbolic-links.md) | symlink(7) | 20+ | 2 |
| [credentials](credentials.md) | credentials(7) | 20+ | 1 |
| [inodes](inodes.md) | inode(7) | 20+ | 1 |
| [filesystem-hierarchy](filesystem-hierarchy.md) | hier(7), file-hierarchy(7) | 3 / 4 | 0 / 1 |
| [path-resolution](path-resolution.md) | path_resolution(7) | 20+ | 0 |
| [cgroups](cgroups.md) | cgroups(7) | 20+ | 0 |
| [pipelines](pipelines.md) | pipe(7), fifo(7) (gap: shell pipelines) | 14 / 8 | 0 |
| [exit-status](exit-status.md) | none (gap) | EXIT STATUS headings | — |
| [redirection](redirection.md) | none (gap) | bash(1) REDIRECTION | — |
| [quoting](quoting.md) | none (gap) | bash(1) QUOTING | — |

Kept off the first list: pages referenced mostly by programming interfaces
(netlink(7), socket(7), tcp(7), epoll(7), pthreads(7), attributes(7)), pages
that are themselves tutorials or formats rather than concepts a reader looks
up (groff(7), man(7), systemd.special(7), systemd.time(7)), and character set
tables, which ascii(7)'s explainer covers. Section 7 pages with no section 1
or 8 referrers stayed in only where a command reader still needs the idea
(path resolution, cgroups, the file system hierarchy).
