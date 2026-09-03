from __future__ import annotations

import gzip
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class MandocResult:
    html: str
    warnings: str | None


def read_roff(path: Path) -> bytes:
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rb") as f:
            return f.read()
    return path.read_bytes()


def render_html(path: Path) -> MandocResult:
    """Render a roff source with `mandoc -Thtml`.

    The source is always passed on stdin so gzip and plain files behave the
    same. `.so` stubs are detected before this point by `is_so_stub`, so
    include resolution is not needed here.
    """
    env = os.environ | {"LC_ALL": "C.UTF-8"}
    proc = subprocess.run(
        ["mandoc", "-Thtml"],
        check=False,
        capture_output=True,
        env=env,
        input=read_roff(path),
    )
    stdout = proc.stdout.decode("utf-8", errors="replace")
    stderr = proc.stderr.decode("utf-8", errors="replace")

    if proc.returncode != 0:
        raise RuntimeError(f"mandoc failed ({proc.returncode}): {stderr.strip()}")

    warnings = stderr.strip() if stderr and stderr.strip() else None
    return MandocResult(html=stdout, warnings=warnings)
