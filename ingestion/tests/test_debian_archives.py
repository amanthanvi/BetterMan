from __future__ import annotations

import hashlib
import io
from pathlib import Path

import pytest

from ingestion import debian_indexes as indexes
from ingestion.debian_archives import ArchiveStore, MissingSource, extract
from ingestion.debian_indexes import Package, release_checksums, safe_path
from ingestion.debian_pipeline import Workspace, parse_archive_source, sample_packages
from ingestion.debian_publish import copyright_text

FIXTURES = Path(__file__).parent / "fixtures" / "debs"


def package(name, installed=1):
    data = (FIXTURES / f"{name}.deb").read_bytes()
    return Package(
        name, "1", f"pool/main/{name}.deb", hashlib.sha256(data).hexdigest(), len(data), installed
    )


def workspace(tmp_path):
    obj = object.__new__(Workspace)
    obj.root = tmp_path
    obj.store = ArchiveStore(tmp_path)
    obj.packages = [package("provider-low", 10), package("provider-high", 100), package("gawk", 1)]
    obj.available = {p.name: p for p in obj.packages}
    obj.acquired = set(obj.available)
    obj.missing = []
    obj.owners = obj.store.db
    obj.owners.execute("CREATE TABLE owners(path TEXT,pkg TEXT)")
    for pkg in obj.packages:
        obj.store.add(pkg, extract(FIXTURES / f"{pkg.name}.deb", pkg, tmp_path))
    return obj


@pytest.fixture
def archive_workspace(tmp_path):
    obj = workspace(tmp_path)
    yield obj
    obj.store.db.close()


def test_real_debs_resolve_cross_package_stubs_links_hardlinks_and_copyright(
    archive_workspace, tmp_path
):
    obj = archive_workspace
    target = obj.resolve("provider-low", "usr/share/man/man1/target.1")
    for path in ["cross", "hard", "linked"]:
        data = obj.resolve("provider-high", f"usr/share/man/man1/{path}.1.gz")
        assert b".TH SHARED" in data
    assert obj.resolve("provider-high", "usr/share/man/man1/cross.1.gz") == target
    assert "License: MIT" in copyright_text(obj, "provider-high")
    assert not list(tmp_path.rglob("postinst"))
    assert not any(p.is_symlink() for p in tmp_path.rglob("*"))
    with pytest.raises(MissingSource):
        obj.resolve("provider-low", "usr/share/man/man1/absent.1")


def test_provider_defaults_popcon_curated_names_and_case_collisions(archive_workspace, tmp_path):
    assert indexes.MAN_PATH.fullmatch("usr/share/man/man3/EmitVertex.3G.gz")
    obj = archive_workspace
    # Package-owned pages always retain their route; alternatives only fill gaps.
    # Unrelated shared(1) still picks the most installed package.
    obj.store.db.execute(
        "INSERT INTO entries SELECT 'provider-high',replace(path,'gawk.1.gz','awk.1.gz'),"
        "'file',NULL,file FROM entries WHERE pkg='gawk' AND path LIKE '%gawk.1.gz'"
    )
    sources = list(obj.sources())
    shared = [row for row in sources if row[2:4] == ("shared", "1")]
    assert [(row[0], row[4]) for row in shared] == [
        ("provider-high", False),
        ("provider-low", False),
    ]
    assert next(row for row in sources if row[2] == "awk")[0] == "provider-high"
    cases = [row for row in sources if row[2] == "foo::bar"]
    assert len(cases) == 2
    assert [row[4] for row in cases] == [False, False]
    assert any(row[2] == "_exit" for row in sources)
    assert any(row[2] == "[" for row in sources)


def test_archive_pages_use_existing_mandoc_parser_and_stable_provider_ids(
    archive_workspace, tmp_path
):
    obj = archive_workspace
    source = next(row for row in obj.sources() if row[2] == "shared")
    row, primary = parse_archive_source((*source, "1"))
    assert not primary and row.source_package == "provider-high"
    assert row.description == "preferred fixture"
    assert row.options and row.options[0]["flags"] == "--fixture"
    assert parse_archive_source((*source, "1"))[0].page_id == row.page_id


