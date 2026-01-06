from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ManSource:
    path: Path
    name: str
    section: str


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
    for n in range(1, 10):
        section = str(n)
        dir_path = root / f"man{section}"
        if not dir_path.is_dir():
            continue
        for entry in dir_path.iterdir():
            if entry.is_dir():
                continue
            if not (entry.name.endswith(f".{section}") or entry.name.endswith(f".{section}.gz")):
                continue
            name = _strip_suffixes(entry.name, section)
            if not name:
                continue
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
