from __future__ import annotations

import os
import shutil
from collections import Counter
from copy import deepcopy
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest
from fidelity import alignment, check_fidelity, source_body, visible_text

from ingestion.mandoc import render_html
from ingestion.mandoc_parser import is_so_stub, parse_mandoc_html

SAMPLES = {
    "definition": '<dl><dt id="flag">--flag</dt><dd>Opening <b>inline</b> prose.'
    "<p>Continuation.</p>Between.<pre>Example</pre>After.</dd></dl>",
    "list": "<ul><li>Opening prose.<p>Continuation.</p>After.</li>"
    "<li>Repeated prose.</li></ul><p>Repeated prose.</p>",
    "rs": '<div class="Bd-indent">Opening prose.<p>Continuation.</p>'
    "Between.<pre>Example</pre>After.</div>",
    "docbook": "<!-- Generator: DocBook XSL --><h1>OPTIONS</h1>"
    '<p class="Pp">--flag</p><div class="Bd-indent">Opening prose.'
    "<p>Continuation.</p>After.</div>",
    "top_level": '<section class="Sh"><h1>DESCRIPTION</h1>Opening <b>inline</b> prose.'
    "<p>Continuation.</p>Between.<pre>Example</pre>After.</section>"
    "Last prose.",
}


@pytest.mark.parametrize("body", SAMPLES.values(), ids=SAMPLES.keys())
def test_sample_source_body_and_definition_sequences_are_exact(body: str) -> None:
    html = f'<div class="manual-text">{body}</div>'
    result = check_fidelity(html, parse_mandoc_html(html).doc.model_dump())
    assert result["page"]["equal"], result
    assert not result["definitions"], result


@pytest.mark.parametrize("mutation", ["reorder", "duplicate", "loss"])
@pytest.mark.parametrize("position", [0, 2, -1])
def test_definition_guard_rejects_mutations_with_leading_text_still_present(
    mutation: str, position: int
) -> None:
    html = f'<div class="manual-text">{SAMPLES["definition"]}</div>'
    doc = parse_mandoc_html(html).doc.model_dump()
    blocks = doc["blocks"][0]["items"][0]["definitionBlocks"]
    if mutation == "reorder":
        blocks[position], blocks[1] = blocks[1], blocks[position]
    elif mutation == "duplicate":
        blocks.insert(position, deepcopy(blocks[position]))
    else:
        blocks.pop(position)
    result = check_fidelity(html, doc)
    assert not result["page"]["equal"]
    assert len(result["definitions"]) == 1
    assert result["definitions"][0]["id"] == "flag"
    assert result["definitions"][0]["same_multiset"] == (mutation == "reorder")


@pytest.mark.parametrize("sample", ["list", "rs", "docbook", "top_level"])
@pytest.mark.parametrize("mutation", ["reorder", "duplicate", "loss"])
def test_page_guard_checks_structure_without_source_definition_ids(
    sample: str, mutation: str
) -> None:
    html = f'<div class="manual-text">{SAMPLES[sample]}</div>'
    doc = parse_mandoc_html(html).doc.model_dump()
    if sample in {"list", "rs"}:
        blocks = doc["blocks"][0]["items"][0]
    elif sample == "docbook":
        blocks = doc["blocks"][1]["items"][0]["definitionBlocks"]
    else:
        blocks = doc["blocks"]
    if mutation == "reorder":
        blocks[0], blocks[1] = blocks[1], blocks[0]
    elif mutation == "duplicate":
        blocks.append(deepcopy(blocks[0]))
    else:
        blocks.pop(0)
    assert not check_fidelity(html, doc)["page"]["equal"]


def test_definition_guard_rejects_missing_and_duplicate_ids() -> None:
    html = '<div class="manual-text"><dl><dt id="flag">--flag</dt><dd>Text.</dd></dl></div>'
    doc = parse_mandoc_html(html).doc.model_dump()
    items = doc["blocks"][0]["items"]
    items.append(deepcopy(items[0]))
    assert check_fidelity(html, doc)["definitions"] == [{"id": "flag", "matches": 2}]
    items.clear()
    assert check_fidelity(html, doc)["definitions"] == [{"id": "flag", "matches": 0}]


def test_bullet_loss_is_not_masked_by_identical_prose_elsewhere() -> None:
    html = (
        '<div class="manual-text"><dl><dt>•</dt><dd>Repeated prose.'
        "<p>Bullet body.</p></dd></dl><p>Repeated prose.</p></div>"
    )
    doc = parse_mandoc_html(html).doc.model_dump()
    assert check_fidelity(html, doc)["page"]["equal"]
    doc["blocks"][0]["items"][0].pop(0)
    assert not check_fidelity(html, doc)["page"]["equal"]


