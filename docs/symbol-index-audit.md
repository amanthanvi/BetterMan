# B5 symbol extraction revision audit

Compared the original PR extractor at `84b4901` with the revised extractor using the same current parser and 18,529 retained English HTML pages from the earlier ingestion audit. No network fetch or deployment ingestion was performed. Zero parse failures.

| Distro | Pages | Before symbols | After symbols | ssh_config before | ssh_config after |
| --- | ---: | ---: | ---: | ---: | ---: |
| debian | 4,763 | 6,983 | 6,321 | 64 | 110 |
| ubuntu | 4,278 | 6,484 | 5,910 | 64 | 109 |
| fedora | 9,488 | 4,835 | 4,216 | 64 | 112 |

Total symbols: **18,302 → 16,447**. The lower overall count reflects stricter definition extraction; the larger per-page cap restores late directives. All three ssh_config pages now include ProxyJump, Port, User, StrictHostKeyChecking, LocalForward, ServerAliveInterval, UserKnownHostsFile, `~/.ssh/config`, and `/etc/ssh/ssh_config`. A separate regression fixture preserves `$HOME/.ssh/config` literally.

Removed false-positive samples:

- ssh_config(5): nested ChannelTimeout values `agent`, `session`, `tun`, `x11`.
- groff_out(5): single-letter formatting codes including `C`, `f`, `H`, and `N`.
- proc_pid_stat(5): state values including `R`, `S`, `D`, and nested `session`.

The targeted audit found no remaining config terms equal to `The`, `f`, `pre`, `commit`, `agent`, `session`, `tun`, `x11`, or a single letter. This is a targeted quality check, not a claim that every retained term is a valid directive. Exact category headings, top-level definitions, complete directive terms, UTF-16 limits and nested-list exclusions have unit coverage.

Cached HTML manifest SHA-256:

`7921b48b1301f81501b7eb75aa59ad03d4032c6f514ae71691e6ecadc61ca5f3`

## Round 2: recall and real document layouts

Compared `7981298` with the round-2 extractor on the identical 18,529-page corpus; zero parse failures. Explicit heading synonyms restore environment/file categories without substring matching. Styled directive terms retain multi-word rsyncd.conf keys, strip assignment values, and distinguish a leading resolv.conf keyword from accompanying prose. Paragraph/list term-definition pairs use the existing enclosing section anchor when there is no term ID. Real selected AST fixtures record their source HTML hashes in `ingestion/tests/fixtures/symbol-layouts.json`.

| Distro | Category | Before | After |
| --- | --- | ---: | ---: |
| debian | environment | 464 | 747 |
| debian | files | 876 | 896 |
| debian | errors | 3,884 | 4,011 |
| debian | config | 851 | 1,551 |
| debian | subcommand | 236 | 308 |
| debian | shell | 10 | 10 |
| ubuntu | environment | 478 | 698 |
| ubuntu | files | 810 | 830 |
| ubuntu | errors | 3,617 | 3,744 |
| ubuntu | config | 762 | 1,631 |
| ubuntu | subcommand | 233 | 304 |
| ubuntu | shell | 10 | 10 |
| fedora | environment | 450 | 632 |
| fedora | files | 671 | 691 |
| fedora | errors | 2,086 | 2,213 |
| fedora | config | 759 | 1,346 |
| fedora | subcommand | 240 | 312 |
| fedora | shell | 10 | 10 |

Totals: Debian **6,321 → 7,523**, Ubuntu **5,910 → 7,217**, Fedora **4,216 → 5,204** (all **16,447 → 19,944**). Debian environment symbols are **747**, above the original 714 reference. Targeted checks retain the round-1 exclusions (`The`, `f`, `pre`, `commit`, nested ssh_config values and single-letter config terms).

