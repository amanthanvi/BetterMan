from __future__ import annotations

from pathlib import Path as RealPath
from types import SimpleNamespace

import ingestion.debian as debian


def test_dpkg_packages_parses_tabbed_output(monkeypatch) -> None:
    def fake_check_output(cmd: list[str], text: bool = False) -> str:
        assert cmd[:3] == ["dpkg-query", "-W", "-f"]
        assert text is True
        return "bash\t5.2.0\n\ncoreutils\t9.1\n"

    monkeypatch.setattr(debian.subprocess, "check_output", fake_check_output)
    assert debian.dpkg_packages() == {"bash": "5.2.0", "coreutils": "9.1"}


def test_mandoc_pkg_version_prefers_mandoc() -> None:
    assert debian.mandoc_pkg_version({"mandoc": "1.2.3"}) == "1.2.3"
    assert debian.mandoc_pkg_version({"mandoc-base": "9.9.9"}) == "9.9.9"
    assert debian.mandoc_pkg_version({}) is None


def test_build_manpath_to_package_reads_dpkg_lists(tmp_path, monkeypatch) -> None:
    info = tmp_path / "info"
    info.mkdir()
    (info / "foo:amd64.list").write_text(
        "/usr/share/man/man1/foo.1.gz\n/usr/share/doc/foo/readme\n",
        encoding="utf-8",
    )
    (info / "bar.list").write_text(
        "/usr/share/man/man5/bar.5\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(debian, "_DPKG_INFO_DIR", info)

    mapping = debian.build_manpath_to_package()
    assert mapping["/usr/share/man/man1/foo.1.gz"] == "foo"
    assert mapping["/usr/share/man/man5/bar.5"] == "bar"


def test_installed_packages_filters_non_installed(monkeypatch) -> None:
    def fake_run(cmd: list[str], **_kwargs: object):
        pkg = cmd[-1]
        if pkg == "bash":
            return SimpleNamespace(returncode=0, stdout="install ok installed")
        if pkg == "curl":
            return SimpleNamespace(returncode=0, stdout="deinstall ok config-files")
        return SimpleNamespace(returncode=1, stdout="")

    monkeypatch.setattr(debian.subprocess, "run", fake_run)
    assert debian._installed_packages(["bash", "curl", "missing"], env={}) == ["bash"]


def test_apt_install_restores_preinstalled_mount_owner(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: object):
        calls.append(cmd)
        if cmd[0] == "dpkg-query":
            return SimpleNamespace(
                returncode=0, stdout="install ok installed" if cmd[-1] == "mount" else ""
            )
        assert kwargs["check"] is True
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(debian, "_enable_manpages_if_excluded", lambda: True)
    monkeypatch.setattr(debian.subprocess, "run", fake_run)
    requested = ["util-linux"]
    debian.apt_install(requested)

    assert requested == ["util-linux"]
    installs = [cmd for cmd in calls if cmd[:2] == ["apt-get", "install"]]
    assert installs[0][-2:] == ["util-linux", "mount"]
    assert installs[1][-2:] == ["--reinstall", "mount"]


def test_apt_install_does_not_reinstall_without_excludes(monkeypatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(debian, "_enable_manpages_if_excluded", lambda: False)
    monkeypatch.setattr(debian.subprocess, "run", lambda cmd, **_kwargs: calls.append(cmd))
    debian.apt_install(["util-linux", "mount"])
    assert len(calls) == 2
    assert calls[1][-2:] == ["util-linux", "mount"]
    assert "--reinstall" not in calls[1]


def test_enable_manpages_if_excluded_removes_man_excludes(tmp_path, monkeypatch) -> None:
    excludes = tmp_path / "excludes"
    excludes.write_text(
        "keep-this\npath-exclude=/usr/share/man/*\npath-exclude=/usr/share/doc/*\n",
        encoding="utf-8",
    )

    def fake_path(p: str):
        if p == "/etc/dpkg/dpkg.cfg.d/excludes":
            return excludes
        return RealPath(p)

    monkeypatch.setattr(debian, "Path", fake_path)

    assert debian._enable_manpages_if_excluded() is True
    assert "path-exclude=/usr/share/man/" not in excludes.read_text(encoding="utf-8")
