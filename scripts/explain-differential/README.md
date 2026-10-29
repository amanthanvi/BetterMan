# GNU wrapper admission oracle

Run `pnpm explain:record-gnu` from this worktree to regenerate
`convex/fixtures/explain-differential.json`. Docker is required only for this
manual recording; CI replays the committed expectations through the public
Convex explain query. The generator and ordered-case SHA-256 hashes prevent a
changed generator from silently reusing old truth bits.

`cases.mjs` enumerates ordered wrapper chains through depth three across every
modeled wrapper (including external GNU time). It varies each position's valid,
invalid, delimiter, value-taking and assignment forms. Builtins cover every
position exhaustively through depth two and rotate across neighbors at depth
three. Redirects cover every chain position and individual option/value positions.
Additional find execution forms test external argv boundaries. The corpus has
125,002 distinct lines, each ending in `rm x` or `truncate -s 0 f`.

The Debian trixie image installs real GNU/coreutils/findutils/time, sudo and
opendoas. Sudo and doas keep their real parsers with root-only nonprompting test
policies. At image build, both target binaries are replaced with a small ELF
marker. Each line runs in Bash with fixed input and a reset marker. Runtime
containers have no host mounts, no network, a read-only root, and isolated
scratch/tmp/run storage. The recorder commits whether the target marker ran,
exit-status totals, image identity and tool versions as a compact bitset.

The assertion concerns **target-command admission**, not filesystem effects,
option semantics of rm/truncate, or separate shell-overwrite facts. Missing
facts are permitted and counted; any target fact without marker execution fails.
The fixed Linux environment is evidence for these generated forms, not a proof
of every shell, distro, runtime path, user policy or possible command line.
Interactive xargs, nested xargs input dependencies and doas after environment
clearing are conservatively diagnostic. Production explain never runs a shell,
Docker, a subprocess, or user input.

Recorded replay on the round-7 implementation: 50,014 marker executions,
45,358 target facts, **zero false positives**, and 4,656 false negatives out of
125,002 generated lines. These are admission omissions, not claims that the
omitted commands are safe. The test prints current counts and optionally writes
its complete counts/failure report to `BM_DIFFERENTIAL_REPORT`.
