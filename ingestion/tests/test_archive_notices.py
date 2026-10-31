"""License collection follows verified archive directories and fails closed."""

import json
import sqlite3
from pathlib import Path

import pytest

from ingestion import alpine_archives, arch_archives, fedora_archives
from ingestion.debian_archives import ArchiveStore, ExtractedQuota, MissingSource
from ingestion.debian_pipeline import Workspace
from tests.test_fedora_archives import payload


@pytest.fixture
def notice_workspace(tmp_path):
    workspace = object.__new__(Workspace)
    workspace.distro = "fedora"
    workspace.pins = {}
    workspace.store = ArchiveStore(tmp_path)
    workspace.owners = sqlite3.connect(":memory:")
    workspace.owners.execute("CREATE TABLE owners(path TEXT,pkg TEXT,PRIMARY KEY(path,pkg))")
    workspace.available = {}
    workspace.acquired = set()
    workspace.downloads = []
    archives = {}

    def register(name, members, *, source=None, license="MIT", acquired=True):
        package = fedora_archives.ArchivePackage(
            name,
            "1",
            f"Packages/{name}.rpm",
            "a" * 64,
            1,
            license=license,
            source=source or name,
        )
        workspace.available[name] = package
        archives[name] = members
        workspace.owners.executemany(
            "INSERT INTO owners VALUES (?,?)", [(path, name) for path, _, _ in members]
        )
        if acquired:
            acquire([package])
        return package

    def acquire(packages, **_kwargs):
        for package in packages:
            workspace.downloads.append(package.name)
            workspace.store.add(
                package,
                fedora_archives.extract_payload(
                    payload(archives[package.name]),
                    package,
                    tmp_path,
                    quota=ExtractedQuota(tmp_path / "files"),
                ),
            )
            workspace.acquired.add(package.name)

    workspace.acquire = acquire
    workspace.register = register
    yield workspace
    workspace.store.db.close()
    workspace.owners.close()


def test_license_directory_link_acquires_target_owner_and_reads_all_notices(notice_workspace):
    w = notice_workspace
    w.register("split", [("usr/share/licenses/split", b"", "base")])
    w.register(
        "base",
        [
            ("usr/share/licenses/base/COPYING", b"first license", None),
            ("usr/share/licenses/base/nested/NOTICE", b"second license", None),
        ],
        acquired=False,
    )
    assert fedora_archives.copyright_text(w, "split") == "first license\n\nsecond license"
    assert w.downloads == ["split", "base"]


def test_nested_license_directory_links_are_followed_as_store_data(notice_workspace):
    w = notice_workspace
    w.register("split", [("usr/share/licenses/split", b"", "middle")])
    w.register("middle", [("usr/share/licenses/middle", b"", "base")], acquired=False)
    w.register(
        "base",
        [
            ("usr/share/licenses/base/subdir", b"", "../other"),
            ("usr/share/licenses/other/LICENSE", b"full license", None),
        ],
        acquired=False,
    )
    assert fedora_archives.copyright_text(w, "split") == "full license"
    assert not any(p.is_symlink() for p in w.store.root.rglob("*"))


def test_arch_missing_split_license_directory_uses_verified_spdx_fallback(notice_workspace):
    w = notice_workspace
    w.distro = "arch"
    w.register("fuse2fs", [("usr/share/licenses/fuse2fs", b"", "e2fsprogs")], source="e2fsprogs")
    w.register("e2fsprogs", [], source="e2fsprogs", acquired=False)
    w.register(
        "licenses", [("usr/share/licenses/spdx/MIT.txt", b"MIT license", None)], acquired=False
    )
    assert arch_archives.copyright_text(w, "fuse2fs") == "MIT license"
    assert "licenses" in w.acquired


def test_dnsconfd_exact_pinned_repair_reads_the_rpm_dist_info_notice(notice_workspace):
    w = notice_workspace
    w.pins = json.loads((Path(__file__).parents[1] / "data/fedora-44.json").read_text())
    w.register(
        "dnsconfd",
        [
            ("usr/share/licenses/dnsconfd/LICENSE", b"", "./distribution/LICENSE"),
            (
                "usr/lib/python3.14/site-packages/dnsconfd-1.7.5.dist-info/licenses/LICENSE",
                b"MIT notice",
                None,
            ),
        ],
    )
    assert fedora_archives.copyright_text(w, "dnsconfd") == "MIT notice"


