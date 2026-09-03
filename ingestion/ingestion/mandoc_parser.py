from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, NavigableString, Tag

from ingestion.doc_model import (
    BlockCode,
    BlockDefinitionList,
    BlockHeading,
    BlockHorizontalRule,
    BlockList,
    BlockParagraph,
    BlockTable,
    DefinitionListItem,
    DocumentModel,
    InlineCode,
    InlineEmphasis,
    InlineLink,
    InlineNode,
    InlineStrong,
    InlineText,
    OptionItem,
    SeeAlsoRef,
    TocItem,
)
from ingestion.util import normalize_ws, stable_unique_id, stable_unique_slug

_xref_re = re.compile(r"^(?P<name>.+?)\((?P<section>[^)]+)\)$")
_section_re = re.compile(r"[1-9][a-z0-9]*")
# A man(7) cross reference is `<b>name</b>(N)` or `<i>name</i>(N)`: the bold
# or italic name immediately followed by a parenthesised section in the
# surrounding text.
_trailing_section_re = re.compile(r"^\((?P<section>[1-9][a-z0-9]*)\)")
_xref_name_re = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.+:-]*$")
_bare_xref_re = re.compile(
    r"(?<![\w./-])(?P<name>[A-Za-z0-9_][A-Za-z0-9_.+:-]*)\((?P<section>[1-9][a-z0-9]*)\)"
)
_bullet_term_re = re.compile(r"^\s*(?:\*|\+|-|•)(?:\s+|$)")
_options_heading_re = re.compile(r"\bOPTIONS?\b", re.IGNORECASE)
_option_term_re = re.compile(r"^\s*[\[(]?(?:--?|\+)(?:[^\s,|\])]|$)")
# mdoc semantic classes that mandoc renders as bare <code>/<var>/<span>.
_MDOC_CODE_CLASSES = {"Pa", "Fl", "Cm", "Nm", "Ev", "Ic", "Li", "Dv", "Fn", "Fd", "In", "Cd"}
_MDOC_EMPHASIS_CLASSES = {"Ar", "Va", "Fa", "Ft", "Vt", "Em"}
_MDOC_STRONG_CLASSES = {"Sy"}


@dataclass(frozen=True)
class ParsedManPage:
    doc: DocumentModel
    description: str
    plain_text: str
    synopsis: list[str] | None
    options: list[OptionItem] | None
    see_also: list[SeeAlsoRef] | None
    headings_text: str


