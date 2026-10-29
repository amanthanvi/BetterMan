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
stages refer to their containing command, wrapper or substitution. Empty
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
unambiguous bounded prefix (`ip addr` → ip-address(8)). Global flags before a
subcommand retain their base-command page. Wrapper command arguments are
separate child stages, including `find -exec` / `-execdir` / `-ok` / `-okdir`.

Destructive entries have `{description, dryRun}`. They describe standard
command operations requested by literal input, not completed execution or
certain data loss. Dynamic input, malformed syntax, unresolved options,
resolution exhaustion and uncertain wrapper parents suppress claims. Signals
cover indexed rm recursive/force flags, find -delete, xargs rm, dd of=,
mkfs variants, truncate, shred, tar --remove-files and `>` overwrite-capable
redirection. A redirection explicitly says file existence and noclobber state
are unknown; append and file-descriptor duplication do not imply truncation.
`dryRun` is currently null: no generic safe rewrite can be promised without
inspecting all side effects and the execution environment. Absence of a signal
**does not establish that a command is safe**. Names may be shadowed by shell
functions/aliases or executables; their runtime identities are not inspected.

Limits are 4,096 characters, 128 lexical tokens, 24 stages and nesting depth 8.
The resolver performs at most 64 indexed lookups, each reading at most four
rows, plus two release reads: a conservative ceiling of 258 documents. It
caches repeated lookups. Once exhausted, remaining tokens stay unresolved and
the response includes a diagnostic. The pure parser has no data dependency.
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
up to 64 unique terms per page from definition IDs under ENVIRONMENT, FILES,
ERRORS and section-5 directives, plus known hyphenated command families.
Subsections retain their enclosing category; missing item IDs use the actual
section ID. Invalid/oversized terms or anchors are omitted, never truncated
into a bogus anchor. Excerpts are capped at 160 characters. Bash syntax
headings are reserved first. Search reads at most eight exact matching rows,
denormalized with page metadata, with optional section/distro scoping. No
runtime document-body or corpus scan is needed. Broader family graphs and
portability data belong to #399; task phrases (#398) and popularity (#396)
remain separate work.
