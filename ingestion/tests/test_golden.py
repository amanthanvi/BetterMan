"""Golden parser fixtures.

Each roff source under `fixtures/roff` is rendered with the host `mandoc` and
parsed. The result must match `fixtures/golden/<file>.json`. Regenerate with:

    uv run python -m pytest tests/test_golden.py --update-golden

The same JSON files are copied into `nextjs/components/doc/__fixtures__` and
rendered by the Next.js golden test, so both sides of the document model are
checked against one artifact.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from ingestion.mandoc_parser import is_so_stub, parse_mandoc_html, so_target_name_section

_ROFF = Path(__file__).parent / "fixtures" / "roff"
_GOLDEN = Path(__file__).parent / "fixtures" / "golden"
# bash(1) and curl(1) are kept as roff sources for behavioural tests but their
# goldens would be over a megabyte each, so they are excluded from the snapshot set.
_LARGE = {"bash.1", "curl.1"}
_CASES = sorted(p.name for p in _ROFF.iterdir() if p.is_file() and p.name not in _LARGE)

# CI installs mandoc; locally the suite skips rather than fails without it.
pytestmark = pytest.mark.skipif(
    shutil.which("mandoc") is None and not os.environ.get("CI"),
    reason="mandoc not installed",
)


def _render(path: Path) -> str:
    env = os.environ | {"LC_ALL": "C.UTF-8"}
    proc = subprocess.run(
        ["mandoc", "-Thtml"],
        check=True,
        capture_output=True,
        env=env,
        input=path.read_bytes(),
    )
    return proc.stdout.decode("utf-8", errors="replace")


def _golden_payload(path: Path) -> dict[str, object]:
    source = path.read_bytes()
    stub = is_so_stub(source)
    if stub is not None:
        target = so_target_name_section(stub)
        return {"alias": {"target": list(target) if target else None, "raw": stub}}

    parsed = parse_mandoc_html(_render(path))
    return {
        "description": parsed.description,
        "synopsis": parsed.synopsis,
        "seeAlso": [ref.model_dump() for ref in parsed.see_also or []],
        "options": [opt.model_dump() for opt in parsed.options or []],
        "doc": parsed.doc.model_dump(),
    }


@pytest.mark.parametrize("name", _CASES)
def test_golden(name: str, request: pytest.FixtureRequest) -> None:
    payload = _golden_payload(_ROFF / name)
    golden_path = _GOLDEN / f"{name}.json"

    if request.config.getoption("--update-golden"):
        _GOLDEN.mkdir(parents=True, exist_ok=True)
        golden_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return

    assert golden_path.exists(), f"missing golden {golden_path.name}; run with --update-golden"
    expected = json.loads(golden_path.read_text(encoding="utf-8"))
    assert payload == expected


def test_man7_xrefs_link_and_see_also_is_populated() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "tar.1"))
    hrefs: list[str] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if node.get("type") == "link":
                hrefs.append(str(node.get("href")))
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(parsed.doc.model_dump())
    assert "/man/gzip/1" in hrefs
    assert parsed.see_also is not None
    assert ("gzip", "1") in [(r.name, r.section) for r in parsed.see_also]
    assert all("\n" not in item.title for item in parsed.doc.toc)
    assert "SEE ALSO" in [item.title for item in parsed.doc.toc]


def test_mdoc_synopsis_is_a_line_not_a_table() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "ls.1.mdoc"))
    assert parsed.synopsis and parsed.synopsis[0].startswith("ls [")
    assert not any(block.type == "table" for block in parsed.doc.blocks)


def test_tbl_first_row_becomes_headers() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "ascii.7"))
    tables = [block for block in parsed.doc.blocks if block.type == "table"]
    assert tables and tables[0].headers[:2] == ["Oct", "Dec"]


def test_bare_see_also_references_become_links() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "rbash.1"))
    see_also = next(b for b in parsed.doc.blocks if b.type == "heading" and b.text == "SEE ALSO")
    idx = parsed.doc.blocks.index(see_also)
    paragraph = parsed.doc.blocks[idx + 1]
    assert paragraph.type == "paragraph"
    assert any(i.type == "link" and i.href == "/man/bash/1" for i in paragraph.inlines)


def test_stub_is_detected() -> None:
    assert is_so_stub((_ROFF / "man.7").read_bytes()) == "man7/groff_man.7"
    assert so_target_name_section("man7/groff_man.7") == ("groff_man", "7")
    assert is_so_stub((_ROFF / "rbash.1").read_bytes()) is None


@pytest.mark.parametrize(
    ("name", "flags"),
    [
        ("tar.1", ["-c, --create", "-x, --extract, --get"]),
        ("git-commit.1", ["-a, --all"]),
        ("dash-prose.1", ["-a"]),
    ],
)
def test_option_extraction_from_roff(name: str, flags: list[str]) -> None:
    parsed = parse_mandoc_html(_render(_ROFF / name))
    assert parsed.options
    extracted = [option.flags for option in parsed.options]
    for flag in flags:
        assert flag in extracted
    if name == "dash-prose.1":
        assert extracted == flags


def test_tar_nested_environment_and_format_values_are_not_options() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "tar.1"))
    assert parsed.options and len(parsed.options) == 156
    flags = [option.flags for option in parsed.options]
    assert "-c, --create" in flags
    assert "-x, --extract, --get" in flags
    assert not any(flag.startswith("TAR_") for flag in flags)
    assert not {"gnu", "oldgnu", "pax, posix", "ustar", "v7"}.intersection(flags)
    # Values keep their original body anchors even though they are not indexed.
    body = parsed.doc.model_dump_json()
    for anchor in ("TAR_FILETYPE", "TAR_FORMAT", "gnu", "oldgnu", "ustar", "v7"):
        assert f'"id":"{anchor}"' in body


@pytest.mark.parametrize("name", ["curl.1", "curl-options.1"])
def test_curl_tlsv1_owns_minus_one_instead_of_range_example(name: str) -> None:
    parsed = parse_mandoc_html(_render(_ROFF / name))
    assert parsed.options
    owners = [option for option in parsed.options if "-1" in option.flags]
    assert len(owners) == 1
    assert owners[0].flags == "-1, --tlsv1"
    assert owners[0].anchorId == "def-1-tlsv1"
    assert not any(option.flags == "0-0,-1" for option in parsed.options)


def test_tmux_flag_prose_is_not_a_docbook_option_definition() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "tmux-prose.1"))
    assert parsed.options is None
    description = parsed.doc.blocks[3:]
    assert [block.type for block in description] == ["paragraph", "list"]
    assert "sets the client's key table" in parsed.plain_text


@pytest.mark.parametrize(
    ("name", "flags"),
    [("bare-options.1", ["-a", "-", "--"]), ("bare-options.1.mdoc", ["-l", "-", "+"])],
)
def test_bare_options_exclude_bullets_exit_status_and_format_modifiers(
    name: str, flags: list[str]
) -> None:
    parsed = parse_mandoc_html(_render(_ROFF / name))
    assert parsed.options and [option.flags for option in parsed.options] == flags


def test_bash_conditional_operators_are_not_command_options() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "bash.1"))
    assert parsed.options
    start = next(
        index
        for index, block in enumerate(parsed.doc.blocks)
        if block.type == "heading" and block.text == "CONDITIONAL EXPRESSIONS"
    )
    end = next(
        index
        for index in range(start + 1, len(parsed.doc.blocks))
        if parsed.doc.blocks[index].type == "heading"
        and parsed.doc.blocks[index].level <= parsed.doc.blocks[start].level
    )
    conditional_ids = {
        item.id
        for block in parsed.doc.blocks[start + 1 : end]
        if block.type == "definition_list"
        for item in block.items
    }
    assert len(conditional_ids) == 36
    assert conditional_ids.isdisjoint(option.anchorId for option in parsed.options)
    assert any(option.flags == "-c" for option in parsed.options)
    assert any(option.flags == "-a" for option in parsed.options)
    assert not any(option.flags == "+(pattern-list)" for option in parsed.options)


def test_git_commit_docbook_options_are_preserved() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "git-commit.1"))
    assert parsed.options and len(parsed.options) == 38


def test_option_shapes_keep_symbolic_and_grouped_flags_but_not_values_or_operators() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "option-shapes.1"))
    assert parsed.options and [option.flags for option in parsed.options] == [
        "-q",
        "-<digit>",
        "-<, --less-than",
        "-/",
        "-^",
        "--(heading|footing)-(left|center|right)",
        "[--password app-specific-password]",
        "-a",
        "+O",
    ]


def test_printf_modifiers_do_not_become_bare_options() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "printf-modifiers.1"))
    assert parsed.options is None
    definitions = next(block for block in parsed.doc.blocks if block.type == "definition_list")
    assert [item.id for item in definitions.items] == ["_", "def", "+", "0"]