def parse_mandoc_html(html: str) -> ParsedManPage:
    soup = BeautifulSoup(html, "html.parser")
    manual_text = soup.select_one(".manual-text") or soup.select_one("#manual-text") or soup.body
    if manual_text is None:
        raise ValueError("mandoc output missing manual text container")

    used_ids: set[str] = set()
    toc: list[TocItem] = []
    blocks: list[object] = []

    def add_heading(text: str, source_level: int) -> BlockHeading:
        heading_id = stable_unique_slug(text, used_ids)
        level = min(6, max(1, source_level + 1))
        toc.append(TocItem(id=heading_id, title=text, level=level))
        return BlockHeading(id=heading_id, level=level, text=text)

    def push_blocks(more: list[object]) -> None:
        for b in more:
            blocks.append(b)

    def inlines_from_container(container: Tag) -> list[InlineNode]:
        out: list[InlineNode] = []
        children = list(container.children)
        index = 0
        while index < len(children):
            child = children[index]
            nxt = children[index + 1] if index + 1 < len(children) else None
            xref = _man7_xref(child, nxt)
            if xref is not None:
                link, consumed_text = xref
                out.append(link)
                if consumed_text:
                    out.append(InlineText(text=consumed_text))
                index += 2
                continue
            out.extend(inlines_from_node(child))
            index += 1
        return _trim_inline_ws(_merge_adjacent_text(out))

    def _man7_xref(node: object, nxt: object) -> tuple[InlineLink, str] | None:
        if not isinstance(node, Tag) or node.name.lower() not in {"b", "i"}:
            return None
        if not isinstance(nxt, NavigableString):
            return None
        name = node.get_text("", strip=True)
        if not name or not _xref_name_re.match(name):
            return None
        match = _trailing_section_re.match(str(nxt))
        if match is None:
            return None
        section = match.group("section")
        label = f"{name}({section})"
        href, link_type = _xref_to_href(label)
        if href is None:
            return None
        rest = str(nxt)[match.end() :]
        rest = re.sub(r"\s+", " ", rest)
        return InlineLink(href=href, inlines=[InlineText(text=label)], linkType=link_type), rest

    def inlines_from_node(node: object) -> list[InlineNode]:
        if isinstance(node, NavigableString):
            text = re.sub(r"\s+", " ", str(node))
            if not text:
                return []
            if _in_see_also(node):
                return _link_bare_xrefs(text)
            return [InlineText(text=text)]

        if not isinstance(node, Tag):
            return []

        name = node.name.lower()
        classes = set(node.get("class") or [])

        if name == "br":
            return [InlineText(text=" ")]

        if name in {"b", "i"}:
            whole = _whole_tag_xref(node)
            if whole is not None:
                return [whole]
            if name == "b":
                return [InlineStrong(inlines=inlines_from_container(node))]
            return [InlineEmphasis(inlines=inlines_from_container(node))]

        if name == "code":
            return [InlineCode(text=_compact_text(node))]

        if name == "var":
            return [InlineEmphasis(inlines=inlines_from_container(node))]

        if name == "span":
            if classes & _MDOC_CODE_CLASSES:
                return [InlineCode(text=_compact_text(node))]
            if classes & _MDOC_EMPHASIS_CLASSES:
                return [InlineEmphasis(inlines=inlines_from_container(node))]
            if classes & _MDOC_STRONG_CLASSES:
                return [InlineStrong(inlines=inlines_from_container(node))]
            return inlines_from_container(node)

        if name == "a":
            if "permalink" in classes:
                return inlines_from_container(node)

            if "Xr" in classes:
                label = _compact_text(node)
                href, link_type = _xref_to_href(label)
                if href is None:
                    return [InlineText(text=label)]
                return [InlineLink(href=href, inlines=[InlineText(text=label)], linkType=link_type)]

            href_attr = node.get("href")
            if isinstance(href_attr, str) and href_attr:
                href = href_attr.strip()
                if href.startswith("#"):
                    return inlines_from_container(node)
                if href.startswith(("http://", "https://")):
                    return [
                        InlineLink(
                            href=href,
                            inlines=inlines_from_container(node),
                            linkType="external",
                        )
                    ]
            return inlines_from_container(node)

        return inlines_from_container(node)

    def blocks_from_container(container: Tag) -> list[object]:
        out: list[object] = []
        for child in container.children:
            if isinstance(child, NavigableString):
                continue
            if not isinstance(child, Tag):
                continue
            out.extend(blocks_from_tag(child))
        return out

    def blocks_from_tag(tag: Tag) -> list[object]:
        tname = tag.name.lower()

        if re.fullmatch(r"h[1-6]", tname):
            text = _compact_text(tag)
            if not text:
                return []
            return [add_heading(text=text, source_level=int(tname[1]))]

        if tname == "p":
            inlines = inlines_from_container(tag)
            if not _has_meaningful_inlines(inlines):
                return []
            return [BlockParagraph(inlines=inlines)]

        if tname == "pre":
            text = _pre_text(tag)
            text = text.rstrip()
            if not text.strip():
                return []
            return [BlockCode(text=text, languageHint=None)]

        if tname in {"ul", "ol"}:
            ordered = tname == "ol"
            items: list[list[object]] = []
            for li in tag.find_all("li", recursive=False):
                item_blocks = blocks_from_container(li)
                if not item_blocks:
                    leaf = _compact_text(li)
                    if leaf:
                        item_blocks = [BlockParagraph(inlines=[InlineText(text=leaf)])]
                if item_blocks:
                    items.append(item_blocks)
            if not items:
                return []
            return [BlockList(ordered=ordered, items=items)]

        if tname == "dl":
            items: list[DefinitionListItem] = []
            children = [c for c in tag.children if isinstance(c, Tag)]
            term_pairs = _definition_list_pairs(children)
            if _is_bullet_definition_list(term_pairs):
                list_items: list[list[object]] = []
                for dt, dds in term_pairs:
                    term_inlines = _strip_bullet_marker(inlines_from_container(dt))
                    item_blocks: list[object] = []

                    for dd in dds:
                        dd_children = [c for c in dd.children if isinstance(c, Tag)]
                        if (
                            not item_blocks
                            and len(dd_children) == 1
                            and dd_children[0].name.lower() == "pre"
                        ):
                            pre = dd_children[0]
                            pre_text = _pre_text(pre).strip()
                            if pre_text and "\n" not in pre_text:
                                continuation = inlines_from_container(pre)
                                item_blocks.append(
                                    BlockParagraph(
                                        inlines=_join_inline_phrases(term_inlines, continuation)
                                    )
                                )
                                continue

                        definition_blocks = blocks_from_container(dd)
                        if not definition_blocks:
                            definition_inlines = inlines_from_container(dd)
                            if _has_meaningful_inlines(definition_inlines):
                                if item_blocks:
                                    item_blocks.append(BlockParagraph(inlines=definition_inlines))
                                else:
                                    item_blocks.append(
                                        BlockParagraph(
                                            inlines=_join_inline_phrases(
                                                term_inlines, definition_inlines
                                            )
                                        )
                                    )
                        else:
                            if not item_blocks and _has_meaningful_inlines(term_inlines):
                                item_blocks.append(BlockParagraph(inlines=term_inlines))
                            item_blocks.extend(definition_blocks)

                    if not item_blocks and _has_meaningful_inlines(term_inlines):
                        item_blocks = [BlockParagraph(inlines=term_inlines)]
                    if item_blocks:
                        list_items.append(item_blocks)

                if list_items:
                    return [BlockList(ordered=False, items=list_items)]

            for dt, dds in term_pairs:
                term_inlines = inlines_from_container(dt)
                definition_blocks: list[object] = []
                for dd in dds:
                    dd_blocks = blocks_from_container(dd)
                    if not dd_blocks:
                        dd_inlines = inlines_from_container(dd)
                        if _has_meaningful_inlines(dd_inlines):
                            dd_blocks = [BlockParagraph(inlines=dd_inlines)]
                    definition_blocks.extend(dd_blocks)

                raw_id = dt.get("id") if isinstance(dt.get("id"), str) else None
                if raw_id:
                    item_id = stable_unique_id(raw_id, used_ids)
                else:
                    term_text = _compact_text(dt) or "definition"
                    item_id = stable_unique_slug(f"def-{term_text}", used_ids)

                items.append(
                    DefinitionListItem(
                        id=item_id,
                        termInlines=term_inlines,
                        definitionBlocks=definition_blocks,
                    )
                )

            if not items:
                return []
            return [BlockDefinitionList(items=items)]

        if tname == "table":
            classes = set(tag.get("class") or [])
            if "Nm" in classes:
                # mdoc SYNOPSIS: each row is one usage line. Render as a code block.
                lines = [_synopsis_row_text(tr) for tr in tag.find_all("tr", recursive=False)]
                lines = [ln for ln in lines if ln]
                if not lines:
                    return []
                return [BlockCode(text="\n".join(lines), languageHint=None)]

            rows_tags = tag.find_all("tr")
            headers: list[str] = []
            rows: list[list[str]] = []
            for index, tr in enumerate(rows_tags):
                cells = tr.find_all(["td", "th"], recursive=False)
                if not cells:
                    continue
                values = [_compact_text(cell) for cell in cells]
                is_header = index == 0 and _looks_like_header_row(tr, cells, len(rows_tags))
                if is_header:
                    headers = values
                else:
                    rows.append(values)

            if not headers and not rows:
                return []
            return [BlockTable(headers=headers, rows=rows)]

        if tname == "hr":
            return [BlockHorizontalRule()]

        if tname == "div":
            classes = set(tag.get("class") or [])
            if "Bd-indent" in classes:
                # troff .RS: an indented region. Keep it as a one-item unordered
                # list so the nesting survives in the document model.
                inner = blocks_from_container(tag)
                if not inner:
                    inlines = inlines_from_container(tag)
                    if not _has_meaningful_inlines(inlines):
                        return []
                    inner = [BlockParagraph(inlines=inlines)]
                return [BlockList(ordered=False, items=[inner])]
            return blocks_from_container(tag)

        if tname == "section":
            return blocks_from_container(tag)

        return []

    for child in manual_text.children:
        if isinstance(child, NavigableString):
            continue
        if not isinstance(child, Tag):
            continue

        if child.name.lower() == "section":
            section_heading = child.find(re.compile(r"^h[1-6]$"), recursive=False)
            if section_heading is not None:
                heading_blocks = blocks_from_tag(section_heading)
                push_blocks(heading_blocks)
                for sibling in section_heading.find_next_siblings(recursive=False):
                    push_blocks(blocks_from_tag(sibling))
                continue

        push_blocks(blocks_from_tag(child))

    doc = DocumentModel(toc=toc, blocks=blocks)  # validates node shapes

    description = _extract_description(manual_text) or ""
    synopsis = _extract_synopsis(manual_text)
    options = _extract_options_from_doc(doc)
    see_also = _extract_see_also(manual_text)

    plain_text = normalize_ws(manual_text.get_text(" "))
    headings_text = normalize_ws(" ".join(item.title for item in toc))

    return ParsedManPage(
        doc=doc,
        description=description,
        plain_text=plain_text,
        synopsis=synopsis or None,
        options=options or None,
        see_also=see_also or None,
        headings_text=headings_text,
    )


