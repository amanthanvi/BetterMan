from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

_DPKG_INFO_DIR = Path("/var/lib/dpkg/info")


@dataclass(frozen=True)
class DebianProvenance:
    image_ref: str
    image_digest: str
    locale: str
    arch: str
    packages: dict[str, str]
    requested_packages: list[str]
    mandoc_version: str | None


def is_debian_like() -> bool:
    return Path("/etc/debian_version").exists() and _DPKG_INFO_DIR.exists()


def apt_install(packages: list[str]) -> None:
    env = os.environ | {"DEBIAN_FRONTEND": "noninteractive"}
    subprocess.run(["apt-get", "update", "-qq"], check=True, env=env)
    subprocess.run(
        ["apt-get", "install", "-y", "-qq", "--no-install-recommends", *packages],
        check=True,
        env=env,
    )


def dpkg_arch() -> str:
    return subprocess.check_output(["dpkg", "--print-architecture"], text=True).strip()


def dpkg_packages() -> dict[str, str]:
    out = subprocess.check_output(["dpkg-query", "-W", "-f", "${Package}\t${Version}\n"], text=True)
    packages: dict[str, str] = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        name, version = line.split("\t", 1)
        packages[name] = version
    return packages


def mandoc_pkg_version(packages: dict[str, str]) -> str | None:
    # Prefer the package db over executing mandoc (not all mandoc builds expose a version flag).
    for name in ("mandoc", "mandoc-base"):
        if name in packages:
            return packages[name]
    return None


def build_manpath_to_package() -> dict[str, str]:
    mapping: dict[str, str] = {}
    if not _DPKG_INFO_DIR.exists():
        return mapping

    for list_file in _DPKG_INFO_DIR.glob("*.list"):
        pkg = list_file.name.removesuffix(".list")
        pkg_base = pkg.split(":", 1)[0]
        try:
            content = list_file.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for line in content.splitlines():
            path = line.strip()
            if not path.startswith("/usr/share/man/"):
                continue
            mapping.setdefault(path, pkg_base)

    return mapping
