"""APK v2 integrity covers its pinned control identity and SHA256 data stream."""

import base64
import dataclasses
import gzip
import hashlib
import io
import json
import sqlite3
import tarfile
from pathlib import Path

import pytest

from ingestion import alpine_archives as alpine
from ingestion import debian_indexes as indexes
from ingestion.debian_archives import ArchiveStore


def tar_bytes(entries):
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w") as tar:
        for name, body in entries:
            member = tarfile.TarInfo(name)
            member.size = len(body)
            tar.addfile(member, io.BytesIO(body))
    return raw.getvalue()


def fixture(tmp_path, *, path="usr/share/man/man1/tool.1", notice=b"MIT notice"):
    data = gzip.compress(
        tar_bytes(
            [
                (path, b".TH TOOL 1\n.SH NAME\ntool - fixture\n"),
                ("usr/share/licenses/fixture/LICENSE", notice),
            ]
        ),
        mtime=0,
    )
    info = (
        "pkgname = fixture\npkgver = 1-r0\narch = x86_64\n"
        f"datahash = {hashlib.sha256(data).hexdigest()}\n"
    ).encode()
    control = gzip.compress(
        tar_bytes([(".PKGINFO", info), (".post-install", b"touch /tmp/never-run")]), mtime=0
    )
    signature = gzip.compress(tar_bytes([(".SIGN.RSA.test.pub", b"opaque signature")]), mtime=0)
    raw = signature + control + data
    package = alpine.AlpinePackage(
        "fixture",
        "1-r0",
        "main/x86_64/fixture-1-r0.apk",
        "Q1" + base64.b64encode(hashlib.sha1(control).digest()).decode(),
        len(raw),
        license="MIT",
        source="fixture",
    )
    archive = tmp_path / "fixture.apk"
    archive.write_bytes(raw)
    return archive, package, len(signature), len(signature + control)


def test_native_integrity_and_observed_sha256_precede_selective_extraction(tmp_path):
    archive, package, _, _ = fixture(tmp_path)
    with pytest.raises(ValueError, match="must pass native verification"):
        alpine.extract(archive, package, tmp_path)
    proof = alpine.verify(archive, package)
    assert proof["sha256"] == hashlib.sha256(archive.read_bytes()).hexdigest()
    verified = dataclasses.replace(package, **proof)
    entries = alpine.extract(archive, verified, tmp_path)
    assert len(entries) == 2 and not any(p.name == ".post-install" for p in tmp_path.rglob("*"))
    store = ArchiveStore(tmp_path, registrations={"packages": {}})
    store.add(verified, entries)
    assert not store.complete(package)
    assert store.complete(verified)
    assert (
        store.resolve("fixture", "usr/share/man/man1/tool.1")
        == b".TH TOOL 1\n.SH NAME\ntool - fixture\n"
    )
    assert store.db.execute("SELECT control,sha256 FROM apk_hashes").fetchone() == (
        package.control_checksum,
        proof["sha256"],
    )
    changed = dataclasses.replace(
        verified, control_checksum="Q1" + base64.b64encode(b"x" * 20).decode()
    )
    assert not store.complete(changed)
    store.db.close()


@pytest.mark.parametrize("part", ["control", "data", "truncated"])
def test_tampered_or_truncated_apk_fails_before_extraction(tmp_path, part):
    archive, package, control, data = fixture(tmp_path)
    raw = bytearray(archive.read_bytes())
    if part == "truncated":
        raw.pop()
    else:
        raw[(control if part == "control" else data) + 12] ^= 1
    archive.write_bytes(raw)
    with pytest.raises(indexes.DownloadIntegrityError):
        alpine.verify(archive, package)
    assert not (tmp_path / "files").exists()


def test_native_verifier_does_not_weaken_retained_path_guard(tmp_path):
    archive, package, _, _ = fixture(tmp_path, path="usr/share/man/../../escape")
    verified = dataclasses.replace(package, **alpine.verify(archive, package))
    with pytest.raises(ValueError, match="Unsafe"):
        alpine.extract(archive, verified, tmp_path)
    assert not (tmp_path / "escape").exists()