@pytest.mark.parametrize("distro", ["fedora", "arch", "alpine"])
@pytest.mark.parametrize("readable", [False, True])
def test_missing_notice_file_is_not_hidden_by_other_notices_or_spdx(
    notice_workspace, distro, readable
):
    w = notice_workspace
    w.distro = distro
    members = [("usr/share/licenses/tool/LICENSE", b"", "missing/LICENSE")]
    if readable:
        members.insert(0, ("usr/share/licenses/tool/NOTICE", b"other notice", None))
    w.register("tool", members)
    w.register("licenses", [("usr/share/licenses/spdx/MIT.txt", b"MIT license", None)])
    collector = {
        "arch": arch_archives.copyright_text,
        "alpine": alpine_archives.copyright_text,
        "fedora": fedora_archives.copyright_text,
    }[distro]
    with pytest.raises(MissingSource, match="missing/LICENSE"):
        collector(w, "tool")


def test_blocked_notice_link_is_not_ignored_beside_readable_notice(notice_workspace):
    w = notice_workspace
    w.register(
        "tool",
        [
            ("usr/share/licenses/tool/NOTICE", b"other notice", None),
            ("usr/share/licenses/tool/LICENSE", b"", "../../../../../etc/passwd"),
        ],
    )
    with pytest.raises(ValueError, match="leaves archive documentation roots"):
        fedora_archives.copyright_text(w, "tool")


def test_arch_missing_directory_without_spdx_text_fails_closed(notice_workspace):
    w = notice_workspace
    w.distro = "arch"
    w.register("tool", [("usr/share/licenses/tool", b"", "missing")], license="LicenseRef-private")
    w.register("licenses", [("usr/share/licenses/spdx/MIT.txt", b"MIT license", None)])
    with pytest.raises((MissingSource, RuntimeError)):
        arch_archives.copyright_text(w, "tool")


def test_directory_notice_cycle_fails_closed(notice_workspace):
    w = notice_workspace
    w.register(
        "tool",
        [
            ("usr/share/licenses/tool", b"", "base"),
            ("usr/share/licenses/base/recursive", b"", "../tool"),
        ],
    )
    with pytest.raises(ValueError, match="cycle"):
        fedora_archives.copyright_text(w, "tool")


def test_unreadable_stored_notice_is_not_hidden_by_readable_notice(notice_workspace):
    w = notice_workspace
    w.register(
        "tool",
        [
            ("usr/share/licenses/tool/NOTICE", b"other notice", None),
            ("usr/share/licenses/tool/LICENSE", b"full license", None),
        ],
    )
    stored = w.store.db.execute(
        "SELECT file FROM entries WHERE pkg='tool' AND path='usr/share/licenses/tool/LICENSE'"
    ).fetchone()[0]
    Path(stored).unlink()
    with pytest.raises(FileNotFoundError):
        fedora_archives.copyright_text(w, "tool")


def test_arch_directory_fallback_preserves_other_package_notices(notice_workspace):
    w = notice_workspace
    w.distro = "arch"
    w.register(
        "tool",
        [
            ("usr/share/licenses/tool", b"", "missing"),
            ("usr/share/doc/tool/NOTICE", b"attribution", None),
        ],
    )
    w.register("licenses", [("usr/share/licenses/spdx/MIT.txt", b"MIT license", None)])
    text = arch_archives.copyright_text(w, "tool")
    assert "attribution" in text and "MIT license" in text


def test_fedora_missing_directory_is_not_hidden_by_readable_notice(notice_workspace):
    w = notice_workspace
    w.register(
        "tool",
        [
            ("usr/share/licenses/tool", b"", "missing"),
            ("usr/share/doc/tool/NOTICE", b"attribution", None),
        ],
    )
    with pytest.raises(MissingSource):
        fedora_archives.copyright_text(w, "tool")


