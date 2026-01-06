from __future__ import annotations

import re
from hashlib import sha256

_slug_re = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    slug = _slug_re.sub("-", value.strip().lower()).strip("-")
    return slug or "section"


def stable_unique_slug(base: str, used: set[str]) -> str:
    slug = slugify(base)
    if slug not in used:
        used.add(slug)
        return slug

    n = 2
    while True:
        candidate = f"{slug}-{n}"
        if candidate not in used:
            used.add(candidate)
            return candidate
        n += 1


def stable_unique_id(base: str, used: set[str]) -> str:
    candidate = base.strip()
    if not candidate:
        candidate = "id"
    if candidate not in used:
        used.add(candidate)
        return candidate

    n = 2
    while True:
        next_candidate = f"{candidate}-{n}"
        if next_candidate not in used:
            used.add(next_candidate)
            return next_candidate
        n += 1


def sha256_hex(data: bytes) -> str:
    return sha256(data).hexdigest()


def normalize_ws(value: str) -> str:
    return " ".join(value.split())
