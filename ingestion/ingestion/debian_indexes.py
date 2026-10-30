"""Immutable Debian snapshot metadata; every downloaded byte is digest checked."""

from __future__ import annotations

import email.utils
import gzip
import hashlib
import json
import lzma
import math
import random
import re
import sqlite3
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from http.client import HTTPException
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PINS = Path(__file__).resolve().parents[1] / "data" / "debian-trixie.json"
BINARY_PATH = re.compile(r"^(?:(?:usr/)?s?bin/[^/]+|usr/lib/llvm-[^/]+/bin/[^/]+)$")
MAN_PATH = re.compile(
    # These private English roots are registered under unchanged basenames by
    # their postinst data. Retain the sources directly, without running helpers.
    r"^(?:usr/share/man|usr/lib/jvm/[^/]+/man|usr/share/"
    r"(?:postgresql/[0-9]+|firebird/[0-9]+\.[0-9]+|groovy|icedtea-web|librarian-puppet|scala-[0-9]+\.[0-9]+)/man)"
    r"/man[1-9][a-z0-9]*/([^/]+)\.([1-9][a-z0-9]*)(?:\.(?:gz|xz|bz2|zst))?$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Package:
    name: str
    version: str
    filename: str
    sha256: str
    size: int
    installed: int = 0
    priority: str = "optional"

    def __post_init__(self):
        if not re.fullmatch(r"[a-z0-9][a-z0-9+.-]*", self.name) or not self.version.strip():
            raise ValueError("Invalid Debian package identity")
        if safe_path(self.filename) != self.filename or not self.filename.startswith("pool/main/"):
            raise ValueError("Invalid Debian pool path")
        if not re.fullmatch(r"[a-f0-9]{64}", self.sha256) or self.size <= 0:
            raise ValueError("Invalid Debian package digest/size")


def safe_path(value: str) -> str:
    value = value.removeprefix("./")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "\\" in value or any(ord(c) < 32 for c in value):
        raise ValueError(f"Unsafe archive path: {value!r}")
    return str(path)


def _download_once(url: str, destination: Path, digest: str, size: int | None = None) -> int:
    """Bounded streaming download, atomic publish, and checked cache replays."""
    if not re.fullmatch(r"[a-f0-9]{64}", digest) or not url.startswith("https://"):
        raise ValueError("A pinned HTTPS URL and SHA256 are required")
    if destination.exists():
        with destination.open("rb") as source:
            actual = hashlib.file_digest(source, "sha256").hexdigest()
        if actual == digest and (size is None or destination.stat().st_size == size):
            return 0
        destination.unlink()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(destination.name + f".{uuid.uuid4().hex}.part")
    count = 0
    checksum = hashlib.sha256()
    try:
        with (
            urlopen(
                Request(url, headers={"User-Agent": "BetterMan-ingestion/1"}), timeout=90
            ) as response,
            temporary.open("wb") as output,
        ):
            while chunk := response.read(256 * 1024):
                count += len(chunk)
                if count > (size if size is not None else 2 * 1024 * 1024):
                    raise ValueError("Download exceeds declared size")
                checksum.update(chunk)
                output.write(chunk)
        if checksum.hexdigest() != digest or (size is not None and count != size):
            raise ValueError(f"SHA256/size mismatch: {destination.name}")
        temporary.replace(destination)
        return count
    finally:
        temporary.unlink(missing_ok=True)


def download(
    url: str, destination: Path, digest: str, size: int | None = None, *, fallback_url=None
) -> int:
    for attempt in range(8):
        try:
            return _download_once(url, destination, digest, size)
        except HTTPError as exc:
            if fallback_url and exc.code in {404, 410}:
                exc.close()
                url, fallback_url = fallback_url, None
                continue
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 7:
                raise
            retry_after = exc.headers.get("Retry-After", "") if exc.headers else ""
            exc.close()
        except (URLError, TimeoutError, ConnectionError, OSError, HTTPException):
            if attempt == 7:
                raise
            retry_after = ""
        if fallback_url:
            url, fallback_url = fallback_url, None
        delay = min(180, 5 * 2**attempt) + random.uniform(0, 3)
        try:
            advertised = float(retry_after)
        except ValueError:
            try:
                advertised = (
                    email.utils.parsedate_to_datetime(retry_after) - datetime.now(UTC)
                ).total_seconds()
            except (ValueError, TypeError):
                advertised = 0
        if not math.isfinite(advertised) or advertised > 900:
            raise RuntimeError("Retry-After exceeds the retry budget; resume acquisition later")
        delay = max(delay, max(0, advertised))
        # Sleep in short pieces so the absolute workflow budget stays effective.
        from ingestion.convex_client import ingest_activation_deadline

        remaining = delay
        while remaining > 0:
            deadline = ingest_activation_deadline()
            chunk = min(remaining, 30)
            if deadline is not None and time.time() + chunk >= deadline:
                raise RuntimeError("Job deadline exhausted during Debian download backoff")
            time.sleep(chunk)
            remaining -= chunk
    raise RuntimeError("Download attempts exhausted")


def release_checksums(text: str) -> dict[str, tuple[str, int]]:
    checksums = {}
    active = False
    for line in text.splitlines():
        if line == "SHA256:":
            active = True
        elif not line.startswith(" "):
            active = False
        elif active:
            digest, size, filename = line.split()
            if not re.fullmatch(r"[a-f0-9]{64}", digest) or int(size) < 0:
                raise ValueError("Invalid Release SHA256 entry")
            checksums[safe_path(filename)] = (digest, int(size))
    if not checksums:
        raise ValueError("Release has no SHA256 entries")
    return checksums


def records(lines):
    record = {}
    key = ""
    for line in lines:
        if not line.strip():
            if record:
                yield record
            record, key = {}, ""
        elif line[0].isspace():
            if key:
                record[key] += "\n" + line.strip()
        else:
            key, separator, value = line.rstrip("\n").partition(":")
            if not separator:
                raise ValueError("Malformed Packages record")
            record[key] = value.strip()
    if record:
        yield record


def popularity(pins: dict) -> dict[str, int]:
    source = PINS.parent / pins["popcon"]["file"]
    if hashlib.sha256(source.read_bytes()).hexdigest() != pins["popcon"]["sha256"]:
        raise ValueError("Pinned popcon snapshot checksum mismatch")
    with gzip.open(source, "rt") as stream:
        return {name: int(count) for name, count in (line.split() for line in stream)}


def catalog(root: Path) -> tuple[dict, list[Package]]:
    pins = json.loads(PINS.read_text())
    mirror = pins["mirror"].rstrip("/")
    suite = f"dists/{pins['suite']}"
    release = root / "Release"
    download(f"{mirror}/{suite}/Release", release, pins["releaseSha256"])
    checksums = release_checksums(release.read_text())
    selected = set()
    owners = sqlite3.connect(root / "owners.sqlite3")
    owners.execute("CREATE TABLE IF NOT EXISTS owners(path TEXT,pkg TEXT,PRIMARY KEY(path,pkg))")
    for name in ["main/Contents-all.gz", "main/Contents-amd64.gz"]:
        digest, size = checksums[name]
        path = root / name.replace("/", "-")
        download(f"{mirror}/{suite}/{name}", path, digest, size)
        with gzip.open(path, "rt", errors="strict") as lines:
            for line in lines:
                fields = line.rstrip().rsplit(None, 1)
                if len(fields) == 2 and MAN_PATH.fullmatch(fields[0]):
                    selected.update(owner.rsplit("/", 1)[-1] for owner in fields[1].split(","))
                if len(fields) == 2 and (
                    MAN_PATH.fullmatch(fields[0])
                    or BINARY_PATH.fullmatch(fields[0])
                    or (
                        fields[0].startswith("usr/share/doc/")
                        and (fields[0].endswith("/copyright") or fields[0].count("/") == 3)
                    )
                ):
                    owners.executemany(
                        "INSERT OR IGNORE INTO owners VALUES (?,?)",
                        [(fields[0], owner.rsplit("/", 1)[-1]) for owner in fields[1].split(",")],
                    )
        owners.commit()
    owners.close()
    name = "main/binary-amd64/Packages.xz"
    digest, size = checksums[name]
    path = root / "Packages.xz"
    download(f"{mirror}/{suite}/{name}", path, digest, size)
    counts = popularity(pins)
    packages = []
    with lzma.open(path, "rt") as lines:
        for record in records(lines):
            if record["Package"] not in selected:
                continue
            filename = safe_path(record["Filename"])
            if not filename.startswith("pool/main/") or not filename.endswith(".deb"):
                raise ValueError("Unexpected package pool path")
            packages.append(
                Package(
                    record["Package"],
                    record["Version"],
                    filename,
                    record["SHA256"],
                    int(record["Size"]),
                    counts.get(record["Package"], 0),
                    record.get("Priority", "optional"),
                )
            )
    missing = selected - {package.name for package in packages}
    if missing:
        raise ValueError(f"Contents packages missing from Packages: {sorted(missing)[:10]}")
    return pins, sorted(packages, key=lambda package: (-package.installed, package.name))


def available_packages(root: Path, counts: dict[str, int]) -> dict[str, Package]:
    with lzma.open(root / "Packages.xz", "rt") as lines:
        return {
            record["Package"]: Package(
                record["Package"],
                record["Version"],
                safe_path(record["Filename"]),
                record["SHA256"],
                int(record["Size"]),
                counts.get(record["Package"], 0),
                record.get("Priority", "optional"),
            )
            for record in records(lines)
        }
