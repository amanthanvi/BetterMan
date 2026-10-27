from __future__ import annotations

from ingestion import arch


def test_ensure_pacman_extracts_man_pages_removes_man_pattern(monkeypatch, tmp_path) -> None:
    conf = tmp_path / "pacman.conf"
    conf.write_text(
        "\n".join(
            [
                "NoExtract = usr/share/doc/* usr/share/man/* usr/share/info/*",
                "CacheDir = /var/cache/pacman/pkg",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(arch, "_PACMAN_CONF_PATH", conf)

    arch._ensure_pacman_extracts_man_pages()

    assert conf.read_text(encoding="utf-8") == (
        "NoExtract = usr/share/doc/* usr/share/info/*\nCacheDir = /var/cache/pacman/pkg\n"
    )


def test_ensure_pacman_extracts_man_pages_drops_noextract_when_only_man(
    monkeypatch, tmp_path
) -> None:
    conf = tmp_path / "pacman.conf"
    conf.write_text(
        "\n".join(
            [
                "NoExtract = usr/share/man/*",
                "CacheDir = /var/cache/pacman/pkg",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(arch, "_PACMAN_CONF_PATH", conf)

    arch._ensure_pacman_extracts_man_pages()

    assert conf.read_text(encoding="utf-8") == "CacheDir = /var/cache/pacman/pkg\n"


def test_pacman_reinstalls_preinstalled_packages_after_enabling_manpages(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(arch, "_ensure_pacman_extracts_man_pages", lambda: calls.append("config"))
    monkeypatch.setattr(arch.subprocess, "run", lambda cmd, **_kwargs: calls.append(cmd))
    arch.pacman_install(["tar", "bash"])
    assert calls == ["config", ["pacman", "-Syu", "--noconfirm", "tar", "bash"]]


def test_pacman_license_ids_read_all_declared_licenses(monkeypatch, tmp_path) -> None:
    pkg = tmp_path / "tar-1.35"
    pkg.mkdir()
    (pkg / "desc").write_text("%NAME%\ntar\n\n%LICENSE%\nGPL-3.0-or-later\nMIT\n\n")
    monkeypatch.setattr(arch, "_PACMAN_LOCAL_DIR", tmp_path)
    assert arch.package_license_ids() == {"tar": "GPL-3.0-or-later\nMIT"}
