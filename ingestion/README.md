# Ingestion

Ingestion pipeline that builds BetterMan dataset releases and posts them to Convex.

Required environment:

- `CONVEX_HTTP_URL` or `CONVEX_URL` — Convex HTTP actions URL. `.convex.cloud` URLs are converted to `.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex ingest HTTP actions.
- `BETTERMAN_DATASET_STAGE` — `staging` for scheduled imports, `prod` for direct local/E2E seeds.

Optional: `BETTERMAN_INGEST_PAGE_BATCH_ITEMS` (default 20) and `BETTERMAN_INGEST_PAGE_BATCH_BYTES` (default 8 MiB) bound each page upload request. The Linux container receives each one, by name, when it is set on the host.

The ingest command parses man pages locally/in-container, creates a Convex release, stores full page content in Convex file storage, batch-inserts page metadata/search documents, and activates the release pointer for the configured stage when `--activate` is set.

Optional: `BETTERMAN_INGEST_WORKERS` sets the number of parse processes, clamped to 1–8 and defaulting to the CPU count up to 8. `1` parses sequentially. Output order and page ids do not depend on it.

## Parser fixtures

`tests/fixtures/roff/` holds roff sources captured from Debian trixie plus one mdoc page from macOS. `tests/test_golden.py` renders each with the host `mandoc` and compares the parsed result to `tests/fixtures/golden/`. After a deliberate parser change:

```bash
uv run python -m pytest tests/test_golden.py --update-golden
cp tests/fixtures/golden/*.json ../nextjs/components/doc/__fixtures__/
```

The Next.js test `components/doc/DocRenderer.golden.test.tsx` renders the same JSON, so the two copies must match.

`definition-leading-text.1` covers inline content before paragraphs and nested
blocks, including prose before a single-line code example. `find-name.1` is an
excerpt from Debian's find(1). The tar and ssh_config goldens retain their opening
archive/TAPE and ForwardAgent explanations. `tests/test_definition_content.py`
checks every roff fixture against its rendered source: each `<dd>` opening must
survive in the matching definition body (or the visible page body for converted
prose bullets). This guard ignores markup/whitespace differences and checks
repeated terms in document order. Run it with `pnpm ingest:test`.

`parser-text-fidelity.1` covers loose text after `.RE`, inline whitespace,
and redundant DocBook list bullets. Correctly spaced option terms also restore
flag/argument splitting (`-t format`, `-f ARCHIVE`) while joined spellings such as
`-n10` stay joined and body/option anchors stay unchanged. `tests/test_fidelity.py`
checks exact ordered source tokens against definitions and the complete document,
with mutation cases
for loss, duplication, reordering, and glued words. The document model is unchanged.

For a full local audit of cached mandoc HTML (no ingestion clients or uploads):

```bash
PYTHONPATH=ingestion ingestion/.venv/bin/python ingestion/scripts/audit_fidelity.py \
  --cache /tmp/issue416/out --baseline /tmp/issue416b/baseline_mandoc_parser.py \
  --output /tmp/issue416b/final.jsonl
```

Run this command from the repository root, using a baseline parser snapshot and
`<cache>/<distro>/html/*.html.gz`. JSONL records include source/body and per-definition
findings, whitespace-boundary diagnostics, and baseline/candidate ID, TOC, option,
and plain-text comparisons. Exact token equality covers every page. Above 40,000
tokens, diagnostic alignment uses equal spans as anchors before refining smaller
differences; any unresolved partition is reported explicitly. A nonzero exit means
residual fidelity findings or read/parse errors, not a skipped corpus. Source
normalization removes only recognized list markers; other differences remain visible.

The curated command-page check runs after parsing and alias resolution, before any
release upload. Arch reinstalls requested packages to restore man pages omitted
by its container image; Alpine requires `tar-doc` alongside `tar`. Debian/Ubuntu
also reinstall the `mount`, `perl-base`, `python3-minimal`, and installed
`python3.*-minimal` owners to restore pages stripped before ingestion starts.
Fedora restores `coreutils-common` and
`util-linux-core`, whose pages the base image strips. New package sets must
extend the representative command expectations in `ingest_runner.py`.

Expectations are distro-specific: Debian trixie excludes `gcc(1)` and `gdb(1)`
because their documentation requires non-free packages. Ubuntu requires
`perl(1)` and `python3(1)` after restoring their minimal-package owners.
Each exclusion logs its reason. Missing-page errors name the requested package
and expected owner. Alpine's best-effort `docs` install can now block the release
if it leaves a required page absent. For an intentional exception, set
`BETTERMAN_ALLOW_MISSING_COMMAND_PAGES=1` on the host ingestion command; Docker
forwards it by name. The override logs every missing page at WARNING as
`command_pages_missing_allowed` and never bypasses unclassified packages. Every
release package manifest records `commandPageCheck.allowMissingCommandPages`
and `allowedMissingPages` (name, section, requested package, and expected owner),
so use of the override remains auditable after ingestion.

Fedora, Arch, and Alpine collect package notices from `/usr/share/licenses`.
Fedora also resolves RPM-marked license files and named license documents in
`/usr/share/doc` through packages built from the same source RPM, including
mixed-case package names. Python's RPM license lives under `/usr/lib[64]`.
Arch resolves declared SPDX licenses; Alpine installs `spdx-licenses-text` and
resolves declarations from `/usr/share/spdx/text` because many `-doc` packages
ship no license copy. Packages without discoverable license text remain declared
with `hasLicenseText: false`; license expressions alone are not published as text.

License records are size-checked before creating a release or uploading pages.
The encoded stored record must fit below Convex's 1 MiB limit with 1 KiB reserved
for system fields and serialization overhead. Oversized text fails the run and
is never truncated. FreeBSD and the filtered macOS corpus record synthetic base
package/version provenance and upstream source links; those entries are
provenance records, not a blanket license for every source file.
These dataset corrections take effect at the next monthly ingest.

`git-commit.1` was captured from
<https://manpages.debian.org/trixie/git-man/git-commit.1.en.gz> (Git 2.47.3).
`dash-prose.1` is a synthetic negative fixture for option extraction.

`curl-options.1` covers nested argument values and `-1` ownership; `tmux-prose.1`
keeps non-DocBook prose out of definition conversion. The paired `bare-options`
man/mdoc fixtures retain real `-`, `--`, and `+` options without promoting bullets
or date/stat/printf format modifiers. The `option-shapes` fixture rejects numeric
ranges, compiler prose, and shell operators while retaining symbolic/grouped
flags. Tar's golden excludes environment names and format values, and parser
tests exclude bash's conditional-expression operators.

Bare tokens nested inside option definitions or their indented argument lists are
values, not options. A mixed field-range or compatibility-entry list cannot
establish CLI context solely through one flag-shaped peer; extraction keeps the
original body terms and anchors intact.
