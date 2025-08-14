# backend/src/parser_enhanced.py
from __future__ import annotations
import re
from typing import Dict, List, Optional, Tuple

SECTION_RE = re.compile(r'^\s*([A-Z][A-Z0-9 _/-]{2,})\s*$', re.MULTILINE)

OPTION_HEAD_RE = re.compile(
    r"""^
        \s*
        (?:                                   # typical forms:
            (?P<both>-[A-Za-z](?:,\s*--[A-Za-z0-9][-\w]*)?)  # "-a, --all"
          | (?P<long>--[A-Za-z0-9][-\w]*(?:=\S+)?)
          | (?P<short>-[A-Za-z])
        )
        (?:\s{2,}|\s+$|$)                     # then at least some spacing or EOL
    """,
    re.VERBOSE,
)

SEE_ALSO_REF_RE = re.compile(r'\b([A-Za-z0-9_+-]+)\((\d+[a-z]*)\)')

def _collapse_spaces(s: str) -> str:
    return re.sub(r'[ \t]+', ' ', s.strip())

def _normalize_synopsis(text: str) -> str:
    # Keep separate forms on separate lines, collapse internal runs of spaces
    lines = [ _collapse_spaces(l) for l in text.strip().splitlines() if l.strip() ]
    return "\n".join(lines)

def _split_sections(raw: str) -> List[Dict[str, str]]:
    """Split by SH headings (NAME, SYNOPSIS, DESCRIPTION, OPTIONS, EXAMPLES...)"""
    parts = []
    last = 0
    for m in SECTION_RE.finditer(raw):
        title = m.group(1).strip()
        if last == 0 and m.start() != 0:
            # body before first heading
            pre = raw[:m.start()].strip()
            if pre:
                parts.append({"title": "BODY", "content": pre})
        if parts:
            parts[-1]["content"] = raw[last:m.start()].strip()
        parts.append({"title": title, "content": ""})
        last = m.end()
    if parts:
        parts[-1]["content"] = raw[last:].strip()
    else:
        parts.append({"title": "BODY", "content": raw.strip()})
    return parts

def _title_from_name_section(name_section_text: str) -> Tuple[str, str]:
    """
    NAME section is usually 'ls - list directory contents' or 'ls — list ...'
    """
    line = name_section_text.splitlines()[0] if name_section_text else ""
    line = line.replace("—", "-")
    if " - " in line:
        name, title = line.split(" - ", 1)
    else:
        # Fallback: first token as name
        tokens = line.split()
        name, title = (tokens[0], " ".join(tokens[1:])) if tokens else ("", "")
    return _collapse_spaces(name), _collapse_spaces(title)

def _extract_summary(description: str, max_sentences: int = 3) -> str:
    # Simple rule-based summary: first 2–3 sentences from DESCRIPTION
    desc = re.sub(r'\s+', ' ', description.strip())
    if not desc:
        return ""
    # end-of-sentence heuristic
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z(])', desc)
    return " ".join(sentences[:max_sentences]).strip()

def _lines(text: str) -> List[str]:
    return text.splitlines()

def _collect_options_from_lines(lines: List[str]) -> List[Dict[str, Optional[str]]]:
    """
    Parse GNU/posix style options block, supporting:
      - '-a, --all  description...'
      - '--author   description...'
      - '-T, --tabsize=COLS  description...'
      - option description continuing on following indented lines
    """
    options: List[Dict[str, Optional[str]]] = []
    cur = None

    def flush():
        nonlocal cur
        if cur:
            cur["description"] = _collapse_spaces(cur["description"])
            options.append(cur)
            cur = None

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            # blank line → continue description paragraph boundary
            if cur and cur["description"] and not cur["description"].endswith("\n"):
                cur["description"] += " "
            continue

        m = OPTION_HEAD_RE.match(line)
        if m:
            # New option row
            flush()
            head = (m.group("both") or m.group("long") or m.group("short")).strip()
            rest = line[m.end():].strip()

            short_flag: Optional[str] = None
            long_flag: Optional[str] = None
            argument: Optional[str] = None

            # split something like "-a, --all" or just "--color[=WHEN]" etc.
            heads = [h.strip() for h in head.split(",")]
            for h in heads:
                if h.startswith("--"):
                    # strip any "=ARG"
                    base = h.split("=", 1)[0]
                    long_flag = base
                    if "=" in h:
                        argument = h.split("=", 1)[1]
                elif h.startswith("-"):
                    short_flag = h

            cur = {
                "flag": long_flag or short_flag,
                "shortFlag": short_flag if long_flag else None,
                "argument": argument,
                "description": rest,
            }
        else:
            # continuation line: treat as description
            if cur:
                if cur["description"]:
                    cur["description"] += " " + line.strip()
                else:
                    cur["description"] = line.strip()

    flush()
    return options

def _extract_options(sections: List[Dict[str, str]]) -> List[Dict[str, Optional[str]]]:
    # Prefer explicit OPTIONS, else fall back to DESCRIPTION (GNU coreutils style)
    target = None
    for s in sections:
        if s["title"] == "OPTIONS":
            target = s["content"]
            break
    if target is None:
        for s in sections:
            if s["title"] == "DESCRIPTION":
                target = s["content"]
                break
    if not target:
        return []
    return _collect_options_from_lines(_lines(target))

def _extract_synopsis(sections: List[Dict[str, str]]) -> str:
    for s in sections:
        if s["title"] == "SYNOPSIS":
            return _normalize_synopsis(s["content"])
    return ""

def _extract_see_also(sections: List[Dict[str, str]]) -> List[Dict[str, str]]:
    for s in sections:
        if s["title"] == "SEE ALSO":
            refs = []
            for name, sec in SEE_ALSO_REF_RE.findall(s["content"]):
                refs.append({"name": name, "section": sec})
            return refs[:30]
    return []

def parse_man_page(raw_text: str) -> Dict:
    """
    Input: plain text from `man -l <file> | col -bx`
    Output: structured page, deterministic and side-effect free.
    """
    sections = _split_sections(raw_text)

    # name/title
    name, title = "", ""
    for s in sections:
        if s["title"] == "NAME":
            name, title = _title_from_name_section(s["content"])
            break

    synopsis = _extract_synopsis(sections)
    description = ""
    for s in sections:
        if s["title"] == "DESCRIPTION":
            description = s["content"].strip()
            break

    options = _extract_options(sections)
    summary = _extract_summary(description or title)
    see_also = _extract_see_also(sections)

    return {
        "name": name,
        "title": title,
        "synopsis": synopsis,
        "description": description,
        "summary": summary,
        "options": options,
        "examples": [],            # can be filled from EXAMPLES section later
        "see_also": see_also,
        "sections": sections,      # keep for debugging/UX
    }