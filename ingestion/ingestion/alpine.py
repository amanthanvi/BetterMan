from __future__ import annotations

import subprocess
from pathlib import Path

_APK_INSTALLED_DB = Path("/lib/apk/db/installed")


def apk_install(packages: list[str]) -> None:
    subprocess.run(["apk", "add", "--no-cache", *packages], check=True)


def apk_arch() -> str:
    return subprocess.check_output(["apk", "--print-arch"], text=True).strip()


def apk_packages() -> dict[str, str]:
    packages, _ = _parse_installed_db()
    return packages


def mandoc_pkg_version(packages: dict[str, str]) -> str | None:
    return packages.get("mandoc")


def build_manpath_to_package() -> dict[str, str]:
    _, mapping = _parse_installed_db()
    return mapping


def _parse_installed_db() -> tuple[dict[str, str], dict[str, str]]:
    packages: dict[str, str] = {}
    mapping: dict[str, str] = {}

    if not _APK_INSTALLED_DB.exists():
        return packages, mapping

    try:
        content = _APK_INSTALLED_DB.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return packages, mapping

    current_pkg: str | None = None
    current_ver: str | None = None
    current_dir: str | None = None

    def flush_pkg() -> None:
        nonlocal current_pkg, current_ver, current_dir
        if current_pkg and current_ver and current_pkg not in packages:
            packages[current_pkg] = current_ver
        current_pkg = None
        current_ver = None
        current_dir = None

    for raw in content.splitlines():
        line = raw.strip()
        if not line:
            flush_pkg()
            continue

        if line.startswith("P:"):
            current_pkg = line.removeprefix("P:").strip() or None
            continue
        if line.startswith("V:"):
            current_ver = line.removeprefix("V:").strip() or None
            continue

        if current_pkg is None:
            continue

        if line.startswith("F:"):
            current_dir = line.removeprefix("F:").strip().lstrip("/")
            continue

        if line.startswith("R:"):
            if not current_dir:
                continue
            name = line.removeprefix("R:").strip()
            if not name:
                continue
            rel = f"{current_dir}/{name}"
            if not rel.startswith("usr/share/man/"):
                continue
            mapping.setdefault(f"/{rel}", current_pkg)

    flush_pkg()
    return packages, mapping