def test_cycles_and_host_file_includes_fail_closed(archive_workspace, tmp_path):
    obj = archive_workspace
    with obj.store.db:
        for name, target in [("a", "b"), ("b", "a")]:
            obj.store.db.execute(
                "INSERT INTO entries VALUES (?,?,?,?,?)",
                (
                    "provider-low",
                    f"usr/share/man/man1/{name}",
                    "link",
                    f"usr/share/man/man1/{target}",
                    None,
                ),
            )
    with pytest.raises(ValueError, match="cycle"):
        obj.resolve("provider-low", "usr/share/man/man1/a")
    evil = tmp_path / "evil"
    evil.write_bytes(b".TH BAD 1\n.so /etc/passwd\n")
    obj.store.db.execute(
        "INSERT INTO entries VALUES (?,?,?,?,?)",
        ("provider-low", "usr/share/man/man1/evil", "file", None, str(evil)),
    )
    with pytest.raises(ValueError, match="escapes"):
        obj.resolve("provider-low", "usr/share/man/man1/evil")


@pytest.mark.parametrize(
    "path",
    ["/etc/passwd", "../escape", "./../escape", "usr/../../etc/passwd", "usr\\evil", "a\nfile"],
)
def test_rejects_unsafe_paths(path):
    with pytest.raises(ValueError):
        safe_path(path)


def test_checksums_are_checked_on_download_and_cache_replay(tmp_path, monkeypatch):
    body = b"verified archive bytes"
    digest = hashlib.sha256(body).hexdigest()
    calls = []

    def fetch(*_args, **_kwargs):
        calls.append(1)
        return io.BytesIO(body)

    monkeypatch.setattr(indexes, "urlopen", fetch)
    path = tmp_path / "file"
    assert indexes.download("https://example.test/file", path, digest, len(body)) == len(body)
    assert indexes.download("https://example.test/file", path, digest, len(body)) == 0
    assert len(calls) == 1
    path.write_bytes(b"corrupt cache")
    assert indexes.download("https://example.test/file", path, digest, len(body)) == len(body)
    with pytest.raises(ValueError, match="mismatch"):
        indexes.download("https://example.test/file", tmp_path / "bad", "0" * 64, len(body))
    assert not (tmp_path / "bad.part").exists()
    with pytest.raises(ValueError, match="size"):
        indexes.download("https://example.test/file", tmp_path / "large", digest, 1)


def test_release_uses_sha256_not_md5_and_sampling_is_stable():
    digest = "a" * 64
    assert release_checksums(
        f"MD5Sum:\n {'b' * 32} 10 ignored\nSHA256:\n {digest} 10 main/Contents-all.gz\n"
    ) == {"main/Contents-all.gz": (digest, 10)}
    packages = [package("gawk"), package("provider-low"), package("provider-high")]
    assert sample_packages(packages, 2) == sample_packages(list(reversed(packages)), 2)
    assert sample_packages(packages, 2)[0].name == "gawk"


