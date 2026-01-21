from __future__ import annotations

from pathlib import Path

import ingestion.man_scan as man_scan


def test_parse_man_filename_accepts_extended_sections() -> None:
    assert man_scan._parse_man_filename("curl.1.gz") == ("curl", "1")
    assert man_scan._parse_man_filename("EVP_DigestInit.3ssl") == ("EVP_DigestInit", "3ssl")

    assert man_scan._parse_man_filename("no-dot") is None
    assert man_scan._parse_man_filename("bad.") is None
    assert man_scan._parse_man_filename(".1") is None
    assert man_scan._parse_man_filename("name.0") is None


def test_scan_man_sources_discovers_files(tmp_path: Path) -> None:
    (tmp_path / "man1").mkdir()
    (tmp_path / "man5").mkdir()
    (tmp_path / "man1" / "curl.1").write_text("x", encoding="utf-8")
    (tmp_path / "man1" / "ls.1.gz").write_text("x", encoding="utf-8")
    (tmp_path / "man5" / "ssh_config.5").write_text("x", encoding="utf-8")
    (tmp_path / "not-man").mkdir()

    sources = man_scan.scan_man_sources(tmp_path, sample=False)
    pairs = {(src.name, src.section) for src in sources}
    assert ("curl", "1") in pairs
    assert ("ls", "1") in pairs
    assert ("ssh_config", "5") in pairs


def test_scan_man_sources_sample_uses_find(tmp_path: Path) -> None:
    (tmp_path / "man1").mkdir()
    (tmp_path / "man5").mkdir()
    (tmp_path / "man1" / "curl.1.gz").write_text("x", encoding="utf-8")
    (tmp_path / "man5" / "ssh_config.5").write_text("x", encoding="utf-8")

    sources = man_scan.scan_man_sources(tmp_path, sample=True)
    pairs = {(src.name, src.section) for src in sources}
    assert pairs == {("curl", "1"), ("ssh_config", "5")}
