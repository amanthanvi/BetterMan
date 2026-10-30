---
slug: character-encoding
title: Character encoding and UTF-8
term: UTF-8
summary: How text is stored as bytes, from 7-bit ASCII through the ISO 8859 sets to UTF-8, and why one byte is not always one character.
status: pending-owner
generated-by: claude-opus-5-5
generated-on: 2026-10-30
panel-review: GPT-6.1 Sol and Grok 4.7, 2026-10-30, corrections applied
sources:
  - page: utf-8(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: DESCRIPTION; Properties; Encoding; Application notes; Security
  - page: charsets(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine
    sections: ASCII; ISO/IEC 8859; Unicode
  - page: ascii(7)
    package: manpages 6.9.1-1
    distros: debian, ubuntu, fedora, arch, alpine, freebsd, macos
    sections: DESCRIPTION
related: iconv(1), locale(1), unicode(7), locale(7)
aliases: utf8, utf-8, unicode, ascii, character encoding, charset, charsets, character set, latin-1, iso-8859-1
references: utf-8(7), utf8(7), charsets(7), ascii(7), unicode(7), iso_8859-1(7), latin1(7)
---
Text in a file is a sequence of bytes; an *encoding* says which bytes stand for
which characters.

ASCII is the original 7-bit code: 128 characters covering English letters,
digits, punctuation and control codes such as newline and tab. ascii(7) has the
full table. The ISO/IEC 8859 family, such as Latin-1, kept ASCII as the lower
half; positions 128 to 159 are control characters, and 160 to 255 hold 96
characters for one group of languages at a time.

Unicode aims to give every character in every language its own number, and
UTF-8 is the common way to store it on Unix-like systems:

- ASCII characters are stored as the same single bytes, so a pure ASCII file
  is already valid UTF-8.
- Every other character takes two to four bytes, each in the range 0x80 to
  0xfd, so no byte inside a multibyte character can be mistaken for `/` or the
  null byte. The bytes 0xfe and 0xff never occur.
- The first byte tells how long the sequence is, so a reader can resynchronize
  after damaged data.

Programs learn the encoding from the [[locale]], set for example with
`LANG=en_GB.UTF-8`. In a UTF-8 locale one byte is not necessarily one
character, and one character does not always take one column on screen: wide
East Asian characters take two, and combining marks take none.

Each character must use its shortest encoding, and programs must reject
longer forms, which could slip a `/` past checks for the ASCII byte.
