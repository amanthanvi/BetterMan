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
        for child in container.children:
            out.extend(inlines_from_node(child))
        return _trim_inline_ws(_merge_adjacent_text(out))

    def inlines_from_node(node: object) -> list[InlineNode]:
        if isinstance(node, NavigableString):
            text = re.sub(r"\\s+", " ", str(node))
            if not text.strip():
                return []
            return [InlineText(text=text)]

        if not isinstance(node, Tag):
            return []

        name = node.name.lower()
        classes = set(node.get("class") or [])

        if name == "br":
            return [InlineText(text=" ")]

        if name == "b":
            return [InlineStrong(inlines=inlines_from_container(node))]

        if name == "i":
            return [InlineEmphasis(inlines=inlines_from_container(node))]

        if name == "code":
            return [InlineCode(text=node.get_text(" ", strip=True))]

        if name == "span":
            if "Pa" in classes:
                return [InlineCode(text=node.get_text(" ", strip=True))]
            return inlines_from_container(node)

        if name == "a":
            if "permalink" in classes:
                return inlines_from_container(node)

            if "Xr" in classes:
                label = node.get_text(" ", strip=True)
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
            text = tag.get_text(" ", strip=True)
            if not text:
                return []
            return [add_heading(text=text, source_level=int(tname[1]))]

        if tname == "p":
            inlines = inlines_from_container(tag)
            if not _has_meaningful_inlines(inlines):
                return []
            return [BlockParagraph(inlines=inlines)]

        if tname == "pre":
            text = tag.get_text("\\n")
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
                    leaf = li.get_text(" ", strip=True)
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
            i = 0
            while i < len(children):
                if children[i].name.lower() != "dt":
                    i += 1
                    continue
                dt = children[i]
                dd = (
                    children[i + 1]
                    if i + 1 < len(children) and children[i + 1].name.lower() == "dd"
                    else None
                )

                term_inlines = inlines_from_container(dt)
                definition_blocks = blocks_from_container(dd) if dd is not None else []
                if dd is not None and not definition_blocks:
                    dd_inlines = inlines_from_container(dd)
                    if _has_meaningful_inlines(dd_inlines):
                        definition_blocks = [BlockParagraph(inlines=dd_inlines)]

                raw_id = dt.get("id") if isinstance(dt.get("id"), str) else None
                if raw_id:
                    item_id = stable_unique_id(raw_id, used_ids)
                else:
                    term_text = dt.get_text(" ", strip=True) or "definition"
                    item_id = stable_unique_slug(f"def-{term_text}", used_ids)

                items.append(
                    DefinitionListItem(
                        id=item_id,
                        termInlines=term_inlines,
                        definitionBlocks=definition_blocks,
                    )
                )
                i += 2

            if not items:
                return []
            return [BlockDefinitionList(items=items)]

        if tname == "table":
            headers: list[str] = []
            header_row = tag.find("tr")
            if header_row is not None:
                ths = header_row.find_all("th")
                if ths:
                    headers = [th.get_text(" ", strip=True) for th in ths]

            rows: list[list[str]] = []
            for tr in tag.find_all("tr"):
                tds = tr.find_all("td")
                if not tds:
                    continue
                rows.append([td.get_text(" ", strip=True) for td in tds])

            if not headers and not rows:
                return []
            return [BlockTable(headers=headers, rows=rows)]

        if tname == "hr":
            return [BlockHorizontalRule()]

        if tname in {"div", "section"}:
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
    synopsis = _extract_section_lines(manual_text, "SYNOPSIS")
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
    if re.fullmatch(r"[1-9][a-z0-9]*", section):
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
    for sep in (" - ", " \u2014 ", " \u2013 "):
        if sep in text:
            _lhs, rhs = text.split(sep, 1)
            rhs = rhs.strip()
            return rhs or None
    return None


def _extract_section_lines(manual_text: Tag, heading_id: str) -> list[str]:
    heading = manual_text.find(id=heading_id)
    if heading is None:
        return []
    section = heading.find_parent("section")
    if section is None:
        return []
    lines: list[str] = []
    for p in section.find_all(["p", "pre"], recursive=False):
        text = p.get_text("\n")
        text = text.strip()
        if text:
            lines.extend([ln for ln in text.splitlines() if ln.strip()])
    return lines


def _extract_options_from_doc(doc: DocumentModel) -> list[OptionItem]:
    out: list[OptionItem] = []
    used: set[str] = set()
    for block in doc.blocks:
        if isinstance(block, BlockDefinitionList):
            for item in block.items:
                flags = normalize_ws(_inlines_to_text(item.termInlines))
                desc = normalize_ws(_blocks_to_text(item.definitionBlocks))
                if not flags or not desc:
                    continue
                anchor = item.id or stable_unique_slug(flags, used)
                out.append(
                    OptionItem(
                        flags=flags,
                        argument=None,
                        description=desc,
                        anchorId=anchor,
                    )
                )
    return out


def _extract_see_also(manual_text: Tag) -> list[SeeAlsoRef] | None:
    heading = manual_text.find(id="SEE ALSO") or manual_text.find(id="SEE_ALSO")
    if heading is None:
        return None

    section = heading.find_parent("section")
    if section is None:
        return None

    refs: list[SeeAlsoRef] = []
    for a in section.find_all("a", class_="Xr"):
        label = a.get_text(" ", strip=True)
        match = _xref_re.match(label)
        if not match:
            continue
        name = match.group("name").strip().lower()
        sec = match.group("section").strip().lower()
        if not name:
            continue
        if not re.fullmatch(r"[1-9][a-z0-9]*", sec):
            sec = ""
        refs.append(SeeAlsoRef(name=name, section=sec or None))

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
