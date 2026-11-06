"""Ubuntu's pins, independent private registrations, and command-owner policy."""

import gzip
import hashlib
import json
import lzma
from pathlib import Path

import pytest

from ingestion import debian_indexes as indexes
from ingestion.debian_pipeline import Workspace

DATA = Path(__file__).resolve().parents[1] / "data"


def test_ubuntu_catalog_verifies_components_and_filters_unselected_owners(tmp_path, monkeypatch):
    contents = gzip.compress(
        b"usr/share/man/man1/tool.1.gz universe/doc\n"
        b"usr/share/man/man1/secret.1.gz multiverse/secret\n"
    )
    stanza = (
        b"Package: doc\nVersion: 1\nFilename: pool/universe/d/doc.deb\nSHA256: "
        + b"a" * 64
        + b"\nSize: 20\n"
    )
    blobs = {
        "Contents-amd64.gz": contents,
        "main/binary-amd64/Packages.xz": lzma.compress(b""),
        "universe/binary-amd64/Packages.xz": lzma.compress(stanza),
    }
    release = "SHA256:\n" + "".join(
        f" {hashlib.sha256(b).hexdigest()} {len(b)} {n}\n" for n, b in blobs.items()
    )
    blobs["Release"] = release.encode()
    pins = json.loads((DATA / "ubuntu-noble.json").read_text())
    pins["releaseSha256"] = hashlib.sha256(blobs["Release"]).hexdigest()
    pinfile = tmp_path / "pins.json"
    pinfile.write_text(json.dumps(pins))
    calls = []

    def download(url, destination, digest, size=None):
        name = url.split("/dists/noble/")[1]
        raw = blobs[name]
        assert hashlib.sha256(raw).hexdigest() == digest
        assert size is None or len(raw) == size
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        calls.append(name)

    monkeypatch.setattr(indexes, "download", download)
    _, packages = indexes.catalog(tmp_path / "indexes", pinfile)
    assert [p.name for p in packages] == ["doc"]
    assert set(calls) == set(blobs)
    with pytest.raises(ValueError, match="Unsafe archive path"):
        indexes.Package("escape", "1", "pool/universe/../../escape", "a" * 64, 1)


def test_ubuntu_private_allowlist_is_bound_to_audited_control_text():
    pins = json.loads((DATA / "ubuntu-noble.json").read_text())
    path = DATA / pins["privateManuals"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == pins["privateManualsSha256"]
    registrations = indexes.private_registrations(path)
    assert registrations["releaseSha256"] == pins["releaseSha256"]
    fixture = Path(__file__).parent / "fixtures/ubuntu"
    assert (
        hashlib.sha256((fixture / "postgresql-helper").read_bytes()).hexdigest()
        == registrations["postgresqlHelperSha256"]
    )
    for name, entry in registrations["packages"].items():
        assert (
            hashlib.sha256(
                gzip.decompress((fixture / f"{name}.postinst.gz").read_bytes())
            ).hexdigest()
            == entry["postinstSha256"]
        )
        assert all(indexes.manual_registered(name, p, registrations) for p in entry["paths"])
        package = indexes.Package(name, "1", "pool/main/x.deb", "0" * 64, 1)
        with pytest.raises(ValueError, match="registrations do not match"):
            indexes.require_private_package(package, registrations)
    assert not indexes.manual_registered(
        "groovy", "usr/share/groovy/man/man1/groovysh.1.gz", registrations
    )
    assert indexes.manual_registered(
        "postgresql-client-16", "usr/share/postgresql/16/man/man1/psql.1.gz", registrations
    )


def test_ubuntu_gate_rejects_proxy_popularity_winner_outside_curated_dependency_graph():
    def package(name, depends=(), installed=1):
        return indexes.Package(
            name, "1", f"pool/main/{name}.deb", "a" * 64, 1, installed, depends=depends
        )

    workspace = object.__new__(Workspace)
    workspace.distro = "ubuntu"
    workspace.available = {
        p.name: p
        for p in [
            package("default-mysql-client", ("mysql-client",)),
            package("mysql-client", ("mysql-client-core-8.0",)),
            package("mysql-client-core-8.0"),
            package("mariadb-client-core", installed=100000),
        ]
    }
    workspace.published_route_owners = {("mysql", "1"): "mariadb-client-core"}
    with pytest.raises(RuntimeError, match="wrong command-page owner for mysql"):
        workspace.require_command_owners()
    workspace.published_route_owners = {("mysql", "1"): "mysql-client-core-8.0"}
    assert workspace.require_command_owners()["default-mysql-client"] == "mysql-client-core-8.0"


def test_ubuntu_refuses_pre_b2_v7_before_acquisition(monkeypatch):
    from ingestion import debian_publish

    class Client:
        def __init__(self, *_args):
            pass

        def require_deployed_contract(self):
            return {"schemaVersion": 7}

    monkeypatch.setattr(debian_publish, "ConvexIngestClient", Client)
    monkeypatch.setattr(
        debian_publish, "Workspace", lambda *a, **kw: pytest.fail("acquisition forbidden")
    )
    with pytest.raises(RuntimeError, match="Deploy B2"):
        debian_publish.ingest_debian(
            activate=True,
            convex_url="unused",
            ingest_secret="unused",
            dataset_stage="staging",
            git_sha="test",
            distro="ubuntu",
        )
