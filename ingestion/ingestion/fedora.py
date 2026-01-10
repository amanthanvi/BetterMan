from __future__ import annotations

import subprocess
from pathlib import Path


def is_fedora_like() -> bool:
    return Path("/etc/fedora-release").exists() or Path("/etc/redhat-release").exists()


def dnf_install(packages: list[str]) -> None:
    # Fedora container base images commonly set tsflags=nodocs, which strips man pages.
    # Clearing tsflags on `dnf install` isn't enough for preinstalled packages (dnf won't reinstall
    # them), so we also `dnf reinstall` anything already present to backfill docs/man pages.
    installed = [
        pkg
        for pkg in packages
        if subprocess.run(
            ["rpm", "-q", pkg],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode
        == 0
    ]

    subprocess.run(["dnf", "-y", "-q", "install", "--setopt=tsflags=", *packages], check=True)
    if installed:
        subprocess.run(
            ["dnf", "-y", "-q", "reinstall", "--setopt=tsflags=", *installed],
            check=True,
        )


def rpm_arch() -> str:
    return subprocess.check_output(["rpm", "--eval", "%{_arch}"], text=True).strip()


def rpm_packages() -> dict[str, str]:
    out = subprocess.check_output(
        ["rpm", "-qa", "--qf", "%{NAME}\t%{VERSION}-%{RELEASE}\n"],
        text=True,
    )
    packages: dict[str, str] = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        name, version = line.split("\t", 1)
        packages[name] = version
    return packages


def mandoc_pkg_version(packages: dict[str, str]) -> str | None:
    return packages.get("mandoc")


def build_manpath_to_package(paths: list[Path]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    to_query = [str(p) for p in paths if str(p).startswith("/usr/share/man/")]
    if not to_query:
        return mapping

    chunk_size = 200
    for i in range(0, len(to_query), chunk_size):
        chunk = to_query[i : i + chunk_size]
        proc = subprocess.run(
            ["rpm", "-qf", "--qf", "%{NAME}\n", *chunk],
            check=False,
            text=True,
            capture_output=True,
        )
        lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
        if len(lines) != len(chunk):
            continue
        for path, pkg in zip(chunk, lines, strict=False):
            mapping[path] = pkg

    return mapping
