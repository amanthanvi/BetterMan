"""Declared-license fallback uses exact expressions and pinned official texts."""

import pytest

from tests.test_archive_notices import notice_workspace as notice_workspace


def test_expression_parser_preserves_and_or_with_and_exception():
    from ingestion.standard_licenses import parse_expression

    assert parse_expression(
        "MIT AND (BSD-3-Clause OR GPL-2.0-or-later WITH Classpath-exception-2.0)"
    ) == [
        ("MIT", "license"),
        ("BSD-3-Clause", "license"),
        ("GPL-2.0-or-later", "license"),
        ("Classpath-exception-2.0", "exception"),
    ]
    for expression in (
        "MIT OR",
        "MIT BSD-3-Clause",
        "(MIT OR BSD-3-Clause) WITH X",
        "MIT AND !GPL",
    ):
        with pytest.raises(ValueError):
            parse_expression(expression)


@pytest.fixture
def workspace(notice_workspace, monkeypatch):
    from ingestion import standard_licenses

    w = notice_workspace
    w.root = w.store.root
    inventory = {
        "license": {"MIT": "canonical MIT text", "BSD-3-Clause": "canonical BSD text"},
        "exception": {"Classpath-exception-2.0": "canonical Classpath exception"},
    }
    for family, versions in [("GPL", ["1.0", "2.0", "3.0"]), ("LGPL", ["2.0", "2.1", "3.0"])]:
        for version in versions:
            for suffix in ["only", "or-later"]:
                inventory["license"][f"{family}-{version}-{suffix}"] = (
                    f"canonical {family} {version} text"
                )
    monkeypatch.setattr(standard_licenses, "load_texts", lambda _root: inventory)
    return w


def test_legacy_gnu_superset_fills_partial_shared_text_first(workspace):
    from ingestion.standard_licenses import standard_text

    w = workspace
    w.distro = "arch"
    w.register("fuse2fs", [], license="GPL AND LGPL AND MIT")
    w.register(
        "licenses", [("usr/share/licenses/spdx/GPL-2.0-only.txt", b"canonical GPL 2.0 text", None)]
    )
    text = standard_text(w, "fuse2fs")
    assert text.index("canonical GPL 2.0 text") < text.index("canonical MIT text")
    assert text.count("canonical GPL 2.0 text") == 1
    assert "Standard text for the declared license MIT" in text
    metadata = w.standard_license_metadata["fuse2fs"]
    assert metadata["missingLicenseIdentifiers"] == []
    assert {"MIT", "GPL-1.0-only", "GPL-2.0-only", "GPL-3.0-only", "LGPL-2.1-only"} <= set(
        metadata["standardLicenseIdentifiers"]
    )


def test_unknown_identifier_and_invalid_expression_are_recorded_and_shown(workspace):
    from ingestion.standard_licenses import standard_text

    w = workspace
    w.register("unknown", [], license="MIT OR LicenseRef-Private")
    text = standard_text(w, "unknown")
    assert "canonical MIT text" in text
    assert "Missing license identifiers after shared and SPDX sources: LicenseRef-Private" in text
    assert w.standard_license_metadata["unknown"]["missingLicenseIdentifiers"] == [
        "LicenseRef-Private"
    ]
    w.register("broken", [], license="MIT ??? BSD")
    text = standard_text(w, "broken")
    assert "Unparseable license expression" in text
    assert "canonical MIT text" not in text
    assert w.standard_license_metadata["broken"]["licenseExpressionError"]


def test_own_notice_is_returned_unchanged_without_loading_spdx(workspace, monkeypatch):
    from ingestion import standard_licenses

    w = workspace
    w.register(
        "own",
        [("usr/share/licenses/own/LICENSE", b"upstream notice unchanged", None)],
        license="not a valid expression",
    )
    monkeypatch.setattr(
        standard_licenses, "load_texts", lambda _root: pytest.fail("own notice must win")
    )
    assert standard_licenses.license_text(w, "own") == "upstream notice unchanged"
    assert "own" not in getattr(w, "standard_license_metadata", {})


def test_known_license_is_not_treated_as_an_unknown_exception(workspace):
    from ingestion.standard_licenses import standard_text

    w = workspace
    w.distro = "arch"
    w.register("typed", [], license="BSD-3-Clause WITH MIT")
    w.register("licenses", [("usr/share/licenses/spdx/MIT.txt", b"canonical MIT text", None)])
    text = standard_text(w, "typed")
    assert "canonical MIT text" not in text
    assert w.standard_license_metadata["typed"]["missingLicenseIdentifiers"] == ["MIT"]


