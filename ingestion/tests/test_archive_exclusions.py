"""Reviewed archive exclusions apply before acquisition and survive publication."""

import gzip
import hashlib
import json
import lzma
from pathlib import Path

import pytest

from ingestion import debian_indexes as indexes
from ingestion import debian_pipeline as pipeline
from ingestion.debian_archives import MissingSource
from ingestion.debian_licenses import copyright_text
from ingestion.debian_publish import publish_workspace

DATA = Path(__file__).resolve().parents[1] / "data"
FIXTURES = Path(__file__).parent / "fixtures" / "debs"
REASON = "No copyright notice in the pinned archive (fixture 1)."


@pytest.fixture
def pinned_workspace(tmp_path, monkeypatch):
    names = ["provider-low", "provider-high", "gawk"]
    archives = {name: (FIXTURES / f"{name}.deb").read_bytes() for name in names}
    stanzas = "\n".join(
        f"Package: {name}\nVersion: 1\nFilename: pool/main/{name}.deb\n"
        f"SHA256: {hashlib.sha256(raw).hexdigest()}\nSize: {len(raw)}\n"
        for name, raw in archives.items()
    )
    blobs = {
        "main/Contents-amd64.gz": gzip.compress(
            "".join(f"usr/share/man/man1/{name}.1.gz main/{name}\n" for name in names).encode()
        ),
        "main/binary-amd64/Packages.xz": lzma.compress(stanzas.encode()),
    }
    blobs["Release"] = (
        "SHA256:\n"
        + "".join(f" {hashlib.sha256(b).hexdigest()} {len(b)} {n}\n" for n, b in blobs.items())
    ).encode()
    pins = json.loads((DATA / "debian-trixie.json").read_text())
    pins["releaseSha256"] = hashlib.sha256(blobs["Release"]).hexdigest()
    pins["contents"] = ["main/Contents-amd64.gz"]
    pinfile = tmp_path / "debian-trixie.json"
    (tmp_path / pins["popcon"]["file"]).write_bytes((DATA / pins["popcon"]["file"]).read_bytes())
    downloaded = []

    def download(url, destination, digest, size=None, **_kwargs):
        if "/pool/" in url:
            name = url.rsplit("/", 1)[-1].removesuffix(".deb")
            raw = archives[name]
            downloaded.append(name)
        else:
            raw = blobs[url.split("/dists/trixie/")[1]]
        assert hashlib.sha256(raw).hexdigest() == digest
        assert size is None or len(raw) == size
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        return len(raw)

    monkeypatch.setattr(indexes, "download", download)
    monkeypatch.setattr(pipeline, "download", download)
    monkeypatch.setattr(pipeline, "PINS", pinfile)
    monkeypatch.setattr(indexes, "PINS", pinfile)
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")

    def create(*, distro="debian", exclusions=...):
        pins["excludedPackages"] = {"provider-high": REASON} if exclusions is ... else exclusions
        target = pinfile if distro == "debian" else pinfile.with_name("ubuntu-noble.json")
        target.write_text(json.dumps(pins))
        return pipeline.Workspace(tmp_path / "workspace", distro=distro), downloaded

    return create


@pytest.mark.parametrize("distro", ["debian", "ubuntu"])
def test_excluded_package_is_never_acquired_or_published_and_manifest_records_it(
    pinned_workspace, distro
):
    workspace, downloaded = pinned_workspace(distro=distro)
    calls = []

    class Client:
        def post(self, path, payload):
            calls.append((path, payload))
            if path == "/ingest/pages/storage":
                return {"inserted": len(payload["pages"]), "skipped": 0}
            return {}

    try:
        workspace.acquire()
        assert set(downloaded) == {"gawk", "provider-low"}
        assert {p.name for p in workspace.all_manual_packages} == {"gawk", "provider-low"}
        publish_workspace(
            workspace,
            Client(),
            activate=False,
            dataset_stage="staging",
            git_sha="test",
            sample=True,
        )
        release = next(payload for path, payload in calls if path == "/ingest/release")
        manifest = release["packageManifest"]
        assert manifest["excludedPackages"] == {"provider-high": REASON}
        assert manifest["pins"]["excludedPackages"] == manifest["excludedPackages"]
        assert {p["name"] for p in manifest["packages"]} == {"gawk", "provider-low"}
        for _path, payload in calls:
            for row in payload.get("pages", []) + payload.get("aliases", []):
                assert row.get("sourcePackage") != "provider-high"
                assert row.get("targetPackage") != "provider-high"
        assert "provider-high" not in downloaded
    finally:
        workspace.store.db.close()
        workspace.owners.close()