def test_arch_legacy_gnu_names_use_canonical_versions_without_guessing(notice_workspace):
    w = notice_workspace
    w.distro = "arch"
    w.register(
        "fuse2fs",
        [("usr/share/licenses/fuse2fs", b"", "e2fsprogs")],
        license="GPL AND LGPL AND MIT",
    )
    w.register(
        "licenses",
        [
            ("usr/share/licenses/spdx/GPL-2.0-only.txt", b"GPL version 2", None),
            ("usr/share/licenses/spdx/GPL-3.0-or-later.txt", b"GPL version 3 or later", None),
            ("usr/share/licenses/spdx/LGPL-2.1-only.txt", b"LGPL version 2.1", None),
            ("usr/share/licenses/spdx/GPL-CC-1.0.txt", b"unrelated cooperation commitment", None),
        ],
    )
    text = arch_archives.copyright_text(w, "fuse2fs")
    assert "GPL version 2" in text
    assert "GPL version 3 or later" in text
    assert "LGPL version 2.1" in text
    assert "cooperation commitment" not in text


def test_notice_in_named_license_directory_is_retained_and_resolved(notice_workspace):
    w = notice_workspace
    w.register(
        "systemd",
        [
            ("usr/share/licenses/systemd/MIT-0.txt", b"", "../../doc/systemd/LICENSES/MIT-0.txt"),
            ("usr/share/doc/systemd/LICENSES/MIT-0.txt", b"MIT zero notice", None),
        ],
    )
    assert fedora_archives.copyright_text(w, "systemd") == "MIT zero notice"


@pytest.mark.parametrize(
    "target",
    [
        "usr/share/texlive/licenses/gpl.txt",
        "usr/share/kvirc/5.2/license/COPYING",
        "usr/include/llvm/Support/LICENSE.TXT",
    ],
)
def test_notice_targets_in_archive_license_roots_acquire_the_owner(notice_workspace, target):
    w = notice_workspace
    w.register("tool", [("usr/share/licenses/tool/LICENSE", b"", "/" + target)])
    w.register("shared", [(target, b"shared license", None)], acquired=False)
    assert fedora_archives.copyright_text(w, "tool") == "shared license"
    assert w.downloads == ["tool", "shared"]


def test_manual_named_license_is_not_a_package_notice():
    assert not fedora_archives.notice_path("usr/share/man/man1/license.1")


def test_arch_versioned_legacy_gnu_alias_does_not_select_other_versions(notice_workspace):
    w = notice_workspace
    w.distro = "arch"
    w.register("tool", [], license="GPL3")
    w.register(
        "licenses",
        [
            ("usr/share/licenses/spdx/GPL-2.0-only.txt", b"GPL version 2", None),
            ("usr/share/licenses/spdx/GPL-3.0-or-later.txt", b"GPL version 3", None),
        ],
    )
    assert arch_archives.copyright_text(w, "tool") == "GPL version 3"


def test_directory_notice_children_include_non_bmp_filenames(notice_workspace):
    w = notice_workspace
    w.register("tool", [("usr/share/licenses/tool", b"", "base")])
    w.register(
        "base", [("usr/share/licenses/base/\U0001f4dc.txt", b"full notice", None)], acquired=False
    )
    assert fedora_archives.copyright_text(w, "tool") == "full notice"


@pytest.mark.parametrize("owner_notice", [False, True])
def test_alpine_qt_directory_alias_uses_metadata_owner_or_verified_spdx(
    notice_workspace, owner_notice
):
    import dataclasses

    from ingestion import alpine_archives

    w = notice_workspace
    w.distro = "alpine"
    w.register(
        "qt5-qtfeedback-doc",
        [("usr/share/licenses/qt5-qtfeedback", b"", "qt5-base")],
        source="qt5-qtfeedback",
        license="LGPL-2.1-only AND Qt-GPL-exception-1.0",
    )
    runtime = w.register("qt5-qtfeedback", [], acquired=False)
    w.available[runtime.name] = dataclasses.replace(runtime, depends=("so:libQt5Core.so.5",))
    base = w.register(
        "qt5-qtbase",
        [("usr/share/licenses/qt5-base/LICENSE", b"Qt upstream notice", None)]
        if owner_notice
        else [],
        acquired=False,
    )
    w.available[base.name] = dataclasses.replace(base, provides=("so:libQt5Core.so.5",))
    w.register(
        "spdx-licenses-text",
        [
            ("usr/share/spdx/text/LGPL-2.1-only.txt", b"LGPL 2.1 text", None),
            ("usr/share/spdx/text/Qt-GPL-exception-1.0.txt", b"Qt exception text", None),
        ],
        acquired=False,
    )
    # APKINDEX contains no paths; only acquisition can establish ownership.
    w.owners.execute("DELETE FROM owners")
    text = alpine_archives.copyright_text(w, "qt5-qtfeedback-doc")
    if owner_notice:
        assert text == "Qt upstream notice"
        assert "spdx-licenses-text" not in w.acquired
    else:
        assert "LGPL 2.1 text" in text and "Qt exception text" in text
    assert "qt5-qtbase" in w.acquired
    assert "qt5-base" not in w.available


