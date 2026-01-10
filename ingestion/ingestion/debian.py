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


def _enable_manpages_if_excluded() -> bool:
    path = Path("/etc/dpkg/dpkg.cfg.d/excludes")
    if not path.exists():
        return False
    try:
        original = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False

    lines = original.splitlines(keepends=True)
    filtered = [
        line for line in lines if not line.strip().startswith("path-exclude=/usr/share/man/")
    ]
    if filtered == lines:
        return False

    try:
        path.write_text("".join(filtered), encoding="utf-8")
    except OSError:
        return False
    return True


def _installed_packages(packages: list[str], *, env: dict[str, str]) -> list[str]:
    installed: list[str] = []
    for pkg in packages:
        proc = subprocess.run(
            ["dpkg-query", "-W", "-f", "${Status}", pkg],
            check=False,
            env=env,
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            continue
        if "install ok installed" in proc.stdout:
            installed.append(pkg)
    return installed


def apt_install(packages: list[str]) -> None:
    env = os.environ | {"DEBIAN_FRONTEND": "noninteractive"}

    reinstall: list[str] = []
    if _enable_manpages_if_excluded():
        reinstall = _installed_packages(packages, env=env)

    subprocess.run(["apt-get", "update", "-qq"], check=True, env=env)
    subprocess.run(
        ["apt-get", "install", "-y", "-qq", "--no-install-recommends", *packages],
        check=True,
        env=env,
    )
    if reinstall:
        subprocess.run(
            [
                "apt-get",
                "install",
                "-y",
                "-qq",
                "--no-install-recommends",
                "--reinstall",
                *reinstall,
            ],
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
