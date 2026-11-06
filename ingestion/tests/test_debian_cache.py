import hashlib
import io
import sqlite3
import threading
from pathlib import Path
from urllib.error import HTTPError

import pytest

from ingestion import convex_client
from ingestion import debian_indexes as indexes
from ingestion import debian_pipeline as pipeline
from ingestion.debian_indexes import Package


@pytest.mark.parametrize("failure", ["download", "extract"])
def test_acquisition_cleanup_preserves_original_errors(tmp_path, monkeypatch, failure):
    obj = object.__new__(pipeline.Workspace)
    obj.root = tmp_path
    obj.cache = tmp_path / "cache"
    obj.cache.mkdir()
    obj.pins = {"mirror": "https://never-contact.invalid"}
    obj.cache_limit = 1
    obj._disk_lock = threading.Lock()
    obj._reserved = 0
    obj._inflight = set()
    obj.extracted_quota = None
    (obj.cache / "old.deb").write_bytes(b"old")
    package = Package("fixture", "1", "pool/main/fixture.deb", "a" * 64, 1)
    error = RuntimeError(f"original {failure} error")

    def fail(*_args, **_kwargs):
        raise error

    monkeypatch.setattr(
        pipeline, "download", fail if failure == "download" else lambda *_, **_kw: 0
    )
    monkeypatch.setattr(pipeline, "extract", fail)
    with pytest.raises(RuntimeError) as caught:
        obj._acquire(package)
    assert caught.value is error
    assert obj._reserved == 0 and not obj._inflight
    assert sum(p.stat().st_size for p in obj.cache.glob("*.deb")) <= obj.cache_limit


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
    pins.write_text("{}")
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


def test_extracted_quota_counts_resumed_files_and_parallel_writes(tmp_path):
    from concurrent.futures import ThreadPoolExecutor

    from ingestion.debian_archives import ExtractedQuota

    (tmp_path / "existing").write_bytes(b"1234")
    quota = ExtractedQuota(tmp_path, 10)

    def write(name):
        try:
            quota.write(tmp_path / name, io.BytesIO(b"1234"), 4)
            return True
        except RuntimeError:
            return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        assert sorted(executor.map(write, ["one", "two"])) == [False, True]
    assert quota.used == sum(p.stat().st_size for p in tmp_path.iterdir()) == 8
    quota.write(tmp_path / "existing", io.BytesIO(b"1"), 1)
    assert quota.used == 5
    with pytest.raises(RuntimeError, match="Existing extracted"):
        ExtractedQuota(tmp_path, 4)


@pytest.mark.parametrize("status", [404, 410, 429, 503, "timeout"])
def test_regular_mirror_falls_back_to_pinned_snapshot(tmp_path, monkeypatch, status):
    calls, sleeps = [], []
    data = b"pinned archive"

    def fetch(req, **_kwargs):
        calls.append(req.full_url)
        if len(calls) == 1:
            if status == "timeout":
                raise TimeoutError()
            raise HTTPError(req.full_url, status, "unavailable", {"Retry-After": "7"}, None)
        return io.BytesIO(data)

    monkeypatch.setattr(indexes, "urlopen", fetch)
    monkeypatch.setattr(indexes.time, "sleep", sleeps.append)
    monkeypatch.setattr(indexes.random, "uniform", lambda *_: 0)
    monkeypatch.setattr(convex_client, "ingest_activation_deadline", lambda: None)
    digest = hashlib.sha256(data).hexdigest()
    assert indexes.download(
        "https://deb.debian.org/debian/a.deb",
        tmp_path / "a",
        digest,
        len(data),
        fallback_url="https://snapshot.test/pinned/a.deb",
    ) == len(data)
    assert calls == ["https://deb.debian.org/debian/a.deb", "https://snapshot.test/pinned/a.deb"]
    assert not sleeps


@pytest.mark.parametrize(
    "failure", ["checksum", "oversize", "short_body", "http_403", "retry_after"]
)
def test_every_bad_cdn_response_is_discarded_before_snapshot(
    tmp_path, monkeypatch, caplog, failure
):
    import json
    import logging

    data = b"pinned archive"
    calls = []
    caplog.set_level(logging.WARNING, logger="betterman.ingestion")

    def fetch(req, **_kwargs):
        calls.append(req.full_url)
        if len(calls) == 1:
            if failure.startswith("http") or failure == "retry_after":
                raise HTTPError(
                    req.full_url,
                    403 if failure == "http_403" else 503,
                    "DO NOT LOG BODY",
                    {"Retry-After": "3600"},
                    None,
                )
            return io.BytesIO(
                {"checksum": b"x" * len(data), "oversize": data + b"x", "short_body": data[:-1]}[
                    failure
                ]
            )
        assert not list(tmp_path.glob("*.part"))
        return io.BytesIO(data)

    monkeypatch.setattr(indexes, "urlopen", fetch)
    monkeypatch.setattr(indexes.time, "sleep", lambda _: pytest.fail("host switch must not sleep"))
    events = []
    assert indexes.download(
        "https://deb.debian.org/debian/a.deb",
        tmp_path / "a",
        hashlib.sha256(data).hexdigest(),
        len(data),
        fallback_url="https://snapshot.debian.org/pinned/a.deb",
        on_fallback=events.append,
    ) == len(data)
    assert calls == [
        "https://deb.debian.org/debian/a.deb",
        "https://snapshot.debian.org/pinned/a.deb",
    ]
    assert (tmp_path / "a").read_bytes() == data
    assert len(events) == 1
    event = json.loads(caplog.records[-1].message)
    assert event == {"event": "deb_archive_fallback", "reason": events[0]}
    assert "http" not in event["reason"] or event["reason"] in {"http_403", "http_503"}
    assert "DO NOT LOG BODY" not in caplog.text and "https://" not in caplog.text


