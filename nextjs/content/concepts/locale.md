---
slug: locale
title: Locale
term: locale
summary: The language and cultural settings, chosen by LANG and the LC_* variables, that change messages, sorting, character handling, numbers and dates.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
sources:
  - page: locale(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION (the LC_* categories and how the default locale is determined); FILES
  - page: environ(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine, freebsd, macos
    sections: LANG
  - page: bash(1)
    package: bash 5.2.37-2+b10
    distros: debian
    sections: Pattern Matching
related: locale(1), localedef(1), setlocale(3), locale(5), environ(7)
aliases: locales, lang, lc_all, lc_ctype, lc_collate, lc_messages, lc_time, lc_numeric, localization, internationalization
references: locale(7)
---
A locale is a set of language and cultural rules: the language of messages,
how bytes are read as characters, how strings sort, and how numbers, money,
dates and times are written. The same command can sort, match or print
differently under two locales.

The rules come in categories, each of which can be set on its own:

- `LC_CTYPE`, how bytes become characters and which characters are letters,
  digits or upper case.
- `LC_COLLATE`, the sorting order, which also shapes ranges such as `[a-z]` in
  [[globbing|wildcards]] and [[regular-expressions|regular expressions]].
- `LC_MESSAGES`, the language of messages and of yes/no answers.
- `LC_NUMERIC` and `LC_MONETARY`, such as the decimal point or comma.
- `LC_TIME`, how dates and times are formatted.

A program that asks for the default locale picks each category from the
[[environment]] in this order: `LC_ALL` if it is set, then the variable named
after the category (for example `LC_TIME`), then `LANG`. So `LANG` sets a
default, a single `LC_*` variable overrides one category, and `LC_ALL`
overrides everything.

Locale names look like `en_GB.UTF-8`, and compiled locale data usually lives
in `/usr/lib/locale`. locale(1) shows the current settings. Setting
`LC_ALL=C` asks for the traditional behaviour; bash(1), for example, suggests
it to make `[a-d]` mean exactly `[abcd]`.
