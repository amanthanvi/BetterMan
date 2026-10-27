"""Source-based guard against silently dropping the opening text of a definition."""

from __future__ import annotations

import os
import shutil
from collections import defaultdict, deque
from pathlib import Path

import pytest
from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from ingestion.doc_model import DocumentModel
from ingestion.mandoc import render_html
from ingestion.mandoc_parser import is_so_stub, parse_mandoc_html

_BLOCK_TAGS = {
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
_FIXTURES = Path(__file__).parent / "fixtures" / "roff"


def _normalized(text: str) -> str:
    return "".join(text.split())


def _visible_text(node: object) -> str:
    if isinstance(node, Comment):
        return ""
    if isinstance(node, NavigableString):
        return str(node)
    if isinstance(node, Tag):
        return "".join(_visible_text(child) for child in node.children)
    return ""


def _body_text(node: object) -> str:
    if isinstance(node, dict):
        # IDs, link destinations, language hints and discriminators are not visible text.
        return " ".join(
            _body_text(value)
            for key, value in node.items()
            if key
            in {
                "text",
                "inlines",
                "blocks",
                "items",
                "termInlines",
                "definitionBlocks",
                "headers",
                "rows",
            }
        )
    if isinstance(node, list):
        return " ".join(_body_text(value) for value in node)
    return node if isinstance(node, str) else ""


def missing_definition_leading_text(html: str, doc: DocumentModel) -> list[dict[str, str]]:
    """Return missing source dd prefixes, checking each matching definition independently.

    Repeated terms match in document order. Bullet lists lose their dt identity in
    the model, so marker terms and unmatched terms use the whole visible body.
    """
    payload = doc.model_dump()
    definitions: dict[str, deque[str]] = defaultdict(deque)

    def collect(node: object) -> None:
        if isinstance(node, dict):
            if "termInlines" in node:
                definitions[_normalized(_body_text(node["termInlines"]))].append(
                    _normalized(_body_text(node["definitionBlocks"]))
                )
            for value in node.values():
                collect(value)
        elif isinstance(node, list):
            for value in node:
                collect(value)

    collect(payload["blocks"])
    body = _normalized(_body_text(payload["blocks"]))
    soup = BeautifulSoup(html, "html.parser")
    manual = soup.select_one(".manual-text") or soup.select_one("#manual-text") or soup.body
    assert manual is not None
    missing = []
    for dt in manual.find_all("dt"):
        term = _visible_text(dt).strip()
        candidates = definitions[_normalized(term)]
        # Converted bullets can share a marker with a later retained definition.
        actual = (
            candidates.popleft()
            if candidates and term not in {"*", "•", "·", "+", "-", "–", "—"}
            else None
        )
        sibling = dt.find_next_sibling()
        while sibling is not None and sibling.name == "dd":
            leading = []
            for child in sibling.children:
                if isinstance(child, Tag) and child.name in _BLOCK_TAGS:
                    break
                leading.append(_visible_text(child))
            text = "".join(leading).strip()
            if text and _normalized(text) not in (actual if actual is not None else body):
                missing.append(
                    {
                        "term": term,
                        "leading": text,
                        "scope": "definition" if actual is not None else "body",
                    }
                )
            sibling = sibling.find_next_sibling()
    return missing


def test_source_check_detects_the_minimal_baseline_failure() -> None:
    html = """<div class="manual-text"><dl><dt id="flag">--flag</dt>
      <dd>Opening <b>inline</b> text.<p>Continuation.</p></dd></dl></div>"""
    # The old parser produced exactly this body, keeping only the block child.
    truncated = parse_mandoc_html(html.replace("Opening <b>inline</b> text.", ""))
    assert missing_definition_leading_text(html, truncated.doc) == [
        {"term": "--flag", "leading": "Opening inline text.", "scope": "definition"}
    ]
    assert not missing_definition_leading_text(html, parse_mandoc_html(html).doc)


def test_source_check_ignores_comments_and_markup_spacing_but_checks_each_definition() -> None:
    html = """<div class="manual-text"><dl>
      <dt>--one</dt><dd>same <b>opening</b><!-- hidden --> text</dd>
      <dt>--two</dt><dd>same opening text<p>Continuation.</p></dd>
      </dl></div>"""
    truncated = parse_mandoc_html(html.replace("<dd>same opening text<p>", "<dd><p>"))
    assert missing_definition_leading_text(html, truncated.doc) == [
        {"term": "--two", "leading": "same opening text", "scope": "definition"}
    ]
    assert not missing_definition_leading_text(html, parse_mandoc_html(html).doc)


@pytest.mark.parametrize(
    ("marker", "retained"),
    [
        (
            "•",
            """<dl><dt>•</dt><dd>Retained marker definition.</dd>
            <dt>ordinary term</dt><dd>Ordinary definition.</dd></dl>""",
        ),
        (
            "+",
            """<h1>OPTIONS</h1><dl><dt><b>+</b></dt>
            <dd>Retained plus option.</dd></dl>""",
        ),
    ],
)
def test_source_check_does_not_match_converted_bullets_to_retained_marker_terms(
    marker: str, retained: str
) -> None:
    html = f"""<div class="manual-text"><dl><dt>{marker}</dt>
      <dd>Converted bullet prose.</dd></dl>{retained}</div>"""
    assert not missing_definition_leading_text(html, parse_mandoc_html(html).doc)


@pytest.mark.skipif(
    shutil.which("mandoc") is None and not os.environ.get("CI"), reason="mandoc not installed"
)
@pytest.mark.parametrize("source", sorted(_FIXTURES.iterdir()), ids=lambda path: path.name)
def test_fixture_definitions_keep_source_leading_text(source: Path) -> None:
    raw = source.read_bytes()
    if is_so_stub(raw) is not None:
        return
    html = render_html(raw).html
    assert not missing_definition_leading_text(html, parse_mandoc_html(html).doc)
