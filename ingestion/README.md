# Ingestion

Ingestion pipeline that builds BetterMan dataset releases and posts them to Convex.

Required environment:

- `CONVEX_HTTP_URL` or `CONVEX_URL` — Convex HTTP actions URL. `.convex.cloud` URLs are converted to `.convex.site`.
- `CONVEX_INGEST_SECRET` — bearer token checked by Convex ingest HTTP actions.
- `BETTERMAN_DATASET_STAGE` — `staging` for scheduled imports, `prod` for direct local/E2E seeds.

Optional: `BETTERMAN_INGEST_PAGE_BATCH_ITEMS` (default 20) and `BETTERMAN_INGEST_PAGE_BATCH_BYTES` (default 8 MiB) bound each page upload request. The Linux container receives each one, by name, when it is set on the host.

The ingest command parses man pages locally/in-container, creates a Convex release, stores full page content in Convex file storage, batch-inserts page metadata/search documents, and activates the release pointer for the configured stage when `--activate` is set.

Optional: `BETTERMAN_INGEST_WORKERS` sets the number of parse processes, clamped to 1–8 and defaulting to the CPU count up to 8. `1` parses sequentially. Output order and page ids do not depend on it.

## Large releases and recovery

Ingest contract **7** must be deployed before this client writes. Release
provenance is a JSON file in Convex storage, referenced from `releaseManifests`;
page views read only the small release row. Page-upload counters use 16 shards;
sealing folds their per-section counts in one bounded verification transaction,
avoiding a write to the same release/stat row from every upload worker. Package declarations use digest-bound
batches of 200 (`/ingest/license-packages`). Creation commits the batch digests,
counts and license requirements. Missing batches block activation; replaying an
identical batch is a no-op and changing its payload fails. The small legacy
internal mutation path remains available for existing fixtures.

Parsing writes document bodies to a temporary SQLite spool with an 8 MiB cache.
Only source/route/package references remain in memory. A second pass resolves
links and streams page batches. Parse futures are bounded to twice the process
count; upload futures are bounded to the upload worker count. License text is
also spooled and validated in a first pass before any release upload. Temporary
files are removed on success or failure; allow disk space for the parsed bodies
in addition to source archives.

`BETTERMAN_INGEST_UPLOAD_WORKERS` defaults to **4**, capped at **8**; `1` keeps
serial uploads. The existing page-count and exact-byte limits still apply per
request. These variables are forwarded through the curated Docker path.

Activation polls for up to 45 minutes, configurable with
`BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS` (positive, at most 2700; validated before any work). Each
request is short; the server persists and schedules batches of 500 link rows.
A failed/canceled job resumes its cursor for the same metadata version. Until
all work completes, the previous pointer stays active. A timeout or disconnect
does not require another parse/upload. With the same local/deployment environment
already configured, resume the **same release and intended stage**:

```bash
pnpm ingest:activate --release-id '<uploaded-release-id>' --stage staging
```

The contract check runs before this command writes. It reports success only for
`pending: false` and the requested release ID. For a rollback use the explicitly
authorized `prod` stage and saved rollback ID as described in the runbook.

`pnpm ingest:scale` is an opt-in synthetic benchmark. It requires this worktree's
`.convex/local/default/config.json`, matching loopback URLs in `.env.local`, and
the local ingest secret `bm2-scale-local`; it accepts no deployment URL. Start
`pnpm convex:dev` and set that secret on the verified local deployment first.
It uploads 20,000 pages and declares/uploads notices for 17,300 packages, then
activates only its local fixture. It refuses to replace an unrelated local
Debian pointer. The report is `.perf-results/ingest-scale.json`; `--output` can
select another path. Measurements are synthetic, not a Debian throughput or
billing guarantee. See [PR 1 evidence](../docs/roadmap/b1-scale-evidence.md).

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
git show <baseline-commit>:ingestion/ingestion/mandoc_parser.py > /path/to/baseline_parser.py
PYTHONPATH=ingestion ingestion/.venv/bin/python ingestion/scripts/audit_fidelity.py \
  --cache /path/to/cached-html --baseline /path/to/baseline_parser.py \
  --output /path/to/audit.jsonl
