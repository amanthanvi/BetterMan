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
