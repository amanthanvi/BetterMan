from __future__ import annotations

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
    proc = subprocess.run(
        ["mandoc", "-Thtml", str(path)],
        check=False,
        capture_output=True,
        text=True,
        env=env,
    )

    if proc.returncode != 0:
        raise RuntimeError(f"mandoc failed ({proc.returncode}): {proc.stderr.strip()}")

    warnings = proc.stderr.strip() if proc.stderr and proc.stderr.strip() else None
    return MandocResult(html=proc.stdout, warnings=warnings)
