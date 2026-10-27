"""Read-only source/body checks adapted from PR 424's independent reviewer harness.

Token order and multiplicity are significant; word-boundary changes remain
failures while insignificant HTML whitespace normalizes. Only intentional list
marker syntax is removed from the source view.
"""

from __future__ import annotations

import difflib
import re
from collections import Counter, defaultdict

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from ingestion.util import normalize_ws, stable_unique_id, stable_unique_slug

TOKENS = re.compile(r"\w+|[^\w\s]")
BLOCK_TAGS = {
    "p",
    "pre",
    "div",
    "dl",
    "ul",
    "ol",
    "table",
    "section",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
}
SEPARATED_TAGS = BLOCK_TAGS | {"br", "td", "th", "tr", "dt", "dd", "li"}


def visible_text(node: object) -> str:
    if isinstance(node, Comment):
        return ""
    if isinstance(node, NavigableString):
        return str(node)
    if isinstance(node, Tag):
        separator = " " if node.name in SEPARATED_TAGS else ""
        return separator + "".join(visible_text(c) for c in node.children) + separator
    return ""


def inline_text(nodes: list[dict]) -> str:
    return "".join(
        node["text"] if node["type"] in {"text", "code"} else inline_text(node["inlines"])
        for node in nodes
    )


def walk_blocks(blocks: list[dict]):
    for block in blocks:
        yield block
        if block["type"] == "list":
            for item in block["items"]:
                yield from walk_blocks(item)
        elif block["type"] == "definition_list":
            for item in block["items"]:
                yield from walk_blocks(item["definitionBlocks"])


def body_text(blocks: list[dict]) -> str:
    parts = []
    for block in blocks:
        kind = block["type"]
        if kind in {"heading", "code_block"}:
            parts.append(block["text"])
        elif kind == "paragraph":
            parts.append(inline_text(block["inlines"]))
        elif kind == "list":
            parts.extend(body_text(item) for item in block["items"])
        elif kind == "definition_list":
            for item in block["items"]:
                parts.extend(
                    (
                        inline_text(item["termInlines"]),
                        body_text(item["definitionBlocks"]),
                    )
                )
        elif kind == "table":
            parts.extend(block["headers"])
            for row in block["rows"]:
                parts.extend(row)
        elif kind != "horizontal_rule":
            raise ValueError(f"Unhandled block type: {kind}")
    return " ".join(parts)


def strip_source_prefix(container: Tag, pattern: re.Pattern) -> bool:
    """Remove only actual text characters in the leading inline run."""
    leaves = []

    def collect(tag: Tag) -> None:
        for child in tag.children:
            if isinstance(child, Tag) and child.name in BLOCK_TAGS:
                break
            if isinstance(child, NavigableString) and not isinstance(child, Comment):
                leaves.append(child)
            elif isinstance(child, Tag):
                collect(child)

    collect(container)
    match = pattern.match("".join(str(leaf) for leaf in leaves))
    if not match:
        return False
    remaining = match.end()
    for leaf in leaves:
        if not remaining:
            break
        count = min(remaining, len(leaf))
        leaf.replace_with(str(leaf)[count:])
        remaining -= count
    return True


def source_body(html: str) -> tuple[Tag, int, set[int], bool]:
    soup = BeautifulSoup(html, "html.parser")
    manual = soup.select_one(".manual-text") or soup.select_one("#manual-text") or soup.body
    if manual is None:
        raise ValueError("Source missing manual text container")
    removed = 0
    converted = set()
    # A marker followed by prose, or a pure star/bullet, is unambiguous. Bare
    # +/- definitions stay exact because those can be command-line options.
    marker = re.compile(r"^\s*(?:[*•](?:\s+|$)|[+-]\s+(?=\S))")
    for dl in manual.find_all("dl"):
        terms = dl.find_all("dt", recursive=False)
        if not terms or not all(marker.match(visible_text(dt)) for dt in terms):
            continue
        for dt in terms:
            if strip_source_prefix(dt, marker):
                converted.add(id(dt))
                removed += 1
    docbook = any(
        re.search(r"^\s*Generator:\s*DocBook\b", str(c), re.MULTILINE)
        for c in soup.find_all(string=lambda n: isinstance(n, Comment))
    )
    if docbook:
        for region in manual.select("div.Bd-indent"):
            children = [c for c in region.children if visible_text(c).strip()]
            if not children:
                continue
            first = children[0]
            if isinstance(first, Tag) and first.name in BLOCK_TAGS and first.name != "p":
                continue
            paragraph = first if isinstance(first, Tag) and first.name == "p" else region
            if strip_source_prefix(paragraph, re.compile(r"^\s*•\s*")):
                removed += 1
    return manual, removed, converted, docbook


MAX_EXACT_PARTITION = 40000


