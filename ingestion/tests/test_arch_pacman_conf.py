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
