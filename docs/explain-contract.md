# Static command explanations (B5 / C5 contract)

`GET /api/v1/explain?cmd=<URL-encoded shell line>&distro=debian` and the
shareable `GET /explain?cmd=...` return the same version-1 JSON. The latter
currently serves JSON; C5 can replace that route with its interface. Responses
are private/no-store because commands can contain sensitive values. Validation
precedes the existing search rate limiter; invalid input returns 400, a spent
or unavailable limiter returns 429, and unavailable data returns 503. No shell,
process, filesystem inspection, expansion, or user input evaluation occurs.

The public Convex function `explain.explain({cmd, distro})` selects only that
distro's active production release. It accepts no dataset stage. C5 can import
`Explanation` as a type from `convex/explain.ts`; runtime fields are validated.

The response has `version: 1`, the original `input`, a URL-encoded `shareUrl`,
`diagnostics`, and `stages`. Each stage has a stable numeric `id`, `parent`
(or null), `relation` (`list`, `subshell`, `substitution`, `wrapper`, `exec`),
`tokens`, and a `destructive` array. IDs reflect lexical discovery; child
stages refer to their containing command, wrapper or substitution. The array
places each child directly after its parent; IDs need not be ascending. Empty
lexer stages are omitted, so IDs can have gaps. This is static syntax, not a
prediction of which conditional branches will run.

Every token has:

| Field | Meaning |
| --- | --- |
| `kind` | `command`, `subcommand`, `option`, `optionArgument`, `argument`, `assignment`, `operator`, `redirect`, `redirectTarget`, `glob`, `expansion`, `comment`, `endOfOptions`, or `unknown` |
| `text` | Exact source text, retaining quotes and escapes |
| `value` | Decoded literal word, flag key or attached argument; expansions remain literal |
| `start`, `end` | Half-open UTF-16 offsets in the original input |
| `page` | `{name, section, distro}` or null |
| `anchor` | Exact document ID or null; never a guessed slug |
| `excerpt` | Bounded definition/option excerpt, or empty when unavailable |
| `takesArgument` | Boolean for indexed flags, otherwise null |
| `portability` | null, reserved for B7 data; no portability claim yet |
| `shell` | Additional `{page, anchor, excerpt}` reference for shell syntax, otherwise null |

A cluster emits one token per flag, followed by any attached argument. These
tokens deliberately share their original source span and `text`; the decoded
`value` identifies each part. Nested substitutions also retain the containing
word's raw text and expose the inner commands as child stages. Literal quoted
wildcards stay arguments; unquoted wildcards are globs. No glob, environment
variable, substitution, shell alias, function, command path or filesystem result
is evaluated. Manual-page aliases use at most one indexed hop within the same
release.

`shell` references come from bash(1)'s actual ingest-indexed heading IDs for
pipelines, lists, quoting, redirections, expansions and subshells. A release
without this metadata can link bash(1) with a null anchor and an explicit
unavailable-section excerpt. An unavailable page/flag remains unknown.

Exact indexed multi-letter flags win over cluster splitting. Splitting stops
at an argument-taking flag or the first unknown flag; it never labels the
remainder of an unknown option as known switches. A following word belongs
to an argument-taking flag, including words beginning with `-`. `--` ends
option interpretation. Subcommands use ingest-derived exact names, or an
exact manual-name fallback for an explicit command-family table. Git verbs
are exact; iproute2 object aliases map `ip addr` to ip-address(8), regardless
of ip-addrlabel(8). Command sections include suffixes such as 1ssl/1ossl.
Global flags before a subcommand retain their base-command page. Wrapper
command arguments (`sudo`, `env`, `xargs`, `timeout`, `nice`, `nohup`, `time`,
`command`, `exec`, `doas`) are separate child stages, including `find -exec` /
`-execdir` / `-ok` / `-okdir`.

Destructive entries have `{description, dryRun}`. They describe literal
operations requested by the line, not runtime success or certain data loss.
The independent semantic allowlist in `convex/_destructive.ts` is stricter
than the manual option index. Every option/predicate on the command and each
wrapper ancestor must be modeled; a recognized but unmodeled manual option
still suppresses the note. Dynamic/unknown syntax and resolution exhaustion
also suppress it. The supported set is deliberately small:

