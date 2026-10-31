from __future__ import annotations

import hashlib
import io
from pathlib import Path

import pytest

from ingestion import debian_indexes as indexes
from ingestion import debian_pipeline as pipeline
from ingestion.debian_archives import ArchiveStore, MissingSource, extract
from ingestion.debian_indexes import Package, release_checksums, safe_path
from ingestion.debian_licenses import copyright_text

FIXTURES = Path(__file__).parent / "fixtures" / "debs"


def package(name, installed=1):
    data = (FIXTURES / f"{name}.deb").read_bytes()
    return Package(
        name, "1", f"pool/main/{name}.deb", hashlib.sha256(data).hexdigest(), len(data), installed
    )


def workspace(tmp_path):
    obj = object.__new__(pipeline.Workspace)
    obj.root = tmp_path
    obj.store = ArchiveStore(tmp_path)
    obj.packages = [package("provider-low", 10), package("provider-high", 100), package("gawk", 1)]
    obj.available = {p.name: p for p in obj.packages}
    obj.acquired = set(obj.available)
    obj.missing = []
    obj.archive_fallbacks = 0
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


def check_command_owners(obj, pages):
    obj.published_route_owners = {(page.name, page.section): page.source_package for page in pages}
    obj.published_route_owners.update(
        {
            (a["name"], a["section"]): a["targetPackage"]
            for a in obj.alias_providers
            if not a["providerOnly"]
        }
    )
    return obj.require_command_owners()


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
    pkg, path, name, section, _alias, raw = source
    job = pipeline.ArchiveParseInput(pkg, path, name, section, raw, "1")
    row = pipeline.parse_archive_source(job)
    assert row.source_package == "provider-high"
    assert row.description == "preferred fixture"
    assert row.options and row.options[0]["flags"] == "--fixture"
    assert pipeline.parse_archive_source(job).page_id == row.page_id


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
    assert pipeline.sample_packages(packages, 2) == pipeline.sample_packages(
        list(reversed(packages)), 2
    )
    assert pipeline.sample_packages(packages, 2)[0].name == "gawk"


@pytest.mark.parametrize(
    "root",
    [
        "usr/share/postgresql/17",
        "usr/share/firebird/3.0",
        "usr/share/groovy",
        "usr/share/icedtea-web",
        "usr/share/librarian-puppet",
        "usr/share/scala-2.11",
    ],
)
def test_private_alternatives_manuals_are_selected_and_extracted(tmp_path, monkeypatch, root):
    import tarfile

    path = f"{root}/man/man1/psql.1.gz"
    assert indexes.MAN_PATH.fullmatch(path)
    assert not indexes.MAN_PATH.fullmatch(f"{root}/man/fr/man1/psql.1.gz")
    monkeypatch.setattr(
        indexes,
        "private_registrations",
        lambda: {
            "packages": {
                "postgresql-client-17": {
                    "archiveSha256": "a" * 64,
                    "paths": {
                        path.replace("psql", name) for name in ["psql", "pg_dump", "createdb"]
                    },
                }
            }
        },
    )
    tar_bytes = io.BytesIO()
    with tarfile.open(fileobj=tar_bytes, mode="w") as tar:
        for name in ["psql", "pg_dump", "createdb", "unregistered"]:
            member = tarfile.TarInfo(path.replace("psql", name))
            payload = f".TH {name.upper()} 1\n.SH NAME\n{name} - fixture\n".encode()
            member.size = len(payload)
            tar.addfile(member, io.BytesIO(payload))

    def ar_member(name, data):
        return (
            f"{name:<16}{0:<12}{0:<6}{0:<6}{'100644':<8}{len(data):<10}`\n".encode()
            + data
            + (b"\n" if len(data) % 2 else b"")
        )

    archive = tmp_path / "postgresql.deb"
    archive.write_bytes(
        b"!<arch>\n"
        + ar_member("debian-binary", b"2.0\n")
        + ar_member("data.tar", tar_bytes.getvalue())
    )
    pkg = Package("postgresql-client-17", "17", "pool/main/p/pg.deb", "a" * 64, 1)
    store = ArchiveStore(tmp_path)
    try:
        store.add(pkg, extract(archive, pkg, tmp_path))
        assert {row[2] for row in store.manuals()} == {"psql", "pg_dump", "createdb"}
        assert b"PSQL" in store.resolve(pkg.name, path)
    finally:
        store.db.close()


