"""Read pinned Contents metadata only; project B4 without archives or Convex writes."""

import argparse
import gzip
import json
from pathlib import Path

from ingestion.debian_indexes import MAN_PATH, catalog
from ingestion.package_set import FULL_PACKAGE_SET_DEBIAN
from ingestion.popularity import PopularityPolicy


def report(indexes: Path, policy: PopularityPolicy) -> dict:
    routes: dict[tuple[str, str], set[str]] = {}
    for filename in ("main-Contents-all.gz", "main-Contents-amd64.gz"):
        with gzip.open(indexes / filename, "rt") as lines:
            for line in lines:
                fields = line.rstrip().rsplit(None, 1)
                match = MAN_PATH.fullmatch(fields[0]) if len(fields) == 2 else None
                if match:
                    key = (match[1].lower(), match[2].lower())
                    routes.setdefault(key, set()).update(
                        p.rsplit("/", 1)[-1] for p in fields[1].split(",")
                    )
    selected = set(FULL_PACKAGE_SET_DEBIAN)

    def counts(items):
        total = indexed = 0
        for (name, section), packages in items:
            # A proxy for B1's deterministic canonical election; actual aliases,
            # parse rejections and alternative providers require extraction.
            package = min(packages, key=lambda p: (-policy.installations.get(p, 0), p))
            total += 1
            indexed += policy.evaluate(name, section, package).indexable
        return {"routes": total, "indexable": indexed, "fraction": indexed / total if total else 0}

    full = counts(routes.items())
    curated = counts((key, pkgs & selected) for key, pkgs in routes.items() if pkgs & selected)
    return {
        "scope": (
            "checksum-verified English Contents routes, including aliases; no archive extraction"
        ),
        "policy": policy.provenance(),
        "curatedExplicitPackages": curated,
        "fullDebianRoutes": full,
        "projected115kCanonicalIndexable": round(115_000 * full["fraction"]),
        "limits": (
            "Alias distribution, provider election, package dependencies "
            "and parse rejection can change the ratio."
        ),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--indexes", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.indexes.mkdir(parents=True, exist_ok=True)
    catalog(args.indexes)  # re-verifies every cached byte using B1's pins
    result = report(args.indexes, PopularityPolicy.load())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