def test_snapshot_integrity_failure_still_fails_closed(tmp_path, monkeypatch):
    monkeypatch.setattr(indexes, "urlopen", lambda *_a, **_kw: io.BytesIO(b"bad"))
    with pytest.raises(ValueError, match="mismatch"):
        indexes.download("https://snapshot.debian.org/pinned/a.deb", tmp_path / "a", "0" * 64, 3)
    assert not list(tmp_path.iterdir())


@pytest.mark.parametrize("value,enabled", [(None, True), ("", True), ("1", True), ("0", False)])
def test_cdn_switch_and_download_only_share_the_archive_path(tmp_path, monkeypatch, value, enabled):
    from scripts import check_debian_archives

    if value is None:
        monkeypatch.delenv("BETTERMAN_DEBIAN_CDN", raising=False)
    else:
        monkeypatch.setenv("BETTERMAN_DEBIAN_CDN", value)
    assert indexes.debian_cdn_enabled() is enabled
    obj = object.__new__(pipeline.Workspace)
    obj.root = tmp_path
    obj.cache = tmp_path / "cache"
    obj.cache.mkdir()
    obj.pins = {"mirror": "https://snapshot.debian.org/pinned"}
    obj._disk_lock = threading.Lock()
    obj._reserved = 0
    obj._inflight = set()
    obj.cache_limit = 2 * 1024**3
    obj.extracted_quota = None
    package = Package("fixture", "1", "pool/main/f.deb", "a" * 64, 1)
    calls = []

    def fetch(url, destination, *_args, **kwargs):
        calls.append((url, kwargs["fallback_url"]))
        destination.write_bytes(b"x")
        if enabled:
            kwargs["on_fallback"]("http_403")
        return 1

    monkeypatch.setattr(pipeline, "download", fetch)
    monkeypatch.setattr(pipeline, "extract", lambda *_args, **_kwargs: [])
    assert obj._acquire(package)[-1] == int(enabled)
    snapshot = "https://snapshot.debian.org/pinned/pool/main/f.deb"
    assert calls == [
        ("https://deb.debian.org/debian/pool/main/f.deb", snapshot) if enabled else (snapshot, None)
    ]
    assert check_debian_archives.benchmark.__globals__["Workspace"] is pipeline.Workspace


def test_invalid_cdn_switch_fails_before_network(monkeypatch):
    monkeypatch.setenv("BETTERMAN_DEBIAN_CDN", "false")
    with pytest.raises(ValueError, match="0 or 1"):
        indexes.debian_cdn_enabled()


@pytest.mark.parametrize(
    "target",
    [
        "http://snapshot.debian.org/file/abc",
        "https://evil.invalid/file/abc",
        "https://deb.debian.org/debian/a.deb",
        "https://user@snapshot.debian.org/file/abc",
        "https://snapshot.debian.org:8443/file/abc",
        "https://snapshot.debian.org:invalid/file/abc",
    ],
)
def test_redirect_policy_rejects_downgrades_unexpected_hosts_and_credentials(target):
    from urllib.request import Request

    with pytest.raises(HTTPError, match="redirect policy"):
        indexes.DebianRedirects().redirect_request(
            Request("https://snapshot.debian.org/archive/debian/a.deb"),
            None,
            302,
            "Found",
            {},
            target,
        )


def test_snapshot_same_host_https_redirect_and_neutral_header(tmp_path, monkeypatch):
    from urllib.request import Request

    target = "https://snapshot.debian.org/file/" + "a" * 40
    request = indexes.DebianRedirects().redirect_request(
        Request("https://snapshot.debian.org/archive/debian/a.deb"),
        None,
        302,
        "Found",
        {},
        target,
    )
    assert request.full_url == target

    def fetch(req, **_kwargs):
        assert req.get_header("User-agent") == "BetterMan-ingestion/1"
        return io.BytesIO(b"x")

    monkeypatch.setattr(indexes, "urlopen", fetch)
    indexes.download(target, tmp_path / "a", hashlib.sha256(b"x").hexdigest(), 1)


@pytest.mark.parametrize(
    "failure", ["checksum", "oversize", "short_body", "http_403", "retry_after"]
)
def test_bad_snapshot_leg_is_not_bypassed(tmp_path, monkeypatch, failure):
    data = b"pinned archive"
    calls = []

    def fetch(req, **_kwargs):
        calls.append(req.full_url)
        if len(calls) == 1 or failure.startswith("http") or failure == "retry_after":
            raise HTTPError(
                req.full_url,
                503 if failure == "retry_after" and len(calls) > 1 else 403,
                "unavailable",
                {"Retry-After": "3600"},
                None,
            )
        return io.BytesIO(
            {"checksum": b"x" * len(data), "oversize": data + b"x", "short_body": data[:-1]}[
                failure
            ]
        )

    monkeypatch.setattr(indexes, "urlopen", fetch)
    monkeypatch.setattr(indexes.time, "sleep", lambda _: pytest.fail("must fail closed"))
    with pytest.raises((ValueError, HTTPError, RuntimeError)):
        indexes.download(
            "https://deb.debian.org/debian/a.deb",
            tmp_path / "a",
            hashlib.sha256(data).hexdigest(),
            len(data),
            fallback_url="https://snapshot.debian.org/pinned/a.deb",
        )
    assert len(calls) == 2 and not list(tmp_path.iterdir())
