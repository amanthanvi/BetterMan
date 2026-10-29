"""Choose B4 indexable pages, ordered by their ingest-time demand score."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from pathlib import Path

from ingestion.popularity import INDEXED_SECTIONS, PopularityPolicy


@dataclass(frozen=True)
class Candidate:
    name: str
    section: str
    content_sha256: str
    source_package: str | None = None
    has_options: bool | None = None
    indexable: bool | None = None
    popularity_score: int | None = None


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
    policy = PopularityPolicy.load()
    order = {section: index for index, section in enumerate(sections)}
    chosen: dict[str, tuple[tuple, Candidate]] = {}
    for candidate in candidates:
        section_rank = order.get(candidate.section[:1])
        prio = priority.rank(candidate)
        demand = policy.evaluate(candidate.name, candidate.section, candidate.source_package)
        indexed = candidate.indexable if candidate.indexable is not None else demand.indexable
        if not indexed:
            continue
        key = (
            prio if prio is not None else float("inf"),
            -(
                candidate.popularity_score
                if candidate.popularity_score is not None
                else demand.score
            ),
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