def test_whitespace_is_an_explicit_failure_and_inline_adjacency_is_preserved() -> None:
    html = (
        '<div class="manual-text"><p>Use <b>-d\n </b><i>db_name</i>; '
        "<b>printf</b>(1), v<em>fork</em>.</p></div>"
    )
    doc = parse_mandoc_html(html).doc.model_dump()
    assert check_fidelity(html, doc)["page"]["equal"]
    for node in doc["blocks"][0]["inlines"]:
        if node["type"] == "strong":
            node["inlines"][0]["text"] = node["inlines"][0]["text"].rstrip()
            break
    result = check_fidelity(html, doc)
    assert not result["page"]["equal"]
    assert result["page"]["whitespace"] > 0


def test_marker_normalization_does_not_hide_bare_options_or_literal_bullets() -> None:
    html = (
        '<div class="manual-text"><h1>OPTIONS</h1><dl><dt id="plus"><b>+</b></dt>'
        "<dd>Plus option.</dd></dl><p>A literal • in prose.</p></div>"
    )
    doc = parse_mandoc_html(html).doc.model_dump()
    result = check_fidelity(html, doc)
    assert result["page"]["equal"]
    assert result["normalized_markers"] == 0
    assert result["definitions_checked"] == 1


@pytest.mark.skipif(
    shutil.which("mandoc") is None and not os.environ.get("CI"),
    reason="mandoc not installed",
)
@pytest.mark.parametrize(
    "name", ["definition-leading-text.1", "git-commit.1", "find-name.1", "parser-text-fidelity.1"]
)
def test_rendered_samples_keep_exact_source_order(name: str) -> None:
    source = Path(__file__).parent / "fixtures/roff" / name
    raw = source.read_bytes()
    assert is_so_stub(raw) is None
    html = render_html(raw).html
    result = check_fidelity(html, parse_mandoc_html(html).doc.model_dump())
    assert result["page"]["equal"], result
    assert not result["definitions"], result


@pytest.mark.parametrize("marker", ["*", "•", "-", "+"])
def test_converted_prose_markers_and_comments_are_normalized(marker: str) -> None:
    html = (
        f'<div class="manual-text"><dl><dt id="bullet"><!-- keep -->{marker} First</dt>'
        "<dd>Opening prose.<p>Continuation.</p></dd></dl></div>"
    )
    result = check_fidelity(html, parse_mandoc_html(html).doc.model_dump())
    assert result["page"]["equal"], result
    assert not result["definitions"]
    assert result["normalized_markers"] == 1
    manual, _, _, _ = source_body(html)
    assert "<!-- keep -->" in str(manual)
    assert marker not in visible_text(manual)


def test_mixed_marker_definitions_remain_literal() -> None:
    html = (
        '<div class="manual-text"><dl><dt id="one">• literal</dt><dd>First.</dd>'
        '<dt id="two">ordinary</dt><dd>Second.</dd></dl></div>'
    )
    result = check_fidelity(html, parse_mandoc_html(html).doc.model_dump())
    assert result["page"]["equal"]
    assert not result["definitions"]
    assert result["normalized_markers"] == 0


@pytest.mark.parametrize("opening", ["•<b>Opening</b>", "•Opening"])
def test_docbook_bullet_syntax_is_normalized_but_prose_is_checked(opening: str) -> None:
    html = (
        '<!-- Generator: DocBook XSL --><div class="manual-text">'
        f'<div class="Bd-indent">{opening} prose.<p>Continuation.</p>After.</div></div>'
    )
    doc = parse_mandoc_html(html).doc.model_dump()
    result = check_fidelity(html, doc)
    assert result["page"]["equal"], result
    assert result["normalized_markers"] == 1
    doc["blocks"][0]["items"][0].pop()
    assert not check_fidelity(html, doc)["page"]["equal"]


@pytest.mark.parametrize("mutation", ["reorder", "duplicate", "loss", "whitespace"])
def test_anchored_alignment_matches_bounded_exact_comparison(monkeypatch, mutation: str) -> None:
    source = ["repeated", "word"] * 100 + ["unique", "tail"]
    actual = source.copy()
    if mutation == "reorder":
        actual[100:103] = reversed(actual[100:103])
        actual[0], actual[-1] = actual[-1], actual[0]
    elif mutation == "duplicate":
        actual[100:100] = actual[98:100]
    elif mutation == "loss":
        del actual[100:102]
    else:
        actual[100:102] = ["".join(actual[100:102])]
    exact = alignment(source, actual)
    monkeypatch.setattr("fidelity.MAX_EXACT_PARTITION", 10)
    anchored = alignment(source, actual)
    assert anchored["equal"] == exact["equal"] is False
    assert anchored["same_multiset"] == exact["same_multiset"]
    if mutation == "whitespace":
        assert anchored["whitespace"] == exact["whitespace"] == 2
    else:
        assert anchored["missing"] + anchored["extra"] > 0 or anchored["unresolved_partitions"]


