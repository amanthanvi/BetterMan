from __future__ import annotations

from types import SimpleNamespace

import ingestion.fedora as fedora


def test_rpm_packages_parses_tabbed_output(monkeypatch) -> None:
    def fake_check_output(cmd: list[str], text: bool = False) -> str:
        assert cmd[:2] == ["rpm", "-qa"]
        assert text is True
        return "bash\t5.2-1\n\ncoreutils\t9.1-2\n"

    monkeypatch.setattr(fedora.subprocess, "check_output", fake_check_output)
    assert fedora.rpm_packages() == {"bash": "5.2-1", "coreutils": "9.1-2"}


def test_build_manpath_to_package_maps_rpm_owners(monkeypatch) -> None:
    def fake_run(cmd: list[str], **_kwargs: object):
        assert cmd[:3] == ["rpm", "-qf", "--qf"]
        # return one line per path in the chunk
        paths = cmd[4:]
        return SimpleNamespace(returncode=0, stdout="\n".join(f"pkg{i}" for i in range(len(paths))))

    monkeypatch.setattr(fedora.subprocess, "run", fake_run)

    mapping = fedora.build_manpath_to_package(
        paths=[
            "/usr/share/man/man1/ls.1",
            "/usr/share/man/man1/curl.1.gz",
            "/not/man/file",
        ]
    )
    assert mapping["/usr/share/man/man1/ls.1"] == "pkg0"
    assert mapping["/usr/share/man/man1/curl.1.gz"] == "pkg1"


def test_build_manpath_to_package_handles_multi_owner_and_unowned_files(monkeypatch) -> None:
    owners = {
        "/usr/share/man/man1/ls.1": ["coreutils"],
        "/usr/share/man/man1/shared.1": ["pkg-a", "pkg-b"],
        "/usr/share/man/man1/stray.1": [],
    }

    def fake_run(cmd: list[str], **_kwargs: object):
        lines = []
        for path in cmd[4:]:
            lines += owners[path] or [f"file {path} is not owned by any package"]
        returncode = 0 if all(owners[path] for path in cmd[4:]) else 1
        return SimpleNamespace(returncode=returncode, stdout="\n".join(lines) + "\n")

    monkeypatch.setattr(fedora.subprocess, "run", fake_run)

    # A second owner adds a line, so the chunk falls back to per-file queries.
    assert fedora.build_manpath_to_package(paths=list(owners)) == {
        "/usr/share/man/man1/ls.1": "coreutils",
        "/usr/share/man/man1/shared.1": "pkg-a",
    }
    # Line counts match, but the unowned file's notice is not a package name.
    del owners["/usr/share/man/man1/shared.1"]
    assert fedora.build_manpath_to_package(paths=list(owners)) == {
        "/usr/share/man/man1/ls.1": "coreutils",
    }


def test_dnf_install_reinstalls_preinstalled(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["rpm", "-q"]:
            pkg = cmd[2]
            return SimpleNamespace(returncode=0 if pkg == "bash" else 1)
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(fedora.subprocess, "run", fake_run)

    fedora.dnf_install(["bash", "curl"])

    dnf = [cmd for cmd in calls if cmd[0] == "dnf"]
    assert [cmd[3] for cmd in dnf] == ["install", "distro-sync", "reinstall"]
    assert dnf[0][-2:] == ["bash", "curl"]
    # Only the preinstalled package is synced onto the mirror's build and reinstalled.
    assert dnf[1][-1:] == ["bash"]
    assert dnf[2][-1:] == ["bash"]
    assert all("--setopt=tsflags=" in cmd for cmd in dnf)


def test_dnf_install_skips_backfill_when_nothing_is_preinstalled(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **_kwargs: object):
        calls.append(cmd)
        return SimpleNamespace(returncode=1 if cmd[:2] == ["rpm", "-q"] else 0)

    monkeypatch.setattr(fedora.subprocess, "run", fake_run)

    fedora.dnf_install(["bash"])

    assert [cmd[3] for cmd in calls if cmd[0] == "dnf"] == ["install"]


def test_dnf_install_restores_preinstalled_split_manpage_owners(monkeypatch) -> None:
    calls: list[list[str]] = []
    owners = ["coreutils-common", "util-linux-core"]

    def fake_run(cmd: list[str], **kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["rpm", "-q"]:
            return SimpleNamespace(returncode=0 if cmd[-1] in owners else 1)
        assert kwargs["check"] is True
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(fedora.subprocess, "run", fake_run)
    requested = ["coreutils", "util-linux"]
    fedora.dnf_install(requested)

    assert requested == ["coreutils", "util-linux"]
    dnf = [cmd for cmd in calls if cmd[0] == "dnf"]
    assert dnf[0][-4:] == [*requested, *owners]
    assert [cmd[3] for cmd in dnf] == ["install", "distro-sync", "reinstall"]
    assert all(cmd[-2:] == owners for cmd in dnf[1:])
    assert all("--setopt=tsflags=" in cmd for cmd in dnf)
