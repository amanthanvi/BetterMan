"""Read registrations as data. This is not a shell interpreter and executes nothing."""

from __future__ import annotations

import itertools
import re
import shlex
from dataclasses import dataclass

from ingestion.debian_indexes import MAN_PATH, safe_path

VARIABLE = re.compile(r"\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))")


@dataclass(frozen=True)
class Alternative:
    name: str
    section: str
    target: str
    priority: int
    group: str
    binary: bool = False


def _expand(text, values):
    for _ in range(12):
        if not VARIABLE.search(text):
            break

        def replace(match):
            key = match[1] or match[2]
            if key not in values:
                raise ValueError(f"unresolved variable {key}")
            return values[key]

        text = VARIABLE.sub(replace, text)
    if any(c in text for c in "$`\n\r"):
        raise ValueError("dynamic shell expression")
    return text


def _xz_helper(script):
    # A reusable literal-echo helper used by xz-utils. Recognize its complete
    # body before expanding its data arguments; arbitrary functions/subshells
    # remain unsupported. No shell, eval, subprocess or command lookup occurs.
    helper = re.search(
        r"slave\s*\(\)\s*\{\s*dir=\$1 filename=\$2 target=\$3\s*"
        r'echo "--slave \$dir/\$filename \$filename \$dir/\$target"\s*}',
        script,
    )
    block = re.search(r"\$\(\s*\n(.*?)\n\)", script, re.S)
    if not helper or not block:
        return script
    tokens = []
    values = {}
    for line in block[1].splitlines():
        line = line.strip()
        if line.startswith("for "):
            match = re.fullmatch(r"for (\w+) in ([\w ]+)", line)
            if not match:
                return script
            values = {match[1]: match[2].split()}
        elif line in {"do", "done", ""}:
            if line == "done":
                values = {}
        elif line.startswith("slave "):
            for binding in (
                dict(zip(values, row, strict=True)) for row in itertools.product(*values.values())
            ):
                args = shlex.split(_expand(line, binding))
                if len(args) != 4 or any(not re.fullmatch(r"[\w/.+-]+", arg) for arg in args[1:]):
                    return script
                directory, name, target = args[1:]
                tokens.extend(["--slave", f"{directory}/{name}", name, f"{directory}/{target}"])
        else:
            return script
    return script[: block.start()] + " ".join(tokens) + script[block.end() :]


def _literal_functions(script):
    # Substitute literal calls to wrappers whose registrations refer to $1..$9.
    # Only their text is substituted; commands in their bodies never execute.
    pattern = re.compile(r"^(\w+)\s*\(\)\s*\n?\s*\{\n(.*?)^}", re.M | re.S)
    bodies = {}

    def remember(match):
        if "--install" not in match[2] or "update-alternatives" not in match[2]:
            return match[0]
        bodies[match[1]] = match[2]
        return ""

    script = pattern.sub(remember, script)
    expanded = []
    used = set()
    for line in script.splitlines():
        try:
            args = shlex.split(line, comments=True)
        except ValueError:
            args = []
        if args and args[0] in bodies:
            used.add(args[0])
            body = bodies[args[0]]
            if any(not re.fullmatch(r"[\w/+.:-]+", arg) for arg in args[1:]):
                expanded.append("update-alternatives --install UNRESOLVED_FUNCTION_CALL")
                continue
            for i, arg in enumerate(args[1:], 1):
                body = body.replace(f"${i}", arg)
            expanded.append(body)
        else:
            expanded.append(line)
    # No literal invocation means we cannot prove a wrapper offers anything.
    expanded.extend(
        "update-alternatives --install UNRESOLVED_WRAPPER_" + name for name in bodies.keys() - used
    )
    return "\n".join(expanded)


