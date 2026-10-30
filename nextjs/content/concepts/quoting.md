---
slug: quoting
title: Quoting in the shell
term: quoting
summary: How backslashes, single quotes and double quotes stop the shell from treating spaces, $, * and other characters as special.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: bash(1)
    package: bash 5.2.37-2+b10
    distros: debian
    sections: DEFINITIONS; QUOTING; EXPANSION (Word Splitting; Pathname Expansion; Quote Removal); HISTORY EXPANSION
related: sh(1), dash(1), printf(1), echo(1)
aliases: quote, quotes, single quotes, double quotes, escaping, backslash, word splitting
pages: bash(1), sh(1), dash(1)
---
The shell gives many characters a special meaning. Spaces and tabs separate
words; `| & ; ( ) < >` build pipelines, lists and
[[redirection|redirections]]; `$` starts an expansion; `*`, `?` and `[` are
[[globbing|wildcards]]. Quoting turns that meaning off so a character stands
for itself.

There are three ways to quote:

- A *backslash* keeps the next character literal: `\*` is a plain asterisk.
  A backslash at the end of a line joins it to the next.
- *Single quotes* keep everything inside literal, with no exceptions. A single
  quote cannot appear inside single quotes, not even after a backslash.
- *Double quotes* keep everything literal except `$`, the backquote and `\`
  (and `!` while interactive history expansion is on, outside POSIX mode), so
  variables and command substitutions still expand: `"$HOME/My Files"` is
  one word. Inside them a backslash escapes only `$`, the backquote, `"`, `\`
  and a newline.

After the shell expands an unquoted
`$var` or `$(command)`, it splits the result into words at the characters in
`IFS` (space, tab and newline by default; an empty `IFS` means no splitting),
then expands any wildcards in
them. Double quotes prevent both, so `rm "$file"` removes one file even if its
name contains spaces, while `rm $file` might remove several.

An empty pair of quotes, `""` or `''`, passes an empty argument. Once
expansion is done, the shell removes the quote characters themselves. In bash, `$'...'` is a further form in which
backslash escapes such as `\n` and `\t` are decoded.
