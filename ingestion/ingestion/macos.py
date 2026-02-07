from __future__ import annotations

import subprocess

_BSD_PATTERNS: tuple[str, ...] = (
    "Redistribution and use in source and binary forms",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    "Apache License",
)


def macos_arch() -> str:
    return subprocess.check_output(["uname", "-m"], text=True).strip()


def macos_version() -> str | None:
    try:
        return subprocess.check_output(["sw_vers", "-productVersion"], text=True).strip()
    except Exception:  # noqa: BLE001
        return None


def is_permissive_manpage(raw_bytes: bytes) -> bool:
    head = raw_bytes[:32_768]
    try:
        text = head.decode("utf-8", errors="ignore")
    except Exception:  # noqa: BLE001
        return False
    return any(pat in text for pat in _BSD_PATTERNS)
