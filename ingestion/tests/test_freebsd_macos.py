from __future__ import annotations

from types import SimpleNamespace

import ingestion.freebsd as freebsd
import ingestion.macos as macos


def test_pkg_packages_parses_tabbed_output(monkeypatch) -> None:
    def fake_check_output(cmd: list[str], text: bool = False) -> str:
        assert cmd == ["pkg", "query", "%n\t%v"]
        assert text is True
        return "bash\t5.2.0\n\ncurl\t8.0\n"

    monkeypatch.setattr(freebsd.subprocess, "check_output", fake_check_output)
    assert freebsd.pkg_packages() == {"bash": "5.2.0", "curl": "8.0"}


def test_freebsd_arch_uses_uname(monkeypatch) -> None:
    def fake_check_output(cmd: list[str], text: bool = False) -> str:
        assert cmd == ["uname", "-m"]
        assert text is True
        return "amd64\n"

    monkeypatch.setattr(freebsd.subprocess, "check_output", fake_check_output)
    assert freebsd.freebsd_arch() == "amd64"


def test_pkg_install_noops_for_empty_packages(monkeypatch) -> None:
    def fake_run(_cmd: list[str], check: bool) -> SimpleNamespace:
        raise AssertionError("subprocess.run should not be called for empty packages")

    monkeypatch.setattr(freebsd.subprocess, "run", fake_run)
    freebsd.pkg_install([])


def test_pkg_install_updates_then_installs(monkeypatch) -> None:
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool) -> SimpleNamespace:
        assert check is True
        calls.append(cmd)
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(freebsd.subprocess, "run", fake_run)

    freebsd.pkg_install(["bash", "curl"])
    assert calls == [
        ["pkg", "update", "-f"],
        ["pkg", "install", "-y", "bash", "curl"],
    ]


def test_macos_arch_uses_uname(monkeypatch) -> None:
    def fake_check_output(cmd: list[str], text: bool = False) -> str:
        assert cmd == ["uname", "-m"]
        assert text is True
        return "arm64\n"

    monkeypatch.setattr(macos.subprocess, "check_output", fake_check_output)
    assert macos.macos_arch() == "arm64"


def test_macos_version_returns_none_on_failure(monkeypatch) -> None:
    def fake_check_output(_cmd: list[str], text: bool = False) -> str:
        raise RuntimeError("boom")

    monkeypatch.setattr(macos.subprocess, "check_output", fake_check_output)
    assert macos.macos_version() is None


def test_is_permissive_manpage_looks_for_license_markers() -> None:
    assert (
        macos.is_permissive_manpage(
            b"Permission is hereby granted, free of charge, to any person obtaining a copy"
        )
        is True
    )
    assert macos.is_permissive_manpage(b"This is an Apple proprietary man page.") is False