def is_so_stub(source: bytes) -> str | None:
    """Return the include target when the roff source is a bare `.so` stub."""
    text = source.decode("utf-8", errors="replace")
    target: str | None = None
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(('.\\"', "'\\\"", ".\\#")):
            continue
        if stripped.startswith(".so ") and target is None:
            target = stripped[4:].strip().strip('"')
            continue
        # Anything beyond comments and the include means the page has its own body.
        return None
    return target


def so_target_name_section(target: str) -> tuple[str, str] | None:
    base = target.rsplit("/", 1)[-1]
    if base.endswith(".gz"):
        base = base[:-3]
    dot = base.rfind(".")
    if dot <= 0 or dot == len(base) - 1:
        return None
    name = base[:dot].strip().lower()
    section = base[dot + 1 :].strip().lower()
    if not name or not _section_re.fullmatch(section):
        return None
    return name, section


_whole_xref_re = re.compile(
    r"^(?P<name>[A-Za-z0-9_][A-Za-z0-9_.+:-]*)\((?P<section>[1-9][a-z0-9]*)\)$"
)


def _whole_tag_xref(tag: Tag) -> InlineLink | None:
    """`<b>ftp(1)</b>`: the whole reference, section included, inside one tag."""
    if tag.find(True) is not None:
        return None
    text = tag.get_text("", strip=True)
    match = _whole_xref_re.match(text)
    if match is None:
        return None
    href, link_type = _xref_to_href(text)
    if href is None:
        return None
    return InlineLink(href=href, inlines=[InlineText(text=text)], linkType=link_type)