def test_checksum_pin_failure_prevents_archive_use(tmp_path, monkeypatch):
    import hashlib
    import io
    import json

    from ingestion import debian_indexes, standard_licenses
    from ingestion.debian_indexes import DownloadIntegrityError
    from tests.test_arch_archives import tar_bytes

    prefix = "license-list-data-3.29.0/"
    body = tar_bytes(
        [
            (
                prefix + "json/licenses.json",
                json.dumps(
                    {
                        "licenseListVersion": "3.29.0",
                        "licenses": [
                            {"licenseId": "MIT"},
                            {"licenseId": "GPL-2.0", "isDeprecatedLicenseId": True},
                        ],
                    }
                ).encode(),
            ),
            (
                prefix + "json/exceptions.json",
                json.dumps(
                    {
                        "licenseListVersion": "3.29.0",
                        "exceptions": [
                            {
                                "licenseExceptionId": "Nokia-Qt-exception-1.1",
                                "isDeprecatedLicenseId": True,
                            }
                        ],
                    }
                ).encode(),
            ),
            (prefix + "text/MIT.txt", b"official test text"),
            (prefix + "text/deprecated_GPL-2.0.txt", b"deprecated license text"),
            (prefix + "text/Nokia-Qt-exception-1.1.txt", b"deprecated exception text"),
        ]
    )
    pinfile = tmp_path / "pins.json"
    pinfile.write_text(
        json.dumps(
            {
                "release": "v3.29.0",
                "url": "https://codeload.github.com/spdx/license-list-data/tar.gz/refs/tags/v3.29.0",
                "sha256": hashlib.sha256(body).hexdigest(),
                "size": len(body),
            }
        )
    )
    monkeypatch.setattr(standard_licenses, "PINS", pinfile)
    response = [b"x" * len(body)]
    monkeypatch.setattr(debian_indexes, "urlopen", lambda *args, **kwargs: io.BytesIO(response[0]))
    with pytest.raises(DownloadIntegrityError, match="checksum"):
        standard_licenses.load_texts(tmp_path)
    assert not (tmp_path / "spdx-license-list-data.tar.gz").exists()
    response[0] = body
    texts = standard_licenses.load_texts(tmp_path)
    assert texts["license"]["MIT"] == "official test text"
    assert texts["license"]["GPL-2.0"] == "deprecated license text"
    assert texts["exception"]["Nokia-Qt-exception-1.1"] == "deprecated exception text"


def test_standard_entry_attaches_all_or_alternatives_and_with_exception(workspace):
    from ingestion.standard_licenses import standard_text

    w = workspace
    w.register(
        "compound",
        [],
        license="MIT AND (BSD-3-Clause OR GPL-2.0-or-later WITH Classpath-exception-2.0)",
    )
    text = standard_text(w, "compound")
    for body in [
        "canonical MIT text",
        "canonical BSD text",
        "canonical GPL 2.0 text",
        "canonical Classpath exception",
    ]:
        assert body in text
    assert "declared exception Classpath-exception-2.0" in text
    assert w.standard_license_metadata["compound"]["missingLicenseIdentifiers"] == []


@pytest.mark.parametrize("distro", ["debian", "ubuntu"])
def test_debian_and_ubuntu_still_fail_without_copyright(workspace, distro):
    from ingestion.debian_archives import MissingSource
    from ingestion.standard_licenses import license_text

    workspace.distro = distro
    workspace.register("missing", [], license="MIT")
    with pytest.raises(MissingSource):
        license_text(workspace, "missing")


def test_missing_individual_notice_does_not_trigger_standard_substitution(workspace):
    from ingestion.debian_archives import MissingSource
    from ingestion.standard_licenses import license_text

    workspace.register(
        "broken-file", [("usr/share/licenses/broken-file/LICENSE", b"", "missing.txt")]
    )
    with pytest.raises(MissingSource):
        license_text(workspace, "broken-file")


@pytest.mark.parametrize("distro", ["fedora", "arch", "alpine"])
def test_absent_directory_alias_reaches_final_standard_policy(workspace, distro):
    from ingestion.standard_licenses import license_text

    w = workspace
    w.distro = distro
    w.register("split", [("usr/share/licenses/split", b"", "absent")], license="MIT")
    text = license_text(w, "split")
    assert "canonical MIT text" in text
    assert w.standard_license_metadata["split"]["missingLicenseIdentifiers"] == []


