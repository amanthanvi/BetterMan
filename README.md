<div align="center">

<a href="https://betterman.sh"><img src="nextjs/public/betterman-mark.svg" width="112" height="112" alt="BetterMan logo"></a>

# BetterMan

### The Unix manual, typeset for the screen.

Fast, beautiful, linkable man pages for every major Unix.<br>
No accounts. No clutter. Just the answer, then the whole manual.

<p>
  <a href="https://betterman.sh"><img src="https://img.shields.io/badge/try_it-betterman.sh-1c1a16?style=for-the-badge&labelColor=b3261e" alt="Try it at betterman.sh"></a>
</p>

<p>
  <a href="https://github.com/amanthanvi/BetterMan/actions/workflows/ci.yml"><img src="https://github.com/amanthanvi/BetterMan/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-1c1a16" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/accounts-none-1c1a16" alt="No accounts">
</p>

<p>
  <a href="#-why-youll-like-it">Features</a> ·
  <a href="#-explain-any-command">Explain</a> ·
  <a href="#-honest-about-whats-generated">Transparency</a> ·
  <a href="#-for-developers">Developers</a>
</p>

<br>

<a href="https://betterman.sh/tar">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/man-page-dark.png">
    <img src="docs/assets/readme/man-page-light.png" width="900" alt="The tar(1) man page on BetterMan: a serif page title, a table of contents in the margin, the synopsis, and an In brief summary">
  </picture>
</a>

</div>

<br>

You need one flag. `man` hands you a wall of monospace, and a search engine hands you a forum thread from 2011. **BetterMan gives you the real manual, set like a well-printed book**, with the answer at the top and every option one click away.

<div align="center">

| **400,000+** | **7** | **6** | **0** |
| :---: | :---: | :---: | :---: |
| manual pages | operating systems | languages | sign-ups required |

</div>

## ✨ Why you'll like it

<table>
<tr>
<td width="50%" valign="top">

#### 🎯 Answers first
Every page opens with a one-line summary, a few working examples and the most-used flags. The full upstream manual follows, untouched, with a filterable options index.

</td>
<td width="50%" valign="top">

#### 🔎 Search that gets you
Type `extract a tarball`, land on `tar(1)`. Type `open(2)`, land on the syscall. Typos are forgiven.

</td>
</tr>
<tr>
<td valign="top">

#### 🐧 Every distro, side by side
Full archives from **Debian, Ubuntu, Fedora, Arch and Alpine**, plus **FreeBSD** and **macOS**. Flags that differ between systems get a portability marker, so you find out before your script breaks on someone else's machine.

</td>
<td valign="top">

#### 🔗 Links that just work
`betterman.sh/tar` opens the page `man` would pick.<br>
`betterman.sh/tar/-x` jumps straight to the flag.<br>
`curl -L betterman.sh/tar.txt` prints it in your terminal.

</td>
</tr>
<tr>
<td valign="top">

#### ⌨️ Built for the keyboard
<kbd>⌘</kbd> <kbd>K</kbd> opens the command palette. On a man page, the pager keys you already know work: <kbd>j</kbd> <kbd>k</kbd> to scroll, <kbd>/</kbd> to find, <kbd>n</kbd> <kbd>N</kbd> for matches, <kbd>[</kbd> <kbd>]</kbd> for sections. <kbd>?</kbd> shows the rest.

</td>
<td valign="top">

#### 🔒 Private by design
No sign-up, ever. Bookmarks, history and reading preferences (font, size, line height, column width, theme) live in your browser and never touch a server.

</td>
</tr>
<tr>
<td valign="top">

#### 🌍 Speaks your language
Translated pages in German, French, Spanish, Brazilian Portuguese, Japanese and Russian, from Debian's manpages-l10n project. The interface is translated too.

</td>
<td valign="top">

#### ⚡ Fast and light
Server-rendered HTML with almost no JavaScript. Works offline for pages you've read, installs as an app, prints cleanly, and comes in light and dark.

</td>
</tr>
</table>

## 🧩 Explain any command

Paste a shell line and BetterMan breaks it apart: every command, flag and argument is labelled and linked to the exact line of the manual that defines it. Clustered flags like `-xzvf` are split. Little squares show at a glance whether each flag exists on GNU/Linux, FreeBSD and macOS.

It's a deterministic parser, not an AI model. When it can't parse something safely, it says so instead of guessing.

<div align="center">
<a href="https://betterman.sh/explain?cmd=tar%20-xzvf%20backup.tar.gz%20-C%20%2Ftmp">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/explain-dark.png">
    <img src="docs/assets/readme/explain-light.png" width="820" alt="BetterMan explaining tar -xzvf backup.tar.gz -C /tmp: the command, four clustered flags, and their arguments, each labelled and linked to the manual">
  </picture>