def test_native_download_fallback_and_cache_replay_verify_control_and_data(tmp_path, monkeypatch):
    archive, package, _, _ = fixture(tmp_path)
    good = archive.read_bytes()
    bad = bytearray(good)
    bad[-20] ^= 1
    calls = []

    def fetch(request, **kwargs):
        assert request.get_header("User-agent") == "BetterMan-ingestion/1"
        calls.append(request.full_url)
        return io.BytesIO(bytes(bad) if len(calls) == 1 else good)

    monkeypatch.setattr(indexes, "urlopen", fetch)
    destination = tmp_path / "cache.apk"

    def verify(path):
        return alpine.verify(path, package)

    args = ("https://dl-cdn.alpinelinux.org/fixture.apk", destination, None, package.size)
    assert indexes.download(
        *args, fallback_url="https://dl-3.alpinelinux.org/fixture.apk", verify=verify
    ) == len(good)
    assert len(calls) == 2 and destination.read_bytes() == good
    assert indexes.download(*args, verify=verify) == 0 and len(calls) == 2
    assert not list(tmp_path.glob("*.part"))
    with pytest.raises(ValueError, match="pinned HTTPS"):
        indexes.download("https://example.test/no-digest", tmp_path / "none", None, 1)


def test_native_workspace_resume_restores_observed_hashes_without_redownloading(
    tmp_path, monkeypatch
):
    from ingestion.debian_pipeline import Workspace

    archive, package, _, _ = fixture(tmp_path)
    raw = archive.read_bytes()
    calls = []

    def catalog(root, pins_path):
        root.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(root / "owners.sqlite3") as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS owners(path TEXT,pkg TEXT,PRIMARY KEY(path,pkg))"
            )
        db.close()
        return (
            {"mirror": "https://dl-cdn.alpinelinux.org", "archiveSuffix": ".apk"},
            [package],
            {package.name: package},
        )

    monkeypatch.setattr(alpine, "catalog", catalog)
    monkeypatch.setattr(indexes, "urlopen", lambda *a, **kw: calls.append(1) or io.BytesIO(raw))
    root = tmp_path / "workspace"
    for attempt in range(2):
        workspace = Workspace(root, distro="alpine")
        workspace.acquire()
        assert workspace.available[package.name].sha256 == hashlib.sha256(raw).hexdigest()
        assert workspace.store.complete(workspace.available[package.name])
        assert workspace.downloaded == (len(raw) if attempt == 0 else 0)
        workspace.store.db.close()
        workspace.owners.close()
    assert calls == [1]


def test_curated_doc_owner_requires_matching_origin_version_and_docs_install_if():
    from ingestion.debian_pipeline import Workspace

    checksum = "Q1" + base64.b64encode(b"x" * 20).decode()

    def package(name, origin, version="1-r0", install_if=()):
        return alpine.AlpinePackage(
            name,
            version,
            f"main/x86_64/{name}-{version}.apk",
            checksum,
            1,
            source=origin,
            install_if=install_if,
        )

    workspace = object.__new__(Workspace)
    workspace.distro = "alpine"
    workspace.available = {
        p.name: p
        for p in [
            package("tar", "tar"),
            package("tar-doc", "tar", install_if=("docs", "tar")),
            package("busybox-doc", "busybox", install_if=("docs", "busybox")),
        ]
    }
    workspace.published_route_owners = {("tar", "1"): "busybox-doc"}
    with pytest.raises(RuntimeError, match="wrong command-page owner"):
        workspace.require_command_owners()
    workspace.published_route_owners = {("tar", "1"): "tar-doc"}
    assert workspace.require_command_owners()["tar"] == "tar-doc"
    workspace.available["tar-doc"] = package(
        "tar-doc", "tar", version="2-r0", install_if=("docs", "tar")
    )
    with pytest.raises(RuntimeError, match="wrong command-page owner"):
        workspace.require_command_owners()


def test_gzip_control_expansion_is_bounded_before_tar_parsing():
    source = io.BytesIO(gzip.compress(b"x" * (1024**2 + 1), mtime=0))
    with pytest.raises(indexes.DownloadIntegrityError, match="apk_oversize_control"):
        alpine.gzip_section(source, 1024**2)


@pytest.mark.parametrize("source", ["cache", "cdn"])
def test_malformed_gzip_wrapped_signature_tar_is_evicted_or_falls_back(
    tmp_path, monkeypatch, source
):
    archive, package, signature_end, _ = fixture(tmp_path)
    good = archive.read_bytes()
    bad = gzip.compress(b"not a tar archive", mtime=0) + good[signature_end:]
    assert len(bad) < len(good)
    bad += b"\0" * (len(good) - len(bad))
    archive.write_bytes(bad)
    with pytest.raises(indexes.DownloadIntegrityError, match="apk_malformed_signature"):
        alpine.verify(archive, package)
    destination = tmp_path / "cache.apk"
    if source == "cache":
        destination.write_bytes(bad)
    calls, reasons = [], []

    def fetch(request, **kwargs):
        calls.append(request.full_url)
        return io.BytesIO(bad if source == "cdn" and len(calls) == 1 else good)

    monkeypatch.setattr(indexes, "urlopen", fetch)
    indexes.download(
        "https://dl-cdn.alpinelinux.org/fixture.apk",
        destination,
        None,
        package.size,
        fallback_url="https://dl-3.alpinelinux.org/fixture.apk",
        verify=lambda path: alpine.verify(path, package),
        on_fallback=reasons.append,
    )
    assert destination.read_bytes() == good
    assert calls == ["https://dl-cdn.alpinelinux.org/fixture.apk"] + (
        ["https://dl-3.alpinelinux.org/fixture.apk"] if source == "cdn" else []
    )
    assert reasons == (["apk_malformed_signature"] if source == "cdn" else [])
    assert not list(tmp_path.glob("*.part"))