def test_archive_publisher_uses_bounded_pipeline_and_declares_every_provider(
    archive_workspace, tmp_path, monkeypatch
):
    from ingestion.debian_publish import publish_workspace

    obj = archive_workspace
    obj.pins = {"mirror": "https://example.test/snapshot", "releaseSha256": "a" * 64}
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    monkeypatch.setenv("BETTERMAN_INGEST_UPLOAD_WORKERS", "2")
    calls = []

    class Client:
        def post(self, path, payload):
            calls.append((path, payload))
            if path == "/ingest/pages/storage":
                return {"inserted": len(payload["pages"]), "skipped": 0}
            return {}

        def activate_release(self, payload):
            calls.append(("activate", payload))

    result = publish_workspace(
        obj, Client(), activate=True, dataset_stage="prod", git_sha="fixture", sample=True
    )
    release = next(payload for path, payload in calls if path == "/ingest/release")
    pages = [
        page
        for path, payload in calls
        if path == "/ingest/pages/storage"
        for page in payload["pages"]
    ]
    assert result.published
    assert release["providerCount"] >= 2
    alias_providers = [
        a for path, payload in calls if path == "/ingest/aliases" for a in payload["aliases"]
    ]
    assert release["providerCount"] == sum(bool(p.get("providerOnly")) for p in pages) + len(
        alias_providers
    )
    assert release["aliasCount"] == sum(not a["providerOnly"] for a in alias_providers)
    assert any(a["name"] == "cross" and a["targetName"] == "target" for a in alias_providers)
    assert not any(p["name"] == "cross" for p in pages)
    assert release["pageCount"] + sum(bool(p.get("providerOnly")) for p in pages) == len(pages)
    assert release["licenseCount"] == 3
    assert (
        next(p for p in pages if p["name"] == "shared" and not p.get("providerOnly"))[
            "sourcePackage"
        ]
        == "provider-high"
    )
    assert any(path == "activate" for path, _ in calls)


def test_contract_failure_precedes_archive_acquisition(monkeypatch):
    from ingestion import debian_publish
    from ingestion.convex_client import ConvexContractError

    class Client:
        def require_deployed_contract(self):
            raise ConvexContractError("deploy v5 first")

    monkeypatch.setattr(debian_publish, "ConvexIngestClient", lambda *_: Client())

    def forbidden(*_args):
        raise AssertionError("must not acquire or write")

    monkeypatch.setattr(debian_publish, "Workspace", forbidden)
    with pytest.raises(ConvexContractError, match="v5"):
        debian_publish.ingest_debian(
            activate=False,
            convex_url="http://127.0.0.1:1",
            ingest_secret="local",
            dataset_stage="prod",
            git_sha="test",
        )


def test_catalog_verifies_release_contents_packages_and_popcon(tmp_path, monkeypatch):
    import gzip
    import json
    import lzma

    counts = gzip.compress(b"provider-low\t42\n", mtime=0)
    (tmp_path / "popcon.gz").write_bytes(counts)
    artifacts = {
        "main/Contents-all.gz": gzip.compress(
            b"usr/share/man/man1/shared.1.gz misc/provider-low\n"
            b"usr/share/man/fr/man1/translated.1.gz misc/unselected\n",
            mtime=0,
        ),
        "main/Contents-amd64.gz": gzip.compress(
            b"usr/share/doc/provider-low/copyright misc/provider-low\n", mtime=0
        ),
        "main/binary-amd64/Packages.xz": lzma.compress(
            b"Package: provider-low\nVersion: 1\nFilename: pool/main/p/provider-low.deb\n"
            + b"SHA256: "
            + b"a" * 64
            + b"\nSize: 100\n\n"
        ),
    }
    release = "SHA256:\n" + "".join(
        f" {hashlib.sha256(data).hexdigest()} {len(data)} {name}\n"
        for name, data in artifacts.items()
    )
    artifacts["Release"] = release.encode()
    pins = tmp_path / "pins.json"
    pins.write_text(
        json.dumps(
            {
                "mirror": "https://example.test/snapshot",
                "suite": "trixie",
                "releaseSha256": hashlib.sha256(release.encode()).hexdigest(),
                "popcon": {"file": "popcon.gz", "sha256": hashlib.sha256(counts).hexdigest()},
            }
        )
    )
    monkeypatch.setattr(indexes, "PINS", pins)
    monkeypatch.setattr(
        indexes,
        "urlopen",
        lambda req, **_: io.BytesIO(artifacts[req.full_url.split("/dists/trixie/")[1]]),
    )
    _, packages = indexes.catalog(tmp_path / "indexes")
    assert [(p.name, p.installed) for p in packages] == [("provider-low", 42)]
    artifacts["Release"] += b"changed"
    (tmp_path / "indexes" / "Release").unlink()
    with pytest.raises(ValueError, match="SHA256"):
        indexes.catalog(tmp_path / "indexes")


