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

    assert any(cmd[:4] == ["dnf", "-y", "-q", "install"] for cmd in calls)
    assert any(cmd[:4] == ["dnf", "-y", "-q", "reinstall"] and "bash" in cmd for cmd in calls)