@pytest.mark.parametrize("control", [b"not tar", tar_bytes([]), tar_bytes([(".PKGINFO", b"\xff")])])
def test_malformed_control_errors_have_the_download_integrity_type(tmp_path, control):
    archive, package, signature_end, data_start = fixture(tmp_path)
    good = archive.read_bytes()
    compressed = gzip.compress(control, mtime=0)
    raw = good[:signature_end] + compressed + good[data_start:]
    archive.write_bytes(raw)
    package = dataclasses.replace(
        package,
        size=len(raw),
        control_checksum="Q1" + base64.b64encode(hashlib.sha1(compressed).digest()).decode(),
    )
    with pytest.raises(indexes.DownloadIntegrityError, match="apk_malformed_control"):
        alpine.verify(archive, package)


def test_reviewed_whole_file_pin_is_checked_after_native_integrity(tmp_path):
    archive, package, _, _ = fixture(tmp_path)
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert (
        alpine.verify(archive, dataclasses.replace(package, pinned_sha256=actual))["sha256"]
        == actual
    )
    with pytest.raises(indexes.DownloadIntegrityError, match="apk_sha256"):
        alpine.verify(archive, dataclasses.replace(package, pinned_sha256="0" * 64))
    alpine.require_sha256_pin({}, package)
    with pytest.raises(ValueError, match="Missing reviewed APK SHA256 pin"):
        alpine.require_sha256_pin({"packageSha256": {}}, package)


def mock_catalog(monkeypatch, package, pins):
    def catalog(root, pins_path):
        root.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(root / "owners.sqlite3") as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS owners(path TEXT,pkg TEXT,PRIMARY KEY(path,pkg))"
            )
        db.close()
        return pins, [package], {package.name: package}

    monkeypatch.setattr(alpine, "catalog", catalog)


@pytest.mark.parametrize("mode", ["matching", "missing", "mismatch"])
def test_reviewed_pins_apply_to_restored_receipts_and_cache(tmp_path, monkeypatch, mode):
    from ingestion.debian_pipeline import Workspace

    archive, package, _, _ = fixture(tmp_path)
    raw = archive.read_bytes()
    calls = []
    monkeypatch.setattr(indexes, "urlopen", lambda *a, **kw: calls.append(1) or io.BytesIO(raw))
    pins = {
        "mirror": "https://dl-cdn.alpinelinux.org",
        "archiveSuffix": ".apk",
        "releaseSha256": "a" * 64,
    }
    mock_catalog(monkeypatch, package, pins)
    root = tmp_path / "workspace"
    workspace = Workspace(root, distro="alpine")
    workspace.acquire()
    workspace.store.db.close()
    workspace.owners.close()
    actual = hashlib.sha256(raw).hexdigest()
    expected = actual if mode == "matching" else "0" * 64
    pins["packageSha256"] = {} if mode == "missing" else {package.filename: expected}
    mock_catalog(
        monkeypatch,
        dataclasses.replace(package, pinned_sha256="" if mode == "missing" else expected),
        pins,
    )
    if mode == "missing":
        with pytest.raises(ValueError, match="Missing reviewed APK SHA256 pin"):
            Workspace(root, distro="alpine")
        assert calls == [1]
        return
    workspace = Workspace(root, distro="alpine")
    try:
        if mode == "matching":
            workspace.acquire()
            assert workspace.acquired == {package.name} and calls == [1]
            exported = json.loads(alpine.write_sha256_pins(workspace).read_text())
            assert exported == {
                "releaseSha256": "a" * 64,
                "packageSha256": {package.filename: actual},
            }
        else:
            assert not workspace.acquired
            with pytest.raises(indexes.DownloadIntegrityError, match="apk_sha256"):
                workspace.acquire()
            assert calls == [1, 1]
    finally:
        workspace.store.db.close()
        workspace.owners.close()


