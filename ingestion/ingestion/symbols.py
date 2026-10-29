"""Bounded search metadata derived from the existing document AST, not a new AST."""

from __future__ import annotations

import re

# Ten-page uploads leave room for 400 flags + 256 symbols and existing metadata.
MAX_SYMBOLS = 256
COMMAND_FAMILIES = ("git", "ip", "openssl", "systemctl", "docker", "podman")


# Exact aliases only: PROFILES and arbitrary prose headings are not categories.
HEADING_KINDS = {
    **dict.fromkeys(
        ("ENVIRONMENT", "ENVIRONMENT VARIABLES", "ENVIRONMENT VARIABLE"), "environment"
    ),
    **dict.fromkeys(("FILES", "FILES AND DIRECTORIES", "CONFIGURATION FILES"), "files"),
    **dict.fromkeys(("ERRORS", "ERROR NAMES", "LIST OF ERROR NAMES"), "errors"),
    **dict.fromkeys(("COMMANDS", "SUBCOMMANDS", "SUBCOMMAND"), "subcommand"),
}
CONFIG_HEADINGS = {
    "",
    "DESCRIPTION",
    "OPTIONS",
    "DIRECTIVES",
    "CONFIGURATION",
    "SETTINGS",
    "CONFIG DIRECTIVES",
    "CONFIGURATION DIRECTIVES",
    "GLOBAL PARAMETERS",
    "MODULE PARAMETERS",
    "MOUNT OPTIONS",
    "CONFIGURATION OPTIONS",
}


# These pages define kernel/file-format fields, not configuration directives.
NON_DIRECTIVE_PAGES = {"elf", "slabinfo", "core", "utmp", "wtmp", "acct", "lastlog"}


def _directive_page(name: str) -> bool:
    return name not in NON_DIRECTIVE_PAGES and not re.match(
        r"^(?:(?:lin)?proc(?:fs)?(?:_|$)|sysfs(?:_|$)|sysctl(?:_|$))", name
    )


def _formatted_lead(inlines: list) -> str:
    if inlines and inlines[0].get("type") in ("strong", "emphasis", "code"):
        return _text(inlines[0]).strip()
    return ""


def _config_terms(inlines: list, *, multiword: bool = False) -> list[str]:
    term = "".join(_text(inline) for inline in inlines).strip()
    # Assignment placeholders are values, never part of a directive identity.
    if "=" in term:
        key = term.split("=", 1)[0].strip()
        return (
            [key + ("=" if term.endswith("=") else "")]
            if re.fullmatch(r"[A-Za-z_][\w.-]{1,119}", key)
            else []
        )
    terms = term.split(", ")
    if all(re.fullmatch(r"[A-Za-z_][\w.-]{1,119}", t) for t in terms):
        return terms
    # Real resolv.conf terms begin with a styled keyword followed by prose;
    # rsyncd.conf has complete styled multi-word parameter names.
    lead = _formatted_lead(inlines)
    if re.fullmatch(r"[a-z][a-z0-9_-]*", lead) or (
        multiword and re.fullmatch(r"[a-z][a-z0-9_-]*(?: [a-z][a-z0-9_-]*){1,3}", lead)
    ):
        return [lead]
    return []


PLATFORM_LABELS = {"MS", "DOS", "OS", "MSDOS", "UNIX", "WINDOWS", "LINUX", "BSD"}


def _environment_terms(inlines: list) -> list[str]:
    term = "".join(_text(inline) for inline in inlines).strip()
    if len(term) > 1 and term[0] == term[-1] and term[0] in ("'", '"'):
        term = term[1:-1]
    key = term.split("=", 1)[0] if "=" in term else term
    key = re.sub(r" \([^()]*\)$", "", key)
    parts = re.split(r"\s*(?:,|/|\bor\b|\band\b)\s*", key)

    def valid(value: str) -> bool:
        return (
            bool(re.fullmatch(r"\$?[A-Z_][A-Z0-9_]+", value))
            and value.lstrip("$") not in PLATFORM_LABELS
        )

    if parts and all(valid(part) for part in parts):
        return [part.lstrip("$") for part in parts]
    # curl documents variables followed by angle-bracket value placeholders.
    # Match the entire initial identifier, never words inside the placeholder.
    placeholder = re.fullmatch(r"(\$?[A-Z_][A-Z0-9_]+) (?:\[[^\]]+\])?<[^>]+>(?:\[[^\]]+\])?", term)
    if placeholder and valid(placeholder[1]):
        return [placeholder[1].lstrip("$")]
    macro = re.fullmatch(r"\.Ev ([A-Z_][A-Z0-9_]+)(?: [.), ]+)?", term)
    if macro and valid(macro[1]):
        return [macro[1]]
    lead = _formatted_lead(inlines)
    if valid(lead) and term.startswith(lead + " "):
        return [lead.lstrip("$")]
    return []


