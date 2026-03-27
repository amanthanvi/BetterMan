from __future__ import annotations

from typing import Literal

from app.core.errors import APIError

Distro = Literal["debian", "ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"]

DISTRO_ORDER: tuple[Distro, ...] = (
    "debian",
    "ubuntu",
    "fedora",
    "arch",
    "alpine",
    "freebsd",
    "macos",
)

DISTRO_ORDER_INDEX: dict[str, int] = {distro: idx for idx, distro in enumerate(DISTRO_ORDER)}

SUPPORTED_DISTROS: set[str] = set(DISTRO_ORDER)


def normalize_distro(value: str | None) -> Distro:
    if not value:
        return "debian"
    distro = value.strip().lower()
    if distro in SUPPORTED_DISTROS:
        return distro  # type: ignore[return-value]
    raise APIError(status_code=400, code="INVALID_DISTRO", message="Invalid distro")