Real Debian layout results: systemd.service(5) **41** symbols including ExecStart=; errno(3) **127** including ENOSPC; environ(7) **11** including HOME; systemctl(1) **72** parent-page command terms including restart; resolv.conf(5) includes nameserver/search; tmpfs(5) includes size; rsyncd.conf(5) includes motd file/path. Definition-item IDs are retained when present; paragraph/list definitions use actual section IDs, rather than inventing per-term anchors. Environment regressions cover less, python3, rsync RSYNC_RSH, ps, and find POSIXLY_CORRECT. The regression fixture is selected from actual parsed blocks, not a synthetic definition-list substitute.

## Round 3: file fields and prose are not directives

Compared 082738d with the same 18,529 cached pages, with zero parse failures.
Config extraction excludes proc/procfs/sysfs/sysctl field pages and known ELF,
slabinfo and accounting-format pages. Multi-word terms are rejected outside
rsyncd.conf's documented parameter-name layout; the sampled prose phrases
`hashed database`, `directory tree`, `isolated nodes` and `settime flags` do
not become directives. Other symbol categories are unchanged.

| Distro | Config before | Config after | Total symbols after |
| --- | ---: | ---: | ---: |
| Debian | 1,551 | 1,061 | 7,033 |
| Ubuntu | 1,631 | 1,145 | 6,731 |
| Fedora | 1,346 | 859 | 4,717 |

This deliberately trades unsupported multi-word recall for precision. Existing
real fixtures still retain rsyncd.conf's `motd file`, resolv.conf's nameserver/
search, tmpfs size, systemd directives and parent-page commands. Debian
environment recall remains 747. Total symbols: **19,944 → 18,481**.

## Round 4: variable definitions and typed login.defs directives

Compared `07b64cd` with the revised extractor on the identical 18,529 cached
HTML pages; zero parse failures and the same manifest hash above. No network
fetch, ingestion upload or production data change was performed.

| Distro | Category | Before | After |
| --- | --- | ---: | ---: |
| debian | environment | 747 | 729 |
| debian | config | 1,061 | 1,095 |
| debian | files | 896 | 896 |
| debian | errors | 4,011 | 4,011 |
| debian | subcommand | 308 | 308 |
| debian | shell | 10 | 10 |
| ubuntu | environment | 698 | 671 |
| ubuntu | config | 1,145 | 1,145 |
| ubuntu | files | 830 | 830 |
| ubuntu | errors | 3,744 | 3,744 |
| ubuntu | subcommand | 304 | 304 |
| ubuntu | shell | 10 | 10 |
| fedora | environment | 632 | 621 |
| fedora | config | 859 | 859 |
| fedora | files | 691 | 691 |
| fedora | errors | 2,213 | 2,213 |
| fedora | subcommand | 312 | 312 |
| fedora | shell | 10 | 10 |

Totals: Debian **7,033 → 7,049**, Ubuntu **6,731 → 6,704**, Fedora
**4,717 → 4,706**; overall **18,481 → 18,459**. Debian environment symbols
are **729**, above the original 714 reference. This is a retained-corpus
coverage count, not a manually labeled recall percentage.

Environment terms must be complete variable definitions, lists of variables,
styled definition leads, documented value placeholders or explicit `.Ev`
macro examples. Platform labels `MS`, `DOS`, `OS`, `MSDOS`, `UNIX`, `WINDOWS`,
`LINUX`, `BSD` are excluded. Removed examples include less/pager's MS/DOS/OS,
getopt's prose placeholder PID, curl's incomplete _PROXY/TLS fragments, and
groff's `.Li M1 M2 M3` literal example. Curl's HTTPS_PROXY, CURL_SSL_BACKEND
and the other full variable names, plus groff's `.Ev PATH`, remain indexed.
The removed-term pass over all three corpora also found GCC encoding labels
JIS/SJIS/EUCJP and Perl VMS/SYS/LOGIN prose fragments; these are excluded,
while complete quoted locale-variable definitions in perllocale remain.

Debian login.defs(5) recovers **0 → 34** directives, including PASS_MAX_DAYS,
PASS_MIN_DAYS and PASS_WARN_AGE, from real `NAME (type)` paragraph/list pairs.
These retain the real `description` enclosing anchor. Selected real blocks
and source hashes are retained in `symbol-layouts-r4.json`; no synthetic
definition-list replacement is used for that production layout.