def alignment(source: list[str], actual: list[str]) -> dict:
    """Exact equality; diagnostic diff uses frequent-token anchors above 40k.

    Every differing anchor partition is refined with autojunk=False below 40k.
    Character-identical partitions use linear token-boundary grouping. Any huge
    unsplittable partition is reported explicitly; counts exclude that partition.
    """
    result = {
        "equal": source == actual,
        "missing": 0,
        "extra": 0,
        "whitespace": 0,
        "same_multiset": Counter(source) == Counter(actual),
        "unresolved_partitions": [],
        "examples": [],
    }

    def record(kind: str, expected: list[str], got: list[str]) -> None:
        if kind == "whitespace":
            result["whitespace"] += max(len(expected), len(got))
        elif kind == "unresolved":
            result["unresolved_partitions"].append(
                {"source_tokens": len(expected), "actual_tokens": len(got)}
            )
        else:
            result["missing"] += len(expected)
            result["extra"] += len(got)
        if len(result["examples"]) < 4:
            result["examples"].append(
                {"kind": kind, "source": " ".join(expected)[:160], "actual": " ".join(got)[:160]}
            )

    def refine(expected: list[str], got: list[str]) -> None:
        if expected == got:
            return
        if not expected or not got:
            record("insert" if got else "delete", expected, got)
            return
        if "".join(expected) == "".join(got):
            i = j = 0
            while i < len(expected):
                start_i, start_j = i, j
                left, right = expected[i], got[j]
                i += 1
                j += 1
                while left != right:
                    if len(left) < len(right):
                        left += expected[i]
                        i += 1
                    else:
                        right += got[j]
                        j += 1
                if expected[start_i:i] != got[start_j:j]:
                    record("whitespace", expected[start_i:i], got[start_j:j])
            return
        anchored = max(len(expected), len(got)) > MAX_EXACT_PARTITION
        for op, i, end_i, j, end_j in difflib.SequenceMatcher(
            None, expected, got, autojunk=anchored
        ).get_opcodes():
            if op == "equal":
                continue
            left, right = expected[i:end_i], got[j:end_j]
            if anchored:
                if len(left) == len(expected) and len(right) == len(got):
                    record("unresolved", left, right)
                else:
                    refine(left, right)
            elif op == "replace" and "".join(left) == "".join(right):
                refine(left, right)
            else:
                record(op, left, right)

    refine(source, actual)
    return result


def source_definition_ids(manual: Tag, converted: set[int]) -> dict[int, str]:
    """Replay source ID allocation, including headings and nested definitions.

    Definition IDs are allocated after their children. Converted DocBook option
    IDs are deferred by the parser and cannot collide with original source dt IDs.
    """
    used, result = set(), {}

    def visit(tag: Tag) -> None:
        if re.fullmatch(r"h[1-6]", tag.name):
            text = normalize_ws(tag.get_text(" "))
            if text:
                stable_unique_slug(text, used)
        elif tag.name == "dl":
            for dt in tag.find_all("dt", recursive=False):
                sibling = dt.find_next_sibling()
                while sibling is not None and sibling.name == "dd":
                    visit(sibling)
                    sibling = sibling.find_next_sibling()
                if id(dt) not in converted:
                    raw = dt.get("id")
                    result[id(dt)] = (
                        stable_unique_id(raw, used)
                        if raw
                        else stable_unique_slug(
                            "def-" + (normalize_ws(dt.get_text(" ")) or "definition"), used
                        )
                    )
        elif tag.name in {"ul", "ol"}:
            for child in tag.find_all("li", recursive=False):
                visit(child)
        elif tag is manual or tag.name in {"div", "section", "dd", "li"}:
            for child in tag.children:
                if isinstance(child, Tag):
                    visit(child)

    visit(manual)
    return result


def check_fidelity(html: str, doc: dict) -> dict:
    manual, removed, converted, docbook = source_body(html)
    blocks = doc["blocks"]
    resolved_ids = source_definition_ids(manual, converted)
    page = alignment(TOKENS.findall(visible_text(manual)), TOKENS.findall(body_text(blocks)))
    items = defaultdict(list)
    for block in walk_blocks(blocks):
        if block["type"] == "definition_list":
            for item in block["items"]:
                if item["id"]:
                    items[item["id"]].append(item)
    definitions, checked, without_id = [], 0, 0
    for dt in manual.find_all("dt"):
        # Converted bullet dt IDs intentionally do not survive as definitions.
        if id(dt) in converted:
            continue
        did = dt.get("id")
        if not did:
            without_id += 1
            continue
        dds = []
        sibling = dt.find_next_sibling()
        while sibling is not None and sibling.name == "dd":
            dds.append(sibling)
            sibling = sibling.find_next_sibling()
        checked += 1
        resolved = resolved_ids[id(dt)]
        if len(items[resolved]) != 1:
            definitions.append({"id": did, "matches": len(items[resolved])})
            continue
        difference = alignment(
            TOKENS.findall(" ".join(visible_text(dd) for dd in dds)),
            TOKENS.findall(body_text(items[resolved][0]["definitionBlocks"])),
        )
        if not difference["equal"]:
            definitions.append({"id": did, **difference})
    return {
        "page": page,
        "definitions": definitions,
        "definitions_checked": checked,
        "definitions_without_source_id": without_id,
        "normalized_markers": removed,
        "docbook": docbook,
    }


def loose_runs(html: str) -> list[str]:
    """Match reviewer shscan: manual children and direct .Sh section children."""
    soup = BeautifulSoup(html, "html.parser")
    manual = soup.select_one(".manual-text") or soup.select_one("#manual-text") or soup.body
    if manual is None:
        raise ValueError("Source missing manual text container")
    runs = []
    for container in [
        manual,
        *manual.find_all("section", class_="Sh", recursive=False),
    ]:
        pending = []
        for child in [*container.children, None]:
            if child is None or isinstance(child, Tag) and child.name in BLOCK_TAGS:
                text = "".join(pending).strip()
                if text:
                    runs.append(text)
                pending = []
            else:
                pending.append(visible_text(child))
    return runs