@pytest.mark.parametrize(
    "exclusions", [None, [], "bcc", {"../bcc": "reason"}, {"bcc": " "}, {"bcc": 1}]
)
def test_pin_validation_rejects_malformed_exclusions(pinned_workspace, exclusions):
    with pytest.raises(ValueError, match="Invalid pinned package exclusions"):
        workspace, _ = pinned_workspace(exclusions=exclusions)
        workspace.store.db.close()
        workspace.owners.close()


@pytest.mark.parametrize("kind", ["include", "stub", "link", "repair", "explicit"])
def test_dependency_on_excluded_package_fails_closed(pinned_workspace, kind, tmp_path):
    workspace, downloaded = pinned_workspace(distro="ubuntu")
    try:
        workspace.acquire()
        target = "usr/share/man/man1/provider-high.1.gz"
        source = "usr/share/man/man1/needs-excluded.1"
        if kind != "explicit":
            if kind == "link":
                entry = ("provider-low", source, "link", target, None)
            else:
                raw = (
                    b".so man1/provider-high.1\n"
                    if kind == "stub"
                    else b".TH NEEDS 1\n.SH NAME\n.so man1/provider-high.1\n"
                )
                file = tmp_path / "needs-excluded.1"
                file.write_bytes(raw)
                entry = ("provider-low", source, "file", None, str(file))
            workspace.store.db.execute("INSERT INTO entries VALUES (?,?,?,?,?)", entry)
            if kind == "repair":
                workspace.pins["sourceTargets"] = {
                    "usr/share/man/man1/provider-high.1": ["provider-high", target]
                }
        with pytest.raises(RuntimeError, match="requires excluded package provider-high"):
            if kind == "explicit":
                workspace.acquire([workspace.available["provider-high"]])
            else:
                list(workspace.sources())
        assert "provider-high" not in downloaded
    finally:
        workspace.store.db.close()
        workspace.owners.close()


def test_curated_package_cannot_be_excluded(pinned_workspace):
    with pytest.raises(RuntimeError, match="requires excluded package gawk"):
        pinned_workspace(exclusions={"gawk": REASON})


def test_exclusions_must_name_packages_in_the_archive(pinned_workspace):
    with pytest.raises(ValueError, match="unknown packages: bcc-typo"):
        pinned_workspace(exclusions={"bcc-typo": REASON})


def test_command_page_owner_cannot_be_excluded(pinned_workspace, monkeypatch):
    # git(1) ships in git-man, not git: excluding the owner would drop a curated page.
    monkeypatch.setattr(pipeline, "_COMMAND_PAGE_OWNERS", {"debian": {"gawk": "provider-low"}})
    with pytest.raises(RuntimeError, match="requires excluded package provider-low"):
        pinned_workspace(exclusions={"provider-low": REASON})


def test_changing_exclusions_invalidates_workspace(pinned_workspace):
    workspace, _ = pinned_workspace()
    workspace.store.db.close()
    workspace.owners.close()
    with pytest.raises(ValueError, match="different archive pins"):
        pinned_workspace(exclusions={})


def test_resumed_selection_cannot_request_excluded_package(pinned_workspace):
    workspace, _ = pinned_workspace()
    (workspace.root / "selection.json").write_text(
        json.dumps({"limit": None, "packages": ["provider-high"]})
    )
    workspace.store.db.close()
    workspace.owners.close()
    with pytest.raises(RuntimeError, match="requires excluded package provider-high"):
        pinned_workspace()


def test_ubuntu_exclusions_are_the_reviewed_linux86_packages():
    pins = json.loads((DATA / "ubuntu-noble.json").read_text())
    assert pins["excludedPackages"] == {
        "bcc": "No copyright notice in the pinned archive (linux86 0.16.17-3.5build1).",
        "bin86": "No copyright notice in the pinned archive (linux86 0.16.17-3.5build1).",
    }


def test_unlisted_package_missing_copyright_still_fails(pinned_workspace):
    workspace, _ = pinned_workspace()
    try:
        workspace.acquire()
        workspace.store.db.execute(
            "DELETE FROM entries WHERE pkg='provider-low' AND path LIKE 'usr/share/doc/%'"
        )
        with pytest.raises(
            MissingSource, match="provider-low:usr/share/doc/provider-low/copyright"
        ):
            copyright_text(workspace, "provider-low")

        class Client:
            def post(self, *_args):
                pytest.fail("Missing copyright must block release creation")

        with pytest.raises(
            MissingSource, match="provider-low:usr/share/doc/provider-low/copyright"
        ):
            publish_workspace(
                workspace,
                Client(),
                activate=False,
                dataset_stage="staging",
                git_sha="test",
                sample=True,
            )
    finally:
        workspace.store.db.close()
        workspace.owners.close()
