"""Explicit maintenance command: refresh the checksummed by_inst snapshot."""

import gzip
import hashlib
import io
import json
from datetime import UTC, datetime
from urllib.request import Request, urlopen

from ingestion.debian_indexes import PINS


def main():
    pins = json.loads(PINS.read_text())
    source = pins["popcon"]["url"]
    if source != "https://popcon.debian.org/by_inst":
        raise ValueError("Unexpected popularity source")
    # Bounded maintenance download; runtime ingestion never fetches mutable data.
    with urlopen(
        Request(source, headers={"User-Agent": "BetterMan-ingestion/1"}), timeout=90
    ) as res:
        raw = res.read(32 * 1024 * 1024 + 1)
    if len(raw) > 32 * 1024 * 1024:
        raise ValueError("popcon snapshot exceeds 32 MiB")
    counts = {}
    for line in raw.decode("utf-8").splitlines():
        columns = line.split()
        if not columns or not columns[0].isdigit():
            continue
        name, count = columns[1], int(columns[2])
        if name in counts or count < 0:
            raise ValueError("Invalid popularity row")
        counts[name] = count
    if len(counts) < 100_000:
        raise ValueError("Incomplete popcon snapshot")
    buffer = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buffer, mtime=0, compresslevel=6) as stream:
        stream.write("".join(f"{name}\t{counts[name]}\n" for name in sorted(counts)).encode())
    data = buffer.getvalue()
    (PINS.parent / pins["popcon"]["file"]).write_bytes(data)
    pins["popcon"].update(
        acquiredAt=datetime.now(UTC).date().isoformat(),
        sourceSha256=hashlib.sha256(raw).hexdigest(),
        sha256=hashlib.sha256(data).hexdigest(),
    )
    PINS.write_text(json.dumps(pins, indent=2) + "\n")
    print(f"Pinned {len(counts)} package counts; review both hashes and snapshot changes")


if __name__ == "__main__":
    main()
