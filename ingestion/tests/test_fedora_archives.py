"""Archive trust boundaries are independent of package installation tools."""

import io
import tarfile

import pytest

from ingestion.debian_archives import ArchiveStore, ExtractedQuota
from ingestion.fedora_archives import ArchivePackage, extract_payload


def package():
    return ArchivePackage("fixture", "1", "Packages/f/fixture.rpm", "a" * 64, 1)


def payload(members):
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w") as archive:
        for name, body, target in members:
            item = tarfile.TarInfo(name)
            if target:
                item.type, item.linkname = tarfile.SYMTYPE, target
                archive.addfile(item)
            else:
                item.size = len(body)
                archive.addfile(item, io.BytesIO(body))
    return io.BytesIO(raw.getvalue())


def test_rpm_payload_keeps_only_docs_and_never_creates_links_or_runs_scripts(tmp_path):
    body = b".TH TOOL 1\n.SH NAME\ntool - fixture\n"
    source = payload(
        [
            ("usr/share/man/man1/tool.1", body, None),
            ("usr/share/man/man1/alias.1", b"", "tool.1"),
            ("usr/share/licenses/fixture/LICENSE", b"license notice", None),
            (".postinstall", b"touch /tmp/never-executed", None),
            ("usr/share/doc/site/a\\b.html", b"unrelated Linux filename", None),
        ]
    )
    entries = extract_payload(source, package(), tmp_path, quota=ExtractedQuota(tmp_path / "files"))
    store = ArchiveStore(tmp_path, registrations={"packages": {}})
    store.add(package(), entries)
    assert store.resolve("fixture", "usr/share/man/man1/alias.1") == body
    assert len(entries) == 3
    assert all(not p.is_symlink() for p in tmp_path.rglob("*"))
    assert not any(p.name == ".postinstall" for p in tmp_path.rglob("*"))
    store.db.close()


@pytest.mark.parametrize(
    "name,target",
    [
        ("usr/share/man/../../escape", None),
        ("usr/share/man/man1/escape.1", "../../../../../etc/passwd"),
    ],
)
def test_retained_paths_reject_traversal(tmp_path, name, target):
    with pytest.raises(ValueError, match="Unsafe"):
        extract_payload(
            payload([(name, b"x", target)]),
            package(),
            tmp_path,
            quota=ExtractedQuota(tmp_path / "files"),
        )
    assert not (tmp_path / "escape").exists()


@pytest.mark.parametrize("request_line", [b".so man1/part.1 extra\n", b".so\n"])
def test_unsupported_include_fails_only_that_page(tmp_path, request_line):
    # Arch and Alpine full imports stopped on one such page; it is now a per-page
    # failure that names the page, counted by the archive parse gate.
    entries = extract_payload(
        payload(
            [
                ("usr/share/man/man1/odd.1", b".TH ODD 1\n" + request_line, None),
                ("usr/share/man/man1/fine.1", b".TH FINE 1\n.SH NAME\nfine - ok\n", None),
                ("usr/share/man/man1/part.1", b"part\n", None),
            ]
        ),
        package(),
        tmp_path,
        quota=ExtractedQuota(tmp_path / "files"),
    )
    store = ArchiveStore(tmp_path, registrations={"packages": {}})
    store.add(package(), entries)
    with pytest.raises(ValueError, match="fixture:usr/share/man/man1/odd.1: Unsupported roff"):
        store.resolve("fixture", "usr/share/man/man1/odd.1")
    assert b"fine - ok" in store.resolve("fixture", "usr/share/man/man1/fine.1")
    store.db.close()


def test_other_include_errors_still_stop_the_import(tmp_path):
    entries = extract_payload(
        payload(
            [
                ("usr/share/man/man1/a.1", b".TH A 1\n.so man1/b.1\n", None),
                ("usr/share/man/man1/b.1", b"b\n", None),
            ]
        ),
        package(),
        tmp_path,
        quota=ExtractedQuota(tmp_path / "files"),
    )
    store = ArchiveStore(tmp_path, registrations={"packages": {}})
    store.add(package(), entries)
    resolve = store.resolve

    def refusing(pkg, path, *args, **kwargs):
        if path.endswith("/b.1"):
            raise RuntimeError("Archive dependency requires excluded package b")
        return resolve(pkg, path, *args, **kwargs)

    store.resolve = refusing
    with pytest.raises(RuntimeError, match="excluded package"):
        resolve("fixture", "usr/share/man/man1/a.1")
    store.db.close()


def test_retained_source_limit_is_shared_across_payloads(tmp_path):
    quota = ExtractedQuota(tmp_path / "files", limit=4)
    with pytest.raises(RuntimeError, match="disk limit"):
        extract_payload(
            payload([("usr/share/man/man1/tool.1", b"12345", None)]),
            package(),
            tmp_path,
            quota=quota,
        )
    assert quota.used == 0


