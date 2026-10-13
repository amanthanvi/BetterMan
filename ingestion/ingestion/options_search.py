"""Bounded OPTIONS metadata; mirror convex/_optionsSearch.ts without AST changes."""

from __future__ import annotations

import json
import re

MAX_OPTIONS_SEARCH_BYTES = 2048
_BARE_TOKEN = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.+-]*\Z")
_SIGNED_TOKEN = re.compile(r"(?:-{1,2}|\+)[!-~]+\Z")
_OPTION_DELIMITERS = re.compile(r"[\s,|()[\]{}=]")


def _is_token(value: str) -> bool:
    return bool(_BARE_TOKEN.fullmatch(value)) or (
        bool(_SIGNED_TOKEN.fullmatch(value)) and not _OPTION_DELIMITERS.search(value)
    )


def _normalize(value: str) -> str:
    return value if value.startswith(("-", "+")) else value.lower()


def _token(value: str) -> str:
    hash_value = 0xCBF29CE484222325
    for byte in value.encode("ascii"):
        hash_value = ((hash_value ^ byte) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"t{hash_value:016x}"


def options_search_text(options: object) -> str | None:
    """Whole anchor/token entries share one 2 KiB UTF-8 budget, flags first."""
    if not isinstance(options, list):
        return None
    entries: list[list[str]] = []
    seen: set[str] = set()
    for option in options:
        if not isinstance(option, dict):
            continue
        flags, anchor = option.get("flags"), option.get("anchorId")
        if not isinstance(flags, str) or not isinstance(anchor, str) or not anchor:
            continue
        tokens: dict[str, None] = {}
        for part in re.split(r"[\s,|()[\]{}]+", flags):
            flag = part.split("=")[0]
            if not _is_token(flag):
                continue
            tokens[_normalize(flag)] = None
            bare = flag.lstrip("-+")
            if _BARE_TOKEN.fullmatch(bare):
                tokens[bare.lower()] = None
        if not tokens:
            continue
        entry = [anchor, " " + " ".join(_token(token) for token in tokens) + " ", " ".join(tokens)]
        key = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
        if key in seen:
            continue
        candidate = json.dumps([*entries, entry], ensure_ascii=False, separators=(",", ":"))
        if len(candidate.encode("utf-8")) > MAX_OPTIONS_SEARCH_BYTES:
            continue
        entries.append(entry)
        seen.add(key)
    return json.dumps(entries, ensure_ascii=False, separators=(",", ":")) if entries else None
