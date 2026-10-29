"""Automatic provenance for the parser and its direct option-extraction dependencies."""

from __future__ import annotations

from collections.abc import Sequence
from hashlib import sha256
from pathlib import Path

# The golden-options test requires fixture changes to update this source value.
# This file participates in the runtime fingerprint, so that update also changes
# the extractor version without a separate hand-maintained integer.
OPTION_EXTRACTOR_FIXTURES_SHA256 = (
    "936eca82135790b0586926fffd44fd63f243a4363ef51fbe8b86e30d6d56b4ed"
)


def extractor_version(sources: Sequence[Path]) -> int | None:
    """Return a JSON-safe code fingerprint, or unknown for a source-less distribution.

    Hashing the complete files deliberately invalidates comparisons for some
    nonsemantic edits too. That loses a mark rather than inventing an introduction.
    File names and length prefixes make the digest independent of install path
    and unambiguous across different file boundaries.
    """
    digest = sha256(b"betterman-option-extractor-v1\0")
    try:
        for source in sources:
            content = source.read_bytes().replace(b"\r\n", b"\n")
            digest.update(source.name.encode() + b"\0")
            digest.update(len(content).to_bytes(8, "big") + content)
    except OSError:
        return None
    # Thirteen hex digits fit exactly in JavaScript's 53-bit safe-integer range.
    return int(digest.hexdigest()[:13], 16) or 1


_SOURCE_DIR = Path(__file__).parent
OPTION_EXTRACTOR_SOURCES = tuple(
    _SOURCE_DIR / filename
    for filename in (
        "extractor_provenance.py",
        "mandoc_parser.py",
        "mandoc.py",
        "doc_model.py",
        "util.py",
    )
)
OPTION_EXTRACTOR_VERSION = extractor_version(OPTION_EXTRACTOR_SOURCES)