def test_rpm_scriptlets_are_bounded_data_and_use_static_alternatives_parser(tmp_path):
    import struct

    from ingestion.debian_alternatives import parse_alternatives
    from ingestion.fedora_archives import rpm_scripts

    script = (
        b"/usr/sbin/alternatives --install /usr/bin/soelim soelim /usr/bin/soelim.groff 300 "
        b"--slave /usr/share/man/man1/soelim.1 soelim.1 /usr/share/man/man1/soelim.groff.1 "
        b">/dev/null 2>&1 || :\ntouch /tmp/never-executed\n\0"
    )

    def header(records, data):
        return (
            b"\x8e\xad\xe8\x01"
            + b"\0" * 4
            + struct.pack(">II", len(records), len(data))
            + b"".join(struct.pack(">IIII", *record) for record in records)
            + data
        )

    archive = tmp_path / "fixture.rpm"
    archive.write_bytes(
        b"\xed\xab\xee\xdb" + b"\0" * 92 + header([], b"") + header([(1024, 6, 0, 1)], script)
    )
    scripts = rpm_scripts(archive)
    offers, _ = parse_alternatives(scripts[0][1].decode())
    assert [(o.name, o.priority) for o in offers] == [("soelim", 300)]
    assert not (tmp_path / "never-executed").exists()
    archive.write_bytes(
        b"\xed\xab\xee\xdb"
        + b"\0" * 92
        + b"\x8e\xad\xe8\x01"
        + b"\0" * 4
        + struct.pack(">II", 65537, 0)
    )
    with pytest.raises(ValueError, match="Oversized RPM header"):
        rpm_scripts(archive)


def test_fedora_catalog_binds_filelists_to_primary_and_requires_duplicate_version_pins(
    tmp_path, monkeypatch
):
    import hashlib
    import json
    from pathlib import Path

    from compression.zstd import compress

    from ingestion import fedora_archives as fedora

    digest = "a" * 64
    primary = f"""<metadata xmlns="http://linux.duke.edu/metadata/common" xmlns:rpm="http://linux.duke.edu/metadata/rpm">
<package type="rpm">
<name>fixture</name>
<arch>x86_64</arch>
<version epoch="0" ver="1" rel="1"/>
<checksum type="sha256">{digest}</checksum>
<size package="100"/>
<location href="Packages/f/fixture.rpm"/>
<format>
<rpm:license>MIT</rpm:license>
<rpm:sourcerpm>fixture-1-1.src.rpm</rpm:sourcerpm>
<rpm:requires/>
<rpm:provides/>
</format>
</package>
</metadata>"""
    files = f'''<filelists xmlns="http://linux.duke.edu/metadata/filelists">
<package name="fixture" arch="x86_64" pkgid="{digest}">
<file>/usr/share/man/man1/fixture.1</file>
<file>/usr/share/doc/site/a\\b.html</file>
</package>
</filelists>'''
    blobs = {
        "primary.xml.zst": compress(primary.encode()),
        "filelists.xml.zst": compress(files.encode()),
    }
    repomd = (
        '<repomd xmlns="http://linux.duke.edu/metadata/repo">'
        + "".join(
            f'<data type="{kind}"><checksum type="sha256">'
            f"{hashlib.sha256(blobs[kind + '.xml.zst']).hexdigest()}</checksum>"
            f"<size>{len(blobs[kind + '.xml.zst'])}</size>"
            f'<location href="repodata/{kind}.xml.zst"/></data>'
            for kind in ("primary", "filelists")
        )
        + "</repomd>"
    )
    blobs["repomd.xml"] = repomd.encode()
    pins = json.loads((Path(__file__).parents[1] / "data/fedora-44.json").read_text())
    pins.update(releaseSha256=hashlib.sha256(blobs["repomd.xml"]).hexdigest(), packageVersions={})
    pinfile = tmp_path / "pins.json"
    pinfile.write_text(json.dumps(pins))

    def download(url, destination, checksum, size=None, **_kwargs):
        raw = blobs[url.rsplit("/", 1)[-1]]
        assert hashlib.sha256(raw).hexdigest() == checksum
        assert size is None or len(raw) == size
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)

    monkeypatch.setattr(fedora, "download", download)
    _, packages, available = fedora.catalog(tmp_path / "indexes", pinfile)
    assert [p.name for p in packages] == ["fixture"]
    assert available["fixture"].license == "MIT"
    pins["packageVersions"] = {"missing": "1"}
    pinfile.write_text(json.dumps(pins))
    with pytest.raises(ValueError, match="Pinned Fedora version unavailable"):
        fedora.catalog(tmp_path / "indexes", pinfile)


def test_large_notices_keep_all_text_through_the_stored_license_limit():
    from ingestion.ingest_runner import _iter_license_items

    text = "copyright notice\n" * 280000
    with pytest.raises(RuntimeError, match="Convex 1 MiB"):
        list(
            _iter_license_items(
                licenses={"large": text}, distro="fedora", dataset_release_id="test"
            )
        )
    items = list(
        _iter_license_items(
            licenses={"large": text}, distro="fedora", dataset_release_id="test", stored=True
        )
    )
    assert items[0]["licenseText"] == text
    with pytest.raises(RuntimeError, match="stored-notice 7 MiB"):
        list(
            _iter_license_items(
                licenses={"huge": "x" * (7 * 1024**2)},
                distro="fedora",
                dataset_release_id="test",
                stored=True,
            )
        )


def test_fedora_requires_deployed_stored_license_capability_before_acquisition(monkeypatch):
    from ingestion import debian_publish

    class Client:
        def __init__(self, *args):
            pass

        def require_deployed_contract(self):
            return {"schemaVersion": 8, "acquisitions": ["fedora-rpm-extraction"]}

    monkeypatch.setattr(debian_publish, "ConvexIngestClient", Client)
    monkeypatch.setattr(debian_publish, "Workspace", lambda *a, **kw: pytest.fail("no acquisition"))
    with pytest.raises(RuntimeError, match="stored-license support"):
        debian_publish.ingest_debian(
            activate=True,
            convex_url="unused",
            ingest_secret="unused",
            dataset_stage="staging",
            git_sha="test",
            distro="fedora",
        )
