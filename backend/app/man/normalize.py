from __future__ import annotations

import re

from app.core.errors import APIError

_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._+\-]*$")
_SECTION_RE = re.compile(r"^[1-9][a-z0-9]*$")


def normalize_name(name: str) -> str:
    return name.strip().lower()


def normalize_section(section: str) -> str:
    return section.strip().lower()


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
    section_norm = section.strip().lower()
    if not section_norm:
        raise APIError(status_code=400, code="INVALID_SECTION", message="Section is required")
    if len(section_norm) > 20:
        raise APIError(status_code=400, code="INVALID_SECTION", message="Section is too long")
    if not _SECTION_RE.fullmatch(section_norm):
        raise APIError(
            status_code=400,
            code="INVALID_SECTION",
            message="Section contains unsupported characters",
        )