def test_alpine_directory_owner_can_be_a_direct_dependency(notice_workspace):
    import dataclasses

    from ingestion import alpine_archives

    w = notice_workspace
    w.distro = "alpine"
    package = w.register("tool-doc", [("usr/share/licenses/tool", b"", "shared")])
    w.available[package.name] = dataclasses.replace(package, depends=("notice-provider",))
    w.register(
        "notice-provider",
        [("usr/share/licenses/shared/LICENSE", b"full notice", None)],
        acquired=False,
    )
    w.owners.execute("DELETE FROM owners")
    assert alpine_archives.copyright_text(w, "tool-doc") == "full notice"


def test_alpine_directory_owner_is_not_guessed_from_name_similarity(notice_workspace):
    from ingestion import alpine_archives

    w = notice_workspace
    w.distro = "alpine"
    w.register("tool-doc", [("usr/share/licenses/tool", b"", "qt5-base")])
    w.register(
        "qt5-qtbase", [("usr/share/licenses/qt5-base/LICENSE", b"unrelated", None)], acquired=False
    )
    w.owners.execute("DELETE FROM owners")
    with pytest.raises(MissingSource):
        alpine_archives.copyright_text(w, "tool-doc")
    assert "qt5-qtbase" not in w.acquired


def test_alpine_missing_directory_with_no_matching_spdx_fails_closed(notice_workspace):
    w = notice_workspace
    w.distro = "alpine"
    w.register(
        "tool-doc", [("usr/share/licenses/tool", b"", "absent")], license="LicenseRef-private"
    )
    w.register("spdx-licenses-text", [("usr/share/spdx/text/MIT.txt", b"MIT text", None)])
    with pytest.raises(MissingSource):
        alpine_archives.copyright_text(w, "tool-doc")


def test_alpine_directory_owner_with_blocked_notice_cannot_use_spdx(notice_workspace):
    import dataclasses

    w = notice_workspace
    w.distro = "alpine"
    p = w.register("tool-doc", [("usr/share/licenses/tool", b"", "shared")])
    w.available[p.name] = dataclasses.replace(p, depends=("provider",))
    w.register(
        "provider", [("usr/share/licenses/shared/LICENSE", b"", "/etc/passwd")], acquired=False
    )
    w.register("spdx-licenses-text", [("usr/share/spdx/text/MIT.txt", b"MIT text", None)])
    w.owners.execute("DELETE FROM owners")
    with pytest.raises(ValueError, match="leaves archive documentation roots"):
        alpine_archives.copyright_text(w, "tool-doc")


def test_alpine_blocked_matching_spdx_text_is_not_skipped(notice_workspace):
    w = notice_workspace
    w.distro = "alpine"
    w.register(
        "tool-doc", [("usr/share/licenses/tool", b"", "absent")], license="MIT AND BSD-3-Clause"
    )
    w.register(
        "spdx-licenses-text",
        [
            ("usr/share/spdx/text/BSD-3-Clause.txt", b"BSD text", None),
            ("usr/share/spdx/text/MIT.txt", b"", "/etc/passwd"),
        ],
    )
    with pytest.raises(ValueError, match="leaves archive documentation roots"):
        alpine_archives.copyright_text(w, "tool-doc")


def test_alpine_metadata_owner_directory_alias_can_reach_spdx_fallback(notice_workspace):
    import dataclasses

    w = notice_workspace
    w.distro = "alpine"
    p = w.register("tool-doc", [("usr/share/licenses/tool", b"", "shared")])
    w.available[p.name] = dataclasses.replace(p, depends=("provider",))
    w.register("provider", [("usr/share/licenses/shared", b"", "absent")], acquired=False)
    w.register("spdx-licenses-text", [("usr/share/spdx/text/MIT.txt", b"MIT text", None)])
    w.owners.execute("DELETE FROM owners")
    assert alpine_archives.copyright_text(w, "tool-doc") == "MIT text"


