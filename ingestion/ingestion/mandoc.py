from __future__ import annotations

import gzip
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

MANDOC_TIMEOUT_SECONDS = 120


@dataclass(frozen=True)
class MandocResult:
    html: str
    warnings: str | None


def read_roff(path: Path) -> bytes:
    """Read a roff source, detecting gzip by its magic bytes rather than its name."""
    raw = path.read_bytes()
    return gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw


def render_html(source: bytes) -> MandocResult:
    """Render roff source bytes with `mandoc -Thtml`.

    The source is passed on stdin. `.so` stubs are detected before this point
    by `is_so_stub`, so include resolution is not needed here.
    """
    # Resolve archive .so first, then reject executable includes. Formatting
    # arguments such as `.B .so` are text, while conditional bodies are requests.
    controls = {46, 39}
    checked = []
    for line in source.splitlines(keepends=True):
        request = line  # Only column-zero control characters introduce requests.
        if (
            not request
            or request[0] not in controls
            or request[1:3] in {bytes([92, 34]), bytes([92, 35])}
        ):
            checked.append(line)
            continue
        command = re.match(rb".\s*([A-Za-z][A-Za-z0-9]*)", request)
        if not command:
            if request[1:2] == bytes([92]) and request[1:3] not in {
                bytes([92, 125]),
                bytes([92, 123]),
                bytes([92, 45]),
            }:
                raise RuntimeError("Dynamic roff request is unsupported")
            checked.append(line)
            continue
        name = command[1]
        nested = name in {b"if", b"ie", b"el", b"while", b"do", b"nop"}
        candidates = [request] if name in {b"so", b"mso", b"cc", b"c2"} else []
        if nested:
            if re.search(rb"\bdo\s+(?:so|mso|cc|c2)\b", request):
                raise RuntimeError("Unresolved roff include request")
            pattern = (
                rb"["
                + re.escape(bytes(sorted(controls)))
                + rb"]\s*(?:so|mso|cc|c2)(?=[^A-Za-z0-9_]|$)"
            )
            candidates = [request[match.start() :] for match in re.finditer(pattern, request)]
        if name in {b"als", b"rn"} and re.search(
            rb"\b(?:so|mso|if|ie|el|do|cc|c2)\b", request[command.end() :]
        ):
            raise RuntimeError("Dynamic roff include alias is unsupported")
        for candidate in candidates:
            match = re.match(rb".\s*(so|mso|cc|c2)", candidate)
            rest = candidate[match.end() :].strip()
            kind = match[1]
            argument = rest.split()[0] if rest else None
            if kind == b"mso" and argument in {b"www.tmac", b"pic.tmac"}:
                # Optional groff macro packages have no mandoc implementation;
                # omit only the actual request, never quoted manual examples.
                macro = re.match(rb".\s*mso\s+(?:www|pic)\.tmac", candidate)
                line = line.replace(macro[0], b".nop")
            elif kind in {b"so", b"mso"}:
                raise RuntimeError("Unresolved roff include request")
            else:
                argument = argument or b"."
                if len(argument) != 1 or argument[0] <= 32 or argument == bytes([92]):
                    raise RuntimeError("Roff control-character change is unsupported")
                controls.add(argument[0])
        checked.append(line)
    source = b"".join(checked)
    env = os.environ | {"LC_ALL": "C.UTF-8"}
    try:
        with TemporaryDirectory(prefix="betterman-mandoc-") as directory:
            proc = subprocess.run(
                ["mandoc", "-Thtml"],
                check=False,
                capture_output=True,
                env=env,
                input=source,
                cwd=directory,
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