def _in_see_also(node: NavigableString) -> bool:
    section = node.find_parent("section")
    if section is None:
        return False
    heading = section.find(re.compile(r"^h[1-6]$"), recursive=False)
    if heading is None:
        return False
    return normalize_ws(heading.get_text(" ")).upper() == "SEE ALSO"


def _link_bare_xrefs(text: str) -> list[InlineNode]:
    """`bash(1), sh(1)` written with no markup at all, inside SEE ALSO only."""
    out: list[InlineNode] = []
    cursor = 0
    for match in _bare_xref_re.finditer(text):
        if match.start() > cursor:
            out.append(InlineText(text=text[cursor : match.start()]))
        label = match.group(0)
        href, link_type = _xref_to_href(label)
        if href is None:
            out.append(InlineText(text=label))
        else:
            out.append(InlineLink(href=href, inlines=[InlineText(text=label)], linkType=link_type))
        cursor = match.end()
    if cursor < len(text):
        out.append(InlineText(text=text[cursor:]))
    return out or [InlineText(text=text)]


def _compact_text(tag: Tag) -> str:
    return normalize_ws(tag.get_text(" "))


def _synopsis_row_text(tr: Tag) -> str:
    cells = tr.find_all("td", recursive=False)
    return normalize_ws(" ".join(cell.get_text(" ") for cell in cells))


