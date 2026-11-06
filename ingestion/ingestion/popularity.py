"""B4's versioned, ingest-time index policy (also used by generation).

No request-time analytics. Package counts are Debian binary-package by_inst;
other systems use exact package-name matches, never fuzzy library guesses.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache

from ingestion.debian_indexes import PINS, popularity

POLICY_VERSION = 1
INDEXED_SECTIONS = ("1", "8", "5", "7")
POPULAR_INSTALLATIONS = 10_000


@dataclass(frozen=True)
class Demand:
    score: int
    indexable: bool


@dataclass(frozen=True)
class PopularityPolicy:
    installations: dict[str, int]

    @classmethod
    def load(cls) -> PopularityPolicy:
        return cls(popularity(json.loads(PINS.read_text(encoding="utf-8"))))

    def evaluate(self, name: str, section: str, package: str | None = None) -> Demand:
        # Strip Debian multiarch qualifier only; exact matches keep the proxy honest.
        installed = self.installations.get((package or "").split(":", 1)[0], 0)
        return Demand(
            round(1000 * math.log10(1 + installed)),
            section.lower()[:1] in INDEXED_SECTIONS or installed >= POPULAR_INSTALLATIONS,
        )

    def provenance(self) -> dict:
        pins = json.loads(PINS.read_text(encoding="utf-8"))
        return {
            "policyVersion": POLICY_VERSION,
            "popconSha256": pins["popcon"]["sha256"],
            "popularInstallations": POPULAR_INSTALLATIONS,
        }


@lru_cache(maxsize=1)
def default_policy() -> PopularityPolicy:
    """Helper-call default; publication explicitly loads one policy per release."""
    return PopularityPolicy.load()
