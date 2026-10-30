# Static command explanations (B5 / C5 contract)

`GET /api/v1/explain?cmd=<URL-encoded shell line>&distro=debian` returns the
version-1 JSON. The `shareUrl`, `GET /explain?cmd=...`, is the explain page
(C5): server-rendered HTML that renders this same response, complete without
JavaScript, `noindex` and uncached. Responses
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

A cluster emits one token per flag, followed by any attached argument. Each
flag retains only its own source span/text, never a copy of the entire cluster.
Literal quoted wildcards stay arguments; unquoted wildcards are globs. No glob,
environment variable, substitution, shell alias, function or filesystem result
is evaluated. Manual-page aliases use at most one indexed hop within the same
release.

The admitted grammar is defined once in `convex/_shellGrammar.ts`:

- Literal simple commands, literal environment assignments, quoted/escaped words,
  argument globs and comments; single, double and ANSI-C quotes.
- Pipelines and `&&`, `||`, `;` lists with nonempty, well-formed boundaries.
  A final semicolon is allowed; trailing pipelines/conditionals, including those
  followed only by a comment, are unsupported.
- `>`, `>|`, `>>`, `&>`, `<` and numeric descriptor duplication such as `2>&1`.
- The explicitly modeled executing wrapper forms listed below, including find's
  validated conjunction-only expression and exec argument boundaries.

Everything else is unsupported: arithmetic, runtime expansions/substitutions,
process substitution, subshells/groups, conditionals/loops/case/functions,
heredocs/here-strings, background jobs, brace expansion, unsupported redirects,
and raw C0/DEL control characters outside quotes (including tab/newline/CR).
Unclosed quoting and malformed list boundaries also diagnose the whole line.
Safe token explanations remain available, but **any diagnostic or unknown token
anywhere clears every fact and hint for the entire line**. This deliberately
prefers missing a fact to partially modeling a shell form.

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

The stage `destructive` arrays now contain **command-level facts**, not
per-invocation predictions. Facts are deduplicated across the entire response;
consumers should render the collected facts after the explanation. No note
names input targets, predicts prompting, counts affected objects, or asserts
that the submitted line successfully performs the operation.

| Resolved command/syntax | Fact | Optional inspection hint |
| --- | --- | --- |
| rm | rm deletes files. | Run it with `ls -d` in place of `rm` first to see what it would act on. |
| find with a real -delete action | find -delete deletes the files it matches. | Run it with `-print` in place of `-delete` first. |
| git clean | git clean deletes files from the working tree. | Run `git clean -n` first. |
| mkfs variants / mke2fs | mkfs creates a new filesystem, erasing what the device held. | Add `-n` to see what it would do. (mkfs.ext4/mke2fs only) |
| truncate with a size option | truncate changes file sizes; a size of 0 empties a file. | none |
| literal file output using >, >| or &> | > replaces the contents of the file it writes to. | none |

Shell assignment prefixes apply only at the start of top-level simple commands.
Wrapper children receive argv, not a new shell: an assignment-shaped executable
is unknown and diagnosed. env and sudo consume their own documented assignment
prefixes; after env's first assignment, options are finished and the next word
is its executable (including an option-like word, which remains unknown).
Xargs delimiters accept one literal byte or a complete GNU C escape: octal
values must be at most 377, hexadecimal values at most ff (leading zeros are
accepted in both), and only the documented
C escapes are admitted. Other wrapper strings are not escape-decoded.

Wrapper resolution first lifts shell redirect pairs out of argv while retaining
source spans and attaching them to the whole simple command. Redirects can
precede the executable or appear between wrapper switches and their values.
A shared execution-option catalog rejects unknown/opaque wrapper modes and
validates required/attached/optional values before a child stage is created:
timeout durations/signals, signed nice adjustments, sudo/doas user/group forms,
env unset names, numeric xargs limits/delimiters and literal path/string values.
Unsupported values diagnose the entire line. These checks establish syntax,
not user existence, path existence or runtime success.

Brace checks retain each raw word's quote/escape provenance. Any unquoted
opening brace is unsupported, including partly quoted words; only standalone
`{}` markers in modeled find/xargs replacement positions are admitted. Quoted
or escaped literal braces remain supported. Unquoted tildes are also diagnosed
as unsupported runtime expansion, including partly quoted words. Attached unquoted replacement
markers can still receive safe token explanations but no facts/hints.

Hints are deliberately narrower than facts. They require zero diagnostics and
unknown tokens across the line. find must have a valid modeled expression with
no stray path operands after its first predicate. Unknown/invalid lines never receive
a hint. rm previews require ls-compatible switches and a replacement marker
that cannot alter the inserted command; find previews use a known simple
expression; git previews exclude existing dry-run, global options, wrappers
and runtime substitutions; mkfs previews exclude existing dry-run and markers
that would rewrite -n. These are suggestions, never executable rewrites or
whole-line guarantees. dd, rsync, shred and tar remain silent.

Facts require a resolved command position through known executing wrapper
modes (find -exec/-execdir, xargs, sudo/doas/env/nice/timeout/nohup/time/command/
exec). Listing, shell-string, help/version and other opaque modes do not
establish execution. Command text inside echo/printf, comments or a quoted
sentence is not a command stage. Local/relative executable paths such as
./rm or ./sudo remain unknown; standard absolute system binary paths can map
to their manuals. Runtime program identity is not inspected.