def _looks_like_header_row(tr: Tag, cells: list[Tag], row_count: int) -> bool:
    if row_count < 2:
        return False
    if any(cell.name.lower() == "th" for cell in cells):
        return True
    style = tr.get("style")
    if isinstance(style, str) and "border-bottom" in style:
        return True
    texts = [_compact_text(cell) for cell in cells]
    if not any(texts):
        return False
    bold = all(cell.find("b") is not None or not _compact_text(cell) for cell in cells)
    return bold and any(texts)


def _pre_text(tag: Tag) -> str:
    parts: list[str] = []
    for descendant in tag.descendants:
        if isinstance(descendant, NavigableString):
            parts.append(str(descendant))
        elif isinstance(descendant, Tag) and descendant.name.lower() == "br":
            parts.append("\n")
    return "".join(parts)


def _definition_list_pairs(children: list[Tag]) -> list[tuple[Tag, list[Tag]]]:
    pairs: list[tuple[Tag, list[Tag]]] = []
    index = 0
    while index < len(children):
        term = children[index]
        if term.name.lower() != "dt":
            index += 1
            continue

        definitions: list[Tag] = []
        index += 1
        while index < len(children) and children[index].name.lower() == "dd":
            definitions.append(children[index])
            index += 1
        pairs.append((term, definitions))
    return pairs


def _is_bullet_definition_list(term_pairs: list[tuple[Tag, list[Tag]]]) -> bool:
    return bool(term_pairs) and all(
        _bullet_term_re.match(term.get_text()) for term, _definitions in term_pairs
    )


def _strip_bullet_marker(inlines: list[InlineNode]) -> list[InlineNode]:
    match = _bullet_term_re.match(_inlines_to_text(inlines))
    if match is None:
        return inlines

    remaining = match.end()

    def strip_prefix(nodes: list[InlineNode]) -> list[InlineNode]:
        nonlocal remaining
        stripped: list[InlineNode] = []
        for inline in nodes:
            if isinstance(inline, InlineText) or isinstance(inline, InlineCode):
                if remaining:
                    consumed = min(remaining, len(inline.text))
                    inline.text = inline.text[consumed:]
                    remaining -= consumed
                if inline.text:
                    stripped.append(inline)
                continue

            if (
                isinstance(inline, InlineEmphasis)
                or isinstance(inline, InlineStrong)
                or isinstance(inline, InlineLink)
            ):
                inline.inlines = strip_prefix(inline.inlines)
                if inline.inlines:
                    stripped.append(inline)
        return stripped

    return _trim_inline_ws(strip_prefix(inlines))


def _join_inline_phrases(first: list[InlineNode], second: list[InlineNode]) -> list[InlineNode]:
    if not first:
        return second
    if not second:
        return first
    return _trim_inline_ws(_merge_adjacent_text([*first, InlineText(text=" "), *second]))


def _merge_adjacent_text(inlines: list[InlineNode]) -> list[InlineNode]:
    merged: list[InlineNode] = []
    for item in inlines:
        if (
            merged
            and isinstance(merged[-1], InlineText)
            and isinstance(item, InlineText)
            and merged[-1].type == "text"
            and item.type == "text"
        ):
            merged[-1].text += item.text
        else:
            merged.append(item)
    return merged


def _trim_inline_ws(inlines: list[InlineNode]) -> list[InlineNode]:
    if not inlines:
        return inlines

    first = inlines[0]
    if isinstance(first, InlineText):
        first.text = first.text.lstrip()
        if not first.text:
            inlines = inlines[1:]

    if not inlines:
        return inlines

    last = inlines[-1]
    if isinstance(last, InlineText):
        last.text = last.text.rstrip()
        if not last.text:
            inlines = inlines[:-1]
    return inlines


def _has_meaningful_inlines(inlines: list[InlineNode]) -> bool:
    for inline in inlines:
        if isinstance(inline, InlineText) and inline.text.strip():
            return True
        if not isinstance(inline, InlineText):
            return True
    return False


