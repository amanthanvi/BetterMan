from __future__ import annotations

import subprocess
from pathlib import Path


def dnf_install(packages: list[str]) -> None:
    # Fedora container base images set tsflags=nodocs, which strips man pages.
    # Clearing tsflags on `dnf install` isn't enough for preinstalled packages (dnf won't reinstall
    # them), so we also `dnf reinstall` anything already present to backfill docs/man pages.
    # The image is built from Koji's buildroot, so a preinstalled build (fedora:44 ships
    # curl-8.18.0-8 and tar-1.35-8) may not exist on the mirrors, and dnf5 refuses to
    # reinstall a version it cannot find. distro-sync moves those onto the published build
    # first; it is a no-op for packages already at the repo version.
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
    if not installed:
        return
    for command in ("distro-sync", "reinstall"):
        subprocess.run(["dnf", "-y", "-q", command, "--setopt=tsflags=", *installed], check=True)


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
            # rpm prints one line per owning package, so a file with several
            # owners (or a missing one, reported on stderr) shifts every later
            # line. Query this chunk one file at a time instead.
            for path in chunk:
                single = subprocess.run(
                    ["rpm", "-qf", "--qf", "%{NAME}\n", path],
                    check=False,
                    text=True,
                    capture_output=True,
                )
                owners = single.stdout.split()
                if single.returncode == 0 and owners:
                    mapping[path] = owners[0]
            continue
        for path, pkg in zip(chunk, lines, strict=True):
            # An unowned file prints "file ... is not owned by any package" on
            # stdout in its slot; package names never contain spaces.
            if " " not in pkg:
                mapping[path] = pkg

    return mapping
