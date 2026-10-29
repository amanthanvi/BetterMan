"""A small POSIX-shell lexer for checking example commands.

It keeps quoting: `';'` is a word, not a separator. Syntax the verifier
cannot follow safely (command and process substitution, `${...}`, subshells,
heredocs) raises ShellSyntaxError instead of being guessed at.
"""

from __future__ import annotations

from dataclasses import dataclass


class ShellSyntaxError(ValueError):
    pass


@dataclass(frozen=True)
class Word:
    text: str
    quoted: bool = False


@dataclass(frozen=True)
class Op:
    text: str


SEPARATORS = frozenset({";", ";;", "&", "&&", "||", "|", "|&", "\n"})
REDIRECTS = frozenset({"<", ">", ">>", ">&", "<&", "&>", "&>>", ">|", "<>"})
_UNSUPPORTED_OPS = {
    "<<": "heredoc",
    "<<-": "heredoc",
    "<<<": "here-string",
    "<(": "process substitution",
    ">(": "process substitution",
    "(": "subshell",
    ")": "subshell",
}
# Longest first, so `&&` wins over `&`.
_OPERATORS = sorted({*SEPARATORS - {"\n"}, *REDIRECTS, *_UNSUPPORTED_OPS}, key=len, reverse=True)
_OPERATOR_CHARS = frozenset(";&|<>()")


def lex(text: str) -> list[Word | Op]:
    tokens: list[Word | Op] = []
    buf: list[str] = []
    in_word = False
    quoted = False
    i = 0
    n = len(text)

    def flush() -> None:
        nonlocal in_word, quoted
        if in_word:
            tokens.append(Word("".join(buf), quoted))
        buf.clear()
        in_word = False
        quoted = False

    while i < n:
        c = text[i]
        if c in " \t":
            flush()
            i += 1
        elif c == "\n":
            flush()
            tokens.append(Op("\n"))
            i += 1
        elif c == "#" and not in_word:
            while i < n and text[i] != "\n":
                i += 1
        elif c == "'":
            end = text.find("'", i + 1)
            if end < 0:
                raise ShellSyntaxError("unterminated quote")
            buf.append(text[i + 1 : end])
            in_word = quoted = True
            i = end + 1
        elif c == '"':
            i += 1
            while i < n and text[i] != '"':
                ch = text[i]
                if ch == "\\" and i + 1 < n and text[i + 1] in '"\\$`\n':
                    buf.append(text[i + 1])
                    i += 2
                    continue
                _check_expansion(text, i)
                buf.append(ch)
                i += 1
            if i >= n:
                raise ShellSyntaxError("unterminated quote")
            in_word = quoted = True
            i += 1
        elif c == "\\":
            if i + 1 < n:
                buf.append(text[i + 1])
            in_word = quoted = True
            i += 2
        elif c in _OPERATOR_CHARS:
            flush()
            op = next(op for op in _OPERATORS if text.startswith(op, i))
            if op in _UNSUPPORTED_OPS:
                raise ShellSyntaxError(_UNSUPPORTED_OPS[op])
            tokens.append(Op(op))
            i += len(op)
        else:
            _check_expansion(text, i)
            buf.append(c)
            in_word = True
            i += 1
    flush()
    return tokens


def _check_expansion(text: str, i: int) -> None:
    c = text[i]
    if c == "`":
        raise ShellSyntaxError("command substitution")
    if c == "$" and i + 1 < len(text):
        if text[i + 1] == "(":
            raise ShellSyntaxError("command substitution")
        if text[i + 1] == "{":
            raise ShellSyntaxError("parameter expansion")


def segments(tokens: list[Word | Op]) -> list[list[Word]]:
    """Simple commands, with redirections and their targets removed."""
    result: list[list[Word]] = [[]]
    skip_target = False
    for token in tokens:
        if isinstance(token, Op):
            if token.text in REDIRECTS:
                skip_target = True
            else:
                result.append([])
            continue
        if skip_target:
            skip_target = False
            continue
        result[-1].append(token)
    return [segment for segment in result if segment]
