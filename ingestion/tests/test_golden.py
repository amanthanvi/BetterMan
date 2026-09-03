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

pytestmark = pytest.mark.skipif(shutil.which("mandoc") is None, reason="mandoc not installed")


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
    assert all(" " not in item.title.strip() or "\n" not in item.title for item in parsed.doc.toc)
    assert "SEE ALSO" in [item.title for item in parsed.doc.toc]


def test_mdoc_synopsis_is_a_line_not_a_table() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "ls.1.mdoc"))
    assert parsed.synopsis and parsed.synopsis[0].startswith("ls [")
    assert not any(block.type == "table" for block in parsed.doc.blocks)


def test_tbl_first_row_becomes_headers() -> None:
    parsed = parse_mandoc_html(_render(_ROFF / "ascii.7"))
    tables = [block for block in parsed.doc.blocks if block.type == "table"]
    assert tables and tables[0].headers[:2] == ["Oct", "Dec"]


def test_stub_is_detected() -> None:
    assert is_so_stub((_ROFF / "man.7").read_bytes()) == "man7/groff_man.7"
    assert so_target_name_section("man7/groff_man.7") == ("groff_man", "7")
    assert is_so_stub((_ROFF / "rbash.1").read_bytes()) is None
