"""Flag verification for example commands.

Option keys follow convex/_optionFlags.ts, so a flag verifies here exactly when
the search index would find it on the same page. The verifier checks one page
variant's options table: a flag that exists only in another distro's manual
does not verify.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

from ingestion.generated.shell import (
    REDIRECTS,
    SEPARATORS,
    Op,
    ShellSyntaxError,
    Word,
    lex,
    segments,
)

MAX_FLAG_CHARS = 80
FLAG_RE = re.compile(r"^(?:-{1,2}|\+)[A-Za-z0-9?#@%:!][A-Za-z0-9_.+:#-]*$")
ATTACHED_PLACEHOLDER_RE = re.compile(
    r"^(-[A-Za-z])(?:NUM|N|FILE|FILES|PATTERN|PATTERNS|ACTION|DIR|DIRECTORY|STRING|COMMAND|TYPE"
    r"|LEVEL|SIZE|LIST|GLOB|FORMAT|WHEN|MODE|NAME|ARG|ARGS|VALUE|KEY|PATH|COUNT|WIDTH|SEP|SECS"
    r"|SECONDS|TIME|DATE|CHARS|LINES|BYTES|DEPTH)$"
)
_TAKES_ARGUMENT_RE = re.compile(r"[=<]|(?:^|[\s,|])\[?[A-Z][A-Z_]*\b")
_ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
# Wrappers that run the next word as the command.
# Commands that run another command. Only bare `sudo <target>` and bare
# `env <target>` are followed; any other wrapper form around the target is
# rejected, because its options could hide or change the real invocation.
_WRAPPERS = {
    "sudo",
    "doas",
    "env",
    "time",
    "nohup",
    "nice",
    "exec",
    "command",
    "builtin",
    "xargs",
    "timeout",
    "stdbuf",
    "ionice",
    "chrt",
    "taskset",
    "setsid",
    "flock",
    "runuser",
    "watch",
    "strace",
    "ltrace",
    "fakeroot",
    "chroot",
    "nsenter",
    "unbuffer",
}
_BARE_WRAPPERS = {"sudo", "env"}
_KEYWORDS = {"if", "then", "else", "elif", "while", "until", "do", "!"}
# GNU tar documents traditional usage: `tar cf a.tar` bundles option letters
# without a dash in the first argument.
BUNDLED_FIRST_ARGUMENT = {"tar"}
PLACEHOLDER = "\x1fBMPH\x1f"

Arity = Literal["none", "optional", "required"]


@dataclass(frozen=True)
class OptionFlag:
    anchor_id: str
    arity: Arity


OptionTable = Mapping[str, OptionFlag]


def flag_takes_argument(flags: str) -> bool:
    if _TAKES_ARGUMENT_RE.search(flags):
        return True
    return any(ATTACHED_PLACEHOLDER_RE.match(part) for part in re.split(r"[\s,|/]+", flags))


def flag_key(token: str) -> str | None:
    """`--sort=ORDER` and `--color[=WHEN]` key as `--sort` and `--color`; case is kept."""
    key = re.split(r"[=\[<]", token, maxsplit=1)[0]
    key = re.sub(r"[.,;:]+$", "", key)
    return key if len(key) <= MAX_FLAG_CHARS and FLAG_RE.match(key) else None


def _bracket_variants(part: str) -> list[str]:
    group = re.search(r"\[([^\]=]*)\]", part)
    if not group or group.start() == 0:
        return [part]
    without = part[: group.start()] + part[group.end() :]
    with_group = part[: group.start()] + group.group(1) + part[group.end() :]
    return [without, with_group]


def option_keys(flags: str) -> list[str]:
    keys: list[str] = []
    for part in re.split(r"[\s,|/]+", flags.strip()):
        if not part:
            continue
        for variant in _bracket_variants(part):
            key = flag_key(variant)
            if not key:
                continue
            attached = ATTACHED_PLACEHOLDER_RE.match(key)
            keys.append(attached.group(1) if attached else key)
    return keys


def option_table(options: Iterable[Mapping[str, object]] | None) -> dict[str, OptionFlag]:
    """Every flag the page documents. Unlike the search index, there is no row cap."""
    table: dict[str, OptionFlag] = {}
    for option in options or ():
        flags = option.get("flags")
        anchor_id = option.get("anchorId")
        if not isinstance(flags, str) or not isinstance(anchor_id, str) or not anchor_id:
            continue
        argument = option.get("argument")
        has_argument = isinstance(argument, str) and bool(argument.strip())
        arity: Arity = "none"
        if has_argument or flag_takes_argument(flags):
            optional = "[=" in flags or (has_argument and str(argument).strip().startswith("["))
            arity = "optional" if optional else "required"
        for key in option_keys(flags):
            table.setdefault(key, OptionFlag(anchor_id=anchor_id, arity=arity))
    return table


@dataclass(frozen=True)
class FlagCheck:
    ok: bool
    flags: tuple[str, ...]
    problems: tuple[str, ...]


_PROMPT_RE = re.compile(r"^\s*\$\s+")


def _script(command: str) -> str:
    """One shell line per command. With `$ ` prompts, other lines are output."""
    text = command.replace("\\\n", " ")
    lines = text.splitlines()
    if any(_PROMPT_RE.match(line) for line in lines):
        lines = [_PROMPT_RE.sub("", line) for line in lines if _PROMPT_RE.match(line)]
    lines = [line for line in lines if line.strip() and not line.lstrip().startswith("#")]
    return "\n".join(lines)


def _matches(texts: list[str], i: int, invocations: Sequence[Sequence[str]]) -> int | None:
    if i >= len(texts):
        return None
    head = texts[i].rsplit("/", 1)[-1]
    for words in sorted(invocations, key=len, reverse=True):
        if [head, *texts[i + 1 : i + len(words)]] == list(words):
            return i + len(words)
    return None


def _command_start(
    segment: list[Word], invocations: Sequence[Sequence[str]]
) -> tuple[int | None, str | None]:
    """Where the target's arguments start in this segment, or a reason the
    segment runs the target in a way the verifier cannot check."""
    heads = {words[0] for words in invocations}
    texts = [word.text for word in segment]
    i = 0
    while i < len(segment) and (
        texts[i] in _KEYWORDS or (not segment[i].quoted and _ASSIGNMENT_RE.match(texts[i]))
    ):
        i += 1
    if i >= len(segment):
        return None, None
    # A placeholder stands for an argument, never for the command itself.
    if PLACEHOLDER in texts[i]:
        return None, "placeholder in command position"
    mentions = any(text.rsplit("/", 1)[-1] in heads for text in texts[i + 1 :])
    if texts[i] in _WRAPPERS and texts[i] not in heads:
        if texts[i] in _BARE_WRAPPERS:
            start = _matches(texts, i + 1, invocations)
            if start is not None:
                return start, None
        # Behind a wrapper that is not followed, any placeholder could be the
        # command it runs (`env -- {{tar}}`, `xargs {{tar}}`).
        if any(PLACEHOLDER in text for text in texts[i + 1 :]):
            return None, f"placeholder in command position after {texts[i]}"
        if mentions:
            following = texts[i + 1] if i + 1 < len(texts) else ""
            return None, f"wrapped invocation: {texts[i]} {following}".rstrip()
        return None, None
    start = _matches(texts, i, invocations)
    if start is not None:
        return start, None
    if mentions:
        # `find -exec tar ...`, `ssh host tar ...`: the target runs, unchecked.
        return None, f"indirect invocation through {texts[i]}"
    return None, None


def _check_arguments(
    args: list[str], table: OptionTable, *, bundled_first: bool
) -> tuple[list[str], list[str]]:
    used: list[str] = []
    problems: list[str] = []
    expect_value = False
    for index, token in enumerate(args):
        if expect_value:
            expect_value = False
            continue
        if token == "--":
            break
        if bundled_first and index == 0 and re.fullmatch(r"[A-Za-z]+", token):
            token = f"-{token}"
        if PLACEHOLDER in token:
            prefix = token.split(PLACEHOLDER, 1)[0]
            if prefix.startswith("-") and "=" not in prefix and len(prefix) > 1:
                problems.append(f"placeholder inside flag {prefix}")
            elif prefix == "-":
                problems.append("placeholder used as a flag")
            elif prefix.startswith("-"):
                key = flag_key(prefix)
                if key is None or key not in table:
                    problems.append(f"unknown flag {prefix.split('=', 1)[0]}")
                else:
                    used.append(key)
            continue
        if token.startswith("+"):
            key = flag_key(token)
            if key and key in table:
                used.append(key)
            continue
        if not token.startswith("-") or token == "-":
            continue
        head = token.split("=", 1)[0]
        option = table.get(head)
        if option is not None:
            used.append(head)
            expect_value = option.arity == "required" and "=" not in token
            continue
        if token.startswith("--"):
            problems.append(f"unknown flag {head}")
            continue
        # A single-dash token that is not itself an option is a cluster of
        # short flags. A flag that takes an argument ends the cluster: the
        # rest is its value (`-ofile`, `-n5`).
        for position, letter in enumerate(token[1:], start=1):
            short = f"-{letter}"
            flag = table.get(short)
            if flag is None:
                problems.append(f"unknown flag {short} in {token}")
                break
            used.append(short)
            if flag.arity == "required":
                expect_value = position == len(token) - 1
                break
    return used, problems


def verify_command(
    command: str,
    *,
    invocations: Sequence[Sequence[str]],
    table: OptionTable,
) -> FlagCheck:
    """Check every flag passed to this page's command against its options table.

    Other commands in a pipeline are not this page's responsibility and are
    ignored. A command that never invokes the page's command fails.
    """
    try:
        tokens = lex(_script(command))
    except ShellSyntaxError as exc:
        return FlagCheck(False, (), (f"unsupported shell syntax: {exc}",))
    used: list[str] = []
    problems: list[str] = []
    invoked = False
    bundled = any(len(words) == 1 and words[0] in BUNDLED_FIRST_ARGUMENT for words in invocations)
    for segment in segments(tokens):
        start, problem = _command_start(segment, invocations)
        if problem:
            problems.append(problem)
            continue
        if start is None:
            continue
        invoked = True
        segment_used, segment_problems = _check_arguments(
            [word.text for word in segment[start:]], table, bundled_first=bundled
        )
        used.extend(segment_used)
        problems.extend(segment_problems)
    if not invoked:
        problems.append(f"does not run {' '.join(invocations[0])}")
    return FlagCheck(not problems, tuple(used), tuple(problems))


# Families whose `<family>-<sub>` pages document `<family> <sub>`.
SUBCOMMAND_FAMILIES = {
    "apt",
    "btrfs",
    "cargo",
    "dnf",
    "docker",
    "dpkg",
    "git",
    "ip",
    "nmcli",
    "npm",
    "perf",
    "podman",
    "zfs",
    "zpool",
}


def invocations_for(name: str, title_words: Sequence[str] | None = None) -> list[tuple[str, ...]]:
    """How a page's command is typed, most specific first.

    `git-commit` is typed `git commit`; tldr's page title is authoritative when
    it spells the same name. The page name itself is always accepted.
    """
    forms: list[tuple[str, ...]] = []
    if title_words and "-".join(title_words) == name and len(title_words) > 1:
        forms.append(tuple(title_words))
    family, _, sub = name.partition("-")
    if sub and family in SUBCOMMAND_FAMILIES and (family, sub) not in forms:
        forms.append((family, sub))
    forms.append((name,))
    return forms


def simple_invocation_problems(command: str, invocations: Sequence[Sequence[str]]) -> list[str]:
    """Generated examples must be one simple command that runs this page's command.

    No separators, pipes, background jobs, redirections, substitutions,
    subshells, heredocs, assignments or wrapper prefixes. Nothing is repaired.
    """
    try:
        tokens = lex(command, comments=False)
    except ShellSyntaxError as exc:
        return [f"unsupported shell syntax: {exc}"]
    problems: list[str] = []
    ops = {token.text for token in tokens if isinstance(token, Op)}
    if ops & SEPARATORS:
        problems.append("more than one command")
    if ops & REDIRECTS:
        problems.append("redirection")
    words = [token for token in tokens if isinstance(token, Word)]
    if not words:
        return [*problems, "empty command"]
    first = words[0]
    if not first.quoted and _ASSIGNMENT_RE.match(first.text):
        problems.append("variable assignment")
    elif first.text in _WRAPPERS | _KEYWORDS:
        problems.append(f"wrapper prefix {first.text}")
    texts = [word.text for word in words]
    if not any(texts[: len(form)] == list(form) for form in invocations):
        problems.append(f"does not start with {' '.join(invocations[0])}")
    return problems
