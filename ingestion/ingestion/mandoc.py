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


@dataclass(frozen=True)
class RoffSyntax:
    control: int = ord(".")
    no_break: int = ord("'")
    escape: int | None = ord("\\")

    @property
    def controls(self):
        return bytes({self.control, self.no_break})


def _conditional_body(rest: bytes, controls: bytes) -> tuple[bytes, bool | None]:
    rest = rest.lstrip()
    negative = rest.startswith(b"!")
    condition = rest[1:] if negative else rest
    if condition[:1] in {b"'", b'"'}:
        parts = condition.split(condition[:1], 3)
        return (parts[3].lstrip(), None) if len(parts) == 4 else (b"", None)
    number = re.match(rb"[+-]?[0-9]+(?=\s|$|[" + re.escape(controls) + rb"])", condition)
    if number:
        truth = int(number[0]) != 0
        return condition[number.end() :].lstrip(), truth != negative
    parts = condition.split(None, 1)
    return (parts[1], None) if len(parts) == 2 else (b"", None)


class _RoffScanner:
    """A bounded syntax scanner, not a roff interpreter or filesystem sandbox."""

    def __init__(self, include=None):
        self.include = include
        self.enforce = include is None
        self.strings = {}
        self.aliases = {}

    def request(self, line, syntax, *, nested=False, depth=0):
        if depth > 32:
            raise RuntimeError("Roff request nesting exceeds limit")
        if not line or line[0] not in syntax.controls:
            return line, [syntax], None
        command = line[1:].lstrip()
        escape = bytes([syntax.escape]) if syntax.escape is not None else None
        if escape and command.startswith((escape + b'"', escape + b"#")):
            return line, [syntax], None
        if escape:
            # Resolve literal request-position strings; interpolation elsewhere
            # (for example an IP label) is formatting, not a command word.
            for _ in range(16):
                match = re.match(re.escape(escape) + rb"\*(?:\[([^]]+)\]|\((..)|(.))", command)
                if not match:
                    break
                key = next(value for value in match.groups() if value is not None)
                if key not in self.strings:
                    if not self.enforce:
                        return line, [syntax], None
                    raise RuntimeError("Unresolved dynamic roff include request")
                command = self.strings[key] + command[match.end() :]
            if self.enforce and command.startswith(escape + b"*"):
                raise RuntimeError("Unresolved dynamic roff include request")
        match = re.match(rb"([A-Za-z][A-Za-z0-9]*)(.*)", command, re.S)
        if not match:
            return line, [syntax], None
        name, rest = match[1], match[2].lstrip()
        name = self.aliases.get(name, name)
        if escape:
            rest = rest.split(escape + b'"', 1)[0].rstrip()
        if name in {b"so", b"mso"}:
            argument = rest.strip()
            if name == b"mso" and argument in {b"www.tmac", b"pic.tmac"}:
                return bytes([syntax.control]) + b"nop\n", [syntax], None
            if name == b"so" and self.include is not None and not nested:
                if not argument or len(argument.split()) != 1 or (escape and escape in argument):
                    raise RuntimeError("Unsupported roff include request")
                return self.include(argument.decode("utf-8")) + b"\n", [syntax], None
            if self.enforce:
                raise RuntimeError("Unresolved roff include request")
            return line, [syntax], None
        if name in {b"ec", b"eo", b"cc", b"c2"}:
            from dataclasses import replace

            argument = rest[:1]
            if name == b"ec":
                updated = replace(syntax, escape=argument[0] if argument else ord("\\"))
            elif name == b"eo":
                updated = replace(syntax, escape=None)
            elif name == b"cc":
                updated = replace(syntax, control=argument[0] if argument else ord("."))
            else:
                updated = replace(syntax, no_break=argument[0] if argument else ord("'"))
            return line, [updated], None
        if name in {b"ds", b"as"}:
            args = rest.split(None, 1)
            if len(args) == 2:
                value = args[1].removeprefix(b'"')
                # Keep the literal definition. It becomes a request only when
                # expanded after a current control with escapes enabled.
                self.strings[args[0]] = (
                    self.strings.get(args[0], b"") if name == b"as" else b""
                ) + value
        if name in {b"als", b"rn"}:
            args = rest.split()
            if len(args) >= 2:
                new, old = args[:2] if name == b"als" else (args[1], args[0])
                target = self.aliases.get(old, old)
                if self.enforce and target in {b"so", b"mso"}:
                    raise RuntimeError("Roff definition containing so is unsupported")
                self.aliases[new] = target
                if name == b"rn":
                    self.aliases[old] = b""
        if name in {b"de", b"am", b"de1", b"am1"}:
            args = rest.split()
            return line, [syntax], args[1] if len(args) > 1 else b"."
        if name in {b"if", b"ie", b"el", b"while", b"do", b"nop"}:
            truth = None
            if name in {b"if", b"ie", b"while"}:
                body, truth = _conditional_body(rest, syntax.controls)
            else:
                body = (bytes([syntax.control]) if name == b"do" else b"") + rest
                if name in {b"nop", b"do"}:
                    truth = True
            if truth is False:
                return line, [syntax], None
            rendered, states, definition = self.request(body, syntax, nested=True, depth=depth + 1)
            # Unknown conditions retain both possible syntaxes for following
            # lines. This prevents a conditional control change hiding an include.
            if truth is not True:
                states = list(dict.fromkeys([syntax, *states]))
            if rendered != body:
                line = bytes([syntax.control]) + b"nop\n"
            return line, states, definition
        return line, [syntax], None


