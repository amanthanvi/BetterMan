---
slug: regular-expressions
title: Regular expressions
term: regular expressions
summary: The pattern language grep, sed and many other tools use to match text, in its basic and extended forms.
status: approved
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
owner-skim: approved 2026-10-30
sources:
  - page: regex(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION
  - page: re_format(7)
    distros: freebsd, macos
    sections: DESCRIPTION
related: grep(1), sed(1), awk(1), regex(3), glob(7)
aliases: regex, regexp, regexps, regular expression, extended regular expressions, basic regular expressions
references: regex(7), re_format(7)
---
A regular expression (RE) is a pattern that describes text. grep(1) prints the
lines that match one, sed(1) edits them, and many other tools accept them.
POSIX defines two dialects: *extended* REs, roughly those of egrep(1) or
`grep -E`, and *basic* REs, the older form that grep(1) and sed(1) use unless
told otherwise.

The building blocks of an extended RE:

- An ordinary character matches itself; `.` matches any single character.
- `^` matches at the start of a line and `$` at the end.
- `[abc]` matches one listed character, `[^abc]` any character not listed,
  and `[[:digit:]]` any character in a named class.
- After an item, `*` means zero or more, `+` one or more, `?` zero or one,
  and `{2,4}` between two and four.
- `(...)` groups, and `|` separates alternatives: `(cat|dog)s?`.
- A backslash makes a special character ordinary: `\.` matches a dot.

In a basic RE, `+`, `?` and `|` are ordinary characters, and grouping and
bounds are written `\(...\)` and `\{...\}`. Basic REs add back references: `\1`
matches the same text the first group matched.

When several matches are possible, the one that starts earliest wins, and of
those the longest. Ranges such as `[a-z]` depend on the locale's collating
order, so named classes are the portable choice. Some programs extend this syntax;
their own manual pages say how. File-name wildcards look similar but follow
different rules; see [[globbing]].
