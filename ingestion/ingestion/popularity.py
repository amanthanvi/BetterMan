"""B4's versioned, ingest-time index policy (also used by generation).

No request-time analytics. Package counts are Debian binary-package by_inst;
other systems use exact package-name matches, never fuzzy library guesses.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from urllib.parse import unquote, urlsplit

from ingestion.debian_indexes import PINS, popularity

POLICY_VERSION = 1
INDEXED_SECTIONS = ("1", "8", "5", "7")
POPULAR_INSTALLATIONS = 10_000
TRAFFIC_PAGEVIEWS = 100


@dataclass(frozen=True)
class Demand:
    score: int
    indexable: bool


@dataclass(frozen=True)
class PopularityPolicy:
    installations: dict[str, int]
    pageviews: dict[tuple[str, str], int]
    traffic_sha256: str | None = None
    traffic_generated_at: str | None = None

    @classmethod
    def load(cls) -> PopularityPolicy:
        counts = popularity(json.loads(PINS.read_text(encoding="utf-8")))
        path = os.environ.get("BETTERMAN_PLAUSIBLE_COUNTS")
        traffic: dict[tuple[str, str], int] = {}
        digest = generated_at = None
        if path:
            raw = Path(path).read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            snapshot = json.loads(raw)
            if not isinstance(snapshot, dict):
                raise ValueError("Invalid Plausible aggregate snapshot")
            generated_at = snapshot.get("generatedAt")
            if snapshot.get("schemaVersion") != 1 or not isinstance(
                snapshot.get("pageviews"), dict
            ):
                raise ValueError("Invalid Plausible aggregate snapshot")
            for path, count in snapshot["pageviews"].items():
                if type(count) is not int or not 0 <= count <= 2**53 - 1:
                    raise ValueError("Invalid Plausible aggregate count")
                parts = urlsplit(path)
                segments = parts.path.split("/")
                # A8 strips distro/query parameters. Attribute route demand to
                # all distro editions, never pretend these are distro counts.
                if (
                    not parts.scheme
                    and not parts.netloc
                    and len(segments) == 4
                    and segments[1] == "man"
                    and segments[2]
                    and segments[3]
                ):
                    key = (unquote(segments[2]).lower(), unquote(segments[3]).lower())
                    traffic[key] = traffic.get(key, 0) + count
        return cls(counts, traffic, digest, generated_at)

    def evaluate(self, name: str, section: str, package: str | None = None) -> Demand:
        # Strip Debian multiarch qualifier only; exact matches keep the proxy honest.
        installed = self.installations.get((package or "").split(":", 1)[0], 0)
        views = self.pageviews.get((name.lower(), section.lower()), 0)
        score = round(1000 * math.log10(1 + installed) + 2000 * math.log10(1 + views))
        return Demand(
            score,
            section.lower()[:1] in INDEXED_SECTIONS
            or installed >= POPULAR_INSTALLATIONS
            or views >= TRAFFIC_PAGEVIEWS,
        )

    def provenance(self) -> dict:
        pins = json.loads(PINS.read_text(encoding="utf-8"))
        return {
            "policyVersion": POLICY_VERSION,
            "popconSha256": pins["popcon"]["sha256"],
            "popularInstallations": POPULAR_INSTALLATIONS,
            "trafficPageviews": TRAFFIC_PAGEVIEWS,
            "trafficRoutes": len(self.pageviews),
            "trafficSha256": self.traffic_sha256,
            "trafficGeneratedAt": self.traffic_generated_at,
        }


@lru_cache(maxsize=1)
def default_policy() -> PopularityPolicy:
    """Helper-call default; publication explicitly loads one policy per release."""
    return PopularityPolicy.load()
