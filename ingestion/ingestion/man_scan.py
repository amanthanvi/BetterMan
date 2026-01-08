from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ManSource:
    path: Path
    name: str
    section: str


_SECTION_RE = re.compile(r"^[1-9][a-z0-9]*$")


def scan_man_sources(root: Path, *, sample: bool) -> list[ManSource]:
    if sample:
        desired = [
            ("ls", "1"),
            ("bash", "1"),
            ("tar", "1"),
            ("curl", "1"),
            ("ssh_config", "5"),
        ]
        sources: list[ManSource] = []
        for name, section in desired:
            found = find_man_source(root, name=name, section=section)
            if found is not None:
                sources.append(found)
        return sources

    sources: list[ManSource] = []
    for dir_path in sorted(root.iterdir()):
        if not dir_path.is_dir():
            continue
        if not dir_path.name.startswith("man"):
            continue
        for entry in dir_path.iterdir():
            if entry.is_dir():
                continue
            parsed = _parse_man_filename(entry.name)
            if parsed is None:
                continue
            name, section = parsed
            sources.append(ManSource(path=entry, name=name, section=section))
    return sources


def find_man_source(root: Path, *, name: str, section: str) -> ManSource | None:
    dir_path = root / f"man{section}"
    if not dir_path.is_dir():
        return None

    candidates = [
        dir_path / f"{name}.{section}.gz",
        dir_path / f"{name}.{section}",
    ]
    for candidate in candidates:
        if candidate.exists():
            return ManSource(path=candidate, name=name, section=section)

    # Fallback: scan directory for any matching prefix.
    prefix = f"{name}.{section}"
    for entry in dir_path.iterdir():
        if entry.name == prefix or entry.name == f"{prefix}.gz":
            return ManSource(path=entry, name=name, section=section)

    return None


def _strip_suffixes(filename: str, section: str) -> str:
    name = filename
    if name.endswith(".gz"):
        name = name.removesuffix(".gz")
    if name.endswith(f".{section}"):
        name = name.removesuffix(f".{section}")
    return name


def _parse_man_filename(filename: str) -> tuple[str, str] | None:
    name = filename
    if name.endswith(".gz"):
        name = name.removesuffix(".gz")
    dot = name.rfind(".")
    if dot <= 0 or dot == len(name) - 1:
        return None
    base = name[:dot]
    section = name[dot + 1 :].strip().lower()
    if not section or not _SECTION_RE.fullmatch(section):
        return None
    return base, section
