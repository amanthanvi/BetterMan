---
slug: exit-status
title: Exit status
term: exit status
summary: The number from 0 to 255 every command returns, where 0 means success, and how the shell tests it with $?, &&, || and if.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: bash(1)
    package: bash 5.2.37-2+b10
    distros: debian
    sections: EXIT STATUS; SHELL GRAMMAR (Pipelines; Lists); COMMAND EXECUTION
  - page: grep(1)
    package: grep 3.11-4
    distros: debian
    sections: EXIT STATUS
related: sh(1), true(1), false(1), test(1), exit(3), wait(2), signal(7)
aliases: exit code, exit codes, exit status, exit statuses, return code, return value, return status, $?, status code
headings: EXIT STATUS, EXIT CODES
pages: bash(1), sh(1), dash(1)
---
Every command finishes with an *exit status*, a number from 0 to 255. Zero
means success; any other value means failure. Many manual pages have an EXIT
STATUS section that says what their nonzero values mean, and they differ from
program to program: grep(1), for example, uses 1 for "no lines selected" and 2
for an error, though with `-q` a selected line gives 0 even after an error.

The shell keeps the status of the last command in `$?`, and uses it to decide
what runs next:

- `cmd1 && cmd2` runs `cmd2` only if `cmd1` succeeded.
- `cmd1 || cmd2` runs `cmd2` only if `cmd1` failed.
- `if`, `while` and `until` test a command's status, not a value.

A few values have fixed meanings in bash(1):

- 127: the command was not found, unless a `command_not_found_handle`
  function supplies another status.
- 126: the command was found but could not be executed.
- 128 + *N*: the command was killed by [[signals|signal]] *N*, so 130 usually
  means it was interrupted by `SIGINT`.
- 2: a shell builtin was used incorrectly.

Because the shell gives values above 125 these special meanings, a program's
own failure codes are clearest below 126.

A [[pipelines|pipeline]] returns the status of its last command; with
`pipefail` set, it returns that of the rightmost command that failed. `!` in
front inverts the status. A script ends with the status of the last command it
ran, or the value given to `exit`; a syntax error makes it exit nonzero.