def checked_source(source: bytes, *, include=None) -> bytes:
    """Track roff's actual control/escape syntax while checking remaining includes.

    The optional resolver expands only direct literal archive includes. Nested
    includes remain blocked. Temporary cwd remains the primary relative-path
    boundary; this scanner is defence in depth, not a complete roff interpreter.
    """
    scanner = _RoffScanner(include)
    states = [RoffSyntax()]
    definition = None
    definition_states = []
    checked = []
    pending = b""
    pending_original = b""
    ambiguous_continuation = False
    for physical in source.splitlines(keepends=True):
        original = pending_original + physical
        line = pending + physical
        if ambiguous_continuation:
            # An unknown `.if ... .eo` can make a physical line either text
            # continuation or a fresh request. Check both interpretations.
            possible = states[:]
            for syntax in states:
                _rendered, updated, _end = scanner.request(physical, syntax, nested=True)
                possible.extend(updated)
            states = list(dict.fromkeys(possible))
        pending = b""
        pending_original = b""
        if any(
            s.escape is not None
            and line.endswith(bytes([s.escape]) + b"\n")
            and not line.endswith(bytes([s.escape, s.escape]) + b"\n")
            for s in states
        ):
            pending = line[:-2]
            pending_original = original
            ambiguous_continuation |= len({s.escape for s in states}) > 1
            continue
        if definition is not None:
            if any(
                re.match(
                    rb"[" + re.escape(s.controls) + rb"]\s*" + re.escape(definition) + rb"\s*$",
                    line,
                )
                for s in [*states, *definition_states]
            ):
                definition = None
                states = definition_states
                definition_states = []
                checked.append(line)
                continue
        next_states = []
        rendered = line
        for syntax in states:
            result, updated, end = scanner.request(line, syntax)
            next_states.extend(updated)
            if result != line:
                rendered = result
            if end is not None and definition is None:
                definition, definition_states = end, states[:]
        states = list(dict.fromkeys(next_states))
        if len(states) > 32:
            raise RuntimeError("Too many conditional roff syntaxes")
        checked.append(original if ambiguous_continuation and rendered == line else rendered)
        ambiguous_continuation = False
    if pending:
        for syntax in states:
            scanner.request(pending, syntax)
        checked.append(pending_original if ambiguous_continuation else pending)
    result = b"".join(checked)
    if len(result) > 16 * 1024 * 1024:
        raise RuntimeError("Expanded roff source exceeds limit")
    return result


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
