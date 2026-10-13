import json
from pathlib import Path
from uuid import uuid4

from ingestion.ingest_runner import _page_payload, _PageRow
from ingestion.options_search import MAX_OPTIONS_SEARCH_BYTES, options_search_text


def test_options_metadata_matches_convex_encoding_and_preserves_flag_case() -> None:
    text = options_search_text(
        [
            {"flags": "-c, --create", "anchorId": "opt-create", "description": "not indexed"},
            {"flags": "-C", "anchorId": "opt-directory"},
        ]
    )
    assert text is not None
    entries = json.loads(text)
    assert entries[0][2] == "-c c --create create"
    assert entries[1][2] == "-C c"
    assert "taf63de4c8601eff2" in entries[0][1]  # Known FNV-1a vector for "c".
    assert all(len(token) == 17 for entry in entries for token in entry[1].split())


def test_complete_metadata_including_anchors_fits_two_kib_and_stays_valid_json() -> None:
    options = [{"flags": "--" + "x" * 3000, "anchorId": "oversized"}]
    options.extend({"flags": f"--flag-{i}", "anchorId": f"opt-{i}"} for i in range(300))
    text = options_search_text(options)
    assert text is not None
    assert len(text.encode("utf-8")) <= MAX_OPTIONS_SEARCH_BYTES
    entries = json.loads(text)
    assert entries[0][0] == "opt-0"
    assert len(entries) < 300


def test_empty_invalid_and_duplicate_options_do_not_produce_bad_metadata() -> None:
    assert options_search_text(None) is None
    assert options_search_text([{"flags": "[]", "anchorId": "opt-empty"}]) is None
    assert options_search_text([{"flags": "--foo", "anchorId": ""}]) is None
    option = {"flags": "--foo-bar", "anchorId": "opt-foo"}
    text = options_search_text([option, option])
    assert text is not None
    entries = json.loads(text)
    assert len(entries) == 1
    assert entries[0][2] == "--foo-bar foo-bar"


def test_keyword_options_and_plus_flags_preserve_exact_sign_and_case() -> None:
    text = options_search_text(
        [
            {"flags": "ForwardAgent", "anchorId": "forward-agent"},
            {"flags": "+F", "anchorId": "plus-upper"},
            {"flags": "+f", "anchorId": "plus-lower"},
            {"flags": "foo-bar", "anchorId": "compound-keyword"},
        ]
    )
    assert text is not None
    entries = json.loads(text)
    assert [entry[2] for entry in entries] == ["forwardagent", "+F f", "+f f", "foo-bar"]
    assert entries[1][1] != entries[2][1]
    assert all(len(token) == 17 for entry in entries for token in entry[1].split())


def test_actual_ls_symbolic_flags_keep_their_anchors_without_invalid_bare_tokens() -> None:
    fixture = Path(__file__).parent / "fixtures" / "golden" / "ls.1.mdoc.json"
    options = [
        option
        for option in json.loads(fixture.read_text())["options"]
        if option["flags"] in {"-@", "-%"}
    ]
    pairs = [(option["flags"], option["anchorId"]) for option in options]
    assert pairs == [("-@", "@"), ("-%", "_")]
    options.extend(
        [
            {"flags": "-?", "anchorId": "question"},
            {"flags": "-#", "anchorId": "hash"},
        ]
    )
    text = options_search_text(options)
    assert text is not None
    assert [entry[2] for entry in json.loads(text)] == ["-@", "-%", "-?", "-#"]


def test_upload_payload_contains_only_bounded_derived_options_metadata() -> None:
    row = _PageRow(
        page_id=uuid4(),
        name="tar",
        section="1",
        title="tar",
        description="Archive tool",
        source_path="tar.1",
        source_package=None,
        source_package_version=None,
        content_sha256="tar",
        has_parse_warnings=False,
        doc={"toc": [], "blocks": []},
        plain_text="Body text",
        synopsis=None,
        options=[{"flags": "--create", "anchorId": "opt-create"}],
        see_also=None,
        headings_text="OPTIONS",
        see_also_refs=[],
    )
    payload = _page_payload(row, sitemap_page=1, links=[])
    assert payload["optionsText"] == options_search_text(row.options)
    assert len(str(payload["optionsText"]).encode("utf-8")) <= MAX_OPTIONS_SEARCH_BYTES