def _xref_to_href(label: str) -> tuple[str | None, str]:
    match = _xref_re.match(label)
    if not match:
        name = label.strip().lower()
        if not name:
            return None, "internal"
        return f"/man/{name}", "internal"

    name = match.group("name").strip().lower()
    section = match.group("section").strip().lower()
    if not name:
        return None, "internal"
    if _section_re.fullmatch(section):
        return f"/man/{name}/{section}", "internal"
    return f"/man/{name}", "internal"


def _extract_description(manual_text: Tag) -> str | None:
    name_heading = manual_text.find(id="NAME")
    if name_heading is None:
        return None
    section = name_heading.find_parent("section")
    if section is None:
        return None
    first_p = section.find("p")
    if first_p is None:
        return None
    text = normalize_ws(first_p.get_text(" "))
    # Common patterns: "foo - desc" or "foo — desc"
    for sep in (" - ", " — ", " – "):
        if sep in text:
            _lhs, rhs = text.split(sep, 1)
            rhs = rhs.strip()
            return rhs or None
    return None


def _extract_synopsis(manual_text: Tag) -> list[str]:
    heading = manual_text.find(id="SYNOPSIS")
    if heading is None:
        return []
    section = heading.find_parent("section")
    if section is None:
        return []
    lines: list[str] = []
    nodes: list[Tag] = []
    for node in section.find_all(["p", "pre", "table", "div", "section"], recursive=False):
        if node.name.lower() == "section":
            nodes.extend(node.find_all(["p", "pre", "table", "div"], recursive=False))
        else:
            nodes.append(node)
    for node in nodes:
        tname = node.name.lower()
        if tname == "table":
            classes = set(node.get("class") or [])
            if "Nm" not in classes:
                continue
            for tr in node.find_all("tr", recursive=False):
                text = _synopsis_row_text(tr)
                if text:
                    lines.append(text)
            continue
        if tname == "pre":
            text = _pre_text(node).strip()
            lines.extend(ln.rstrip() for ln in text.splitlines() if ln.strip())
            continue
        if tname == "div":
            for inner in node.find_all(["p", "pre"], recursive=False):
                inner_text = (
                    _pre_text(inner) if inner.name.lower() == "pre" else _paragraph_lines(inner)
                )
                lines.extend(ln.rstrip() for ln in inner_text.splitlines() if ln.strip())
            continue
        lines.extend(ln for ln in _paragraph_lines(node).splitlines() if ln.strip())
    return lines


def _paragraph_lines(tag: Tag) -> str:
    """Paragraph text with `<br>` as line breaks and inline markup flattened."""
    parts: list[str] = []
    for descendant in tag.descendants:
        if isinstance(descendant, NavigableString):
            parts.append(re.sub(r"\s+", " ", str(descendant)))
        elif isinstance(descendant, Tag) and descendant.name.lower() == "br":
            parts.append("\n")
    text = "".join(parts)
    return "\n".join(normalize_ws(ln) for ln in text.split("\n"))


_option_split_re = re.compile(
    r"^(?P<flags>.*(?:^|[\s,])(?:--?|\+)[^\s=\[<,]+)(?P<arg>(?:=|\[=|\s+)[^\s,-][^,]*)?$"
)


def _split_option_argument(flags: str) -> tuple[str, str | None]:
    """Split `-f, --file=ARCHIVE` into (`-f, --file`, `ARCHIVE`).

    Only the argument attached to the last flag is split off. Optional
    arguments keep their brackets: `--color[=WHEN]` becomes `[WHEN]`.
    """
    match = _option_split_re.match(flags)
    if not match or not match.group("arg"):
        return flags, None
    arg = match.group("arg")
    if arg.startswith("[="):
        argument = f"[{arg[2:].strip()}"
    elif arg.startswith("="):
        argument = arg[1:].strip()
    else:
        argument = arg.strip()
    if not argument or argument.startswith(("-", "+")):
        return flags, None
    return match.group("flags").rstrip(), argument


