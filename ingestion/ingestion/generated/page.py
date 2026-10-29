"""Per-page inputs: the page's own EXAMPLES and a bounded excerpt for the prompt."""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field

from ingestion.generated.flags import invocations_for, option_table, verify_command
from ingestion.generated.safety import has_forbidden_chars
from ingestion.generated.tldr import Example

EXAMPLE_HEADINGS = {"EXAMPLE", "EXAMPLES", "USAGE EXAMPLES", "EXAMPLES OF USE"}
MAX_PAGE_EXAMPLES = 5
MAX_COMMAND_CHARS = 400
MAX_DESCRIPTION_CHARS = 240
MAX_EXAMPLE_LINES = 6

# Excerpt bounds keep one request near 1,500 input tokens (about 4 chars each).
SYNOPSIS_CHARS = 600
DESCRIPTION_CHARS = 1500
OPTIONS_CHARS = 3500
OPTION_LINE_CHARS = 160


@dataclass
class PageInput:
    distro: str
    name: str
    section: str
    content_sha256: str
    description: str
    synopsis: list[str]
    options: list[dict]
    doc: dict
    source_package: str | None = None
    _table: dict | None = field(default=None, repr=False, compare=False)

    @property
    def table(self):
        if self._table is None:
            self._table = option_table(self.options)
        return self._table


def inline_text(inlines: Iterable[dict]) -> str:
    parts: list[str] = []
    for node in inlines or ():
        if node.get("type") in {"text", "code"}:
            parts.append(str(node.get("text", "")))
        else:
            parts.append(inline_text(node.get("inlines", ())))
    return "".join(parts)


def block_text(blocks: Iterable[dict]) -> str:
    parts: list[str] = []
    for block in blocks or ():
        kind = block.get("type")
        if kind == "paragraph":
            parts.append(inline_text(block.get("inlines", ())))
        elif kind == "code_block":
            parts.append(str(block.get("text", "")))
        elif kind == "list":
            parts.extend(block_text(item) for item in block.get("items", ()))
        elif kind == "definition_list":
            for item in block.get("items", ()):
                parts.append(inline_text(item.get("termInlines", ())))
                parts.append(block_text(item.get("definitionBlocks", ())))
        elif kind == "table":
            parts.extend(" ".join(row) for row in block.get("rows", ()))
    return " ".join(" ".join(part.split()) for part in parts if part.strip())


def section_blocks(doc: dict, titles: set[str]) -> list[dict]:
    """Blocks under the first heading whose text is in `titles`, up to its next peer."""
    blocks = doc.get("blocks") or []
    for index, block in enumerate(blocks):
        if block.get("type") != "heading":
            continue
        if " ".join(str(block.get("text", "")).upper().split()) not in titles:
            continue
        level = block.get("level", 2)
        body: list[dict] = []
        for following in blocks[index + 1 :]:
            if following.get("type") == "heading" and following.get("level", 2) <= level:
                break
            body.append(following)
        return body
    return []


