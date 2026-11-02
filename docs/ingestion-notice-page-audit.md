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
version 8 invalidates old extractions. No filesystem link is created; #485's
archive-root normalization is unchanged. Outside the existing documentation
roots, link chains, hardlink targets, special files, duplicate target members,
missing targets and unreadable compressed targets conservatively remain gaps.
They never cause a host read or a search through another package.

Fedora/Arch/Alpine record these under `packages[].noticeLinkGaps` alongside
`unmatchedLicenseIdentifiers`, show them in the license text, and try other
notices before #489's declared-license standard texts. A package with neither
notice nor standard text keeps #489's visible warning and recorded identifiers.
Readable directory/cross-package links within the existing documentation roots
retain #488 behavior. Dangling links within those roots and Debian/Ubuntu
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
