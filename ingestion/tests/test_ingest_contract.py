"""Single cross-language ingest contract merge/alignment check.

Resolve protocol changes in convex/ingestContract.ts and convex_client.py together.
Contract v8 retains verified promotion-source reads, compare-and-swap, package
batches, extractor provenance, signatures, symbols and providers, adding demand
scores and indexable counts, adding B2 acquisition identities and stored notices.
Never resolve overlap by taking one branch's functions or payload fields.
"""

import re
from pathlib import Path

from ingestion.convex_client import (
    REQUIRED_DECLARATION_COUNTS,
    REQUIRED_FUNCTIONS,
    REQUIRED_SCHEMA_VERSION,
)


def test_required_contract_matches_convex_source():
    source = (Path(__file__).resolve().parents[2] / "convex" / "ingestContract.ts").read_text(
        encoding="utf-8"
    )
    version = re.search(r"INGEST_CONTRACT_SCHEMA_VERSION = (\d+);", source)
    functions = re.search(r"functions: \[([^\]]+)\]", source)
    counts = re.search(r"declarationCounts: \[([^\]]+)\]", source)
    pending = re.search(r"activatePending: (true|false)", source)
    assert version is not None
    assert functions is not None
    assert counts is not None
    assert pending is not None
    assert int(version.group(1)) == REQUIRED_SCHEMA_VERSION
    assert re.findall(r'"([^"]+)"', functions.group(1)) == list(REQUIRED_FUNCTIONS)
    assert re.findall(r'"([^"]+)"', counts.group(1)) == list(REQUIRED_DECLARATION_COUNTS)
    assert pending.group(1) == "true"
