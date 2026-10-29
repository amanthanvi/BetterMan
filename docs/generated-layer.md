# Generated layer (B6)

The top of a man page answers first: a one-sentence summary, up to five
sourced examples, and the most-used flags. This file covers the summary, the
examples and the task phrases. B7 (`docs/derived-data.md` once #429 lands)
computes the most-used flags from the flag counts recorded here.

Nothing here runs at request time. Text is built in a workflow, checked by
machine, stored by page content hash and read with the page.

## Sources, in order

| Source | Label | What it is | Check |
| --- | --- | --- | --- |
| `page` | from EXAMPLES | The manual's own EXAMPLES section: code blocks, mdoc `.Dl` lines and command-shaped `.TP` terms, with the paragraph before each as its description | Shown as written. Only examples whose flags verify count toward flag usage |
| `tldr` | tldr-pages | [tldr-pages](https://github.com/tldr-pages/tldr), pinned to one commit, platform page before `common/` | Every flag in every segment that runs this page's command must exist in this page's options table, or the example is dropped. Human-curated pipelines may stay |
| `generated` | generated · verified | Model-written examples, only to fill the gap to three | Exactly one simple command that runs this page's command, then the same flag verifier, a schema check, a duplicate check and an unsafe-shape check |

The read path returns the page's examples first, then tldr, then generated,
five at most (`briefFromRecord` in `convex/_generatedLayer.ts`). The reader
omits any part that is missing. `BRIEF_SOURCE_LABELS` in
`nextjs/lib/docModel.ts` holds the short labels. C4 (#406) renders them.

### Generated examples are one simple command

A generated example must be a single simple command that starts with this
page's command (`flags.simple_invocation_problems`). Anything else is
rejected, never repaired: `;`, `&&`, `||`, `|`, `&`, `$(...)`, backticks,
`${...}`, `<(...)`, subshells, redirections, heredocs, variable assignments,
and wrapper prefixes (`sudo`, `env`, `xargs`, `time`, ...). So
`tar -tf a.tar; rm -rf ~/Documents` can never be "generated · verified".

### Destructive commands get no model text

Pages whose command destroys data or a system by nature get the manual's own
EXAMPLES and tldr-pages only: no model call, so no generated summary,
examples or task phrases. The list lives in one place,
`ingestion/ingestion/generated/safety.py` (`DESTRUCTIVE_COMMANDS`, plus every
`mkfs.*`): rm, rmdir, shred, dd, mkfs and mke2fs, wipefs, fdisk/sfdisk/parted,
truncate, git-clean and git-reset, cryptsetup, LVM removals, userdel,
shutdown/reboot, kill/pkill and similar. A run never reads these pages again
for model text.

### Plain text only

Every stored string is plain text. The writer
(`pipeline._require_plain_text`) and the ingest route
(`validateGeneratedRecord`) both reject C0 and C1 control characters, DEL,
U+2028/U+2029 and the bidi controls U+202A-U+202E and U+2066-U+2069. Nothing is
exempt, except that the manual's own multi-line example commands keep line
feeds (tabs become spaces and carriage returns are dropped when they are
extracted). `<`, `>` and `&` are ordinary characters: commands use them.

**Rendering contract.** Readers render summaries, descriptions, commands and
task phrases as React text nodes only: never `dangerouslySetInnerHTML`, never a
markdown or HTML renderer, never `innerHTML`. Placeholder spans are applied by
splitting the command string and wrapping slices in elements, not by inserting
markup. A test stores `<img src=x onerror=...>` and reads it back as the same
inert string.

The summary is one plain-English sentence. Task phrases are three to five
lowercase search phrases such as "extract a tar.gz file". Search (#397) will
index them. Both are generated text and carry the generated mark wherever they
appear.

## Provenance

Each stored part keeps its own provenance:

- `tldr`: the upstream commit, the page path (`common/tar.md`), the number of
  rejected examples, and verified flag counts. The read path adds the GitHub
  URL of that exact file and `CC-BY-4.0` for the page, and an `attribution`
  object on every tldr example (project, file URL, licence, licence URL and
  the change notice), so each item can be credited where it is shown.
- `generated`: provider (`opencode-go`), model (`deepseek-v4.1-flash`),
  prompt version (`b6-v1`), the generation date, and the number of examples
  the verifier rejected.
- `page`: the manual itself; flag counts only.

The reader shows a quiet "generated" mark with the model and date next to the
summary, the task phrases and every generated example.

### tldr-pages attribution

tldr-pages is licensed under CC BY 4.0. Each tldr example carries its own
attribution (above), which the reader shows with it: a "tldr-pages" link to
the source file, "CC BY 4.0" linked to the licence, and the change notice
"Placeholders converted (alternatives shown as the first choice); examples
filtered by flag verification against this manual". The `/licenses` page credits the project, and the licence's legal
code ships in `docs/vendor/CC-BY-4.0.txt` with the notice in
`docs/vendor/tldr-pages.md`. BetterMan changes the examples: placeholders
become plain text, option placeholders take the spelling the manual
documents, and examples whose flags fail are removed.

## The flag verifier

`ingestion/ingestion/generated/flags.py` reads the page's options table with
the same spelling rules as the search index (`convex/_optionFlags.ts`), without
its 400-row cap. A command passes only when every flag it gives this page's
command is in that table:

- Long options key on the text before `=`. Optional and required arguments
  come from the options table; a required argument's value is skipped.
- A single-dash token that is not itself an option is a cluster: `-xzvf` is
  `-x -z -v -f`, and a flag that takes an argument ends the cluster (`-ofile`).
- GNU tar's traditional bundled first argument (`tar czf`) is a cluster.
- Commands are read by a quote-aware lexer (`shell.py`): `';'` and `"a | b"`
  are words, not operators. Command substitution (`$(...)`, backticks),
  `${...}`, process substitution, subshells, heredocs and here-strings are
  rejected as unsupported syntax rather than guessed at.
- Pipelines, `&&`, `;` and redirections split commands. Every segment that
  runs this page's command is checked; `grep -c` after a pipe is grep's
  business. `sudo`, `env`, `time`, `nice`, variable assignments and shell
  keywords before the command are skipped, except on their own pages.
- Behind a wrapper, the target is followed only for bare `sudo <target>` and
  bare `env <target>` (no options, no assignments), and then verified. Any
  other wrapper form around the target (`env --`, `env -i`, `sudo -u x`,
  `xargs`, `nice`, `timeout`, `time`, `command`, `exec`, `nohup`, ...) and
  any other segment that names the target after its first word (`find -exec
  tar`, `ssh host tar`) is rejected: the verifier cannot check that call.
- A placeholder stands only for an argument. One in a command position (the
  first word of a segment, or anywhere behind a wrapper that is not followed,
  as in `env -- {{tar}}` or `xargs {{tar}}`) rejects the example. Wrappers
  are recognised by executable name, so `/usr/bin/env` is `env`, and a
  wrapper named by path is never followed.
- A tldr placeholder must be one of two shapes. A flag list
  (`{{--flag}}`, `{{-v|--verbose}}`, `{{[-c|--create]}}`) is verified like any
  flag, and a subcommand list (`{{[a|address]}}`) shows its full word. A value
  is one or more whitespace-separated words, none starting with `-` and none
  containing `; | & $ < > ( )`, a backtick, a backslash, a quote or a newline
  (`{{path/to/file1 path/to/file2 ...}}`). A value alternation
  (`{{tagged|untagged}}`, `{{0|76|...}}`) whose every choice is one such word
  is shown as its first real choice, skipping a literal `...`. Anything else,
  including a mix of flags and values, rejects the example, so a placeholder
  can never hide a flag or a command.
- `git-commit` is typed `git commit`. tldr's page title decides, and a short
  list of families (`git`, `ip`, `docker`, ...) covers generated text.
- `+F` style flags verify when documented; otherwise `+` tokens are values
  (`date +%Y`).
- Examples that never run the command (interactive keys in less or vim,
  configuration lines) fail.

Verification is per variant. A flag that exists in GNU tar but not in BSD tar
passes on Debian and fails on macOS, because each content hash is checked
against its own table.

### Measured on cached Debian, Ubuntu and Fedora pages

Run with `coverage` over the cached mandoc HTML from earlier parser work
(`/tmp/issue416/out`), tldr commit `f4566462f599`:

| | Debian | Ubuntu | Fedora |
| --- | ---: | ---: | ---: |
| Pages | 4,763 | 4,278 | 9,488 |
| Indexed tier (sections 1, 5, 7, 8) | 1,874 | 1,707 | 1,876 |
| Pages with their own EXAMPLES | 639 | 533 | 1,514 |
| Pages mapped to a tldr page | 537 | 478 | 534 |
| ... with at least one verified example | 502 | 447 | 514 |
| ... with every example rejected | 9 | 8 | 8 |
| tldr examples checked | 2,512 | 2,271 | 2,582 |
| verified | 2,158 (85.9%) | 1,958 (86.2%) | 2,245 (86.9%) |
| rejected | 354 | 313 | 337 |
| Indexed pages already at three examples | 504 | 451 | 524 |
| Indexed pages that need generated examples | 362 | 357 | 336 |

Debian's 354 rejected examples, by reason (an example can have more than
one): 131 flags absent from that manual (apachectl `-t`/`-M`, getconf `-a`,
find `-or`), 92 unsafe placeholders (multi-flag choices such as
`{{[-sh|--summarize --human-readable]}}`, whole commands such as
`{{tar -cvf archive.tar}}`, quoted strings, `$` and backslash escapes,
interactive keys), 58 that do not run the command (less/vim/more keys, sftp
prompt commands), 49 placeholders in a command position (mostly tldr's
`{{command}} | base64` idiom, where the placeholder could name any command),
20 placeholders inside a flag (`du -{{b|k|m}}`), 10 command or process
substitutions, and 4 wrapped or indirect invocations of the target (`help
test`, `xargs`, `find -exec`). These are rejections by design: the verifier
cannot prove those flags, or what the reader would run.

## Generation

`ingestion/ingestion/generated/`:

- `provider.py`: an OpenAI-compatible chat client. `BETTERMAN_GEN_BASE_URL`,
  `BETTERMAN_GEN_MODEL`, `BETTERMAN_GEN_PROVIDER` and the key
  (`OPENCODE_GO_API_KEY` or `BETTERMAN_GEN_API_KEY`) come from the environment.
  The default is OpenCode Go with `deepseek-v4.1-flash`. It sends JSON mode, a
  60 s timeout, its own User-Agent and a per-page `x-opencode-session`, as Go
  asks. `send` makes exactly one HTTP attempt; the generator retries 408,
  409, 429, 5xx and transport failures with backoff and `Retry-After`, and
  every attempt passes the budget governor first. Go's "usage limit exceeded"
  never retries; it pauses the run. Errors never include the key.
- `prompts/b6-v1.txt` and `prompt.py`: the versioned prompt and the strict
  output schema. Input is NAME, SYNOPSIS (600 chars), the DESCRIPTION excerpt
  (1,500 chars) and the options table (3,500 chars, first sentence per option).
  Invalid parts are dropped, never repaired. A new template is a new
  `PROMPT_VERSION`.
- `pipeline.py`: asks for the gap plus two spare examples, verifies each, and
  asks once more with the rejection reasons if the page is still short.
- `budget.py`: the budget governor (below).
- `selector.py`: the generation order.
- `cli.py`: `fetch-tldr`, `coverage` and `run`.

### What gets generated, and when

The indexed tier comes first: sections 1, 8, 5 and 7. A priority file can put
popular pages or packages ahead (`tar`, `tar(1)`, `pkg:coreutils`, one per
line); B4's popularity priors can feed it once they exist. Without one, pages
with an options table come first, sections 1 and 8 before 5 and 7. Pages
without options get a summary and task phrases but no examples.

Each row is keyed by the page's raw-source content hash. A run skips a page
whose hash already has generated text, so text is regenerated only when the
page changes. `--refresh-prompt` regenerates rows made with an older prompt
version, deliberately. Identical pages in other releases or distros reuse the
row. Variants with different hashes need their own run (`--distro`).

## Budget governor

OpenCode Go caps DeepSeek V4.1 Flash at $16 per 5 hours, $40 per week and $80
per month (20%, 50% and 100% of the monthly allowance). Bursts of about
eight concurrent agents have already hit "Go usage limit exceeded" (#398).

- Rolling 5 h, 7 d and 30 d windows, each at `BETTERMAN_GEN_BUDGET_FRACTION`
  of the cap (default 0.5, leaving half for other Go work). Rolling windows
  are conservative for whatever alignment Go uses.
- In-flight requests reserve their worst-case cost, so concurrent workers
  cannot together overshoot.
- `BETTERMAN_GEN_RPM` (default 20) requests per minute;
  `BETTERMAN_GEN_CONCURRENCY` workers (default 3, at most 4).
- Weekday peak hours (01:00-04:00 and 06:00-10:00 UTC) cost double and are
  skipped unless `BETTERMAN_GEN_ALLOW_PEAK=1`.
- `BETTERMAN_GEN_RUN_CAP_USD` caps one run (the workflow sets $8).
- Every HTTP attempt, retries included, acquires from the governor (budget
  and requests per minute) and is written to the ledger.
- Only a successful response with valid usage costs less than the worst
  case. Usage is valid when `prompt_tokens` and `completion_tokens` are both
  non-negative integers (and `total_tokens`, if present, is their sum); its
  cost is tokens × price, or Go's `opencode.allowance` when that is a finite,
  non-negative number. Everything else is charged the worst case, the prompt
  estimate plus `max_tokens` at the peak list price: invalid usage whatever
  the allowance says, failed attempts (they may still have been billed),
  quota refusals and other errors. Over-counting is acceptable; under-counting
  is not. A sent attempt is recorded exactly once whatever happens next, so no
  reservation stays open.
- Short waits sleep. A wait longer than `BETTERMAN_GEN_MAX_WAIT_SECONDS`
  (900) or a provider limit stops model calls, writes the ledger and lets the
  run finish its page and tldr parts. The next run loads the ledger and
  resumes where the windows allow.

The ledger is a JSON checkpoint (`--checkpoint`). The workflow carries only
that file between runs, as the `generated-layer-state` artifact, so a pass can
span several windows and runs. `restore-ledger` (`ledger.py`) recovers it:

- An artifact is trusted only with the expected name, from a `schedule` or
  `workflow_dispatch` run of `generate-layer.yml` on the default branch of this
  repository. The event and workflow path come from each run's own record,
  and the artifact listing is paged until it covers the 30-day window.
- Only the newest trusted ledger in that window counts. It must download,
  hold exactly `checkpoint.json` and pass the schema check; loading then
  clamps it. If it cannot be recovered, the step fails and nothing is
  generated: an older ledger would forget the spend recorded since.
- A fresh ledger starts only when no trusted ledger exists in the window. The
  log says which.
- Runs off the default branch are dry runs, because only default-branch runs
  keep the ledger.

Generated text is never restored from an artifact; the Convex rows record
what is done, so a finished page is not paid for twice. `--cache-dir` keeps
generated parts within one run or on an operator's machine.

## Cost model

Go's DeepSeek V4.1 Flash prices per million tokens: $0.15 input, $0.60 output,
$0.003 cached input, off-peak; double at peak.

| Term | Value | Basis |
| --- | --- | --- |
| Input tokens per request | 830 | 635 measured over Debian's indexed tier (characters / 4), plus 30% for tokenizer differences |
| Output tokens per request | 450 | JSON with a summary, up to five examples and five phrases; `max_tokens` is 700 |
| Requests per page | 1.25 | One retry for about a quarter of pages; unmeasured until a live run |
| Cost per page | $0.00049 | (830 × 0.15 + 450 × 0.60) / 10⁶ × 1.25 |

| Pass | Pages | Cost | Requests | Time at 20 req/min |
| --- | ---: | ---: | ---: | ---: |
| Today's Debian indexed tier | 1,874 | $0.92 | 2,340 | 2 h, one run |
| Full Debian indexed tier (B1, about 35% of 141k) | about 49,000 | about $24 | about 61,000 | about 51 h, ten 5.5 h runs |
| Monthly change after the first pass (a few % of pages) | about 1,500 | under $1 | | minutes |

Under Go's caps at the default half share ($8 per 5 h, $20 per week, $40 per
month), today's tier fits in one run. The full Debian pass is limited by
request rate before money: at 20 requests per minute a 5 h window spends about
$2.40. A first full pass at the defaults spreads over about two weeks of
manual and scheduled runs; raising `BETTERMAN_GEN_RPM` and concurrency
shortens it, and the weekly cap ($20 at half share, about 40,000 pages) then
becomes the limit. No live request was made for this estimate: latency,
retries and real token counts are unmeasured.

Switching to the direct DeepSeek API, or any other provider, is a spend change
that needs owner sign-off (`docs/roadmap/betterman-2.md`).

## Review tiers

1. **Machine, every item.** Schema and length checks, the flag verifier,
   duplicate and unsafe-shape checks (`| sh`, `rm -rf /`, `mkfs`, `of=/dev/`),
   and Convex's own bounds (`validateGeneratedRecord`).
2. **Sampled, every run.** Read the run summary (requests, spend, rejected
   examples by reason, invalid responses) and skim a sample of new records
   with `--out records.jsonl`. Watch the rejection rate: a sudden rise means a
   prompt or model change.
3. **On report.** Problem reports from the page link name the page. Remove a
   bad part with `generated:suppressParts`; it stays out until the page
   changes. See `docs/runbooks/generated-layer.md`.

## Storage and read cost

`manPageGenerated` holds one row per content hash, with optional `page`, `tldr`
and `generated` parts. Rows are not owned by a release, so release pruning
leaves them alone and identical pages share them. Upserts replace only the
parts they send; a tldr refresh keeps paid-for model text.

The man page read adds one indexed `.unique()` lookup inside the existing page
query: no extra function call and no storage read. A page without a row costs
no document. Every field is bounded (five examples per source, 400-character
commands, 240-character summary, five 60-character phrases, 64 flag-usage
rows), so a row stays a few kilobytes. The page-view fixture now has a row for
bash, and `man.documents` moved from 28 to 29.

## Ingest routes

Separate from the release ingest contract, behind the same ingest secret:

| Route | Use |
| --- | --- |
| `GET /ingest/generated/contract` | Version 2, routes and limits (separate from the release ingest contract) |
| `POST /ingest/generated/candidates` | One section of a stage's active release, 200 per page, each with its row's prompt version, tldr commit and suppressed parts |
| `POST /ingest/generated/inputs` | Stored synopsis, options, and the DESCRIPTION and EXAMPLES sections for up to 10 pages. Each page's UTF-8 size is measured before it is added, so a response never exceeds 8 MiB: pages that would push past it are deferred to the next request, and a page too large on its own is skipped with a reason |
| `POST /ingest/generated` | Upsert up to 25 records; schedules B7 flag usage for their pages |
| `POST /ingest/generated/flag-usage` | Hand stored flag counts to B7 for up to 25 content hashes whose pages lack them |

## Coordination

- **B7 (#399, merged in #429):** most-used flags come from the `page` part's
  `flagUsage` (source `examples`) and the `tldr` part's (source `tldr`).
  Generated examples never count. After an upload with either part, and
  after `suppressParts` removes one, `generated.propagateFlagUsage` finds
  every page with that content hash (up to 64), skips releases being pruned
  and pages already current, and schedules B7's own
  `derived.setVerifiedFlagUsage` for the rest. One run schedules at most 256
  updates, well under Convex's 1,000 per mutation, then continues itself after
  the last page it handled (an indexed range on that page's creation time and
  id), so pages pruned between runs cannot push a live page out of reach. Candidates
  report `flagUsageCurrent`, so a run that skips an unchanged hash still
  refreshes the pages of a new release through `/ingest/generated/flag-usage`.
- **B5 (#397):** task phrases are in `generated.taskPhrases`.
- **C4 (#406):** renders `brief` from the man page response.

## Not done yet

- Orphaned rows (hashes no release references) are not pruned.
- The long tail (other sections, non-English) waits for promotion by demand.
- The deterministic parts could be built during ingestion, where the parsed
  pages are already in memory, instead of read back from Convex.
