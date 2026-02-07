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


def render_html(path: Path) -> MandocResult:
    env = os.environ | {"LC_ALL": "C.UTF-8"}
    if path.suffix.lower() == ".gz":
        with gzip.open(path, "rb") as f:
            raw = f.read()

        proc = subprocess.run(
            ["mandoc", "-Thtml"],
            check=False,
            capture_output=True,
            env=env,
            input=raw,
        )
        stdout = proc.stdout.decode("utf-8", errors="replace")
        stderr = proc.stderr.decode("utf-8", errors="replace")
    else:
        proc = subprocess.run(
            ["mandoc", "-Thtml", str(path)],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )
        stdout = proc.stdout
        stderr = proc.stderr

    if proc.returncode != 0:
        raise RuntimeError(f"mandoc failed ({proc.returncode}): {stderr.strip()}")

    warnings = stderr.strip() if stderr and stderr.strip() else None
    return MandocResult(html=stdout, warnings=warnings)