def test_zstd_archive_and_compressed_source_are_streamed_without_installing(tmp_path):
    import tarfile

    from compression import zstd

    from ingestion.debian_archives import source_bytes

    payload = b".TH ZSTD 1\n.SH NAME\nzstd - compressed fixture\n"
    source = tmp_path / "source.zst"
    source.write_bytes(zstd.compress(payload))
    assert source_bytes(source) == payload
    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode="w") as tar:
        member = tarfile.TarInfo("./usr/share/man/man1/zstd.1.zst")
        member.size = source.stat().st_size
        tar.addfile(member, io.BytesIO(source.read_bytes()))

    def ar_member(name, data):
        return (
            f"{name:<16}{0:<12}{0:<6}{0:<6}{'100644':<8}{len(data):<10}`\n".encode()
            + data
            + (b"\n" if len(data) % 2 else b"")
        )

    archive = tmp_path / "test.deb"
    archive.write_bytes(
        b"!<arch>\n"
        + ar_member("debian-binary", b"2.0\n")
        + ar_member("data.tar.zst", zstd.compress(tar_bytes.getvalue()))
    )
    entries = extract(archive, package("gawk"), tmp_path)
    assert len(entries) == 1
    assert source_bytes(Path(entries[0][4])) == payload


def test_selected_traversal_member_is_rejected_without_filesystem_links(tmp_path):
    import tarfile

    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode="w") as tar:
        member = tarfile.TarInfo("usr/share/man/../../outside")
        member.size = 1
        tar.addfile(member, io.BytesIO(b"x"))

    def ar_member(name, data):
        return (
            f"{name:<16}{0:<12}{0:<6}{0:<6}{'100644':<8}{len(data):<10}`\n".encode()
            + data
            + (b"\n" if len(data) % 2 else b"")
        )

    archive = tmp_path / "evil.deb"
    archive.write_bytes(
        b"!<arch>\n"
        + ar_member("debian-binary", b"2.0\n")
        + ar_member("data.tar", tar_bytes.getvalue())
    )
    with pytest.raises(ValueError, match="Unsafe"):
        extract(archive, package("gawk"), tmp_path)
    assert not (tmp_path / "outside").exists()


def test_missing_cross_package_targets_acquire_only_the_indexed_owner(
    archive_workspace, tmp_path, monkeypatch
):
    obj = archive_workspace
    obj.store.db.execute("DELETE FROM entries WHERE pkg='provider-low'")
    obj.acquired.remove("provider-low")
    obj.owners.execute(
        "INSERT INTO owners VALUES (?,?)", ("usr/share/man/man1/target.1.gz", "provider-low")
    )
    acquired = []

    def acquire(packages, **_kwargs):
        acquired.extend(p.name for p in packages)
        for pkg in packages:
            obj.store.add(pkg, extract(FIXTURES / f"{pkg.name}.deb", pkg, tmp_path))
            obj.acquired.add(pkg.name)

    monkeypatch.setattr(obj, "acquire", acquire)
    assert b".TH SHARED" in obj.resolve("provider-high", "usr/share/man/man1/cross.1.gz")
    assert acquired == ["provider-low"]


def test_deadline_blocks_acquisition_before_network_or_extraction(
    archive_workspace, tmp_path, monkeypatch
):
    import ingestion.debian_pipeline as pipeline

    obj = archive_workspace
    monkeypatch.setattr(pipeline, "ingest_activation_deadline", lambda: 1)
    with pytest.raises(RuntimeError, match="Job budget exhausted"):
        obj._acquire(package("gawk"))