def utf16_length(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def clip_utf16(text: str, limit: int) -> str:
    return text.encode("utf-16-le")[: limit * 2].decode("utf-16-le", errors="ignore")


def _text(value: object) -> str:
    if isinstance(value, list):
        return " ".join(filter(None, (_text(item) for item in value)))
    if not isinstance(value, dict):
        return ""
    if isinstance(value.get("text"), str):
        return value["text"]
    return _text(value.get("inlines", value.get("definitionBlocks", value.get("items", []))))


def symbol_rows(name: str, section: str, doc: dict, description: str = "") -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(term: str, anchor: str, excerpt: str, kind: str) -> None:
        term = term.strip()
        key = term.lower().rstrip("=")
        if (
            not term
            or utf16_length(term) > 120
            or utf16_length(anchor) > 160
            or key in seen
            or len(rows) >= MAX_SYMBOLS
        ):
            return
        seen.add(key)
        rows.append(
            {
                "term": term,
                "anchorId": anchor,
                "excerpt": clip_utf16(" ".join(excerpt.split()), 160),
                "kind": kind,
            }
        )

    if (
        re.fullmatch(r"[18][a-z0-9]*", section)
        and name.split("-", 1)[0] in COMMAND_FAMILIES
        and "-" in name
    ):
        family, subcommand = name.split("-", 1)
        add(f"{family} {subcommand}", "", description, "subcommand")

    def walk(blocks: list, heading: str = "", anchor: str = "", nested: bool = False) -> None:
        for index, block in enumerate(blocks):
            if not isinstance(block, dict):
                continue
            if block.get("type") == "heading":
                title = str(block.get("text", "")).upper().strip()
                if (
                    block.get("level", 2) <= 2
                    or not heading
                    or title in HEADING_KINDS
                    or title in CONFIG_HEADINGS
                ):
                    heading = title
                anchor = str(block.get("id", ""))
            elif block.get("type") == "definition_list":
                kind = HEADING_KINDS.get(heading)
                if name == "environ" and section.startswith("7") and heading == "DESCRIPTION":
                    kind = "environment"
                if not kind and section.startswith("5") and heading in CONFIG_HEADINGS:
                    kind = "config"
                for item in block.get("items", []):
                    if not isinstance(item, dict):
                        continue
                    term = "".join(_text(inline) for inline in item.get("termInlines", [])).strip()
                    target = item.get("id") or anchor
                    if kind and target and not nested:
                        if kind == "config":
                            terms = (
                                []
                                if not _directive_page(name)
                                else _config_terms(
                                    item.get("termInlines", []), multiword=name == "rsyncd.conf"
                                )
                            )
                        elif kind == "subcommand":
                            lead = (
                                _formatted_lead(item.get("termInlines", []))
                                or term.split(" ", 1)[0]
                            )
                            terms = (
                                [f"{name} {lead}"]
                                if name in COMMAND_FAMILIES
                                and re.fullmatch(r"[a-z][a-z0-9-]*", lead)
                                else []
                            )
                        elif kind == "errors":
                            terms = re.findall(r"\bE[A-Z0-9_]+\b", term)
                        elif kind == "environment":
                            terms = _environment_terms(item.get("termInlines", []))
                        else:
                            terms = re.findall(
                                r"(?:\$(?:[A-Z_][A-Z0-9_]*|\{[^}]+\})|~)?/(?:\{[^{}\s]+\}|[^\s,;{}])+",
                                term,
                            )
                        for symbol in terms:
                            add(symbol, str(target), _text(item.get("definitionBlocks", [])), kind)
                    walk(item.get("definitionBlocks", []), heading, anchor, True)
            elif block.get("type") == "paragraph" and not nested:
                # DocBook/systemd emits a formatted term paragraph followed by
                # an indented definition list. Use its real enclosing section ID.
                following = blocks[index + 1] if index + 1 < len(blocks) else {}
                if following.get("type") != "list" or not anchor:
                    continue
                inlines = block.get("inlines", [])
                term = "".join(_text(inline) for inline in inlines).strip()
                if (
                    section.startswith("5")
                    and heading in CONFIG_HEADINGS
                    and _directive_page(name)
                    and re.fullmatch(r"[A-Za-z_][\w.-]+=(?:, [A-Za-z_][\w.-]+=)*", term)
                ):
                    for directive in term.split(", "):
                        add(directive, anchor, _text(following.get("items", [])), "config")
                elif (
                    name == "login.defs" and section.startswith("5") and heading in CONFIG_HEADINGS
                ):
                    directive = re.fullmatch(
                        r"([A-Z][A-Z0-9_]*) \((?:number|string|boolean|long number|octal number)\)",
                        term,
                    )
                    if directive:
                        add(directive[1], anchor, _text(following.get("items", [])), "config")
                elif HEADING_KINDS.get(heading) == "subcommand" and name in COMMAND_FAMILIES:
                    lead = _formatted_lead(inlines)
                    if re.fullmatch(r"[a-z][a-z0-9-]*", lead):
                        add(
                            f"{name} {lead}",
                            anchor,
                            _text(following.get("items", [])),
                            "subcommand",
                        )
            elif block.get("type") == "list":
                for children in block.get("items", []):
                    walk(children, heading, anchor, nested)

    if name == "bash" and section.startswith("1"):
        headings = {
            "PIPELINES": "pipeline",
            "LISTS": "list",
            "REDIRECTION": "redirect",
            "REDIRECTIONS": "redirect",
            "QUOTING": "quoting",
            "PATHNAME EXPANSION": "glob",
            "COMMAND SUBSTITUTION": "substitution",
            "PROCESS SUBSTITUTION": "processSubstitution",
            "SIMPLE COMMANDS": "assignment",
            "COMPOUND COMMANDS": "subshell",
            "PARAMETERS": "expansion",
        }
        for block in doc.get("blocks", []):
            title = str(block.get("text", "")).upper()
            if block.get("type") == "heading" and title in headings and block.get("id"):
                add("shell:" + headings[title], block["id"], block["text"], "shell")
    walk(doc.get("blocks", []))
    return rows
