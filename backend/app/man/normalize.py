from __future__ import annotations

import re

from app.core.errors import APIError

_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._+\-]*$")


def normalize_name(name: str) -> str:
    return name.strip().lower()


def validate_name(name_norm: str) -> None:
    if not name_norm:
        raise APIError(status_code=400, code="INVALID_NAME", message="Name is required")
    if len(name_norm) > 200:
        raise APIError(status_code=400, code="INVALID_NAME", message="Name is too long")
    if not _NAME_RE.fullmatch(name_norm):
        raise APIError(
            status_code=400,
            code="INVALID_NAME",
            message="Name contains unsupported characters",
        )


def validate_section(section: str) -> None:
    if section not in {"1", "2", "3", "4", "5", "6", "7", "8", "9"}:
        raise APIError(status_code=400, code="INVALID_SECTION", message="Section must be 1-9")
