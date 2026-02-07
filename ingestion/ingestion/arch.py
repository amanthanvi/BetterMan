from __future__ import annotations

import subprocess
from pathlib import Path

_PACMAN_LOCAL_DIR = Path("/var/lib/pacman/local")


def pacman_install(packages: list[str]) -> None:
    subprocess.run(["pacman", "-Syu", "--noconfirm", "--needed", *packages], check=True)


def pacman_arch() -> str:
    return subprocess.check_output(["uname", "-m"], text=True).strip()


def pacman_packages() -> dict[str, str]:
    out = subprocess.check_output(["pacman", "-Q"], text=True)
    packages: dict[str, str] = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        name, version = line.split(maxsplit=1)
        packages[name.strip()] = version.strip()
    return packages


def mandoc_pkg_version(packages: dict[str, str]) -> str | None:
    return packages.get("mandoc")


def build_manpath_to_package() -> dict[str, str]:
    mapping: dict[str, str] = {}
    if not _PACMAN_LOCAL_DIR.exists():
        return mapping

    for pkg_dir in _PACMAN_LOCAL_DIR.iterdir():
        if not pkg_dir.is_dir():
            continue

        name = _read_pacman_desc_field(pkg_dir / "desc", field="NAME")
        if not name:
            continue

        files = _read_pacman_files(pkg_dir / "files")
        for rel in files:
            if not rel.startswith("usr/share/man/"):
                continue
            mapping.setdefault(f"/{rel}", name)

    return mapping


def _read_pacman_desc_field(path: Path, *, field: str) -> str | None:
    if not path.exists():
        return None
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return None

    marker = f"%{field}%"
    lines = content.splitlines()
    for i, line in enumerate(lines):
        if line.strip() != marker:
            continue
        if i + 1 < len(lines):
            value = lines[i + 1].strip()
            return value or None
    return None


def _read_pacman_files(path: Path) -> list[str]:
    if not path.exists():
        return []
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []

    out: list[str] = []
    in_files = False
    for raw in content.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("%") and line.endswith("%"):
            in_files = line == "%FILES%"
            continue
        if not in_files:
            continue
        out.append(line)
    return out