def test_archive_publisher_uses_bounded_pipeline_and_declares_every_provider(
    archive_workspace, tmp_path, monkeypatch
):
    from ingestion.debian_publish import publish_workspace

    obj = archive_workspace
    import json

    from ingestion.debian_indexes import PINS

    obj.pins = {
        **json.loads(PINS.read_text()),
        "mirror": "https://example.test/snapshot",
        "releaseSha256": "a" * 64,
    }
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
    assert release["packageManifest"]["acquisition"] == obj.pins["acquisition"] == "deb-extraction"
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


def test_debian_publisher_uploads_notices_over_one_mib_whole(archive_workspace, monkeypatch):
    # Full Debian ships notices over Convex's 1 MiB document limit (libboost1.83-tools-dev is
    # about 2.2 MB); they go through the stored-notice path untruncated, like the B2 distros.
    import json

    from ingestion import debian_publish
    from ingestion.debian_indexes import PINS

    obj = archive_workspace
    obj.pins = {
        **json.loads(PINS.read_text()),
        "mirror": "https://example.test/snapshot",
        "releaseSha256": "a" * 64,
    }
    notice = "L" * (2200 * 1024)
    monkeypatch.setattr(debian_publish, "copyright_text", lambda *_args: notice)
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    calls = []

    class Client:
        def post(self, path, payload):
            calls.append((path, payload))
            if path == "/ingest/pages/storage":
                return {"inserted": len(payload["pages"]), "skipped": 0}
            return {}

    debian_publish.publish_workspace(
        obj, Client(), activate=False, dataset_stage="staging", git_sha="test", sample=True
    )
    texts = [
        license["licenseText"]
        for path, payload in calls
        if path == "/ingest/licenses"
        for license in payload["licenses"]
    ]
    assert texts and all(text == notice for text in texts)


def test_full_debian_and_ubuntu_require_deployed_stored_notice_support(monkeypatch):
    from ingestion import debian_publish

    for distro, acquisitions in [("debian", []), ("ubuntu", ["ubuntu-deb-extraction"])]:
        contract = {"acquisitions": acquisitions, "storedLicenseText": False}
        monkeypatch.setattr(
            debian_publish,
            "ConvexIngestClient",
            lambda *_, contract=contract: type(
                "Client", (), {"require_deployed_contract": lambda _self: contract}
            )(),
        )
        monkeypatch.setattr(
            debian_publish, "Workspace", lambda *a, **kw: pytest.fail("must not acquire")
        )
        with pytest.raises(RuntimeError, match="stored-license support"):
            debian_publish.ingest_debian(
                activate=False,
                convex_url="unused",
                ingest_secret="unused",
                dataset_stage="staging",
                git_sha="test",
                distro=distro,
            )


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


