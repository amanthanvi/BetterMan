"""tldr-pages examples, pinned to one upstream commit and verified flag by flag.

tldr-pages is CC BY 4.0. Every example keeps its source path and the pinned
commit so the page can attribute it; `TLDR_ATTRIBUTION` is the notice.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path

from ingestion.generated.flags import (
    PLACEHOLDER,
    OptionTable,
    invocations_for,
    verify_command,
)
from ingestion.generated.safety import has_forbidden_chars

TLDR_REPO = "https://github.com/tldr-pages/tldr.git"
# Upstream re-uploads its release zips on every merge, so a release tag does
# not pin content. A commit does; the digest below covers the English pages.
TLDR_COMMIT = "f4566462f5996e13a4f3523f21dc2a863aec53c1"
TLDR_PAGES_SHA256 = "c4c8360da75a8d471399506445b298acd76e8234c0211a33c9a15176afc48ac8"
TLDR_LICENSE = "CC-BY-4.0"
TLDR_ATTRIBUTION = (
    "Examples marked tldr-pages are from the tldr-pages project "
    "(https://github.com/tldr-pages/tldr), © the tldr-pages team and contributors, "
    "licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). "
    "BetterMan converts placeholders, showing the first of alternative values, "
    "and keeps only examples whose flags exist in the manual shown."
)

# Platform directories in lookup order. A platform page overrides common/.
PLATFORMS_BY_DISTRO: Mapping[str, tuple[str, ...]] = {
    "debian": ("linux", "common"),
    "ubuntu": ("linux", "common"),
    "fedora": ("linux", "common"),
    "arch": ("linux", "common"),
    "alpine": ("linux", "common"),
    "freebsd": ("freebsd", "common"),
    "macos": ("osx", "common"),
}
# tldr documents commands; library and file-format sections never match.
COMMAND_SECTIONS = ("1", "8", "6")
MAX_EXAMPLES = 5
MAX_COMMAND_CHARS = 400
MAX_DESCRIPTION_CHARS = 240

# `{{[-c|--create]}}` (option spellings) and `{{[a|address]}}` (subcommand spellings).
_ALTERNATIVES_RE = re.compile(r"^\[([^\[\]{}|\s]+(?:\|[^\[\]{}|\s]+)+)\]$")
_PLACEHOLDER_RE = re.compile(r"\{\{(.*?)\}\}")
# One flag spelling, optionally with an attached value; no metacharacters.
_FLAG_TOKEN_RE = re.compile(r"^[-+]{1,2}[A-Za-z0-9?#@%:!][A-Za-z0-9_.+:#@%!,/=~*-]*$")
# One value word: not a flag, no shell metacharacters, quotes or backslashes.
_VALUE_WORD_RE = re.compile(r"^(?!-)[^\s;|&$<>()`'\"\\]+$")


class PlaceholderError(ValueError):
    pass


_MNEMONIC_RE = re.compile(r"\[([A-Za-z0-9])\]")
_ALIAS_RE = re.compile(r"This command is an alias of `([^`]+)`")


@dataclass(frozen=True)
class TldrExample:
    description: str
    command: str


@dataclass(frozen=True)
class TldrPage:
    path: str
    title: str
    description: str
    examples: tuple[TldrExample, ...]
    alias_of: str | None = None


@dataclass(frozen=True)
class Example:
    description: str
    command: str
    # [start, end) character spans of user-supplied values in `command`.
    placeholders: tuple[tuple[int, int], ...] = ()

    def to_json(self) -> dict:
        data: dict = {"description": self.description, "command": self.command}
        if self.placeholders:
            data["placeholders"] = [list(span) for span in self.placeholders]
        return data


@dataclass
class TldrResult:
    path: str
    examples: list[Example] = field(default_factory=list)
    flags: Counter[str] = field(default_factory=Counter)
    # Every example that verified, including those past the kept five.
    verified: int = 0
    rejected: list[tuple[str, tuple[str, ...]]] = field(default_factory=list)


def parse_page(text: str, path: str) -> TldrPage:
    title = ""
    description: list[str] = []
    examples: list[TldrExample] = []
    pending: str | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("# ") and not title:
            title = line[2:].strip()
        elif line.startswith("> "):
            body = line[2:].strip()
            if not body.startswith("More information:"):
                description.append(body)
        elif line.startswith("- "):
            pending = line[2:].strip()
        elif line.startswith("`") and line.endswith("`") and len(line) > 1 and pending is not None:
            examples.append(TldrExample(description=pending, command=line[1:-1]))
            pending = None
    summary = " ".join(description)
    alias = _ALIAS_RE.search(summary)
    return TldrPage(
        path=path,
        title=title,
        description=summary,
        examples=tuple(examples),
        alias_of=alias.group(1) if alias else None,
    )


def page_files(root: Path) -> list[Path]:
    return sorted(root.glob("pages/*/*.md"))


def pages_digest(root: Path) -> str:
    """sha256 over (relative path, file sha256) for every English page."""
    digest = hashlib.sha256()
    for path in page_files(root):
        rel = path.relative_to(root).as_posix()
        digest.update(f"{rel}\0{hashlib.sha256(path.read_bytes()).hexdigest()}\n".encode())
    return digest.hexdigest()


class TldrIndex:
    def __init__(self, pages: Mapping[str, Mapping[str, TldrPage]], *, commit: str) -> None:
        self._pages = pages
        self.commit = commit

    @classmethod
    def load(cls, root: Path, *, commit: str = TLDR_COMMIT) -> TldrIndex:
        pages: dict[str, dict[str, TldrPage]] = {}
        for path in page_files(root):
            platform = path.parent.name
            rel = path.relative_to(root / "pages").as_posix()
            page = parse_page(path.read_text(encoding="utf-8"), rel)
            pages.setdefault(platform, {})[path.stem] = page
        return cls(pages, commit=commit)

    def lookup(self, *, distro: str, name: str, section: str) -> TldrPage | None:
        if section not in COMMAND_SECTIONS:
            return None
        stem = name.lower()
        for platform in PLATFORMS_BY_DISTRO.get(distro, ("common",)):
            page = self._pages.get(platform, {}).get(stem)
            if page is not None:
                return page
        return None

    def page_count(self) -> int:
        return sum(len(pages) for pages in self._pages.values())


def convert_command(command: str, table: OptionTable) -> tuple[str, str, list[tuple[int, int]]]:
    """Return (display command, command to verify, placeholder spans).

    `{{path/to/file}}` shows as `path/to/file` and verifies as an opaque value.
    `{{[-c|--create]}}` becomes the first spelling this page documents, short
    form first; with neither documented, the short form stays and fails.
    `{{[a|address]}}` names a subcommand and shows its longest spelling.
    A placeholder that starts with `-` (`{{--flag}}`, `{{-v|--verbose}}`)
    names flags and is verified, never treated as an opaque value.
    `{{tagged|untagged}}` and `{{0|76|...}}` are value alternations shown as
    their first real choice. Anything else must be plain value words;
    otherwise PlaceholderError.
    """
    display: list[str] = []
    verify: list[str] = []
    spans: list[tuple[int, int]] = []
    cursor = 0
    length = 0
    for match in _PLACEHOLDER_RE.finditer(command):
        literal = command[cursor : match.start()]
        display.append(literal)
        verify.append(literal)
        length += len(literal)
        inner = match.group(1)
        alternatives = _ALTERNATIVES_RE.match(inner)
        bare = inner.strip()
        if alternatives or bare.startswith("-"):
            # `{{[-c|--create]}}`, `{{--flag}}`, `{{-v|--verbose}}` name flags;
            # `{{[a|address]}}` names a subcommand. Each choice is one token.
            choices = (alternatives.group(1) if alternatives else bare).split("|")
            flags = all(choice.startswith("-") for choice in choices)
            for choice in choices:
                if not (_FLAG_TOKEN_RE.match(choice) if flags else _VALUE_WORD_RE.match(choice)):
                    raise PlaceholderError(f"unsafe placeholder {{{{{inner}}}}}")
            if flags:
                documented = [c for c in choices if c.split("=", 1)[0] in table]
                chosen = documented[0] if documented else choices[0]
            else:
                # Subcommand abbreviations: show the full word.
                chosen = max(choices, key=len)
            display.append(chosen)
            verify.append(chosen)
            length += len(chosen)
        elif "|" in inner:
            # A value alternation, `{{tagged|untagged}}` or `{{0|76|...}}`:
            # every choice is one safe value word, and the first real one
            # (not a literal `...`) is shown as the value.
            choices = [choice.strip() for choice in inner.split("|")]
            if not all(_VALUE_WORD_RE.match(choice) for choice in choices):
                raise PlaceholderError(f"unsafe placeholder {{{{{inner}}}}}")
            real = [choice for choice in choices if choice != "..."]
            if not real:
                raise PlaceholderError(f"unsafe placeholder {{{{{inner}}}}}")
            display.append(real[0])
            verify.append(PLACEHOLDER)
            spans.append((length, length + len(real[0])))
            length += len(real[0])
        else:
            # A value: whitespace-separated words, none a flag, none with
            # shell metacharacters or quotes (`path/to/file1 path/to/file2 ...`).
            words = inner.split()
            if not words or not all(_VALUE_WORD_RE.match(word) for word in words):
                raise PlaceholderError(f"unsafe placeholder {{{{{inner}}}}}")
            display.append(inner)
            verify.append(PLACEHOLDER)
            spans.append((length, length + len(inner)))
            length += len(inner)
        cursor = match.end()
    tail = command[cursor:]
    display.append(tail)
    verify.append(tail)
    return "".join(display), "".join(verify), spans


def clean_description(text: str) -> str:
    text = _MNEMONIC_RE.sub(r"\1", text).strip()
    return text[:-1] if text.endswith(":") else text


def tldr_examples(
    page: TldrPage, *, name: str, table: OptionTable, max_examples: int = MAX_EXAMPLES
) -> TldrResult:
    """Convert and verify a tldr page's examples against one manual's options."""
    result = TldrResult(path=page.path)
    if page.alias_of is not None:
        return result
    invocations = invocations_for(name, page.title.split())
    for example in page.examples:
        try:
            display, verify, spans = convert_command(example.command, table)
        except PlaceholderError as exc:
            result.rejected.append((example.command, (str(exc),)))
            continue
        check = verify_command(verify, invocations=invocations, table=table)
        problems = list(check.problems)
        if len(display) > MAX_COMMAND_CHARS:
            problems.append("command too long")
        description = clean_description(example.description)
        if has_forbidden_chars(display) or has_forbidden_chars(description):
            problems.append("control characters")
        if len(description) > MAX_DESCRIPTION_CHARS:
            problems.append("description too long")
        if problems:
            result.rejected.append((example.command, tuple(problems)))
            continue
        result.verified += 1
        if len(result.examples) < max_examples:
            result.examples.append(
                Example(
                    description=description,
                    command=display,
                    placeholders=tuple(spans),
                )
            )
        result.flags.update(set(check.flags))
    return result


def fetch_pinned(
    dest: Path,
    *,
    commit: str = TLDR_COMMIT,
    expected: str = TLDR_PAGES_SHA256,
    repo: str = TLDR_REPO,
) -> Path:
    """Shallow-fetch exactly `commit` (pages and LICENSE only) and check the digest."""
    dest.mkdir(parents=True, exist_ok=True)

    def git(*args: str) -> str:
        return subprocess.run(
            ["git", "-C", str(dest), *args], check=True, capture_output=True, text=True
        ).stdout.strip()

    if not (dest / ".git").exists():
        git("init", "-q")
        git("remote", "add", "origin", repo)
    git("sparse-checkout", "set", "--no-cone", "/pages/", "/LICENSE.md")
    git("-c", "advice.detachedHead=false", "fetch", "-q", "--depth", "1", "origin", commit)
    git("-c", "advice.detachedHead=false", "checkout", "-q", "--force", "FETCH_HEAD")
    head = git("rev-parse", "HEAD")
    if head != commit:
        raise RuntimeError(f"tldr-pages checkout is {head}, expected {commit}")
    actual = pages_digest(dest)
    if actual != expected:
        raise RuntimeError(f"tldr-pages digest {actual} does not match pinned {expected}")
    return dest
