import hashlib
import io
import sqlite3
from pathlib import Path
from urllib.error import HTTPError

from ingestion import convex_client
from ingestion import debian_indexes as indexes
from ingestion import debian_pipeline as pipeline
from ingestion.debian_indexes import Package


def test_retry_after_and_minutes_of_jittered_backoff_are_bounded(tmp_path, monkeypatch):
    calls, sleeps = [], []
    data = b"verified"

    def fetch(*_args, **_kwargs):
        calls.append(1)
        if len(calls) < 3:
            raise HTTPError(
                "https://snapshot.test/a",
                429 if len(calls) == 1 else 503,
                "retry",
                {"Retry-After": "130"} if len(calls) == 1 else {},
                None,
            )
        return io.BytesIO(data)

    monkeypatch.setattr(indexes, "urlopen", fetch)
    monkeypatch.setattr(indexes.time, "sleep", sleeps.append)
    monkeypatch.setattr(indexes.random, "uniform", lambda *_: 0)
    monkeypatch.setattr(convex_client, "ingest_activation_deadline", lambda: None)
    indexes.download(
        "https://snapshot.test/a", tmp_path / "a", hashlib.sha256(data).hexdigest(), len(data)
    )
    assert len(calls) == 3 and sum(sleeps) == 140
    assert max(sleeps) <= 30


def test_extracted_receipts_and_checksum_cache_resume_and_revalidate(tmp_path, monkeypatch):
    data = (Path(__file__).parent / "fixtures/debs/gawk.deb").read_bytes()
    package = Package(
        "gawk", "1", "pool/main/g/gawk.deb", hashlib.sha256(data).hexdigest(), len(data)
    )
    pins = tmp_path / "pins"
    pins.write_text("test pins")
    cache = tmp_path / "cache"
    monkeypatch.setenv("BETTERMAN_DEBIAN_CACHE_DIR", str(cache))
    monkeypatch.setattr(pipeline, "PINS", pins)

    def catalog(root):
        root.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(root / "owners.sqlite3") as db:
            db.execute("CREATE TABLE IF NOT EXISTS owners(path TEXT,pkg TEXT)")
        db.close()
        return {"mirror": "https://snapshot.test"}, [package]

    monkeypatch.setattr(pipeline, "catalog", catalog)
    monkeypatch.setattr(pipeline, "available_packages", lambda *_: {"gawk": package})
    monkeypatch.setattr(pipeline, "popularity", lambda *_: {})
    calls = []
    monkeypatch.setattr(
        indexes, "urlopen", lambda *_args, **_kw: calls.append(1) or io.BytesIO(data)
    )

    def acquire(root):
        w = pipeline.Workspace(root)
        try:
            w.acquire()
            assert w.store.complete(package)
        finally:
            w.store.db.close()
            w.owners.close()

    acquire(tmp_path / "one")
    acquire(tmp_path / "one")  # completed extraction: no fetch/extraction needed
    acquire(tmp_path / "two")  # new job: verified archive cache, no fetch
    assert len(calls) == 1
    # A changed extractor must not resolve stale indexed data, even if the old
    # files remain. Rebuild from the verified archive without another download.
    db = sqlite3.connect(tmp_path / "one" / "archives.sqlite3")
    db.execute("UPDATE receipts SET version=1")
    db.commit()
    db.close()
    w = pipeline.Workspace(tmp_path / "one")
    try:
        assert not w.acquired
        assert w.store.db.execute("SELECT count(*) FROM entries").fetchone()[0] == 0
        w.acquire()
        assert w.store.complete(package)
    finally:
        w.store.db.close()
        w.owners.close()
    assert len(calls) == 1
    (cache / f"{package.sha256}.deb").write_bytes(b"corrupted cache")
    acquire(tmp_path / "three")  # corrupt cache is never trusted
    assert len(calls) == 2
    # Missing extracted files invalidate a receipt; the valid archive is reused.
    for file in (tmp_path / "three" / "files").iterdir():
        file.unlink()
    acquire(tmp_path / "three")
    assert len(calls) == 2