@pytest.mark.parametrize("hashes", [None, [], {"main/fixture.apk": "bad"}, {"../escape": "a" * 64}])
def test_reviewed_pin_map_is_validated_before_catalog_reads(tmp_path, hashes):
    path = tmp_path / "pins.json"
    path.write_text(json.dumps({"packageSha256": hashes}))
    with pytest.raises(ValueError, match="reviewed APK|Unsafe"):
        alpine.catalog(tmp_path / "indexes", path)


def test_catalog_binds_reviewed_hashes_to_exact_pinned_filenames(tmp_path):
    source = Path(__file__).parents[1] / "data/alpine-v3.23.json"
    pins = json.loads(source.read_text())
    for repo in pins["repositories"]:
        repo["file"] = str(source.parent / repo["file"])
    path = tmp_path / "pins.json"
    path.write_text(json.dumps(pins))
    _, selected, _ = alpine.catalog(tmp_path / "bootstrap", path)
    filename = selected[0].filename
    pins["packageSha256"] = {filename: "a" * 64}
    path.write_text(json.dumps(pins))
    _, selected, available = alpine.catalog(tmp_path / "reviewed", path)
    assert next(p for p in selected if p.filename == filename).pinned_sha256 == "a" * 64
    unpinned = next(p for p in available.values() if p.filename != filename)
    with pytest.raises(ValueError, match="Missing reviewed APK SHA256 pin"):
        alpine.require_sha256_pin(pins, unpinned)
    pins["packageSha256"] = {"main/x86_64/unknown-1.apk": "a" * 64}
    path.write_text(json.dumps(pins))
    with pytest.raises(ValueError, match="do not match the pinned catalog"):
        alpine.catalog(tmp_path / "unknown", path)


@pytest.mark.parametrize(
    "contract",
    [{"schemaVersion": 8}, {"schemaVersion": 8, "acquisitions": ["alpine-apk-extraction"]}],
)
def test_alpine_publisher_requires_acquisition_and_stored_notice_capabilities(
    monkeypatch, contract
):
    from types import SimpleNamespace

    from ingestion import debian_publish

    monkeypatch.setattr(
        debian_publish,
        "ConvexIngestClient",
        lambda *_: SimpleNamespace(require_deployed_contract=lambda: contract),
    )
    monkeypatch.setattr(
        debian_publish, "Workspace", lambda *a, **kw: pytest.fail("must not acquire")
    )
    with pytest.raises(RuntimeError, match="acquisition support|stored-license support"):
        debian_publish.ingest_debian(
            activate=False,
            convex_url="unused",
            ingest_secret="unused",
            dataset_stage="staging",
            git_sha="test",
            distro="alpine",
        )


def test_alpine_staging_publisher_exports_pins_native_provenance_and_complete_notices(
    tmp_path, monkeypatch
):
    from ingestion.debian_pipeline import Workspace
    from ingestion.debian_publish import publish_workspace

    notice = b"N" * (1100 * 1024)
    archive, package, _, _ = fixture(tmp_path, notice=notice)
    raw = archive.read_bytes()
    pins = {
        "mirror": "https://dl-cdn.alpinelinux.org",
        "archiveSuffix": ".apk",
        "releaseSha256": "a" * 64,
        "acquisition": "alpine-apk-extraction",
    }
    mock_catalog(monkeypatch, package, pins)
    monkeypatch.setattr(indexes, "urlopen", lambda *a, **kw: io.BytesIO(raw))
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    workspace = Workspace(tmp_path / "workspace", distro="alpine")
    calls = []

    class Client:
        def post(self, path, payload):
            calls.append((path, payload))
            return {"inserted": len(payload.get("pages", [])), "skipped": 0}

    try:
        workspace.acquire()
        result = publish_workspace(
            workspace,
            Client(),
            activate=False,
            dataset_stage="staging",
            git_sha="test",
            sample=True,
        )
        assert result.succeeded > 0
        manifest = next(
            payload["packageManifest"] for path, payload in calls if path == "/ingest/release"
        )
        assert manifest["packages"][0]["controlChecksum"] == package.control_checksum
        assert (
            manifest["packages"][0]["dataSha256"] == workspace.available[package.name].data_sha256
        )
        assert manifest["packages"][0]["filename"] == package.filename
        assert manifest["packages"][0]["origin"] == "fixture"
        text = next(
            payload["licenses"][0]["licenseText"]
            for path, payload in calls
            if path == "/ingest/licenses"
        )
        assert text.encode() == notice
        proposal = json.loads((workspace.root / "alpine-package-sha256.json").read_text())
        assert proposal["packageSha256"] == {package.filename: hashlib.sha256(raw).hexdigest()}
    finally:
        workspace.store.db.close()
        workspace.owners.close()
