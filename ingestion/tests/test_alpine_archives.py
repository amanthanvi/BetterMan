"""APK v2 integrity covers its pinned control identity and SHA256 data stream."""

import base64
import dataclasses
import gzip
import hashlib
import io
import tarfile

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


def fixture(tmp_path, *, path="usr/share/man/man1/tool.1"):
    data = gzip.compress(
        tar_bytes([(path, b".TH TOOL 1\n"), ("usr/share/licenses/fixture/LICENSE", b"MIT notice")]),
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
    assert store.resolve("fixture", "usr/share/man/man1/tool.1") == b".TH TOOL 1\n"
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
    import sqlite3

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