def test_alpine_verified_metadata_owner_notice_precedes_standard_policy(workspace, monkeypatch):
    import dataclasses

    from ingestion import standard_licenses

    w = workspace
    w.distro = "alpine"
    p = w.register("qt5-qtfeedback-doc", [("usr/share/licenses/qt5-qtfeedback", b"", "qt5-base")])
    w.available[p.name] = dataclasses.replace(p, depends=("qt5-qtbase",))
    w.register(
        "qt5-qtbase",
        [("usr/share/licenses/qt5-base/LICENSE", b"Qt upstream notice", None)],
        acquired=False,
    )
    w.owners.execute("DELETE FROM owners")
    monkeypatch.setattr(
        standard_licenses, "load_texts", lambda _root: pytest.fail("verified notice must win")
    )
    assert standard_licenses.license_text(w, p.name) == "Qt upstream notice"
    assert "qt5-qtbase" in w.acquired
    assert p.name not in getattr(w, "standard_license_metadata", {})


def test_blocked_shared_text_cannot_be_replaced_by_canonical_copy(workspace):
    from ingestion.standard_licenses import license_text

    w = workspace
    w.distro = "arch"
    w.register("tool", [], license="MIT")
    w.register("licenses", [("usr/share/licenses/spdx/MIT.txt", b"", "/etc/passwd")])
    with pytest.raises(ValueError, match="leaves archive documentation roots"):
        license_text(w, "tool")


def test_publisher_records_standard_provenance_and_remaining_gaps_without_contract_change(
    tmp_path, monkeypatch
):
    import dataclasses
    import io

    from ingestion import debian_indexes, debian_publish, standard_licenses
    from ingestion.debian_pipeline import Workspace
    from tests.test_alpine_archives import fixture, mock_catalog

    archive, package, _, _ = fixture(tmp_path, notice=b"")
    package = dataclasses.replace(package, license="MIT OR LicenseRef-Private")
    pins = {
        "mirror": "https://dl-cdn.alpinelinux.org",
        "archiveSuffix": ".apk",
        "releaseSha256": "a" * 64,
        "acquisition": "alpine-apk-extraction",
    }
    mock_catalog(monkeypatch, package, pins)
    raw = archive.read_bytes()
    monkeypatch.setattr(debian_indexes, "urlopen", lambda *a, **kw: io.BytesIO(raw))
    monkeypatch.setattr(debian_publish, "_ingest_worker_count", lambda: 1)
    monkeypatch.setattr(
        standard_licenses,
        "load_texts",
        lambda _root: {"license": {"MIT": "canonical MIT text"}, "exception": {}},
    )
    calls = []

    class Client:
        def post(self, path, payload):
            calls.append((path, payload))
            return {"inserted": len(payload.get("pages", [])), "skipped": 0}

    w = Workspace(tmp_path / "workspace", distro="alpine")
    try:
        w.acquire()
        result = debian_publish.publish_workspace(
            w, Client(), activate=False, dataset_stage="staging", git_sha="test", sample=True
        )
        assert result.succeeded > 0
        manifest = next(
            payload["packageManifest"] for path, payload in calls if path == "/ingest/release"
        )
        entry = manifest["packages"][0]
        assert entry["standardLicenseIdentifiers"] == ["MIT"]
        assert entry["spdxLicenseIdentifiers"] == ["MIT"]
        assert entry["missingLicenseIdentifiers"] == ["LicenseRef-Private"]
        assert entry["unmatchedLicenseIdentifiers"] == ["LicenseRef-Private"]
        assert manifest["standardLicenseTextSource"]["release"] == "v3.29.0"
        assert len(manifest["standardLicenseTextSource"]["legacyMappingsSha256"]) == 64
        declaration = next(
            payload["packages"][0] for path, payload in calls if path == "/ingest/license-packages"
        )
        assert declaration == {"name": "fixture", "version": "1-r0", "hasLicenseText": True}
        text = next(
            payload["licenses"][0]["licenseText"]
            for path, payload in calls
            if path == "/ingest/licenses"
        )
        assert "Standard text for the declared license MIT" in text
        assert (
            "Missing license identifiers after shared and SPDX sources: LicenseRef-Private" in text
        )
    finally:
        w.store.db.close()
        w.owners.close()
