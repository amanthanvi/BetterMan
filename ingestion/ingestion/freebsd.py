from __future__ import annotations

import subprocess


def pkg_install(packages: list[str]) -> None:
    if not packages:
        return
    subprocess.run(["pkg", "update", "-f"], check=True)
    subprocess.run(["pkg", "install", "-y", *packages], check=True)


def freebsd_arch() -> str:
    return subprocess.check_output(["uname", "-m"], text=True).strip()


def pkg_packages() -> dict[str, str]:
    out = subprocess.check_output(["pkg", "query", "%n\t%v"], text=True)
    packages: dict[str, str] = {}
    for line in out.splitlines():
        if not line.strip():
            continue
        name, version = line.split("\t", 1)
        packages[name.strip()] = version.strip()
    return packages
