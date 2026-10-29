"""Bounded search metadata derived from the existing document AST, not a new AST."""

from __future__ import annotations

import re

# Ten-page uploads leave room for 400 flags + 256 symbols and existing metadata.
MAX_SYMBOLS = 256
COMMAND_FAMILIES = ("git", "ip", "openssl", "systemctl", "docker", "podman")


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
    return _text(value.get("inlines", value.get("definitionBlocks", [])))


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
        for block in blocks:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "heading":
                title = str(block.get("text", "")).upper().strip()
                if (
                    block.get("level", 2) <= 2
                    or not heading
                    or title in ("ENVIRONMENT", "FILES", "ERRORS")
                ):
                    heading = title
                anchor = str(block.get("id", ""))
            elif block.get("type") == "definition_list":
                kind = {"ENVIRONMENT": "environment", "FILES": "files", "ERRORS": "errors"}.get(
                    heading
                )
                config_section = heading in (
                    "",
                    "DESCRIPTION",
                    "OPTIONS",
                    "DIRECTIVES",
                    "CONFIGURATION",
                    "SETTINGS",
                ) or heading.endswith("SECTION OPTIONS")
                if not kind and section.startswith("5") and config_section:
                    kind = "config"
                for item in block.get("items", []):
                    if not isinstance(item, dict):
                        continue
                    term = "".join(_text(inline) for inline in item.get("termInlines", [])).strip()
                    target = item.get("id") or anchor
                    if kind and target and not nested:
                        if kind == "config":
                            # A complete directive term, never the first word of prose or a flag.
                            terms = term.split(", ")
                            terms = (
                                terms
                                if all(re.fullmatch(r"[A-Za-z_][\w.-]{1,119}=?", t) for t in terms)
                                else []
                            )
                        elif kind == "errors":
                            terms = re.findall(r"\bE[A-Z0-9_]+\b", term)
                        elif kind == "environment":
                            terms = re.findall(r"\b[A-Z_][A-Z0-9_]+\b", term)
                        else:
                            terms = re.findall(
                                r"(?:\$(?:[A-Z_][A-Z0-9_]*|\{[^}]+\})|~)?/[^\s,;]+", term
                            )
                        for symbol in terms:
                            add(symbol, str(target), _text(item.get("definitionBlocks", [])), kind)
                    walk(item.get("definitionBlocks", []), heading, anchor, True)
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
