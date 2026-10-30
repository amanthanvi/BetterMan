# Full-Debian elected command owners

This corrects the second staging rehearsal's pre-upload block, following #453
and the lead's real-package/virtual-name correction. The branch starts from
main `2ad57b67` and rebased onto `ee20002b` after #447; ingest contract v6, the full-Debian hold, CAS/promotion checks,
integrity checks, disk bounds and download scheduling are unchanged. No workflow
was dispatched, no shared backend was contacted and no data was uploaded here.
The [machine-readable audit](b1-debian-nc-owner-audit.json) retains every audited
package, full-catalog candidate set, command owner, alternatives offer and limit.

## Rehearsal evidence

Read-only log inspection of update-dataset run
[40992908901](https://github.com/amanthanvi/BetterMan/actions/runs/40992908901)
confirms main `2f302341` acquired 17,330 packages in 1,266.128 seconds
(download workers 829.371 s, extraction workers 714.516 s), with 605 cache hits
and one fallback. Parsing completed 110,082 pages in 1,039.327 seconds. At
03:18:25 UTC on October 30, ownership validation rejected netcat-traditional
for nc(1), whose curated request was netcat-openbsd. Release/upload had not begun.
These are runner observations, not another local runtime projection.

## The actual nc winner

Pinned Release SHA256 remains
`ed56aac47e7911e65ee63aae8d67e29f20e023f840e49f8ed037043a33de138a`.
The complete Packages index and archived postinst registrations establish:

| nc provider | Debian Priority | Pinned installed count | Alternatives priority | Manual target |
| --- | --- | ---: | ---: | --- |
| netcat-traditional | standard | 267,400 | 10 | nc.traditional(1) |
| netcat-openbsd | optional | 35,052 | 50 | nc_openbsd(1) |
| ncat | optional | 2,517 | 40 | ncat(1) |

The documented full-catalog election gives required/important/standard packages
one default-installed group before optional providers. Thus **netcat-traditional
wins** despite OpenBSD's higher alternatives priority. The curated awk/vi/nc
preferences break only remaining ties; they never override that group. All
three nc offers and their actual served targets were replayed from verified
archives, without installing packages or executing maintainer scripts.

Nothing in the pinned index Provides `netcat-openbsd`. The lead's change to
expand providers only for names absent from the real package catalog therefore
cannot cause this failure. The observed block is a **wrong full-archive
expectation**, not an incorrectly elected nc owner. The curated apt install can
continue requesting OpenBSD; the full archive's explicit canonical nc expectation
is traditional. OpenBSD and ncat remain separately available providers. This is
not a general permission for any package that Provides netcat.

## One ownership map for publication and validation

The previous checker independently merged page and alias-registration rows and
used the first owner per normalized route. That reconstruction is removed.
`parse_workspace` now records the finalized publication map after provider-only
real pages and aliases are determined. A canonical real route records its
uploaded page owner; a canonical alias records its served `targetPackage`, which
can differ from the registration package. The owner gate and audit consume that
same map, retaining exact-section preference over suffixes.

The dependency/Pre-Depends traversal and virtual-only provider rule are unchanged.
9base's ls/grep/sed, make-guile's Provides make, and plan9-only fallbacks still
fail the owner gate. A dependency-owned alias target remains valid. Regression
coverage builds two competing nc providers in both selection orders, reverses
alias-provider order, and verifies that the canonical alias target and owner
gate agree. A second case separates the alias registration package from its
served target package.

## Competitors from the full catalog

The old 65-package replay omitted the renamed nc providers. The revised audit
scans both entire verified Contents indexes and all pinned Packages records.
It selects every exact command/manual owner (including suffixed sections),
public competitors for private manual routes, virtual co-providers of curated
packages, and executable families for names with no literal manual basename.
The latter finds nc.openbsd, nc.traditional and ncat; direct manual pages occupy
other literal routes before alternatives under the existing source policy.

The resulting set contains **135 selected packages**, including **99 control
competitor candidates**, with **153 acquired packages including dependencies**.
The real parser and alias election were replayed, rather than choosing owners
from metadata order. Results: **28 required command owners verified**, the same
two non-free exclusions (gcc/gdb), three non-command packages, **138 validated
provider notices**, and **zero parser failures**. The seven unresolved unrelated
sources are recorded below. This is a full-index competitor audit, not a claim
that every one of the 17,323 manual-owner archives was parsed locally.

Every owner differing from its curated requested package is listed here:

| Curated request / command | Published owner | Assessment |
| --- | --- | --- |
| groff / groff(1) | groff-base | Valid dependency; neither election nor expectation needs changing |
| util-linux / mount(8) | mount | Existing explicit companion request; preserved |
| netcat-openbsd / nc(1) | netcat-traditional | Full-archive expectation was wrong; corrected explicitly |
| vim / vim(1) | vim-common | Valid dependency; unchanged |
| git / git(1) | git-man | Valid dependency; unchanged |
| apache2 / apache2(8) | apache2-bin | Valid dependency; unchanged |
| python3 / python3(1) | python3.13-minimal | Served alias target through python3-minimal; valid transitive dependency |
| perl / perl(1) | perl-base | Valid dependency; unchanged |
| postgresql-client / psql(1) | postgresql-client-17 | Valid metapackage dependency; unchanged |
| default-mysql-client / mysql(1) | mariadb-client-core | Valid transitive dependency/alias target; unchanged |

Direct competing routes remain correct: make beats make-guile; ls, grep and sed
use their requested packages in section 1, while 9base's 1plan9 variants remain
separate. The auxiliary curated alternatives also match policy: awk(1) serves
mawk (required beats optional gawk/original-awk), and vi(1) serves vim-common
through the important vim-tiny registration. No election policy changed.

The broader candidate replay exposes seven unrelated pre-existing source-target
mismatches: the four emacs-{gtk,lucid,nox,pgtk}(1) stubs refer to unavailable
emacs(1), and lighttpd-{enable,disable}-mod(8) plus lighty-disable-mod(8) refer to
unavailable lighty-enable-mod(8). None is a curated command route, and none is
silently counted as parsed. Their exact package/path errors remain in the JSON.
This urgent fix does not expand into those parser repairs.

## Reproduction and limits

```bash
pnpm ingest:debian-benchmark --workdir ../.cache/debian/nc-owner-audit --packages 1 --audit-command-pages
pnpm ingest:lint
pnpm ingest:test
pnpm ops:test
node --test scripts/dataset-workflow.test.mjs scripts/deploy-workflow.test.mjs
```

The workdir is relative to ingestion/. The command audit replaces the sample
selection with catalog-derived candidates and never creates a Convex client.
All archive bytes still bind to the pinned Release/Packages checksums.
No new production import, upload, activation or derived completion was tested.
The lead must merge the reviewed PR before the November 1 05:00 UTC cron to
change its behavior; this implementation does not merge or dispatch it.