def _extract_options_from_doc(doc: DocumentModel) -> list[OptionItem]:
    out: list[OptionItem] = []
    used: set[str] = set()
    definition_lists, require_flag_shape = _option_definition_lists(doc)
    for block in definition_lists:
        for item in block.items:
            flags_raw = normalize_ws(_inlines_to_text(item.termInlines))
            desc = normalize_ws(_blocks_to_text(item.definitionBlocks))
            if not flags_raw or not desc:
                continue
            if require_flag_shape and _option_term_re.search(flags_raw) is None:
                continue
            flags, argument = _split_option_argument(flags_raw)
            anchor = item.id or stable_unique_slug(flags, used)
            out.append(
                OptionItem(
                    flags=flags,
                    argument=argument,
                    description=desc,
                    anchorId=anchor,
                )
            )
    return out


def _option_definition_lists(doc: DocumentModel) -> tuple[list[BlockDefinitionList], bool]:
    scoped: list[BlockDefinitionList] = []
    fallback: list[BlockDefinitionList] = []
    options_level: int | None = None
    saw_options_heading = False

    for block in doc.blocks:
        if isinstance(block, BlockHeading):
            if _options_heading_re.search(normalize_ws(block.text)):
                saw_options_heading = True
                options_level = block.level
            elif options_level is not None and block.level <= options_level:
                options_level = None
            continue

        if not isinstance(block, BlockDefinitionList):
            continue
        fallback.append(block)
        if options_level is not None:
            scoped.append(block)

    if saw_options_heading:
        return scoped, False
    return fallback, True


def _extract_see_also(manual_text: Tag) -> list[SeeAlsoRef] | None:
    heading = manual_text.find(id="SEE ALSO") or manual_text.find(id="SEE_ALSO")
    if heading is None:
        return None

    section = heading.find_parent("section")
    if section is None:
        return None

    refs: list[SeeAlsoRef] = []
    seen: set[tuple[str, str]] = set()

    def add(name: str, sec: str) -> None:
        name = name.strip().lower()
        sec = sec.strip().lower()
        if not name:
            return
        if not _section_re.fullmatch(sec):
            sec = ""
        key = (name, sec)
        if key in seen:
            return
        seen.add(key)
        refs.append(SeeAlsoRef(name=name, section=sec or None))

    for a in section.find_all("a", class_="Xr"):
        match = _xref_re.match(_compact_text(a))
        if match:
            add(match.group("name"), match.group("section"))

    for tag in section.find_all(["b", "i"]):
        text = tag.get_text("", strip=True)
        whole = _whole_xref_re.match(text)
        if whole:
            add(whole.group("name"), whole.group("section"))
            continue
        if not text or not _xref_name_re.match(text):
            continue
        nxt = tag.next_sibling
        if not isinstance(nxt, NavigableString):
            continue
        match = _trailing_section_re.match(str(nxt))
        if match is None:
            continue
        add(text, match.group("section"))

    if not refs:
        # Plain text `bash(1), sh(1)` with no markup at all.
        for match in _bare_xref_re.finditer(section.get_text(" ")):
            add(match.group("name"), match.group("section"))

    return refs or None


def _inlines_to_text(inlines: list[InlineNode]) -> str:
    parts: list[str] = []
    for inline in inlines:
        if isinstance(inline, InlineText):
            parts.append(inline.text)
        elif isinstance(inline, InlineCode):
            parts.append(inline.text)
        elif isinstance(inline, InlineEmphasis) or isinstance(inline, InlineStrong):
            parts.append(_inlines_to_text(inline.inlines))
        elif isinstance(inline, InlineLink):
            parts.append(_inlines_to_text(inline.inlines))
    return "".join(parts)


def _blocks_to_text(blocks: list[object]) -> str:
    parts: list[str] = []
    for block in blocks:
        if isinstance(block, BlockParagraph):
            parts.append(_inlines_to_text(block.inlines))
        elif isinstance(block, BlockCode):
            parts.append(block.text)
        elif isinstance(block, BlockHeading):
            parts.append(block.text)
        elif isinstance(block, BlockList):
            for item in block.items:
                parts.append(_blocks_to_text(item))
        elif isinstance(block, BlockDefinitionList):
            for item in block.items:
                parts.append(_inlines_to_text(item.termInlines))
                parts.append(_blocks_to_text(item.definitionBlocks))
        elif isinstance(block, BlockTable):
            parts.extend(block.headers)
            for row in block.rows:
                parts.extend(row)
    return " ".join(parts)
