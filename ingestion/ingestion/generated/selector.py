"""Choose which pages get generated text first.

The indexed tier is sections 1, 5, 7 and 8 plus popular packages. Popularity
priors (B4) do not exist yet, so a priority list can be passed in; without
one, section 1 and 8 commands come first, then file formats and overviews.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

INDEXED_SECTIONS = ("1", "8", "5", "7")


@dataclass(frozen=True)
class Candidate:
    name: str
    section: str
    content_sha256: str
    source_package: str | None = None
    has_options: bool | None = None


@dataclass(frozen=True)
class Priority:
    """`tar`, `tar(1)` or `pkg:coreutils`, one per line; earlier lines rank higher."""

    pages: dict[tuple[str, str | None], int]
    packages: dict[str, int]

    @classmethod
    def parse(cls, lines: Iterable[str]) -> Priority:
        pages: dict[tuple[str, str | None], int] = {}
        packages: dict[str, int] = {}
        for rank, raw in enumerate(lines):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            if line.startswith("pkg:"):
                packages.setdefault(line[4:].strip(), rank)
            elif line.endswith(")") and "(" in line:
                name, section = line[:-1].split("(", 1)
                pages.setdefault((name.strip(), section.strip()), rank)
            else:
                pages.setdefault((line, None), rank)
        return cls(pages, packages)

    @classmethod
    def load(cls, path: Path | None) -> Priority:
        if path is None:
            return cls({}, {})
        return cls.parse(path.read_text(encoding="utf-8").splitlines())

    def rank(self, candidate: Candidate) -> int | None:
        ranks = [
            self.pages.get((candidate.name, candidate.section)),
            self.pages.get((candidate.name, None)),
            self.packages.get(candidate.source_package or ""),
        ]
        present = [rank for rank in ranks if rank is not None]
        return min(present) if present else None


def select(
    candidates: Iterable[Candidate],
    *,
    priority: Priority | None = None,
    sections: Sequence[str] = INDEXED_SECTIONS,
    limit: int | None = None,
) -> list[Candidate]:
    """Indexed-tier pages in generation order, one per content hash."""
    priority = priority or Priority({}, {})
    order = {section: index for index, section in enumerate(sections)}
    chosen: dict[str, tuple[tuple, Candidate]] = {}
    for candidate in candidates:
        section_rank = order.get(candidate.section)
        prio = priority.rank(candidate)
        if section_rank is None and prio is None:
            continue
        key = (
            prio if prio is not None else float("inf"),
            0 if candidate.has_options is not False else 1,
            section_rank if section_rank is not None else len(order),
            candidate.name,
            candidate.section,
        )
        previous = chosen.get(candidate.content_sha256)
        if previous is None or key < previous[0]:
            chosen[candidate.content_sha256] = (key, candidate)
    ordered = [candidate for _, candidate in sorted(chosen.values(), key=lambda item: item[0])]
    return ordered[:limit] if limit is not None else ordered