</a>
<br>
<sub><a href="https://betterman.sh/explain?cmd=tar%20-xzvf%20backup.tar.gz%20-C%20%2Ftmp">Try this example live →</a></sub>
</div>

## 🪪 Honest about what's generated

The manual text is always the upstream manual: parsed, never rewritten. Summaries, task phrases and a few extra examples are generated ahead of time, never while you wait.

- **Labelled.** Every generated line names the model and the date.
- **Checked.** Every flag in a generated example is verified against the page's own options table, or the example is dropped.
- **Held back.** Destructive commands like `rm` and `dd` get no generated text at all.
- **Credited.** Examples from [tldr-pages](https://github.com/tldr-pages/tldr) link to their exact source.

Spot something wrong? Every page has a **Report a problem** link.

---

## 🛠 For developers

BetterMan is a [Next.js](https://nextjs.org) app backed by [Convex](https://convex.dev), with a Python pipeline that turns `mandoc` output into a typed document model.

```text
nextjs/      The web app: pages, API routes, rendering
convex/      Schema and functions: dataset reads, search, rate limits, ingest
ingestion/   Python pipeline: mandoc to document model, uploads releases to Convex
scripts/     CI and deploy helpers
docs/        Architecture, releasing, runbooks
```

### Run it locally

You'll need **Node 26**, **pnpm 10.34**, **Python 3.14** and [**uv**](https://docs.astral.sh/uv/).

```bash
pnpm install
pnpm convex:check                       # provisions a local Convex deployment, writes .env.local
npx convex env set RATE_LIMIT_TAG_KEY dev
RATE_LIMIT_TAG_KEY=dev pnpm next:dev    # Convex watcher + Next.js at http://localhost:3000
```

> [!NOTE]
> Next.js and Convex must share the same `RATE_LIMIT_TAG_KEY`. If they don't, search and page API routes return 429.

The local database starts empty. With `pnpm next:dev` running, load the test fixture in a second terminal:

```bash
npx convex env set CONVEX_INGEST_SECRET dev
set -a; . ./.env.local; set +a
BETTERMAN_E2E_SEED=1 CONVEX_INGEST_SECRET=dev \
  CONVEX_HTTP_URL="${CONVEX_SITE_URL:-$VITE_CONVEX_SITE_URL}" \
  node scripts/seed-convex-e2e.mjs
```

<details>
<summary><strong>Everyday commands</strong></summary>
<br>

| Area | Command | What it does |
| --- | --- | --- |
| Web app | `pnpm next:lint` | ESLint |
| | `pnpm next:grammar` | Checks the visual rules in [`DESIGN.md`](DESIGN.md) |
| | `pnpm next:test` | Unit tests (Vitest) |
| | `pnpm next:e2e` | End-to-end tests (Playwright, app must be on port 3000) |
| | `pnpm next:build` | Production build |
| Convex | `pnpm convex:check` | Validates schema and functions |
| | `pnpm convex:test` / `convex:typecheck` | Integration tests and type checks |
| | `pnpm convex:related-check` | Confirms active releases are verified, sealed and complete (needs a deploy key) |
| Ingestion | `pnpm ingest:test` / `ingest:lint` | Tests and Ruff |
| | `pnpm ingest:sample` | Ingests five pages into the configured Convex stage |
| Ops | `pnpm perf:check` | Enforces the [performance budgets](docs/performance-budgets.md) |
| | `pnpm deps:provenance` / `ops:test` | Verifies Vercel provenance and tests operational gates |

</details>

<details>
<summary><strong>How it ships</strong></summary>
<br>

- **App:** every push to `main` that passes CI deploys to Vercel ([`deploy.yml`](.github/workflows/deploy.yml)).
- **Data:** the dataset is rebuilt monthly ([`update-docs.yml`](.github/workflows/update-docs.yml)). Each release is ingested, verified, sealed and staged before it's promoted, so rolling back is just pointing at the previous release.
- **Analytics:** cookieless [Vercel Web Analytics](docs/analytics.md), production only.

For the full picture, start with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/runbooks/`](docs/runbooks/).

</details>

## 🤝 Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) to get started, and report security issues privately as described in [`SECURITY.md`](SECURITY.md).

## 📄 License

[MIT](LICENSE). Examples from tldr-pages are [CC BY 4.0](docs/vendor/tldr-pages.md).

<div align="center">
<br>
<sub><strong>betterman</strong>(1) · <a href="https://betterman.sh">betterman.sh</a></sub>
</div>
