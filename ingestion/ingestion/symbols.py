"""Bounded search metadata derived from the existing document AST, not a new AST."""

from __future__ import annotations

import re

# shortcut: 64 terms per page bound upload writes; use separate batches for larger coverage.
MAX_SYMBOLS = 64


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
        if (
            not term
            or len(term) > 120
            or len(anchor) > 160
            or term.lower() in seen
            or len(rows) >= MAX_SYMBOLS
        ):
            return
        seen.add(term.lower())
        rows.append(
            {
                "term": term,
                "anchorId": anchor,
                "excerpt": " ".join(excerpt.split())[:160],
                "kind": kind,
            }
        )

    # Page-name families are derived independently of B7's cross-page family graph.
    if section in ("1", "8") and re.fullmatch(
        r"(?:git|ip|openssl|systemctl|docker|podman)-[\w.-]+", name
    ):
        family, subcommand = name.split("-", 1)
        add(f"{family} {subcommand}", "", description, "subcommand")

    def walk(blocks: list, heading: str = "", anchor: str = "") -> None:
        for block in blocks:
            if not isinstance(block, dict):
                continue
            if block.get("type") == "heading":
                title = str(block.get("text", "")).upper()
                if (
                    block.get("level", 2) <= 2
                    or not heading
                    or title in ("ENVIRONMENT", "FILES", "ERRORS")
                ):
                    heading = title
                anchor = str(block.get("id", ""))
            elif block.get("type") == "definition_list":
                kind = next(
                    (
                        label.lower()
                        for label in ("ENVIRONMENT", "FILES", "ERRORS")
                        if label in heading
                    ),
                    "config" if section.startswith("5") else "",
                )
                for item in block.get("items", []):
                    if not isinstance(item, dict):
                        continue
                    term = "".join(_text(inline) for inline in item.get("termInlines", []))
                    target = item.get("id") or anchor
                    if kind and target:
                        if kind == "config":
                            terms = re.findall(r"[A-Za-z_][\w.]*=?", term[:120])[:1]
                        elif kind == "errors":
                            terms = re.findall(r"\bE[A-Z0-9_]+\b", term)
                        elif kind == "environment":
                            terms = re.findall(r"\b[A-Z_][A-Z0-9_]+\b", term)
                        else:
                            terms = re.findall(r"(?:/|~/)[^\s,;]+", term)
                        for symbol in terms:
                            add(symbol, str(target), _text(item.get("definitionBlocks", [])), kind)
                    walk(item.get("definitionBlocks", []), heading, anchor)
            elif block.get("type") == "list":
                for children in block.get("items", []):
                    walk(children, heading, anchor)

    if name == "bash" and section == "1":
        headings = {
            "Pipelines": "pipeline",
            "Lists": "list",
            "REDIRECTION": "redirect",
            "REDIRECTIONS": "redirect",
            "QUOTING": "quoting",
            "Pathname Expansion": "glob",
            "Command Substitution": "substitution",
            "Simple Commands": "assignment",
            "Compound Commands": "subshell",
            "PARAMETERS": "expansion",
        }
        headings = {key.upper(): value for key, value in headings.items()}
        for block in doc.get("blocks", []):
            if (
                block.get("type") == "heading"
                and str(block.get("text", "")).upper() in headings
                and block.get("id")
            ):
                add("shell:" + headings[block["text"].upper()], block["id"], block["text"], "shell")
    walk(doc.get("blocks", []))
    return rows
