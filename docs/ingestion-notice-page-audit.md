# Full-import notice and page-size audit

Baseline: `c22313675be81e8a1fc50c44c631da2a9d749084`, ingest contract v9.
Investigated [staging run 41225646909](https://github.com/amanthanvi/BetterMan/actions/runs/41225646909),
2026-10-31 17:40 UTC. No upload, deployment, workflow dispatch or package script
was used in this investigation.

## Notice links

The shared extractor retained notice links but discarded regular targets outside
its notice/manual predicates. Resolving those entries raised an anonymous fatal
error, even when the same verified package contained the target. The error now
names `package:path -> normalized-target`.

The audit uses pinned Fedora 44 repomd/primary/filelists and Arch's pinned
2026-10-01 `.files` catalogs. It checks the complete archive's SHA256 and size
before inspecting RPM payload headers (libarchive-to-tar, no installation) or
Arch tar members. `.files` supplies candidate paths, never presumed link targets.
Each inspected package has a checksum-keyed audit receipt; the summary reports
errors rather than treating inaccessible archives as negative results.

| Distro | Eligible manual packages | Packages with indexed notice paths | Verified archives | Packages with blocked notices | Blocked links |
| --- | ---: | ---: | ---: | ---: | ---: |
| Fedora 44 | 9,968 | 6,145 | 6,145 | 1 | 1 |
| Arch 2026-10-01 | 3,714 | 1,453 | 1,453 | 4 | 8 |

Fedora's eligible count excludes the two already-pinned `malcontent` packages;
the catalog has 9,970 manual-owning packages before those exclusions. The Fedora
candidate archives total 12,356,360,821 bytes; Arch's total 13,562,554,179 bytes.
Packages without indexed notice paths cannot produce a retained blocked notice
entry under the current extractor. These counts cover eligible manual owners,
not every non-manual source sibling or dependency that might later be acquired.
Both audits completed with zero verification errors.

The observed links all point directly at regular files in their own archives:

- Fedora `reuse` `0:6.2.0-2.fc44`: `usr/lib64/python3.14/site-packages/reuse/resources/licenses.json.license`
  → `usr/lib64/python3.14/site-packages/reuse/resources/exceptions.json.license`.
  RPM SHA256: `08927456787392adf2a30866ef3ab55f64e170d977013d892192fba542c65133`.
- Arch `ardour` `9.8-1`: `usr/share/licenses/ardour/LICENSE.{beats,chords,progressions}`
  → the corresponding `usr/share/ardour9/media/MIDI {Beats,Chords,Progressions}/LICENSE`.
  Archive SHA256: `1ff9de219d0bf833c31b192cdca807893bb6c2a54f57ef1c77ce09b34163ff41`.
- Arch `root` and `root-cuda` `6.40.04-1`: each has `fonts/LICENSE` and `js/LICENSE`
  beneath its `usr/share/licenses/<package>/`, pointing to
  `usr/share/root/{fonts,js}/LICENSE`.
  Archive SHA256s: `3d11a9cc4296f67fda5741d2505db5248200beb183faf7c8fddc28964c6af4c6`
  and `cd83fcae14fa4b3eb6043eb2bcd3be10da9797fabe908e97fd363a90f1951ed8`.
- Arch `steam` `1.0.0.87-3`: `usr/share/licenses/steam/steam_subscriber_agreement.txt`
  → `usr/share/doc/steam/steam_subscriber_agreement.txt`.
  Archive SHA256: `3b59b784d238b6087d38bafa30ae38f4c9e656fb4330860575391c1bf37046ea`.

A second pass over the same verified archive now retains only exact regular-file
targets, under the existing extracted-file quota and 16 MiB source cap. Receipt
version 9 invalidates old extractions. No filesystem link is created; #485's
archive-root normalization is unchanged. Outside the existing documentation
roots, link chains, hardlink targets, special files, duplicate target members,
missing targets and unreadable compressed targets conservatively remain gaps.
They never cause a host read or a search through another package.

Fedora/Arch/Alpine record these under `packages[].noticeLinkGaps` alongside
`unmatchedLicenseIdentifiers`, show them in the license text, and try other
notices before #489's declared-license standard texts. A package with neither
notice nor standard text keeps #489's visible warning and recorded identifiers.
Readable directory/cross-package links within the existing documentation roots
retain #488 behavior. [The Arch follow-up](roadmap/b2-arch-missing-notice-evidence.md)
also records dangling notice-file links within those roots after resolution;
top-level directory aliases keep their existing fallback rules. Debian/Ubuntu
copyright checks remain strict.

## Alpine salt(7)

Verified `salt-doc` `3007.9-r0`, archive SHA256
`fd989e356423a62d065e74392b774cc36eebafb70f613bbae47f776a7eca19f3`.
Its APK control checksum and compressed-data SHA256 were checked before parsing.

| Measurement | Bytes/count |
| --- | ---: |
| Archive | 3,388,122 bytes |
| Decompressed `salt.7` roff | 15,431,448 bytes |
| Parsed document JSON | 36,695,522 bytes |
| Single-page HTTP request, empty resolved-link list and release ID `audit` | 36,750,052 bytes |
| Escaped stored-content blob (same serialization as `serializeStoredPayload`) | 42,413,540 bytes |
| Stored JSON string code units | 42,410,835 |
| Minimum simultaneous string plus UTF-8 digest-input bytes | 84,824,375 bytes |
| Convex HTTP-action RAM | 67,108,864 bytes (64 MiB) |
| Document blocks / TOC entries | 39,307 / 6,804 |

The [documented Convex limits](https://docs.convex.dev/production/state/limits)
state 64 MiB RAM for the Convex runtime, 16 MiB function arguments, a 1 MiB
document cap, and no separate HTTP request-size limit. Here the content is
stored as a blob and removed before the internal page mutation. Consequently
neither the document cap nor the mutation's argument size explains this payload.
The action retains the serialized string while allocating its UTF-8 digest
input: those two representations alone exceed 64 MiB, before the AST, request
body or intermediate strings. A local Node replay of this exact preparation
measured 264,675,536 heap bytes after GC (Node is corroboration, not a deployed
Convex measurement). No local Convex deployment or production logs were used.

The old batcher sent an over-budget singleton anyway, leaving the HTTP action
to fail and the client to retry the same deterministic oversized request. The
shared parser now rejects escaped storage JSON above 8,388,608 bytes (8 MiB)
before spooling. That is a conservative ingestion budget, not a claimed Convex
blob-size limit. It names the page/path/size and counts against the existing
2% archive parse gate. The content is never truncated. Contract v9 stays intact.
A server implementation for larger pages would also need to bound the memory
used preparing and reading those blobs; increasing a batch threshold cannot do
that.

Debian and Ubuntu use the same parser/storage path. Their earlier successful
imports establish success for those payloads, not a size invariant: the 16 MiB
source limit permits AST/escaped-JSON expansion well above the action's RAM.
The new guard covers both distros and translated imports as well.
Their pinned, Release-checksum-verified package indexes were also checked:
Debian trixie's `main` and Ubuntu noble's `main`/`universe` contain no `salt`,
`salt-common` or `salt-doc`; the only `salt*` package is `salt-pepper` `0.5.5-1`.
Thus those snapshots avoid this particular enormous manual by package selection,
not because their upload path safely handles it. Release SHA256s are
`ed56aac47e7911e65ee63aae8d67e29f20e023f840e49f8ed037043a33de138a`
(Debian) and `26758a13cecfaff9ff274d31ea9a4633674a999bd130c09f6ecd66a4b8071184`
(Ubuntu), as committed in the distro pins.

## Rehearsals and verification

Run from the repo root, each work directory initially empty:

```sh
pnpm ingest:notice-audit --distro fedora --workdir ../.local/notice-page-audit/fedora --workers 32
pnpm ingest:notice-audit --distro arch --workdir ../.local/notice-page-audit/arch --workers 16
pnpm ingest:full-benchmark --distro fedora --workdir ../.local/bench-fedora-reuse --package reuse
pnpm ingest:full-benchmark --distro arch --workdir ../.local/bench-arch-ardour --package ardour
pnpm ingest:full-benchmark --distro arch --workdir ../.local/bench-arch-root-steam --package root --package root-cuda --package steam
pnpm ingest:full-benchmark --distro alpine --workdir ../.local/bench-alpine-salt --package salt-doc
pnpm ingest:lint
pnpm ingest:test
pnpm ops:test
```

The commands execute Python from `ingestion/`, so `../.local` denotes the repo's
local artifact directory. Audit receipts allow interrupted runs to resume.
The completed run's reports, receipts, payload and check logs are retained in
the ignored `.cache/b2/notice-page-audit-20261101/` directory. Stored extraction
paths were updated and every retained file checked after moving the artifacts.

- Fedora `reuse`: passes, eight pages; its retained target participates in notice collection.
- Arch `ardour`: passes, one page and one package notice collection, no failures,
  no unresolved sources, and all three formerly-blocked targets retained.
- Arch `root`, `root-cuda`, `steam`: passes, 27 pages and three package notice collections,
  no failures or unresolved sources.
- Alpine `salt-doc`: 13 pages accepted, exactly one named size failure for
  `salt(7)`, zero unresolved sources. The bounded rehearsal intentionally exits
  1 because it reports every parse failure. A 1/14-only-package rehearsal would
  fail the 2% gate; in the reported full Alpine corpus one page is about 0.0023%.
- Red→green regressions cover the named blocked error, same-package regular
  target (both archive orders), cross-package gap, standard/no-standard policy,
  manifest/display, special/compressed targets, and the pre-upload parse gate.
- Final full pytest: 1,216 passed, 89.58% coverage. Ruff check and format passed;
  ops tests: 124 passed. No Convex source changes or Convex tests.

Full Fedora/Arch/Alpine publishing, a Convex backend replay, full Debian/Ubuntu
reimports and independent review remain outside this local verification. The
lead sequences merge/deploy and the next staging import.


## November 8 review fixes

Pulled lead head `9cd613a7342db9d1272d1071c48c8524b5d894e2` before this fix
round; the link-resolution growth reserve and atomic audit receipts remain.

The original audit's “regular file” classification included zero-byte members.
A fresh checksum-verified download of the pinned Fedora `reuse` RPM reproduces
libarchive converting the deferred-data CPIO hardlink set into a zero-byte
regular `exceptions.json.license` followed by a tar hardlink
`licenses.json.license`. The current conversion loses the data on that path.
This fix takes the conservative minimum: a linked notice resolving to empty or
whitespace-only text records the original link and resolved target as a gap,
then uses other notices or the standard-text policy. It does not claim to
recover RPM hardlink-set data. The real `reuse` package still yields 79,871 bytes
of other notices and now records the missing linked notice. The same loss also
exists for in-root hardlinked notices on main; the shared collector now records
those blank linked results too. Direct blank files keep their existing fallback.
Tests cover both locations, empty and whitespace targets, and an actual CPIO
hardlink set passed through the same libarchive conversion.

JVM `MAN_PATH` entries are excluded from `notice_targets` and from conversion to
`notice-file`. A `usr/lib/jvm/<jdk>/man/man1/license.1` link outside the manual
roots stays blocked, rather than returning raw roff and bypassing include
resolution. Extraction receipts advance from 8 to 9 to invalidate the prior
retained-manual shape; ingest contract v9 is unchanged.

### Second-pass trust boundary (documentation only)

Both extraction passes reuse the same archive: Arch and Alpine rewind their
verified open handle; Fedora reopens the same verified archive path through
libarchive. The second pass does **not** recompute the checksum. Verification
happens before extraction, and this relies on the cached file remaining unchanged
between passes. No re-verification or other trust-boundary change is introduced
in this fix round.

### Debian/Ubuntu size audit

Package owners came from the pinned, Release-verified Contents indexes, rather
than a guessed list of package names. Every eligible manual-owning package was
then downloaded into a new temporary directory and checked against its pinned
archive SHA256 and size before scanning data-tar headers. The ranking is by
**decompressed regular man-source bytes**, not total package size and not guessed
from the manual's name. Symlink/hardlink aliases do not add another physical
source to this ranking. English and registered private/JVM sources use the same
`manual_registered` predicate as ingestion.

The audit retains and parses every source at least 128 KiB, reporting the shared
`_stored_page_size` result, including the lead's link-resolution growth reserve.
The guard calls that same function, so measurements do not duplicate its size
formula or weaken acceptance. Parse refusals are reported separately. This is
an exhaustive source-size ranking and a measurement of all large sources; it is
not a replay of publishing or a mathematical expansion bound for every smaller
roff file.

Debian trixie: 17,323 verified package entries, 111,064 regular manual sources;
274 sources at least 128 KiB. No archive-verification errors. All ten largest
sources parse and fit the 8,388,608-byte guard:

| Package | Manual | Source bytes | Guard bytes (including reserve) |
| --- | --- | ---: | ---: |
| `python-petsc4py-doc` | `petsc4py(3)` | 2,514,197 | 5,548,135 |
| `libimage-exiftool-perl` | `image::exiftool::tagnames(3pm)` | 2,246,494 | 2,440,134 |
| `ffmpeg` | `ffmpeg-all(1)` | 2,094,229 | 5,214,104 |
| `python3-ezdxf` | `ezdxf(1)` | 2,087,370 | 5,623,766 |
| `rclone` | `rclone(1)` | 1,832,035 | 3,683,646 |
| `toil` | `toil(1)` | 1,697,804 | 5,318,495 |
| `ffmpeg` | `ffprobe-all(1)` | 1,642,533 | 4,058,052 |
| `ffmpeg` | `ffplay-all(1)` | 1,631,100 | 4,032,804 |
| `perl-doc` | `perltoc(1)` | 1,440,982 | 3,294,564 |
| `fish-common` | `fish-doc(1)` | 1,210,502 | 2,842,118 |

Among all 274 large Debian sources, the largest guard result is `ezdxf(1)` at
5,623,766 bytes; none exceeds 8 MiB. `units(1)` is the sole scanner refusal
(`Unresolved dynamic roff include request`), independent of the size gate.
`gcc(1)` does not ship in this pinned Debian main catalog; the scan includes
all registered actual package-owned sources. Per-source package versions,
archive digests, paths and measurements are retained in the task artifacts.

Ubuntu noble: 18,389 verified package entries, 111,127 regular manual sources;
562 sources at least 128 KiB. No archive-verification errors. Its ten largest
regular sources and guard sizes are shown below. Equal-size GCC variants use
path/package name as a stable tie-breaker.

| Package | Manual | Source bytes | Guard bytes (including reserve) |
| --- | --- | ---: | ---: |
| `platformio` | `platformio(1)` | 4,580,362 | 9,615,044 |
| `libimage-exiftool-perl` | `image::exiftool::tagnames(3pm)` | 2,167,119 | 2,355,722 |
| `ffmpeg` | `ffmpeg-all(1)` | 1,974,159 | 4,916,573 |
| `python3-ezdxf` | `ezdxf(1)` | 1,891,088 | 5,233,418 |
| `rclone` | `rclone(1)` | 1,835,240 | 3,683,634 |
| `ffmpeg` | `ffprobe-all(1)` | 1,580,259 | 3,918,764 |
| `g++-14-aarch64-linux-gnu` | `aarch64-linux-gnu-g++-14(1)` | 1,577,947 | 4,724,424 |
| `gcc-14-aarch64-linux-gnu` | `aarch64-linux-gnu-gcc-14(1)` | 1,577,947 | 4,724,424 |
| `g++-14-alpha-linux-gnu` | `alpha-linux-gnu-g++-14(1)` | 1,577,947 | 4,724,424 |
| `gcc-14-alpha-linux-gnu` | `alpha-linux-gnu-gcc-14(1)` | 1,577,947 | 4,724,424 |

`platformio(1)` in `platformio` `4.3.4-3` is the only measured source above 8 MiB:
9,615,044 bytes. Archive SHA256:
`a15bdb15cbbccfa758478b11c37ea86f17ecfc008ef52a3188dbde7c86ec97a7`.
**The 8 MiB guard will exclude this page at the next import**, recording its
name, path and size in `parseFailures` and counting it against the 2% gate.
No content is truncated. The size limit remains unchanged; this compatibility
cost is explicit rather than claiming every currently-published page fits.

A Node 26.5.0 replay prepared the exact 9,615,044-byte stored blob through the
same JSON serialization, UTF-8 digest and Blob allocation steps. The request
string was not retained after parsing. With `--max-old-space-size=64`, the replay
completed, but sampled heap plus external memory reached **73,661,761 bytes**;
heap plus ArrayBuffers reached **66,330,730 bytes**, leaving only 778,134 bytes
against 64 MiB, before accounting for differences in Convex's function code and
host allocations. Node's old-space cap is not a cap on total runtime memory.
These measurements do not establish a safe higher bound for Convex's total
64 MiB RAM. Keeping a named per-page exclusion is the conservative outcome under
the current memory budget. This is a local V8 replay, **not a Convex backend
failure reproduction**, and the page's current production state was not queried.
Serving it at the next import safely needs a separate change to the action's
allocation/streaming path or evidence from the actual backend before raising
the guard. This round neither changes the contract nor changes server code.

The other large Ubuntu sources fit. `units(1)` is the only audit scanner refusal,
independent of size. The full top-ten tables are based on every eligible archive;
the payload compatibility statement covers the 274/562 measured large sources,
not a full parse/publish replay of the smaller sources.

Fix-round checks: `pnpm ingest:lint` (Ruff check and format) passed;
`pnpm ingest:test`: **1,227 passed, 89.69% coverage**;
`pnpm ops:test`: **125 passed**. The exact final regression cases fail against
`9cd613a7`'s functions and pass with this change. The CPIO/libarchive integration
reproduction also passes locally (it skips only where bsdtar is absent; the
converted-tar gap regressions have no external-tool dependency).
The refreshed no-upload Fedora `reuse` benchmark passes eight pages, preserves
its other notices and shows the named gap. The lead supplied an independent Opus
review reporting no P0/P1; no new independent review was run for this fix round.

Reproduce without uploads:

```sh
pnpm ingest:page-size-audit --distro debian --workdir <new-directory> --workers 24
pnpm ingest:page-size-audit --distro debian --workdir <same-directory> --measure --workers 4
pnpm ingest:page-size-audit --distro ubuntu --workdir <new-directory> --workers 32
pnpm ingest:page-size-audit --distro ubuntu --workdir <same-directory> --measure --workers 4
```

Reports and checksum-keyed receipts are under the ignored
`.cache/b2/notice-page-fix-20261108/{debian,ubuntu}/` directories. Both source
scan and measurement receipts are atomically written for resume.