def test_cross_package_document_directory_symlink_chain(archive_workspace):
    obj = archive_workspace
    obj.store.db.execute(
        "INSERT INTO entries VALUES (?,?,?,?,NULL)",
        ("provider-low", "usr/share/doc/shared-doc", "link", "usr/share/doc/provider-low"),
    )
    assert "License:" in obj.resolve("provider-high", "usr/share/doc/shared-doc/copyright").decode()


def test_binary_master_requires_a_unique_same_package_manual(archive_workspace, tmp_path):
    obj = archive_workspace
    script = tmp_path / "master-data"
    script.write_text(
        "update-alternatives --install /usr/bin/cc cc /usr/bin/shared 10\n"
        "update-alternatives --install /usr/bin/unknown unknown /usr/bin/missing 20\n"
    )
    obj.store.db.execute(
        "INSERT INTO entries VALUES (?,?,?,NULL,?)",
        ("provider-high", "@control/master", "control", str(script)),
    )
    sources = list(obj.sources())
    assert any(row[2] == "cc" and row[4] for row in sources)
    assert not any(row[2] == "unknown" for row in sources)
    assert any(item.get("group") == "unknown" for item in obj.alternatives_skipped)


def test_binary_link_chain_proves_an_alternative_uses_the_same_documented_executable(
    archive_workspace, tmp_path
):
    obj = archive_workspace
    script = tmp_path / "binary-links-postinst"
    script.write_text("update-alternatives --install /usr/bin/c++ c++ /usr/bin/compiler++ 10\n")
    obj.store.db.executemany(
        "INSERT INTO entries VALUES (?,?,?,?,?)",
        [
            ("provider-high", "@control/links", "control", None, str(script)),
            ("provider-high", "usr/bin/compiler++", "binary-link", "usr/bin/shared", None),
            ("provider-high", "usr/bin/shared", "binary-file", None, None),
        ],
    )
    assert obj.binary_target("provider-high", "/usr/bin/compiler++") == "usr/bin/shared"
    assert any(row[2] == "c++" and row[4] for row in obj.sources())


def test_alternative_ranking_elects_before_manual_availability(archive_workspace, tmp_path):
    from dataclasses import replace

    obj = archive_workspace
    obj.store.db.execute("DELETE FROM entries WHERE kind='control'")
    for pkg in ["provider-low", "provider-high"]:
        script = tmp_path / (pkg + ".postinst")
        script.write_text(
            "update-alternatives --install /usr/bin/editor editor /usr/bin/shared 10 "
            "--slave /usr/share/man/man1/editor.1 editor.1 /usr/share/man/man1/shared.1"
        )
        obj.store.db.execute(
            "INSERT INTO entries VALUES (?,?,?,?,?)",
            (pkg, "@control/postinst", "control", None, str(script)),
        )
    obj.available["provider-low"] = replace(obj.available["provider-low"], priority="standard")
    list(obj.sources())
    assert obj.route_winners[("editor", "1")][0] == "provider-low"
    obj.available["provider-high"] = replace(obj.available["provider-high"], priority="important")
    list(obj.sources())
    assert obj.route_winners[("editor", "1")][0] == "provider-high"
    # Missing top-provider manual must not fall back to the documented lower one.
    (tmp_path / "provider-high.postinst").write_text(
        "update-alternatives --install /usr/bin/editor editor /usr/bin/undocumented 999"
    )
    list(obj.sources())
    assert ("editor", "1") not in obj.route_winners
    assert any(
        r.get("name") == "editor" and "winning provider" in r["reason"]
        for r in obj.alternatives_skipped
    )


def test_extraction_stops_before_exceeding_shared_file_quota(tmp_path):
    from ingestion.debian_archives import ExtractedQuota

    quota = ExtractedQuota(tmp_path / "files", 1)
    with pytest.raises(RuntimeError, match="extracted-file disk limit"):
        extract(FIXTURES / "gawk.deb", package("gawk"), tmp_path, quota=quota)
    assert sum(p.stat().st_size for p in (tmp_path / "files").iterdir()) <= 1
