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


def _conditional_body(rest: bytes) -> bytes:
    rest = rest.lstrip()
    condition = rest[1:] if rest.startswith(b"!") else rest
    if condition[:1] in {b"'", b'"'}:
        delimiter = condition[:1]
        parts = condition.split(delimiter, 3)
        return parts[3].lstrip() if len(parts) == 4 else b""
    # Numeric conditions may abut the next request (e.g. `.if 1.so ...`).
    number = re.match(rb"[+-]?[0-9]+(?=[.']|\s|$)", condition)
    if number:
        return condition[number.end() :].lstrip()
    parts = condition.split(None, 1)
    return parts[1] if len(parts) == 2 else b""


def checked_source(source: bytes) -> bytes:
    """Defence in depth for the fixed mandoc syntax, not a filesystem sandbox."""
    # Resolve archive .so first, then reject executable includes. Formatting
    # arguments such as `.B .so` are text, while conditional bodies are requests.
    controls = {46, 39}
    checked = []
    definition_end = None
    source = source.replace(b"\\\n", b"")
    for line in source.splitlines(keepends=True):
        request = line  # Only column-zero control characters introduce requests.
        if definition_end is not None:
            if re.match(rb"[.']\s*" + re.escape(definition_end) + rb"\s*$", request):
                definition_end = None
            elif re.search(
                rb"[.']\s*(?:so|mso)(?=[^A-Za-z0-9_]|$)",
                request.split(b'\\"', 1)[0],
            ):
                raise RuntimeError("Roff definition containing so is unsupported")
        if (
            not request
            or request[0] not in controls
            or request[1:3] in {bytes([92, 34]), bytes([92, 35])}
        ):
            checked.append(line)
            continue
        if re.match(rb".\s*\\\*", request):
            raise RuntimeError("Dynamic roff request is unsupported")
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
        if name in {b"ec", b"eo", b"cc", b"c2"}:
            raise RuntimeError("Roff escape/control-character change is unsupported")
        if name in {b"ds", b"as", b"de", b"am"}:
            if re.search(rb"(?<![A-Za-z0-9_])(?:so|mso)(?![A-Za-z0-9_])", request[command.end() :]):
                raise RuntimeError("Roff definition containing so is unsupported")
            if name in {b"de", b"am"}:
                args = request[command.end() :].split(b'\\"', 1)[0].split()
                definition_end = args[1] if len(args) > 1 else b"."
        nested = name in {b"if", b"ie", b"el", b"while", b"do", b"nop"}
        candidates = [request] if name in {b"so", b"mso", b"cc", b"c2"} else []
        if nested:
            # Inspect the command position, not interpolated formatting arguments
            # such as `.ie n .IP "quoted.\\*(Aq"`.
            body = request
            for _ in range(16):
                instruction = re.match(rb"[.']\s*([A-Za-z]+)\s*(.*)", body)
                if not instruction:
                    if re.match(rb"[.']\s*\\\*", body):
                        raise RuntimeError("Dynamic roff request is unsupported")
                    break
                kind, rest = instruction[1], instruction[2]
                if kind in {b"if", b"ie", b"while"}:
                    body = _conditional_body(rest)
                elif kind in {b"el", b"nop"}:
                    body = rest.lstrip()
                elif kind == b"do":
                    body = b"." + rest.lstrip()
                else:
                    break
            if re.search(rb"[.']\s*(?:ec|eo|cc|c2)(?=[^A-Za-z0-9_]|$)", request):
                raise RuntimeError("Roff escape/control-character change is unsupported")
            if re.search(rb"\bdo\s+(?:so|mso|ec|eo|cc|c2)\b", request):
                raise RuntimeError("Unresolved roff include request")
            pattern = (
                rb"["
                + re.escape(bytes(sorted(controls)))
                + rb"]\s*(?:so|mso|cc|c2)(?=[^A-Za-z0-9_]|$)"
            )
            candidates = [request[match.start() :] for match in re.finditer(pattern, request)]
        if name in {b"als", b"rn"} and re.search(
            rb"\b(?:so|mso|if|ie|el|do|ec|eo|cc|c2)\b", request[command.end() :]
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
        checked.append(line)
    return b"".join(checked)


def render_html(source: bytes) -> MandocResult:
    """Render stdin with a fresh empty cwd; includes are resolved by the archive store."""
    source = checked_source(source)
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
