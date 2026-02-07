from __future__ import annotations

from typing import Literal

from app.core.errors import APIError

Distro = Literal["debian", "ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"]

SUPPORTED_DISTROS: set[str] = {"debian", "ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"}


def normalize_distro(value: str | None) -> Distro:
    if not value:
        return "debian"
    distro = value.strip().lower()
    if distro in SUPPORTED_DISTROS:
        return distro  # type: ignore[return-value]
    raise APIError(status_code=400, code="INVALID_DISTRO", message="Invalid distro")