```

Run this command from the repository root, using a baseline parser snapshot and
`<cache>/<distro>/html/*.html.gz`. JSONL records include source/body and per-definition
findings, whitespace-boundary diagnostics, and baseline/candidate ID, TOC, option,
and plain-text comparisons. Exact token equality covers every page. Above 40,000
tokens, diagnostic alignment uses equal spans as anchors before refining smaller
differences; any unresolved partition is reported explicitly. A nonzero exit means
residual fidelity findings or read/parse errors, not a skipped corpus. Source
normalization removes only recognized list markers; other differences remain visible.

Generated util-linux/Asciidoctor and systemd option definitions use a formatted
flag paragraph followed by an indented description. The parser recognizes that
structure without a Generator comment, rejects prose/examples and nested argument
values, and defers new anchors so existing IDs keep their names. The mount, su,
systemctl, and lsblk excerpt fixtures cover these layouts. Literal bullet prefixes
inside indented blocks are removed because those blocks already render a list marker.
Reference-only definition bodies are cross-reference indexes, not option descriptions.
The generated reference-index and option-forms fixtures cover that exclusion, raw
enum/optional arguments, bare separators, and config entries paired with CLI aliases;
only the CLI spelling is indexed for mixed terms.

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


The activation timeout is validated at CLI startup and client construction.
CI records `BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS` before setup from the platform
job limit (Linux 300 minutes, FreeBSD 90, macOS 60), reserving three minutes for
reporting/promotion. Activation caps the configured wait by the actual time
remaining after parse/upload. The deadline is forwarded unchanged into Docker
and the FreeBSD VM. Standalone CLI runs without that variable retain the
45-minute cap; set it to an absolute Unix timestamp when supplying a job budget. Resume a timed-out release with `pnpm ingest:activate`; three failed attempts
at one hydration cursor require operator repair and explicit re-arming as
described in [the operations runbook](../docs/runbooks/multi-distro-ops.md#deploy-and-activation-recovery).

## Generated layer

`ingestion/generated/` builds the man page brief: the page's own EXAMPLES,
verified tldr-pages examples and model text, keyed by content hash and written
through `/ingest/generated`. It runs after a release exists, from the
`generated-layer` workflow or by hand:

```bash
uv run python -m ingestion.generated.cli fetch-tldr --dest /tmp/tldr
uv run python -m ingestion.generated.cli coverage --cache /path/to/cache --tldr /tmp/tldr --distro debian
uv run python -m ingestion.generated.cli run --source cache --cache /path/to/cache --tldr /tmp/tldr --dry-run --out records.jsonl
```

`coverage` and `--source cache` read `<cache>/<distro>/html/*.html.gz` and need
no Convex deployment. `--source convex` reads the active release through the
ingest secret. Model calls need `OPENCODE_GO_API_KEY`; without it, model text is
only estimated. Design, verifier rules and cost model: `docs/generated-layer.md`.
Operations: `docs/runbooks/generated-layer.md`.

## Full Debian from archives

Full archive ingestion is **off by default**. `pnpm ingest:run --distro debian`
uses the existing curated Docker path, just like Debian samples and other distros.
Only `--debian-full` selects the native archive pipeline. It requires Python 3.14
(including standard-library zstd support) and host `mandoc`. The documented
benchmarks below write only an explicitly selected worktree-local deployment;
shared execution requires owner approval.

The monthly workflow has two independent switches:

| Invocation | Full import opt-in | Promotion |
| --- | --- | --- |
| Cron | Repository variable `BETTERMAN_DEBIAN_FULL=1` | Held unless `BETTERMAN_DEBIAN_FULL_PROMOTE=1` |
| Manual dispatch | `debian_full: true` input; repository import variable is ignored | With the promotion variable off, requires a separate `ingest: false, promote: true, debian_full_promote: true` dispatch |

Both import controls default off/unset. Default dispatches and cron use curated
Debian, which retains its existing promotion behavior. Even `promote: true` on a
full ingest dispatch cannot combine the first full ingest and promotion while
the second variable is off. Flip the second variable only after the owner has
reviewed the first full release and approved recurring full promotions. No
switch or shared deployment was changed while implementing this pipeline.
Promotion-only recovery skips an actual full-Debian staging pointer unless
`debian_full_promote: true` (default false) or the promotion repository variable
is exactly `1`. This check happens atomically with pointer promotion, including
when the import switch is off. Held Debian logs a clear skip; other distros
continue. Non-`1` values, including an explicitly empty value, warn and stay off;
raw values are never printed.

`data/debian-trixie.json` pins snapshot, suite/component/architecture and the
Release SHA256. Verified Release SHA256/size entries bind Contents-all,
Contents-amd64 and Packages.xz, which bind every archive filename/version/size/SHA256.
English root manuals and the existing OpenJDK roots are selected. Other private
roots (PostgreSQL, Firebird, Groovy, IcedTea-Web, librarian-puppet and Scala)
require a per-package path in `data/debian-private-manuals.json`. This audited
allowlist records the pinned Release/archive/control-script hashes and paths
registered by literal manual slaves or the modeled PostgreSQL/Groovy/IcedTea
helpers. Both selection and extraction enforce it; a new Release or package
hash requires an updated audit. A root regex alone never authorizes these pages.
The list contains 329 paths across nine packages: PostgreSQL 295, Firebird 24,
Groovy 3, IcedTea-Web 1, librarian-puppet 1 and Scala 5. Unregistered Firebird
`fb_config` and five Groovy pages are excluded; the public `fb_config(1)` stays
owned by `firebird-dev`. Nothing is installed and no maintainer script executes.
The curated package pass also captures runtime postinst data when a command's manual lives
in another package (vim/vim-tiny and vim-common) or is absent (G++). These runtime
packages must participate in elections even without owning a manual in Contents.
Nothing is installed.

`control.tar` postinst scripts are read as text, never executed. The bounded
static parser recognizes literal `update-alternatives --install` registrations
only as a simple command's command word. It excludes heredoc bodies and
`echo`/`printf` arguments. Literal variables/loops/wrapper calls and checked
OpenJDK/xz templates are supported. Values assigned only in some conditional
branches stay unresolved after the branch joins. Unknown expressions are
skipped with package/line/reason evidence.

### Provider election

A package-owned manual wins over a generated alternative only for an exact-case
basename match. A case-only variant stays an explicit provider: lowercase ftp
follows tnftp, uppercase FTP and `?pkg=ftp.app` serve GNUstep's manual. Original
spelling is retained in source paths; request case survives HTML/API/text/OG.
Direct-file collisions rank by pinned popcon installed count, then package name
and source path. For alternatives elections, treat Debian's `required`/`important`/`standard` Priority values
as one installed-by-default group. Pick its highest alternatives priority,
with pinned popcon `by_inst` breaking ties, as update-alternatives would on a
default install. Only if that group is absent, rank by popcon then alternatives
priority. Existing awk/vi/nc policy preferences break exact
remaining ties only. Elect before resolving documentation: an undocumented
winner suppresses the alternative route, with no fallback to a less-installed
provider. GCC/G++ therefore suppress `cc`/`c++` when their manuals are absent
from main. Binary masters need a unique exact-basename manual in the same
package; archive-owned executable symlinks may prove a shared target (clang++
and clang). Binary contents are never extracted or executed.

The bundled `popcon-by-inst.tsv.gz` contains a fixed, checksum-verified public
`https://popcon.debian.org/by_inst` snapshot. The lock records source and normalized
hashes and acquisition date. Runtime never fetches mutable popularity data.
`pnpm ingest:debian-pin-popcon` deliberately refreshes it: review and commit the
lock/data together. Normalization keeps package/inst columns, sorts by package,
and writes gzip with empty filename, mtime zero, compression level 6. Refresh
Release pins only after verifying Debian's signed archive metadata, not to bypass
an integrity failure.

Archive links remain SQLite records; only hashed regular documentation files
are written. Sources and expanded inputs have a 16 MiB cap. Same-package links
resolve first, then indexed owners; cross-package directory links and missing
owners are resolved on demand. Exact `SOURCE_TARGETS` repairs document four pinned
packaging mismatches. Mandoc runs in a fresh empty temporary directory. After
safe archive include expansion, remaining executable includes are rejected,
including conditional bodies and command aliases. The scanner tracks the current
control, no-break control and escape characters through `.cc`, `.c2`, `.ec`,
`.eo` and resets. An old control character becomes text; escapes-off makes
`\*` literal. Literal strings are tracked and checked when expanded in request
positions, while macro definitions are scanned under their current syntax.
Syntax changes alone do not reject real pages. Ordinary macro prose and
interpolation in formatting arguments remain text. Literal documentation such
as `.B .so` is retained. The optional groff-only
`www.tmac`/`pic.tmac` requests are omitted without reading host macro files.
The empty cwd is the primary boundary against accidental relative host includes;
the source checks are defence in depth. A temporary cwd is **not an OS filesystem
sandbox** and does not revoke access to absolute paths. Explicit unresolved
includes are refused before spawning mandoc. Regression tests independently
check the empty cwd/parent sentinel and the request checks. The current cached
2,000-package audit rejects **0/13,243** renderable owner sources, and the expanded
provider/dependency audit rejects **0/13,423**. The full parser replay also has
zero failures; sqlite3, nomarch, mjpegtools and tio all render. See the evidence
and full Contents case-collision report.

Bare `.so` stubs and manual symlinks/hardlinks whose target has another route
register redirect aliases. They create no duplicate canonical page or search
row. `manPageAliasProviders` retains every source/package/target provider;
`manPageProviders` retains alternate real pages. Provider counters cover both.
`?pkg=` selects a bounded Debian package name on HTML/JSON/text/OG; invalid values
are ignored before persistent cache keys. A redirect can carry its actual target
package. Same-package case/path variants remain stored and select their first
original path. B10 #402 owns the switch UI. Canonical browse/search/sitemap reads
stay on the existing tables.

Copyright files are resolved from the selected archives and every published
provider's package, including linked doc directories. Missing/blank or oversized
notices block publishing and are never truncated. Required curated command pages
and the two-percent parse/unresolved-source gate still apply. Archive publishing
also requires each actual canonical/alias owner to be the full-archive expected
package, a transitive Depends/Pre-Depends dependency, or a virtual-name provider. The existing explicit
`util-linux` → `mount` companion request from `apt_install` remains accepted;
other diagnostic owner hints grant no authority. Ownership checks consume the
finalized canonical/alias-target publication map, so candidate input order and
alias registration-package identity cannot change the checked owner. Providers
satisfy only virtual names absent from the real Packages catalog; make-guile's
`Provides: make` never satisfies the real make package. Exact sections take
precedence over suffixes such as `ls(1plan9)`. Wrong ownership blocks before any
upload and is not covered by the missing-page escape hatch.

The curated apt package pass requests netcat-openbsd, but the full archive corpus
contains netcat-traditional too. Its `standard` Priority wins the default-installed
group under the existing election policy; the OpenBSD preference breaks only
remaining ties. Full imports therefore require netcat-traditional for canonical
`nc(1)`, while retaining netcat-openbsd and ncat as explicit alternate providers.
This is a full-archive expectation, not permission for any package that Provides
netcat. The [full-competitor audit](../docs/roadmap/b1-debian-nc-owner.md) records
all curated owner differences and the second staging rehearsal.

### Acquisition checkpoints and runner measurements

Production archive acquisition uses a persistent pin-keyed workspace under
`.cache/debian/`, or `BETTERMAN_DEBIAN_WORKDIR/<lock-sha256>`. Completed extraction
receipts bind package SHA256, extractor version and retained files. A failed
process retains completed packages; restarting on the same workspace fetches
only missing/invalid packages. Parse/publish spools are temporary and rebuilt;
uploaded release activation remains separately resumable through `ingest:activate`.

`BETTERMAN_DEBIAN_CACHE_DIR` selects an external-to-spool, SHA256-named archive
cache (2 GiB LRU by default; `BETTERMAN_DEBIAN_CACHE_MAX_BYTES` accepts 1–2 GiB).
Total retained extracted files have a separate 4 GiB ceiling, counting existing
and partial files, replacements and concurrent writes. Reservations happen before
writes under one shared lock. `BETTERMAN_DEBIAN_EXTRACTED_MAX_BYTES` can lower
this to at least 16 MiB, but cannot raise it past 4 GiB. Exhaustion stops acquisition
with completed receipts retained. Free-space checks remain an additional guard.
Every cache hit is rehashed and size-checked. Restored archives are consumed
before fresh downloads can evict them. Release, Contents and Packages still
come only from the pinned snapshot. Archive payloads try `deb.debian.org` first,
bound to the pinned Packages SHA256 and size. On the CDN leg, any HTTP error,
transport failure, checksum mismatch, oversized body or cleanly truncated body
is discarded before switching immediately to the pinned snapshot. A CDN
Retry-After (including values over fifteen minutes) does not delay another host.
The snapshot leg stays fail-closed on integrity errors and retains the bounded
Retry-After/backoff policy for retryable transport/HTTP failures. It never
publishes invalid bytes. There remain two workers, eight total attempts per
file, and the absolute job deadline.

Set `BETTERMAN_DEBIAN_CDN=0` to disable the CDN leg entirely; unset/empty or `1`
uses CDN-first. Other values fail before acquisition. This affects both normal
full imports and `--download-only`. The workflow benchmark uses that same
Workspace acquisition code and defaults to CDN-first; no workflow variable was
changed. Its report includes `cdnEnabled` and `archiveFallbacks`. Each fallback
logs only `deb_archive_fallback` and a bounded reason code (no URL/body), and
progress/completion summaries count fallbacks. Redirects are HTTPS-only and
same-host on `deb.debian.org` or `snapshot.debian.org`, including snapshot's
`/file/<sha1>` redirects. The downloader's User-Agent includes the published
project contact address.

The workflow restores and saves only verified `.deb` files under one stable
`debian-debs-<Release SHA256>` key, without run IDs or broad restore prefixes.
An always-run save step can preserve successful files after a recoverable failure.
GitHub cache entries are immutable: the first saved bounded subset for that
Release/branch remains the reusable snapshot; later attempts do not replace it.
No new 2 GiB entry is created per run. A new Release gets a new key; GitHub's
repository-wide 10 GB LRU quota evicts old keys. Old run-ID keys from this draft
are not reused and may be removed by the owner or age out. Local archive LRU
eviction skips in-use files. It never caches trusted
extracted SQLite state. A fresh runner reuses retained cache files and re-extracts
them; evicted files are downloaded again. The 18+ GB full archive set cannot be
kept in a 2 GiB cache or a 14 GB runner, so cross-runner reuse is bounded, not a
promise that an entire interrupted full job survives a new VM. Abrupt VM loss
can prevent the final cache save; the same-runner checkpoint is the stronger
guarantee. Source/body queues and acquisition remain bounded.

```bash
pnpm ingest:debian-benchmark --workdir /absolute/path/to/sample --packages 2000 --workers 2
```

This defaults to acquisition/parsing only. `--local-upload` additionally requires
this worktree's matching loopback Convex configuration, refuses deploy keys, and
writes `local-upload.json`; never point it at a shared backend. `--download-only`
cannot be combined with upload and never creates a Convex client.
`--audit-alternatives` extends the fixed sample with the competing providers
listed in the evidence, elects routes, and audits renderable sources against the
roff checks. It also performs no Convex writes and records every rejection.

`--audit-command-pages` scans complete verified Contents and Packages metadata,
acquiring all exact command/manual competitors, virtual co-providers, executable
families for commands without a literal manual basename (including all nc
variants), and supported private-root packages. It replays
parsing and the exact publish command gate, verifies provider copyrights, and
writes `command-pages-audit.json`. It creates no Convex client. Every curated
package is reported as present, excluded with its reason, or non-command.
Use a dedicated workdir (the `--packages` value must match on workspace reuse):

```bash
pnpm ingest:debian-benchmark --workdir /absolute/path/to/audit --packages 1 --audit-command-pages
```

Acquisition progress separates elapsed time from summed download/extraction
worker seconds and reports cache hits. It collects completed tasks first to
keep both workers occupied; parser ordering is unchanged. Parse, metadata,
pages, aliases, licenses and activation emit phase timings for runner audits.

The workflow's `debian_download_only: true` dispatch runs that acquisition-only
mode for 2,000 packages in a separate job with no production environment or Convex
secrets. It suppresses normal ingest/promotion regardless of their default inputs.
It is prepared for an owner-authorized runner measurement and **was not run**:
runner measurements count as shared execution. The [evidence document](../docs/roadmap/b1-debian-evidence.md)
contains local results, audit dispositions and projections.

Contract **v7** retains the merged v4 license batches, extractor provenance,
packed signatures, symbols and optional-argument metadata with real/alias
provider declarations from v5, verified staging-source reads and CAS promotion
from v6, adding B4 demand fields. Promotion requires the matching v7 header; optional dispatch
`expected_release_ids` pins inspected releases through queue waits. The generated
layer keeps its separate **v3** contract.
The single TS/Python alignment test and bidirectional mismatch tests guard deploy
ordering. All provider and symbol tables are in the schema-checked release-child
registry; derived dependency pins protect pruning. Deploy the combined Convex
contract before ingestion. Do not deploy during update-docs.

Alternate reads retain their own content-hash generated brief, without borrowing
canonical portability/history. Alias redirects preserve the target package,
including name-only redirects. Shared full-Debian switches remain explicit and
were not enabled during integration.

## Index-by-demand

Every release computes demand scores and tier membership from pinned popcon
and optional aggregate pageviews. See the [B4 runbook](../docs/roadmap/b4-index-by-demand.md)
for thresholds, monthly evaluation, `BETTERMAN_PLAUSIBLE_COUNTS`, deployment
ordering and the required fresh v7 ingestion before full-Debian promotion.

Existing unscored prod releases retain all-page indexing and sitemaps. Full-Debian
releases without a tier may activate staging but fail prod activation/promotion
with `FULL_DEBIAN_TIER_REQUIRED`, including with owner authorization. The in-flight
v5 full-Debian release needs a fresh scored replacement. B4 uses ingest v7,
retaining #443's CAS request, fixed-source read, header fence and dispatch pins
alongside demand fields.
