---
slug: globbing
title: Globbing
term: globbing
summary: How wildcard patterns such as *.txt expand into the list of matching file names.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: glob(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: Wildcard matching; Pathnames; Empty lists; NOTES (Regular expressions; Character classes and internationalization)
related: sh(1), bash(1), glob(3), fnmatch(3), regex(7)
aliases: glob, globs, wildcard, wildcards, wildcard pattern, pathname expansion, filename expansion
references: glob(7)
---
Globbing turns a wildcard pattern into the list of path names that match it.
Your shell does it before the command runs, so `rm *.tmp` hands rm(1) the
actual file names, not the pattern. Programs can do the same with glob(3).

A word is a pattern if it contains `?`, `*` or `[`:

- `?` matches any single character.
- `*` matches any string, including the empty string.
- `[abc]` matches one of the listed characters, and `[a-z]` one character in a
  range. `[!abc]` matches any character that is *not* listed.

To use one of these characters literally, put a backslash in front of it or
quote it.

Two rules catch people out. A `/` is never matched by a wildcard: each part of
a path is matched separately, so `*/*.c` looks exactly one directory down. A
name that starts with a dot must be matched explicitly, so `*` skips `.profile`
and other hidden files.

When nothing matches, POSIX leaves the pattern unchanged, and the command
receives the literal `*.gif`. In bash, `shopt -s nullglob` makes an unmatched
pattern expand to nothing instead.

Wildcards are not [[regular-expressions|regular expressions]]. They match file names, not text, and the
symbols differ: in a regular expression `*` means "zero or more of the
preceding thing". Inside brackets, prefer named classes such as
`[[:lower:]]` to ranges like `[a-z]`, whose meaning depends on the locale.