def test_unsplittable_diagnostic_partition_remains_an_explicit_failure(monkeypatch) -> None:
    monkeypatch.setattr("fidelity.MAX_EXACT_PARTITION", 10)
    result = alignment(["a"] * 300, ["b"] * 300)
    assert result["equal"] is False
    assert result["unresolved_partitions"] == [{"source_tokens": 300, "actual_tokens": 300}]


def test_page_guard_detects_definition_order_even_when_each_definition_is_exact() -> None:
    html = (
        '<div class="manual-text"><dl><dt id="one">--one</dt><dd>First prose.</dd>'
        '<dt id="two">--two</dt><dd>Second prose.</dd></dl></div>'
    )
    doc = parse_mandoc_html(html).doc.model_dump()
    doc["blocks"][0]["items"].reverse()
    result = check_fidelity(html, doc)
    assert not result["page"]["equal"]
    assert result["page"]["same_multiset"]
    assert not result["definitions"]


def test_source_id_heading_collision_has_one_deterministic_target() -> None:
    html = (
        '<div class="manual-text"><h1>NAME</h1><dl><dt id="name">--name</dt>'
        "<dd>First prose.</dd></dl></div>"
    )
    doc = parse_mandoc_html(html).doc.model_dump()
    item = doc["blocks"][1]["items"][0]
    assert item["id"] == "name-2"
    assert not check_fidelity(html, doc)["definitions"]
    item["id"] = "name-3"
    assert check_fidelity(html, doc)["definitions"] == [{"id": "name", "matches": 0}]


@pytest.mark.skipif(
    shutil.which("mandoc") is None and not os.environ.get("CI"), reason="mandoc not installed"
)
def test_rendered_docbook_paragraph_bullet_normalization_and_loss_mutation() -> None:
    raw = b""".\\" Generator: DocBook XSL
.TH BULLET 1
.SH DESCRIPTION
.RS
.PP
\\(bu\\fBFirst\\fR item.
.PP
Continuation.
.RE
"""
    html = render_html(raw).html
    doc = parse_mandoc_html(html).doc.model_dump()
    result = check_fidelity(html, doc)
    assert result["page"]["equal"], result
    assert result["normalized_markers"] == 1
    doc["blocks"][1]["items"][0].pop(0)
    assert not check_fidelity(html, doc)["page"]["equal"]


@pytest.mark.parametrize(
    "key",
    [
        "after_alignment_pages",
        "after_perdef_pages",
        "ids_order_equal_changed",
        "toc_equal_changed",
        "option_anchor_order_changes",
        "option_count_change_pages",
        "plain_text_equal_changed",
    ],
)
def test_ops_exit_gate_enforces_content_and_identity_invariants(key: str) -> None:
    path = Path(__file__).parents[1] / "scripts/audit_fidelity.py"
    spec = spec_from_file_location("audit_fidelity_exit_test", path)
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.audit_exit_status(Counter()) == 0
    assert module.audit_exit_status(Counter({"option_tuples_equal_changed": 1})) == 0
    assert module.audit_exit_status(Counter({key: 1})) == 1
    assert module.audit_exit_status(Counter({key: 1, "errors": 1})) == 2


@pytest.mark.parametrize("marker", ["•\n", "<b>•</b>"])
def test_docbook_inline_marker_stops_at_next_block_without_consuming_prose(marker: str) -> None:
    html = (
        f'<!-- Generator: DocBook XSL --><div class="manual-text">'
        f'<div class="Bd-indent">{marker}<p>First item.</p></div></div>'
    )
    manual, removed, _, _ = source_body(html)
    assert removed == 1
    assert "First item." in visible_text(manual)
    doc = parse_mandoc_html(html).doc.model_dump()
    assert check_fidelity(html, doc)["page"]["equal"]
    doc["blocks"][0]["items"][0].clear()
    assert not check_fidelity(html, doc)["page"]["equal"]


@pytest.mark.skipif(
    shutil.which("mandoc") is None and not os.environ.get("CI"), reason="mandoc not installed"
)
def test_rendered_docbook_inline_bullet_before_paragraph_preserves_first_character() -> None:
    html = render_html(
        b'.\\" Generator: DocBook XSL\n.TH BULLET 1\n.SH DESCRIPTION\n'
        b".RS\n\\(bu\n.PP\nFirst item.\n.RE\n"
    ).html
    manual, removed, _, _ = source_body(html)
    assert removed == 1
    assert "First item." in visible_text(manual)
    result = check_fidelity(html, parse_mandoc_html(html).doc.model_dump())
    assert result["page"]["equal"], result