@pytest.mark.parametrize(
    "path",
    [
        "usr/lib/python3.14/site-packages/go_vendor_tools/license_detection/detector.py",
        "usr/lib/python3.14/site-packages/go_vendor_tools/license_detection/__pycache__/detector.cpython-314.pyc",
        "usr/lib/python3.14/site-packages/go_vendor_tools/config/licenses.py",
        "usr/lib/python3.14/site-packages/hatchling/licenses/__init__.py",
        "usr/lib/python3.14/site-packages/hatchling/licenses/data.txt",
        "usr/lib/python3.14/site-packages/reuse/resources/licenses.json",
        "usr/lib/python3.14/site-packages/pip/_internal/commands/license.py",
        "usr/share/licenses/tool/LICENSE.pyc",
        "usr/share/doc/tool/licenses/plugin.so.1",
    ],
)
def test_notice_predicate_rejects_code_and_module_license_directories(path):
    assert not fedora_archives.notice_path(path)


def test_code_is_not_published_ahead_of_real_mit_notice(notice_workspace):
    w = notice_workspace
    w.register(
        "go-vendor-tools",
        [
            (
                "usr/lib/python3.14/site-packages/go_vendor_tools/license_detection/__init__.py",
                b"def detect(): pass",
                None,
            ),
            (
                "usr/lib/python3.14/site-packages/go_vendor_tools/license_detection/__pycache__/detect.pyc",
                b"\xa7\r\r\nbytecode",
                None,
            ),
            ("usr/share/licenses/go-vendor-tools/LICENSE", b"real MIT notice", None),
        ],
    )
    assert fedora_archives.copyright_text(w, "go-vendor-tools") == "real MIT notice"


def test_arch_partial_spdx_records_unmatched_declared_identifiers(notice_workspace):
    w = notice_workspace
    w.distro = "arch"
    w.register(
        "fuse2fs",
        [("usr/share/licenses/fuse2fs", b"", "e2fsprogs")],
        license="GPL AND LGPL AND MIT",
    )
    w.register(
        "licenses",
        [
            ("usr/share/licenses/spdx/GPL-2.0-only.txt", b"GPL text", None),
            ("usr/share/licenses/spdx/LGPL-2.1-only.txt", b"LGPL text", None),
        ],
    )
    assert arch_archives.copyright_text(w, "fuse2fs") == "GPL text\n\nLGPL text"
    assert w.unmatched_license_identifiers["fuse2fs"] == ["MIT"]


def test_arch_spdx_deduplicates_identical_version_texts(notice_workspace):
    w = notice_workspace
    w.distro = "arch"
    w.register("tool", [], license="GPL")
    w.register(
        "licenses",
        [
            ("usr/share/licenses/spdx/GPL-2.0-only.txt", b"same GPL text", None),
            ("usr/share/licenses/spdx/GPL-2.0-or-later.txt", b"same GPL text", None),
        ],
    )
    assert arch_archives.copyright_text(w, "tool") == "same GPL text"


def test_directory_notice_fanout_has_a_cumulative_visit_limit(notice_workspace, monkeypatch):
    w = notice_workspace
    members = [("usr/share/licenses/tool", b"", "level0")]
    for level in range(5):
        members.extend(
            (f"usr/share/licenses/level{level}/alias{i}", b"", f"../level{level + 1}")
            for i in range(4)
        )
    members.append(("usr/share/licenses/level5/LICENSE", b"full notice", None))
    w.register("tool", members)
    monkeypatch.setattr(fedora_archives, "MAX_NOTICE_VISITS", 32, raising=False)
    resolve = w.resolve
    calls = []

    def bounded(*args, **kwargs):
        calls.append(args)
        assert len(calls) <= 100, "unbounded directory fan-out"
        return resolve(*args, **kwargs)

    monkeypatch.setattr(w, "resolve", bounded)
    with pytest.raises(ValueError, match="visit limit"):
        fedora_archives.copyright_text(w, "tool")
    assert len(calls) <= 32


@pytest.mark.parametrize(
    "path",
    [
        "usr/share/licenses/tool/LICENSE.pdf.gz",
        "usr/share/doc/tool/licenses/generator.sh",
    ],
)
def test_notice_predicate_rejects_binary_documents_and_shell_code(path):
    assert not fedora_archives.notice_path(path)
