import gzip
from pathlib import Path

from scripts.audit_page_sizes import manual_sizes
from tests.test_debian_archives import package


def test_manual_size_audit_reads_verified_deb_sources_not_package_size(tmp_path):
    archive = Path(__file__).parent / "fixtures/debs/provider-low.deb"
    with archive.open("rb") as stream:
        rows = manual_sizes(stream, package("provider-low"), None, tmp_path)
    assert rows
    assert any(row["path"].endswith("shared.1.gz") and row["sourceBytes"] > 0 for row in rows)
    assert all(
        row["package"] == "provider-low" and row["sha256"] == package("provider-low").sha256
        for row in rows
    )


def test_size_audit_reports_guard_rejection_as_measurement(tmp_path, monkeypatch):
    from ingestion import ingest_runner
    from scripts.audit_page_sizes import measure_source

    monkeypatch.setattr(ingest_runner, "MAX_STORED_PAGE_BYTES", 64)
    path = tmp_path / "source.gz"
    path.write_bytes(gzip.compress(b".TH LARGE 1\n.SH NAME\nlarge - fixture\n"))
    row = {
        "sourceFile": str(path),
        "path": "usr/share/man/man1/large.1.gz",
        "name": "large",
        "section": "1",
        "sourceBytes": 38,
    }
    measured = measure_source(row)
    assert measured["storedBytes"] > 64
    assert "error" not in measured
    assert measured["path"] == row["path"]
