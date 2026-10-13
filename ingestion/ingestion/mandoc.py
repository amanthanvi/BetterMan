from __future__ import annotations

import gzip
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

MANDOC_TIMEOUT_SECONDS = 120


@dataclass(frozen=True)
class MandocResult:
    html: str
    warnings: str | None


def decompress_roff(raw: bytes) -> bytes:
    """Decompress roff content, sniffing gzip by magic bytes (not filename)."""
    if raw[:2] == b"\x1f\x8b":
        return gzip.decompress(raw)
    return raw


def read_roff(path: Path) -> bytes:
    return decompress_roff(path.read_bytes())


def render_html(source: bytes) -> MandocResult:
    """Render roff source bytes with `mandoc -Thtml`.

    The source is always passed on stdin so gzip and plain files behave the
    same. `.so` stubs are detected before this point by `is_so_stub`, so
    include resolution is not needed here.
    """
    env = os.environ | {"LC_ALL": "C.UTF-8"}
    try:
        proc = subprocess.run(
            ["mandoc", "-Thtml"],
            check=False,
            capture_output=True,
            env=env,
            input=source,
            timeout=MANDOC_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"mandoc timed out after {MANDOC_TIMEOUT_SECONDS}s") from exc
    stdout = proc.stdout.decode("utf-8", errors="replace")
    stderr = proc.stderr.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        raise RuntimeError(f"mandoc failed ({proc.returncode}): {stderr.strip()}")

    warnings = stderr.strip() if stderr and stderr.strip() else None
    return MandocResult(html=stdout, warnings=warnings)
