"""Pinned Arch catalog fields and extraction never require pacman or scripts."""

import hashlib
import io
import json
import tarfile
from pathlib import Path

import pytest

from ingestion import arch_archives as arch
from ingestion.debian_archives import ArchiveStore


def tar_bytes(entries):
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w:gz") as tar:
        for name, body in entries:
            member = tarfile.TarInfo(name)
            member.size = len(body)
            tar.addfile(member, io.BytesIO(body))
    return raw.getvalue()


def test_arch_files_database_binds_archive_digest_and_dependency_owner(tmp_path, monkeypatch):
    desc = (
        "%NAME%\nfixture\n\n%BASE%\nfixture\n\n%VERSION%\n1-1\n\n"
        "%FILENAME%\nfixture-1-1-x86_64.pkg.tar.zst\n\n%ARCH%\nx86_64\n\n"
        "%CSIZE%\n100\n\n%SHA256SUM%\n" + "a" * 64 + "\n\n"
        "%LICENSE%\nMIT\n\n%DEPENDS%\nlibfixture>=1\n\n"
    )
    body = tar_bytes(
        [
            ("fixture-1-1/desc", desc.encode()),
            ("fixture-1-1/files", b"%FILES%\nusr/share/man/man1/fixture.1\n"),
        ]
    )
    pins = json.loads((Path(__file__).parents[1] / "data/arch-20261001.json").read_text())
    pins["repositories"] = [
        {"name": "core", "sha256": hashlib.sha256(body).hexdigest(), "size": len(body)}
    ]
    pinfile = tmp_path / "pins.json"
    pinfile.write_text(json.dumps(pins))

    def download(url, destination, digest, size):
        assert hashlib.sha256(body).hexdigest() == digest and len(body) == size
        destination.write_bytes(body)

    monkeypatch.setattr(arch, "download", download)
    _, selected, available = arch.catalog(tmp_path / "indexes", pinfile)
    assert [p.name for p in selected] == ["fixture"]
    assert available["fixture"].sha256 == "a" * 64
    assert available["fixture"].depends == ("libfixture",)
    assert available["fixture"].license == "MIT"
    with pytest.raises(ValueError, match="Duplicate Arch database field"):
        arch.fields("%NAME%\none\n\n%NAME%\ntwo\n")


def test_arch_payload_ignores_install_script_and_resolves_only_store_data(tmp_path):
    archive = tmp_path / "fixture.pkg.tar.xz"
    archive.write_bytes(
        tar_bytes(
            [
                (".INSTALL", b"touch /tmp/never-run"),
                ("usr/share/man/man1/fixture.1", b".TH FIXTURE 1\n"),
                ("usr/share/licenses/fixture/LICENSE", b"MIT notice"),
            ]
        )
    )
    package = arch.ArchPackage("fixture", "1", "core/os/x86_64/fixture.pkg.tar.xz", "a" * 64, 1)
    store = ArchiveStore(tmp_path, registrations={"packages": {}})
    entries = arch.extract(archive, package, tmp_path)
    store.add(package, entries)
    assert len(entries) == 2
    assert store.resolve("fixture", "usr/share/man/man1/fixture.1") == b".TH FIXTURE 1\n"
    assert not any(p.name == ".INSTALL" for p in tmp_path.rglob("*"))
    store.db.close()
    with pytest.raises(ValueError, match="Unsafe"):
        arch.ArchPackage("fixture", "1", "core/../../escape.pkg.tar.zst", "a" * 64, 1)


def test_oversized_archives_run_after_small_packages_without_overlapping_each_other(tmp_path):
    import threading
    import time
    from types import SimpleNamespace

    from ingestion.debian_pipeline import Workspace

    workspace = object.__new__(Workspace)
    workspace.distro = "arch"
    workspace.pins = {"archiveSuffix": ".pkg"}
    workspace.cache = tmp_path
    workspace.acquired = set()
    workspace.curated_packages = []
    workspace.downloaded = workspace.archive_fallbacks = 0
    workspace.packages = [
        arch.ArchPackage(name, "1", f"core/os/x86_64/{name}.pkg.tar.zst", "a" * 64, size)
        for name, size in [("small", 1), ("large-a", 2 * 1024**3), ("large-b", 2 * 1024**3)]
    ]
    workspace.store = SimpleNamespace(add=lambda *_: None)
    active_large, lock = [], threading.Lock()
    order = []

    def acquire(package):
        with lock:
            if package.size > 1024**3:
                assert not active_large
                active_large.append(package.name)
            order.append(package.name)
        time.sleep(0.005)
        with lock:
            if active_large and package.name in active_large:
                active_large.remove(package.name)
        return package, [], 0, 0, 0, 0

    workspace._acquire = acquire
    workspace.acquire(workers=2)
    assert order[0] == "small"
    assert workspace.acquired == {"small", "large-a", "large-b"}


def test_only_exact_pinned_malformed_include_targets_are_repaired(tmp_path):
    archive = tmp_path / "fixture.pkg.tar.xz"
    archive.write_bytes(
        tar_bytes(
            [
                ("usr/share/man/man1/tool.1", b".TH TOOL 1\n"),
                ("usr/share/man/man1/alias.1", b".so man1/doc/tool.1\n"),
                ("usr/share/man/man1/unlisted.1", b".so man1/doc/other.1\n"),
            ]
        )
    )
    package = arch.ArchPackage("fixture", "1", "core/os/x86_64/fixture.pkg.tar.xz", "a" * 64, 1)
    store = ArchiveStore(
        tmp_path,
        registrations={"packages": {}},
        source_targets={
            "usr/share/man/man1/doc/tool.1": ("fixture", "usr/share/man/man1/tool.1"),
        },
    )
    store.add(package, arch.extract(archive, package, tmp_path))
    assert store.resolve("fixture", "usr/share/man/man1/alias.1") == b".TH TOOL 1\n"
    with pytest.raises(ValueError, match="escapes manual root"):
        store.resolve("fixture", "usr/share/man/man1/unlisted.1")
    store.db.close()