def test_catalog_refuses_private_manuals_without_an_audit_for_the_release(tmp_path, monkeypatch):
    import gzip
    import json
    import lzma

    counts = gzip.compress(b"postgresql-client-17\t42\n", mtime=0)
    (tmp_path / "popcon.gz").write_bytes(counts)
    artifacts = {
        "main/Contents-all.gz": gzip.compress(
            b"usr/share/postgresql/17/man/man1/psql.1.gz database/postgresql-client-17\n",
            mtime=0,
        ),
        "main/Contents-amd64.gz": gzip.compress(b"", mtime=0),
        "main/binary-amd64/Packages.xz": lzma.compress(
            b"Package: postgresql-client-17\nVersion: 1\n"
            + b"Filename: pool/main/p/postgresql-client-17.deb\nSHA256: "
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
    # A Release other than the one the private-manual registrations were audited for.
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
    with pytest.raises(ValueError, match="need an audit for this Release"):
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


def test_default_installed_alternatives_use_priority_before_popularity(archive_workspace):
    from dataclasses import replace

    obj = archive_workspace
    obj.available["provider-low"] = replace(obj.available["provider-low"], priority="standard")
    obj.available["provider-high"] = replace(obj.available["provider-high"], priority="required")
    assert obj.alternative_rank("provider-low", 77, "pager", "1") < obj.alternative_rank(
        "provider-high", 50, "pager", "1"
    )
    obj.available["provider-low"] = replace(obj.available["provider-low"], priority="optional")
    obj.available["provider-high"] = replace(obj.available["provider-high"], priority="optional")
    assert obj.alternative_rank("provider-high", 50, "pager", "1") < obj.alternative_rank(
        "provider-low", 999, "pager", "1"
    )


def test_lowercase_alternative_beats_uppercase_real_page_but_keeps_provider(
    archive_workspace, tmp_path
):
    from ingestion.debian_pipeline import parse_workspace
    from ingestion.ingest_runner import _PageSpool

    obj = archive_workspace
    obj.store.db.execute("DELETE FROM entries WHERE kind='control'")
    script = tmp_path / "ftp.postinst"
    script.write_text(
        "update-alternatives --install /usr/share/man/man1/ftp.1 ftp.1 "
        "/usr/share/man/man1/shared.1 120"
    )
    obj.store.db.execute(
        "INSERT INTO entries VALUES (?,?,?,?,?)",
        ("provider-high", "@control/postinst", "control", None, str(script)),
    )
    obj.store.db.execute(
        "INSERT INTO entries SELECT pkg,replace(path,'shared.1.gz','FTP.1.gz'),kind,target,file "
        "FROM entries WHERE pkg='provider-low' AND path LIKE '%shared.1.gz'"
    )
    with _PageSpool(tmp_path / "parsed.sqlite3") as spool:
        providers, failures = parse_workspace(obj, spool, workers=1)
        assert not failures
        assert obj.route_winners[("ftp", "1")][0] == "provider-high"
        assert any(a.name == "ftp" and a.target_name == "shared" for a in obj.aliases)
        assert any(
            p.name == "ftp" and p.source_package == "provider-low" and p.page_id in providers
            for p in spool.refs()
        )
    # A genuinely lowercase owned manual still beats the generated alternative.
    obj.store.db.execute(
        "UPDATE entries SET path=replace(path,'FTP.1.gz','ftp.1.gz') WHERE path LIKE '%/FTP.1.gz'"
    )
    list(obj.sources())
    assert obj.route_winners[("ftp", "1")][0] == "provider-low"


def test_acquisition_deduplicates_manual_and_runtime_control_selections(
    archive_workspace, monkeypatch
):
    obj = archive_workspace
    obj.acquired.clear()
    obj.downloaded = 0
    obj.cache = obj.root
    seen = []

    def acquire(pkg):
        seen.append(pkg.name)
        return pkg, [], 0, 0, 0, 0

    monkeypatch.setattr(obj, "_acquire", acquire)
    pkg = obj.packages[0]
    obj.acquire([pkg, pkg], workers=2)
    assert seen == [pkg.name]

    seen.clear()
    obj.acquired.clear()
    cached = obj.packages[-1]
    (obj.cache / f"{cached.sha256}.deb").write_bytes(b"checked by download, not scheduling")
    obj.acquire(obj.packages, workers=1)
    assert seen[0] == cached.name


def test_command_audit_replays_gate_and_reports_every_curated_entry(archive_workspace, monkeypatch):
    from ingestion import package_set
    from scripts.check_debian_archives import audit_command_pages

    obj = archive_workspace
    obj.pins = {"releaseSha256": "a" * 64}
    obj.all_manual_packages = obj.packages
    obj.curated_packages = []
    monkeypatch.setattr(package_set, "FULL_PACKAGE_SET_DEBIAN", ["gawk", "gcc", "manpages"])
    report = audit_command_pages(obj, workers=1)
    assert [(row["package"], row["status"]) for row in report["commands"]] == [
        ("gawk", "present"),
        ("gcc", "excluded"),
        ("manpages", "non-command"),
    ]
    assert "non-free" in report["commands"][1]["reason"]
    assert not report["parseFailures"] and not report["unresolvedSources"]


def test_acquisition_keeps_worker_busy_when_an_earlier_archive_is_slow(
    archive_workspace, monkeypatch
):
    import threading

    obj = archive_workspace
    obj.acquired.clear()
    obj.downloaded = 0
    obj.cache = obj.root
    third_started = threading.Event()
    first, _second, third = obj.packages

    def acquire(pkg):
        if pkg == first:
            assert third_started.wait(2), "a finished worker was idle behind the first download"
        if pkg == third:
            third_started.set()
        return pkg, [], 0, 0, 0, 0

    monkeypatch.setattr(obj, "_acquire", acquire)
    obj.acquire(obj.packages, workers=2)
    assert obj.acquired == {p.name for p in obj.packages}


def test_audited_private_registration_allowlists_exclude_unregistered_pages():
    registrations = indexes.private_registrations()["packages"]
    assert sum(len(item["paths"]) for item in registrations.values()) == 329
    assert not indexes.manual_registered(
        "firebird3.0-utils", "usr/share/firebird/3.0/man/man1/fb_config.1.gz"
    )
    assert indexes.manual_registered("firebird-dev", "usr/share/man/man1/fb_config.1.gz")
    for name in ["groovyConsole", "groovydoc", "groovysh", "java2groovy", "startGroovy"]:
        assert not indexes.manual_registered("groovy", f"usr/share/groovy/man/man1/{name}.1.gz")
    assert {Path(p).name for p in registrations["groovy"]["paths"]} == {
        "groovy.1.gz",
        "groovyc.1.gz",
        "grape.1.gz",
    }
    with pytest.raises(ValueError, match="registrations.*SHA256"):
        indexes.require_private_package(Package("groovy", "1", "pool/main/g.deb", "a" * 64, 1))


def test_command_owner_gate_accepts_dependencies_and_virtual_providers_but_rejects_wrong_owner(
    archive_workspace,
    monkeypatch,
):
    from dataclasses import replace
    from types import SimpleNamespace

    obj = archive_workspace
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", ["postgresql-client"])
    base = obj.packages[0]
    obj.available = {
        "postgresql-client": replace(base, name="postgresql-client", depends=("client-runtime",)),
        "client-runtime": replace(base, name="client-runtime", depends=("postgresql-client-17",)),
        "postgresql-client-17": replace(
            base, name="postgresql-client-17", provides=("postgresql-client",)
        ),
    }
    obj.alias_providers = []
    page = SimpleNamespace(name="psql", section="1", source_package="postgresql-client-17")
    assert check_command_owners(obj, [page]) == {"postgresql-client": "postgresql-client-17"}
    del obj.available["postgresql-client"]
    assert check_command_owners(obj, [page]) == {"postgresql-client": "postgresql-client-17"}
    page.source_package = "9base"
    with pytest.raises(RuntimeError, match="wrong command-page owner.*psql"):
        check_command_owners(obj, [page])


def test_wrong_owner_blocks_archive_publish_before_upload(archive_workspace, monkeypatch):
    from ingestion import ingest_runner
    from ingestion.debian_publish import publish_workspace

    obj = archive_workspace
    obj.pins = {"releaseSha256": "a" * 64}
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    monkeypatch.setitem(ingest_runner._COMMAND_PAGES, "gawk", ("shared", "1"))

    class Client:
        def post(self, *_args):
            pytest.fail("wrong owner must fail before upload")

    with pytest.raises(RuntimeError, match="wrong command-page owner.*shared"):
        publish_workspace(obj, Client(), activate=False, dataset_stage="staging", git_sha="test")


def test_debian_relationship_names_ignore_versions_and_arch_qualifiers():
    assert indexes.relationship_names("foo:any (>= 1), bar:native | baz (= 2), virtual (= 1)") == (
        "foo",
        "bar",
        "baz",
        "virtual",
    )


def test_command_owner_gate_prefers_exact_section_to_plan9_suffix(archive_workspace, monkeypatch):
    from dataclasses import replace
    from types import SimpleNamespace

    obj = archive_workspace
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", ["coreutils"])
    obj.available["coreutils"] = replace(obj.packages[0], name="coreutils")
    obj.alias_providers = []
    standard = SimpleNamespace(name="ls", section="1", source_package="coreutils")
    plan9 = SimpleNamespace(name="ls", section="1plan9", source_package="9base")
    assert check_command_owners(obj, [standard, plan9]) == {"coreutils": "coreutils"}
    with pytest.raises(RuntimeError, match="wrong command-page owner.*ls"):
        check_command_owners(obj, [plan9])


def test_command_owner_gate_preserves_explicit_mount_companion(archive_workspace, monkeypatch):
    from dataclasses import replace
    from types import SimpleNamespace

    obj = archive_workspace
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", ["util-linux"])
    obj.available["util-linux"] = replace(obj.packages[0], name="util-linux")
    obj.alias_providers = []
    page = SimpleNamespace(name="mount", section="8", source_package="mount")
    assert check_command_owners(obj, [page]) == {"util-linux": "mount"}


@pytest.mark.parametrize(
    "requested,name,wrong_owner",
    [
        ("coreutils", "ls", "9base"),
        ("grep", "grep", "9base"),
        ("sed", "sed", "9base"),
        ("make", "make", "make-guile"),
    ],
)
def test_unrelated_command_provider_cannot_satisfy_curated_gate(
    archive_workspace,
    monkeypatch,
    requested,
    name,
    wrong_owner,
):
    from dataclasses import replace
    from types import SimpleNamespace

    obj = archive_workspace
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", [requested])
    obj.available[requested] = replace(obj.packages[0], name=requested)
    # Providing the requested name is not enough (make-guile Provides make in the pin).
    obj.available[wrong_owner] = replace(obj.packages[0], name=wrong_owner, provides=(requested,))
    obj.alias_providers = []
    with pytest.raises(RuntimeError, match="wrong command-page owner"):
        check_command_owners(
            obj, [SimpleNamespace(name=name, section="1", source_package=wrong_owner)]
        )


def test_acquisition_summary_counts_archive_fallbacks(archive_workspace, monkeypatch, caplog):
    import json
    import logging

    obj = archive_workspace
    obj.acquired.clear()
    obj.downloaded = 0
    obj.cache = obj.root
    monkeypatch.setattr(obj, "_acquire", lambda pkg: (pkg, [], 1, 0, 0, 1))
    caplog.set_level(logging.INFO, logger="betterman.ingestion")
    obj.acquire(obj.packages[:2], workers=2)
    summary = json.loads(caplog.records[-1].message)
    assert summary["event"] == "deb_acquisition_complete"
    assert summary["archiveFallbacks"] == obj.archive_fallbacks == 2


@pytest.mark.parametrize("reverse", [False, True])
@pytest.mark.parametrize("allowed_wins", [False, True])
def test_published_real_page_owner_excludes_competing_provider(
    archive_workspace, tmp_path, monkeypatch, reverse, allowed_wins
):
    from dataclasses import replace

    from ingestion.ingest_runner import _COMMAND_PAGES, _PageSpool

    obj = archive_workspace
    obj.available["gawk"] = replace(obj.available["gawk"], depends=("provider-high",))
    obj.available["provider-low"] = replace(
        obj.available["provider-low"], installed=1 if allowed_wins else 1000
    )
    obj.packages = [obj.available[p.name] for p in obj.packages]
    if reverse:
        obj.packages.reverse()
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", ["gawk"])
    monkeypatch.setitem(_COMMAND_PAGES, "gawk", ("shared", "1"))
    with _PageSpool(tmp_path / "competing-pages.sqlite3") as spool:
        providers, failures = pipeline.parse_workspace(obj, spool, workers=1)
        assert not failures
        pages = [p for p in spool.refs() if (p.name, p.section) == ("shared", "1")]
        winner = "provider-high" if allowed_wins else "provider-low"
        assert {p.source_package for p in pages} == {"provider-high", "provider-low"}
        assert [p.source_package for p in pages if p.page_id not in providers] == [winner]
        assert obj.published_route_owners[("shared", "1")] == winner
        if allowed_wins:
            assert obj.require_command_owners() == {"gawk": "provider-high"}
        else:
            with pytest.raises(RuntimeError, match="wrong command-page owner.*shared"):
                obj.require_command_owners()


@pytest.mark.parametrize("reverse", [False, True])
def test_published_nc_owner_uses_elected_alias_target_in_both_provider_orders(
    archive_workspace,
    tmp_path,
    monkeypatch,
    reverse,
):
    from dataclasses import replace

    from ingestion.debian_pipeline import parse_workspace
    from ingestion.ingest_runner import _PageSpool

    obj = archive_workspace
    obj.store.db.execute("DELETE FROM entries WHERE kind='control'")
    obj.store.db.execute(
        "INSERT INTO entries SELECT pkg,replace(path,'shared.1.gz','nc_openbsd.1.gz'),"
        "kind,target,file FROM entries WHERE pkg='provider-high' AND path LIKE '%shared.1.gz'"
    )
    mapping = {"provider-low": "netcat-traditional", "provider-high": "netcat-openbsd"}
    for old, name in mapping.items():
        obj.store.db.execute("UPDATE entries SET pkg=? WHERE pkg=?", (name, old))
        obj.store.db.execute("UPDATE packages SET name=? WHERE name=?", (name, old))
        metadata = replace(
            obj.available.pop(old),
            name=name,
            provides=("netcat",),
            priority="standard" if name == "netcat-traditional" else "optional",
        )
        obj.available[name] = metadata
        script = tmp_path / f"{name}.postinst"
        priority = 10 if name == "netcat-traditional" else 50
        target_name = "shared" if name == "netcat-traditional" else "nc_openbsd"
        script.write_text(
            "update-alternatives --install /usr/bin/nc nc /usr/bin/shared "
            f"{priority} --slave /usr/share/man/man1/nc.1 nc.1 "
            f"/usr/share/man/man1/{target_name}.1\n"
        )
        obj.store.db.execute(
            "INSERT INTO entries VALUES (?,?,?,NULL,?)",
            (name, "@control/postinst", "control", str(script)),
        )
    names = list(mapping.values())
    obj.packages = [obj.available[n] for n in (reversed(names) if reverse else names)]
    obj.acquired = set(obj.available)
    obj.curated_packages = []
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", ["netcat-openbsd"])
    with _PageSpool(tmp_path / "nc-pages.sqlite3") as spool:
        providers, failures = parse_workspace(obj, spool, workers=1)
        assert not failures
        assert obj.route_winners[("nc", "1")][0] == "netcat-traditional"
        assert obj.published_route_owners[("nc", "1")] == "netcat-traditional"
        offers = [a for a in obj.alias_providers if a["name"] == "nc"]
        assert {a["sourcePackage"] for a in offers} == set(names)
        elected = next(a for a in offers if not a["providerOnly"])
        assert elected["targetPackage"] == "netcat-traditional"
        assert obj.published_route_owners[("nc_openbsd", "1")] == "netcat-openbsd"
        assert any(
            p.name == "nc_openbsd" and p.source_package == "netcat-openbsd" for p in spool.refs()
        )
        openbsd = next(a for a in offers if a["sourcePackage"] == "netcat-openbsd")
        assert openbsd["providerOnly"]
        assert (openbsd["targetName"], openbsd["targetSection"], openbsd["targetPackage"]) == (
            "nc_openbsd",
            "1",
            "netcat-openbsd",
        )
        obj.alias_providers = list(reversed(offers)) if reverse else offers
        assert obj.require_command_owners() == {"netcat-openbsd": "netcat-traditional"}

    from ingestion.debian_publish import publish_workspace

    obj.pins = {
        "mirror": "https://example.test",
        "releaseSha256": "a" * 64,
        "acquisition": "deb-extraction",
    }
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    calls = []

    class Client:
        def post(self, path, payload):
            calls.append((path, payload))
            return {}

    publish_workspace(
        obj, Client(), activate=False, dataset_stage="staging", git_sha="test", sample=True
    )
    assert any(
        p["name"] == "nc_openbsd"
        and p["sourcePackage"] == "netcat-openbsd"
        and not p.get("providerOnly")
        for path, payload in calls
        if path == "/ingest/pages/storage"
        for p in payload["pages"]
    )
    assert any(
        a["name"] == "nc"
        and a["sourcePackage"] == "netcat-openbsd"
        and a["providerOnly"]
        and a["targetName"] == "nc_openbsd"
        and a["targetPackage"] == "netcat-openbsd"
        for path, payload in calls
        if path == "/ingest/aliases"
        for a in payload["aliases"]
    )


def test_published_alias_owner_is_its_served_target_package(
    archive_workspace, tmp_path, monkeypatch
):
    from dataclasses import replace

    from ingestion.debian_pipeline import parse_workspace
    from ingestion.ingest_runner import _PageSpool

    obj = archive_workspace
    obj.store.db.execute("DELETE FROM entries WHERE kind='control'")
    script = tmp_path / "alias-target.postinst"
    script.write_text(
        "update-alternatives --install /usr/share/man/man1/gawk.1 gawk.1 "
        "/usr/share/man/man1/target.1 10\n"
    )
    obj.store.db.execute(
        "INSERT INTO entries VALUES (?,?,?,NULL,?)",
        ("provider-high", "@control/postinst", "control", str(script)),
    )
    obj.store.db.execute("DELETE FROM entries WHERE pkg='gawk'")
    obj.available["gawk"] = replace(obj.available["gawk"], depends=("provider-low",))
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", ["gawk"])
    with _PageSpool(tmp_path / "target-pages.sqlite3") as spool:
        _providers, failures = parse_workspace(obj, spool, workers=1)
        assert not failures
        assert obj.route_winners[("gawk", "1")][0] == "provider-high"
        assert obj.published_route_owners[("gawk", "1")] == "provider-low"
        assert obj.require_command_owners() == {"gawk": "provider-low"}


@pytest.mark.parametrize("alias_route_page", [False, True])
def test_alias_owner_requires_its_exact_target_to_parse(
    archive_workspace, tmp_path, monkeypatch, alias_route_page
):
    from dataclasses import replace

    from ingestion.ingest_runner import _PageSpool, _require_command_pages

    obj = archive_workspace
    obj.store.db.execute("DELETE FROM entries WHERE kind='control' OR pkg='gawk'")
    if alias_route_page:
        obj.store.db.execute(
            "INSERT INTO entries SELECT pkg,replace(path,'shared.1.gz','GAWK.1.gz'),"
            "kind,target,file FROM entries WHERE pkg='provider-low' AND path LIKE '%shared.1.gz'"
        )
    script = tmp_path / "failed-target.postinst"
    script.write_text(
        "update-alternatives --install /usr/share/man/man1/gawk.1 gawk.1 "
        "/usr/share/man/man1/shared.1 10\n"
    )
    obj.store.db.execute(
        "INSERT INTO entries VALUES (?,?,?,NULL,?)",
        ("provider-high", "@control/postinst", "control", str(script)),
    )
    obj.available["gawk"] = replace(obj.available["gawk"], depends=("provider-high",))
    monkeypatch.setattr(pipeline, "FULL_PACKAGE_SET_DEBIAN", ["gawk"])
    sources = obj.sources

    def fail_target():
        for pkg, path, name, section, alias, raw in sources():
            if (pkg, name, section, alias) == ("provider-high", "shared", "1", False):
                raw = b".so unavailable.1\n"
            yield pkg, path, name, section, alias, raw

    monkeypatch.setattr(obj, "sources", fail_target)
    with _PageSpool(tmp_path / "failed-target-pages.sqlite3") as spool:
        providers, failures = pipeline.parse_workspace(obj, spool, workers=1)
        assert len(failures) == 1 and failures[0]["package"] == "provider-high"
        assert obj.published_route_owners[("shared", "1")] == "provider-low"
        assert not any(a.name == "gawk" for a in obj.aliases)
        assert all(a["providerOnly"] for a in obj.alias_providers if a["name"] == "gawk")
        if alias_route_page:
            assert obj.published_route_owners[("gawk", "1")] == "provider-low"
            with pytest.raises(RuntimeError, match="wrong command-page owner.*gawk"):
                obj.require_command_owners()
            return
        assert ("gawk", "1") not in obj.published_route_owners
        assert obj.require_command_owners() == {}
        with pytest.raises(RuntimeError, match="missing package-set command pages: gawk"):
            _require_command_pages(
                distro="debian",
                requested=["gawk"],
                pages=[p for p in spool.refs() if p.page_id not in providers],
                aliases=obj.aliases,
                sample=False,
            )
