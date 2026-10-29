import json
from hashlib import sha256
from pathlib import Path

from ingestion.extractor_provenance import (
    OPTION_EXTRACTOR_FIXTURES_SHA256,
    OPTION_EXTRACTOR_SOURCES,
    OPTION_EXTRACTOR_VERSION,
    extractor_version,
)


def test_extractor_version_tracks_packaged_sources_and_is_a_json_safe_integer() -> None:
    assert OPTION_EXTRACTOR_VERSION == extractor_version(OPTION_EXTRACTOR_SOURCES)
    assert OPTION_EXTRACTOR_VERSION is not None
    assert 0 < OPTION_EXTRACTOR_VERSION < 2**53
    assert {path.name for path in OPTION_EXTRACTOR_SOURCES} >= {
        "mandoc_parser.py",
        "mandoc.py",
        "doc_model.py",
        "util.py",
        "extractor_provenance.py",
    }


def test_parser_or_dependency_changes_automatically_change_version(tmp_path: Path) -> None:
    parser = tmp_path / "mandoc_parser.py"
    dependency = tmp_path / "util.py"
    parser.write_text("def extract(): return ['--old']\n")
    dependency.write_text("IDENTITY = 1\n")
    old = extractor_version([parser, dependency])
    parser.write_text("def extract(): return ['--old', '--new']\n")
    changed = extractor_version([parser, dependency])
    assert changed != old
    dependency.write_text("IDENTITY = 2\n")
    assert extractor_version([parser, dependency]) not in {old, changed}


def test_version_is_independent_of_install_path_and_line_endings(tmp_path: Path) -> None:
    first = tmp_path / "a" / "parser.py"
    second = tmp_path / "b" / "parser.py"
    first.parent.mkdir()
    second.parent.mkdir()
    first.write_bytes(b"flag = '--one'\n")
    second.write_bytes(b"flag = '--one'\r\n")
    assert extractor_version([first]) == extractor_version([second])


def test_missing_source_has_unknown_provenance(tmp_path: Path) -> None:
    assert extractor_version([tmp_path / "missing.py"]) is None


def test_option_fixture_changes_require_a_new_extractor_fingerprint() -> None:
    fixtures = Path(__file__).parent / "fixtures" / "golden"
    options = [
        (path.name, json.loads(path.read_text()).get("options"))
        for path in sorted(fixtures.glob("*.json"))
    ]
    actual = sha256(
        json.dumps(options, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()
    assert actual == OPTION_EXTRACTOR_FIXTURES_SHA256, (
        "Option fixtures changed: update OPTION_EXTRACTOR_FIXTURES_SHA256 in the hashed "
        "extractor provenance source so the runtime version changes too."
    )