def parse_alternatives(
    script: str, *, architecture="amd64"
) -> tuple[list[Alternative], list[dict]]:
    """Accept literal registrations, literal variables/for-lists and two checked
    Debian templates. Unresolved registrations are reported, never guessed.
    Configure/upgrade guards are not executed: offers describe selected packages.
    """
    script = re.sub(r"\\\n", " ", script)
    script = _xz_helper(script)
    script = _literal_functions(script)
    # Native (not cross-architecture) installation: this exact OpenJDK branch
    # cannot run for the pinned amd64 package on the amd64 ingestion target.
    if architecture == "amd64":
        script = re.sub(
            r'if \[ -n "\$multiarch" \] && \[ "\$DPKG_MAINTSCRIPT_ARCH" != '
            r"\$\(dpkg --print-architecture\) \]; then\s*"
            r"priority=\$\(expr \$priority - 1\)\s*fi",
            "",
            script,
        )
    script = re.sub(r"if false && [^\n]+; then\n.*?\n\s*fi", "", script, flags=re.S)
    values = {}
    ambiguous = set()
    lists = {}
    loop_stack = []
    offers, skipped = [], []
    for number, line in enumerate(script.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        unset = re.match(r"unset ([\w ]+?)(?: \|\||$)", line)
        if unset:
            for name in unset[1].split():
                values.pop(name, None)
                ambiguous.discard(name)
            values.update(dict.fromkeys(unset[1].split(), ""))
        if line == "done":
            if loop_stack:
                key = loop_stack.pop()
                lists.pop(key, None)
                values.pop(key, None)
        assignment = re.fullmatch(r"([A-Za-z_]\w*)=(.*)", line)
        if assignment:
            try:
                literal = shlex.split(assignment[2], comments=True)
                if len(literal) != 1 or "$(" in literal[0] or "`" in literal[0]:
                    raise ValueError("nonliteral assignment")
                key = assignment[1]
                if key in values and values[key] not in {"", literal[0]}:
                    ambiguous.add(key)
                if key in ambiguous:
                    raise ValueError("ambiguous assignment")
                values[key] = literal[0]
            except ValueError:
                values.pop(assignment[1], None)
        loop = re.match(r"for (\w+) in (.*?)(?:; do|$)", line)
        if loop:
            try:
                items = shlex.split(_expand(loop[2], values))
                if not items or len(items) > 128:
                    raise ValueError("unbounded loop")
                lists[loop[1]] = items
                loop_stack.append(loop[1])
            except ValueError:
                lists.pop(loop[1], None)
        if "update-alternatives" not in line or "--install" not in line:
            continue
        if not line.startswith(("update-alternatives ", "/usr/bin/update-alternatives ")):
            skipped.append({"line": number, "reason": "unsupported command context"})
            continue
        command = line[line.index("update-alternatives") :]
        try:
            # Resolve only loop variables transitively referenced by this command.
            referenced = command
            for _ in range(12):
                extended = referenced + " ".join(
                    values.get(m[1] or m[2], "") for m in VARIABLE.finditer(referenced)
                )
                if extended == referenced:
                    break
                referenced = extended[-65536:]
            relevant = {
                key: items
                for key, items in lists.items()
                if re.search(
                    r"\$(?:" + re.escape(key) + r"\b|\{" + re.escape(key) + r"\})", referenced
                )
            }
            combinations = list(itertools.islice(itertools.product(*relevant.values()), 257))
            if len(combinations) > 256:
                raise ValueError("too many static expansions")
            for row in combinations:
                expanded = _expand(command, values | dict(zip(relevant, row, strict=True)))
                args = shlex.split(expanded, comments=True)
                for end, token in enumerate(args):
                    if token in {"||", "&&", ";"}:
                        args = args[:end]
                        break
                install = args.index("--install")
                if any(
                    token not in {"--quiet", "--verbose", "--force"} for token in args[1:install]
                ):
                    raise ValueError("unsupported option")
                link, group, target, priority = args[install + 1 : install + 5]
                if not all(re.fullmatch(r"[\w/+.@:-]+", x) for x in (link, group, target)):
                    raise ValueError("nonliteral identity")
                priority = int(priority)
                if not -(2**31) <= priority < 2**31:
                    raise ValueError("priority outside Debian integer range")
                links = [(link, target)]
                rest = args[install + 5 :]
                while rest:
                    if len(rest) < 4 or rest[0] != "--slave":
                        raise ValueError("unsupported registration tail")
                    links.append((rest[1], rest[3]))
                    rest = rest[4:]
                batch = []
                for destination, source in links:
                    destination, source = (
                        safe_path(destination.lstrip("/")),
                        safe_path(source.lstrip("/")),
                    )
                    match = MAN_PATH.fullmatch(destination)
                    if match and MAN_PATH.fullmatch(source):
                        batch.append(
                            Alternative(match[1].lower(), match[2].lower(), source, priority, group)
                        )
                if (
                    not batch
                    and link.startswith(("/usr/bin/", "/bin/", "/usr/sbin/", "/sbin/"))
                    and link.rsplit("/", 1)[-1] == group
                ):
                    # The pipeline must prove a unique exact target-basename
                    # manual in this package before turning this into a route.
                    batch.append(Alternative(group.lower(), "1", target, priority, group, True))
                offers.extend(batch)
                if not batch:
                    skipped.append(
                        {
                            "line": number,
                            "reason": "registration has no English manual slave",
                            "group": group,
                        }
                    )
        except (ValueError, KeyError, IndexError) as exc:
            skipped.append({"line": number, "reason": str(exc)})
    return sorted(set(offers), key=lambda o: (o.name, o.section, -o.priority, o.target)), skipped