def _clip(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _command_text(text: str) -> str | None:
    # The manual's own text: tabs become spaces and CRs go; any other control
    # character drops the example (multi-line examples keep their line feeds).
    text = text.replace("\t", "    ").replace("\r", "")
    lines = [line.rstrip() for line in text.strip("\n").split("\n")]
    if any(has_forbidden_chars(line) for line in lines):
        return None
    if not lines or len(lines) > MAX_EXAMPLE_LINES:
        return None
    command = "\n".join(lines)
    return command if 0 < len(command) <= MAX_COMMAND_CHARS else None


def _flat(blocks: Iterable[dict]) -> Iterable[dict]:
    """Walk blocks in reading order, descending into definition and list bodies."""
    for block in blocks:
        yield block
        if block.get("type") == "definition_list":
            for item in block.get("items", ()):
                term = inline_text(item.get("termInlines", ()))
                body = item.get("definitionBlocks", ())
                first = body[0] if body and body[0].get("type") == "paragraph" else None
                yield {"type": "_term", "text": term, "description": first}
                if first is not None:
                    yield {**first, "type": "_definition_description"}
                yield from _flat(body[1:] if first is not None else body)
        elif block.get("type") == "list":
            for item in block.get("items", ()):
                yield from _flat(item)


def page_examples(page: PageInput) -> tuple[list[Example], Counter[str]]:
    """The manual's own EXAMPLES: code blocks and command-shaped terms, in order.

    These are shown as the manual wrote them. Only examples whose flags verify
    count toward flag usage, the same rule as tldr.
    """
    invocations = invocations_for(page.name)
    heads = {words[0] for words in invocations}
    examples: list[Example] = []
    flags: Counter[str] = Counter()
    context = ""
    skip_description = False
    for block in _flat(section_blocks(page.doc, EXAMPLE_HEADINGS)):
        kind = block.get("type")
        if kind == "_definition_description":
            if skip_description:
                skip_description = False
                continue
            kind = "paragraph"
        if kind == "code_block":
            text = str(block.get("text", ""))
        elif kind in {"_term", "paragraph"}:
            # mdoc's `.Dl` renders as a paragraph of code; a `.TP` term may
            # be the command itself.
            inlines = block.get("inlines", ())
            text = str(block.get("text", "")) if kind == "_term" else inline_text(inlines)
            code_only = kind == "_term" or all(
                node.get("type") == "code" or not str(node.get("text", "x")).strip()
                for node in inlines
            )
            stripped = re.sub(r"^\s*[$#]\s+", "", text)
            if not code_only or stripped.split(" ", 1)[0].rsplit("/", 1)[-1] not in heads:
                context = text
                continue
        else:
            continue
        if kind == "_term":
            # A term's own body describes it; without one, keep the
            # paragraph that came before, as for other layouts.
            description_block = block.get("description")
            if description_block is not None:
                context = inline_text(description_block.get("inlines", ()))
            skip_description = description_block is not None
        command = _command_text(text)
        if command is None:
            continue
        check = verify_command(command, invocations=invocations, table=page.table)
        if check.ok:
            flags.update(set(check.flags))
        if len(examples) < MAX_PAGE_EXAMPLES:
            description = _clip(context, MAX_DESCRIPTION_CHARS)
            if has_forbidden_chars(description):
                description = ""
            examples.append(Example(description=description, command=command))
        context = ""
    return examples, flags


def excerpt(page: PageInput) -> dict[str, str]:
    """NAME, SYNOPSIS, DESCRIPTION and OPTIONS, each bounded."""
    synopsis = _bounded_lines(page.synopsis or [], SYNOPSIS_CHARS, OPTION_LINE_CHARS)
    description = _clip(block_text(section_blocks(page.doc, {"DESCRIPTION"})), DESCRIPTION_CHARS)
    option_lines = []
    for option in page.options or []:
        flags = str(option.get("flags", "")).strip()
        argument = option.get("argument")
        if isinstance(argument, str) and argument.strip() and argument not in flags:
            flags = f"{flags} {argument.strip()}"
        summary = re.split(r"(?<=[.;])\s", str(option.get("description", "")).strip(), maxsplit=1)[
            0
        ]
        option_lines.append(f"{flags} — {summary}" if summary else flags)
    options = _bounded_lines(option_lines, OPTIONS_CHARS, OPTION_LINE_CHARS)
    return {
        "name": f"{page.name}({page.section}) - {page.description}".strip(),
        "synopsis": synopsis,
        "description": description,
        "options": options,
    }


def _bounded_lines(lines: list[str], limit: int, line_limit: int) -> str:
    kept: list[str] = []
    used = 0
    for index, line in enumerate(lines):
        line = _clip(line, line_limit)
        if used + len(line) + 1 > limit:
            kept.append(f"({len(lines) - index} more omitted)")
            break
        kept.append(line)
        used += len(line) + 1
    return "\n".join(kept)
