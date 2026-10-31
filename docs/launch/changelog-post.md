# BetterMan 2 (changelog post draft)

> Drafting notes, delete before publishing.
>
> - Voice follows [PRODUCT.md](../../PRODUCT.md) and [DESIGN.md](../../DESIGN.md): quiet, precise, tool-like, no hype. No exclamation marks, no superlatives.
> - Replace every `{{…}}` (list in [launch-checklist.md](launch-checklist.md#placeholders)). Re-verify each claim on production first (checklist step 6).
> - The "Other Linux distributions" sentence must say what production actually has. Full Ubuntu, Fedora, Arch and Alpine is B2 (#394), still open when this was drafted.
> - Word count of the post body below: about 430.
> - Not published, not posted. The owner publishes.

**Title:** BetterMan 2

**Date:** {{LAUNCH_DATE}}

BetterMan 2 is out. It is still Unix manual pages, typeset for the screen, with no accounts. This is what changed for a reader.

## The page answers first

Each man page opens with *In brief*: a one-sentence summary, up to five examples, and the flags people use most. Every example names its source: the manual's own EXAMPLES section, tldr-pages, or generated text. The upstream manual follows unchanged, with an options index you can filter and a composer that builds a command from the flags you pick. Cross-references preview on hover.

## Search is the home

The home page is a search box. Results appear as you type. It matches task phrases as well as names, so "extract a tarball" finds tar(1). Paste a whole shell line and *explain* breaks it into commands, splits clustered flags such as `-xzvf`, and links each piece to its exact definition. The result has a shareable URL and works without JavaScript.

## Portability

A flag that is missing from some systems, or behaves differently on them, carries a marker and a plain-words description. The comparison runs across all the systems below. Pages that are identical everywhere collapse into one.

## All of Debian, and more systems

BetterMan now serves {{DEBIAN_PAGES}} manuals from {{DEBIAN_PACKAGES}} Debian {{DEBIAN_RELEASE}} packages. Where several packages ship the same page, the most-installed one gets the plain URL and a *provided by* switch lists the others. Ubuntu, Fedora, Arch, Alpine, FreeBSD and macOS are here too. {{OTHER_LINUX_COVERAGE}}

## Short URLs and plain text

`betterman.sh/tar`, `betterman.sh/tar.1` and `betterman.sh/tar/-x` go where you expect. Add `.txt` for plain text: `curl -L betterman.sh/tar.txt`. Browsers can add BetterMan as a search engine, with suggestions.

## Generated text is labelled

The summaries, the task phrases, and some examples are written by a language model at build time. There is no model call when you load a page. Generated text carries a mark with the model and date. A generated example must be one simple command, and every flag in it is checked against that page's options table. If a flag is not in the table, the example is dropped. Pages for destructive commands such as `rm` and `dd` get no generated text.

Examples from [tldr-pages](https://github.com/tldr-pages/tldr), under CC BY 4.0, are labelled and link to the exact upstream file. The credit is also on the [licenses page](/licenses).

## Not there yet

Manuals are English only, and there are no concept explainers (signals, globbing, regular expressions) yet. Both are planned, neither is dated.

## Feedback

Every page has a *report a problem* link that opens a prefilled GitHub issue. The source is MIT licensed at [github.com/amanthanvi/BetterMan](https://github.com/amanthanvi/BetterMan).

---

## Follow-up note: where this could live (not built)

No page for this exists today (`nextjs/app` has no `/changelog` or `/about`). Options, smallest first:

1. **`/changelog`**, a static server-rendered page that lists dated posts, newest first, in the print-manual voice. It fits the product best: a reader asks what changed, and one dated list answers it. It would need a route, a sitemap decision (indexable, since it is one page) and the `next:grammar` check. The CSP and no-JavaScript rules apply; it should be plain HTML.
2. **`/about`**, one page for what BetterMan is, where the data comes from, the generated-text policy and the credits. Most of this post's "generated text" section belongs there permanently; the credits already live at `/licenses`.
3. **GitHub only.** Publish this as the body of a GitHub release (`gh release create`, see [RELEASING.md](../RELEASING.md)) and link it from the Show HN. No site change.

Recommendation: ship option 3 for launch day and open an issue for `/changelog` plus a short `/about`. Do not add a banner or a modal on the home page.
