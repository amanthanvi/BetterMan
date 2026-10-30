---
slug: environment
title: Environment variables
term: environment variables
summary: The name=value strings every process inherits, such as PATH, HOME and LANG, and how to set them.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: environ(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine, freebsd, macos
    sections: DESCRIPTION; NOTES; BUGS
related: env(1), printenv(1), sh(1), bash(1), getenv(3), setenv(3), execve(2)
aliases: environment, environment variable, env var, env vars, environ, path variable
references: environ(7)
---
Every process carries an *environment*: a list of strings of the form
`name=value`. A child process inherits a copy of its parent's environment. A
shell variable reaches the programs you start only once it is exported, or
when it is assigned in front of the command. Names are case-sensitive and
cannot contain `=`.

In a Bourne-style shell, `export NAME=value` puts a variable into the
environment of every command run afterwards, while `NAME=value command` sets it
for that one command only. env(1) and printenv(1) show the current environment.

Variables you will meet everywhere:

- `PATH`, the colon-separated list of directories searched, in order, for a
  command given without a slash.
- `HOME`, `USER`, `LOGNAME` and `SHELL`, set at login from the user database;
  su(1) may keep `LOGNAME` and `USER` from the old user.
- `LANG` and the `LC_*` variables, which choose the [[locale]].
- `TERM`, the terminal type output is prepared for.
- `PAGER`, `EDITOR` and `VISUAL`, the programs other tools launch for you.
- `TMPDIR`, the directory many programs use for temporary files.

Many manual pages have an ENVIRONMENT section listing the variables that
program reads; the list in environ(7) covers only common ones.

The environment is input a program did not choose, so treat it with care:
unusual values of variables such as `IFS` or `LD_LIBRARY_PATH` have tricked
system commands into misbehaving. An empty entry in `PATH`, or a leading or
trailing colon, means the current directory; this legacy feature is
deprecated.