Replacement templates retain their exact source text and spans. find {} and
xargs -I/-i/--replace substitutions inside operands or option values appear as
`expansion` tokens with a runtime-replacement excerpt, not invented paths.
They reference the find/xargs option (or their own containing option value),
not a bash parameter-expansion section.
When replacement changes a command/option identity, it stays unknown.
-I={} means the literal replacement string ={}, not {}. xargs appending
unknown arguments to a find expression is explicitly unsupported. find's +
execution form requires exactly one trailing {} argument, and an unescaped
shell semicolon is not an execution terminator.

Optional arguments documented in [WHEN], [=WHEN] or [ARG] are not consumed
from the next word. The index now preserves optionality from the separate
argument column; exact legacy rm --interactive/xargs replace forms also have
fallbacks. Short = syntax is unsupported unless that short form is documented;
xargs -I retains its literal attached = replacement string. Redirect targets
that expand as globs remain glob tokens; append redirects and explicit special
device-directory spellings do not produce the file-overwrite fact.

Limits are 4,096 characters, 128 lexical tokens, 24 stages and nesting depth 8.
Decoded output is capped at 256 tokens and 65,536 serialized UTF-8 JSON bytes.
The resolver measures each prospective token against the whole response, including
input/share URL, and emits a truncated diagnostic before exceeding either cap.
A final size check also accounts for facts/diagnostics; truncation suppresses facts.
The resolver performs at most 64 indexed lookups and shares a 64-document
allowance across them, plus two release reads: a whole-request ceiling of 66
documents. Each query reserves its maximum (one, three, or four rows) before
starting; every lookup, including cache hits, consumes the independent probe cap. It
caches repeated database results. Once exhausted, remaining tokens stay unresolved and
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
Contract schema version 4 prevents new ingestion from writing to an older
deployment. Version 4 also retains license-package uploads, extractorVersion
and packed signatures from v3; clients reject both older and newer contracts.
Symbols are registered release children for bounded pruning; the orphan sweep
checks their release and page ownership before deletion. Default page batches are derived from a 7,000-derived-write budget divided
by 400 option rows plus the symbol cap per page (currently ten items). The
existing item-count setting can lower this bound but cannot bypass it.
See [the cached-corpus audit](symbol-index-audit.md) for coverage and quality
evidence. Bash syntax headings are reserved first. Search reads at most eight exact matching rows,
denormalized with page metadata, with optional section/distro scoping. No
runtime document-body or corpus scan is needed. Broader family graphs and
portability data belong to #399; task phrases (#398) and popularity (#396)
remain separate work.


Wrapper dispatch retains its execution context: shell assignments are prefixes
only at the start of a top-level simple command. Env and sudo consume their own
documented assignments, but sudo's `--` ends both options and assignments.
An external wrapper's child is argv, not another shell; builtin names such as
`command` and `exec` are unknown executables there. Shell `command` preserves
builtin dispatch, `exec` switches to external argv, and only lexical keyword
`time` (without an earlier redirect/assignment) preserves shell parsing.
Interactive xargs, nested xargs input dependencies, and doas after environment
clearing receive diagnostics and no facts/hints. Token explanations remain.
See the [recorded GNU admission oracle](../scripts/explain-differential/README.md)
for generation, coverage and its deliberately bounded evidentiary scope.

## The explain page (C5)

`/explain` renders the engine's response and adds no claim of its own. Tokens
appear in input order, numbered from 1. Tokens one typed word produced (a
cluster such as `-xzvf`, or `-C/srv`) share one grid cell, with each flag its own
link to its own note. A note shows the engine's kind, excerpt and source; the
source link is the exact `page#anchor` the engine returned, or the shell
reference for syntax. The reading lists each resolved command's NAME line.
Diagnostics are shown as returned, with a sentence that safety notes are
withheld. The safety note lists the collected `destructive` facts verbatim;
hint backticks become `<code>` through text splitting, never markup.

Because a line can hold secrets, the service worker never stores `/explain`,
`/api/v1/explain`, or any URL with a `cmd`, `q` or `name` parameter (search
pages, search and suggest API answers included) in Cache Storage, and purges
such entries an older worker kept. Sentry never carries their values:
`PRIVATE_QUERY_PARAMS` in `lib/sentryScrub.ts` (`cmd`, `q`, `name`) feeds every
`dataCollection` deny list and the scrubber, which redacts each value to the
next unencoded `&` or `#` (and inside percent-encoded nested URLs) in every
outgoing event, transaction, span and breadcrumb (`beforeSend`, `beforeSendTransaction`, `beforeSendSpan`,
`beforeBreadcrumb`) and in each envelope's header (the trace context's
`transaction`), in all three Sentry configs.

Portability cells are not in this response (`portability` stays null). The
page reads them separately with `portability.getCells({distro, name, section,
anchors})`: three reads per manual (release, page, compact derived summary), at
most 64 anchors, and at most four manuals per line. Anchors past the summary's
loaded rows are `lll` (not loaded); anchors a complete summary lacks are
omitted. Explain shows the cells on every flag that has them, including fully
available ones, with a legend that says they show availability only.
