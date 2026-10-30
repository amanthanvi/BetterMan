---
slug: redirection
title: Redirection
term: redirection
summary: How the shell points a command's standard input, output and error at files or at each other with <, >, >>, 2>&1 and here documents.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: bash(1)
    package: bash 5.2.37-2+b10
    distros: debian
    sections: REDIRECTION (Redirecting Input; Redirecting Output; Appending Redirected Output; Redirecting Standard Output and Standard Error; Here Documents; Here Strings)
related: sh(1), tee(1), cat(1), dup2(2), open(2), stdin(3)
aliases: redirect, redirects, redirections, io redirection, i/o redirection, stdin, stdout, stderr, standard input, standard output, standard error, 2>&1, here document, heredoc, here string, file descriptor, file descriptors
pages: bash(1), sh(1), dash(1)
---
A command inherits its open file descriptors from the shell. By convention, 0
is *standard input*, 1 *standard output* and 2 *standard error*; often all three
are your terminal. Redirection, written
on the command line and carried out by the shell before the command runs,
points them somewhere else.

- `< file` reads standard input from `file`.
- `> file` writes standard output to `file`, creating it or emptying it first.
  With `set -o noclobber`, `>` refuses to overwrite an existing regular file;
  `>|` overrides that.
- `>> file` appends to `file` instead.
- `2> file` sends standard error to `file`; any descriptor number can go in
  front of the operator.
- `2>&1` makes descriptor 2 a copy of descriptor 1, so errors go wherever
  output is going at that moment.
- `&> file`, in bash, means the same as `> file 2>&1`.

Redirections are processed from left to right, so order matters:
`ls > dirlist 2>&1` puts both output and errors in `dirlist`, but
`ls 2>&1 > dirlist` sends errors to where output pointed *before* it was
redirected.

A *here document* feeds lines from the script itself to a command:

```
cat <<END
Hello, $USER
END
```

The lines up to the delimiter become standard input. If any part of the
delimiter word is quoted, as in `<<'END'`, they are used as written; otherwise
parameter expansion, command substitution and arithmetic expansion apply. In
bash, `<<< word` passes a single string, with a newline appended.

A [[pipelines|pipeline]] is the other way to connect commands.