| Operation | Modeled forms and exclusions | Inspection hint |
| --- | --- | --- |
| rm | Basic force/recursive/ordered interactive switches; dot/dot-dot/root operands excluded; literal operands or explicitly modeled find/xargs replacements | Replace rm with `ls -d` |
| find -delete | Literal roots after -H/-L/-P/-O/-D globals; conjunction-only name/type/age/depth predicates; -delete must be the last primary; no branching/pruning | Replace -delete with -print |
| git clean | One literal global -C; -f/-d/-x/-X, with -n/-i suppressing; -e, pathspecs and other global options unmodeled | Replace -f with -n |
| mkfs.ext4 / mke2fs | One literal filesystem target, no flags; -n/-V suppress; aliases resolve to mke2fs | Add -n |
| truncate | Exactly one size option of zero and literal non-device-path operands | null |
| echo redirection | One truncating output redirect to a literal non-device path; no options or other redirects | null |

No notes or hints are emitted for dd, rsync, shred or tar in this revision.
Their operands, copy layout, predicate/mode interactions and file-type effects
need a separate model before adding them to the allowlist. Output redirects
never make device-truncation claims. sudo listing/validation/timestamp/edit
and shell modes are opaque. xargs interactive mode is unmodeled, so it cannot
support a no-prompt claim. Wrapper children appear directly after their parent;
list terminators stay with the containing stage. Unknown lexical tokens keep
kind `unknown` throughout resolution.

Hints inspect only the named operation: other stages can still have side
effects. Runtime aliases/functions, executable identities, file existence and
noclobber state are not inspected. Absence of a note never establishes safety.

Limits are 4,096 characters, 128 lexical tokens, 24 stages and nesting depth 8.
The resolver performs at most 64 indexed lookups and shares a 64-document
allowance across them, plus two release reads: a whole-request ceiling of 66
documents. Each query reserves its maximum (one, three, or four rows) before
starting; empty/cache lookups cannot bypass the independent probe cap. It
caches repeated lookups. Once exhausted, remaining tokens stay unresolved and
the response includes a diagnostic. The pure parser has no data dependency. Limit failures use structured
`ConvexError.data.code` values mapped to HTTP 400, including after production
error redaction.
Here-documents, braced parameter expansion, arithmetic expansion, shell control
structures, and wrappers
that interpret shell strings (such as `env -S`) are diagnosed as uninterpreted;
they cannot support safety claims. This is not an executable shell grammar.

Full sample responses generated from the deterministic performance fixture:

- [Archive kit command](examples/explain-archive.json)
- [Find/xargs kit command](examples/explain-pipeline.json)

The fixture anchors are illustrative; actual responses use the selected
release's IDs and excerpts. Option excerpts, symbol terms and bash heading
anchors take effect after the next ingest. Old releases remain readable and
return explicit unknowns or missing excerpts where metadata is absent.

The symbol index is separate from the unchanged document model. Python derives
up to 256 unique terms per page from definition IDs under explicit heading
synonyms for environment, files, errors and section-5 directives, plus known
hyphenated command families. ENVIRONMENT VARIABLE(S), FILES AND DIRECTORIES,
CONFIG/CONFIGURATION DIRECTIVES and supported config OPTIONS layouts are
recognized; PROFILES and arbitrary substring matches are not.
Subsections retain their enclosing category; missing item IDs use the actual
section ID. Styled directive terms support multi-word keys, assignment
placeholders and keyword-plus-description layouts. Formatted paragraph/list
definitions (systemd and systemctl) use their actual enclosing section anchor.
Parent-page COMMANDS definitions resolve known-family verbs when there is no
separate subcommand page. errno and environ special-page layouts are covered
by selected, hashed real-corpus fixtures. Invalid/oversized terms or anchors are omitted, never truncated
into a bogus anchor. Excerpts are clipped at 160 UTF-16 units without splitting
surrogate pairs; Python and Convex use the same unit. Terms/anchors over their limits are skipped.
Contract schema version 2 prevents new ingestion from writing to an older
deployment. Default page batches are derived from a 7,000-derived-write budget divided
by 400 option rows plus the symbol cap per page (currently ten items). The
existing item-count setting can lower this bound but cannot bypass it.
See [the cached-corpus audit](symbol-index-audit.md) for coverage and quality
evidence. Bash syntax headings are reserved first. Search reads at most eight exact matching rows,
denormalized with page metadata, with optional section/distro scoping. No
runtime document-body or corpus scan is needed. Broader family graphs and
portability data belong to #399; task phrases (#398) and popularity (#396)
remain separate work.
