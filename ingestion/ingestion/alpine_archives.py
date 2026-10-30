"""Pinned APKINDEX snapshots and APK v2 native control/data verification."""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import sqlite3
import tarfile
import zlib
from dataclasses import dataclass
from pathlib import Path

from ingestion.debian_archives import MAX_SOURCE_BYTES, ExtractedQuota
from ingestion.debian_indexes import DownloadIntegrityError, popularity, safe_path
from ingestion.fedora_archives import copyright_text as package_notice
from ingestion.fedora_archives import extract_payload, notice_path


@dataclass(frozen=True)
class AlpinePackage:
    name: str
    version: str
    filename: str
    control_checksum: str
    size: int
    installed: int = 0
    priority: str = "optional"
    depends: tuple[str, ...] = ()
    provides: tuple[str, ...] = ()
    license: str = ""
    source: str = ""
    install_if: tuple[str, ...] = ()
    sha256: str = ""
    data_sha256: str = ""
    data_offset: int = 0
    pinned_sha256: str = ""

    def __post_init__(self):
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9+_.-]*", self.name):
            raise ValueError("Invalid APK package name")
        if not re.fullmatch(r"[0-9][A-Za-z0-9._+~:-]*", self.version):
            raise ValueError("Invalid APK package version")
        if safe_path(self.filename) != self.filename or not self.filename.endswith(".apk"):
            raise ValueError("Invalid APK archive path")
        if (
            not self.control_checksum.startswith("Q1")
            or len(base64.b64decode(self.control_checksum[2:], validate=True)) != 20
        ):
            raise ValueError("Unsupported APK control checksum")
        if self.size <= 0 or (self.sha256 and not re.fullmatch(r"[a-f0-9]{64}", self.sha256)):
            raise ValueError("Invalid APK size/observed SHA256")
        if self.pinned_sha256 and not re.fullmatch(r"[a-f0-9]{64}", self.pinned_sha256):
            raise ValueError("Invalid reviewed APK SHA256")

    @property
    def cache_key(self):
        return hashlib.sha256(self.control_checksum.encode()).hexdigest()

    @property
    def receipt_digest(self):
        return self.control_checksum


def names(value):
    return tuple(
        re.split(r"[<>=~]", token, maxsplit=1)[0]
        for token in value.split()
        if not token.startswith("!")
    )


def catalog(root: Path, pins_path: Path):
    pins = json.loads(pins_path.read_text())
    hashes = pins.get("packageSha256", {})
    if not isinstance(hashes, dict) or any(
        not isinstance(path, str)
        or safe_path(path) != path
        or not isinstance(digest, str)
        or not re.fullmatch(r"[a-f0-9]{64}", digest)
        for path, digest in hashes.items()
    ):
        raise ValueError("Invalid reviewed APK SHA256 pins")
    counts = popularity(pins)
    available = {}
    selected = []
    root.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(root / "owners.sqlite3") as db:
        db.execute("CREATE TABLE IF NOT EXISTS owners(path TEXT,pkg TEXT,PRIMARY KEY(path,pkg))")
    db.close()
    for repo in pins["repositories"]:
        index = pins_path.parent / repo["file"]
        raw = index.read_bytes()
        if len(raw) != repo["size"] or hashlib.sha256(raw).hexdigest() != repo["sha256"]:
            raise ValueError("Pinned APKINDEX snapshot checksum mismatch")
        with tarfile.open(fileobj=io.BytesIO(raw), mode="r:gz") as archive:
            member = archive.getmember("APKINDEX")
            if member.size > 32 * 1024**2:
                raise ValueError("Oversized APKINDEX metadata")
            text = archive.extractfile(member).read(32 * 1024**2 + 1).decode("utf-8")
        for block in text.strip().split("\n\n"):
            entry = {}
            for line in block.splitlines():
                key, separator, value = line.partition(":")
                if not separator or key in entry:
                    raise ValueError("Malformed APKINDEX record")
                entry[key] = value
            if entry["A"] not in {"x86_64", "noarch"}:
                continue
            name, version = entry["P"], entry["V"]
            elected = pins.get("packageVersions", {}).get(name)
            if elected is not None and version != elected:
                continue
            if name in available:
                raise ValueError("Duplicate APK package identity requires a version pin")
            package = AlpinePackage(
                name,
                version,
                f"{repo['name']}/x86_64/{name}-{version}.apk",
                entry["C"],
                int(entry["S"]),
                counts.get(name, 0),
                depends=names(entry.get("D", "")),
                provides=names(entry.get("p", "")),
                license=entry.get("L", ""),
                source=entry.get("o") or name,
                install_if=names(entry.get("i", "")),
                pinned_sha256=hashes.get(f"{repo['name']}/x86_64/{name}-{version}.apk", ""),
            )
            available[name] = package
            if name.endswith("-doc") or name in {"man-pages", "man-pages-posix"}:
                selected.append(package)
    for name, version in pins.get("packageVersions", {}).items():
        if name not in available or available[name].version != version:
            raise ValueError("Pinned APK package version unavailable")
    if set(hashes) - {p.filename for p in available.values()}:
        raise ValueError("Reviewed APK SHA256 pins do not match the pinned catalog")
    return pins, sorted(selected, key=lambda p: p.name), available


def require_sha256_pin(pins, package):
    if "packageSha256" in pins:
        expected = pins["packageSha256"].get(package.filename)
        if not expected:
            raise ValueError(f"Missing reviewed APK SHA256 pin: {package.filename}")
        if package.pinned_sha256 != expected:
            raise ValueError("APK SHA256 does not match the reviewed lock")


def write_sha256_pins(workspace):
    """Export all acquired archives for review; never rewrite the committed lock."""
    hashes = {}
    for name in sorted(workspace.acquired):
        package = workspace.available[name]
        require_sha256_pin(workspace.pins, package)
        if not package.sha256 or not workspace.store.complete(package):
            raise ValueError("Cannot export an unverified APK SHA256 pin")
        hashes[package.filename] = package.sha256
    document = {"releaseSha256": workspace.pins["releaseSha256"], "packageSha256": hashes}
    path = workspace.root / "alpine-package-sha256.json"
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(document, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)
    return path


def gzip_section(stream, limit):
    """One bounded gzip member, preserving the next member's exact offset."""
    decoder = zlib.decompressobj(31)
    output = bytearray()
    checksum = hashlib.sha1()  # APKINDEX Q1 is the native compressed-control checksum.
    while not decoder.eof:
        raw = stream.read(64 * 1024)
        if not raw:
            raise DownloadIntegrityError("apk_truncated_control")
        try:
            output.extend(decoder.decompress(raw, limit - len(output) + 1))
        except zlib.error as error:
            raise DownloadIntegrityError("apk_gzip_control") from error
        if len(output) > limit:
            raise DownloadIntegrityError("apk_oversize_control")
        used = len(raw) - len(decoder.unused_data)
        checksum.update(raw[:used])
        if decoder.unused_data:
            stream.seek(-len(decoder.unused_data), 1)
    return bytes(output), checksum.digest()


def verify(archive, package):
    if archive.stat().st_size != package.size:
        raise DownloadIntegrityError("apk_size")
    with archive.open("rb") as stream:
        signatures, _ = gzip_section(stream, 1024**2)
        try:
            with tarfile.open(fileobj=io.BytesIO(signatures), mode="r:") as tar:
                members = list(tar)
                if not members or not all(m.name.startswith(".SIGN.") for m in members):
                    raise DownloadIntegrityError("apk_signature_section")
        except (tarfile.TarError, EOFError) as error:
            raise DownloadIntegrityError("apk_malformed_signature") from error
        control, checksum = gzip_section(stream, MAX_SOURCE_BYTES)
        if checksum != base64.b64decode(package.control_checksum[2:], validate=True):
            raise DownloadIntegrityError("apk_control_checksum")
        try:
            with tarfile.open(fileobj=io.BytesIO(control), mode="r:") as tar:
                member = tar.getmember(".PKGINFO")
                if not member.isfile() or member.size > MAX_SOURCE_BYTES:
                    raise DownloadIntegrityError("apk_pkginfo")
                info = tar.extractfile(member).read(MAX_SOURCE_BYTES + 1).decode("utf-8")
        except (tarfile.TarError, EOFError, KeyError, UnicodeDecodeError) as error:
            raise DownloadIntegrityError("apk_malformed_control") from error
        fields = {}
        for line in info.splitlines():
            if line.startswith("#") or not line.strip():
                continue
            key, separator, value = line.partition(" = ")
            if not separator:
                raise DownloadIntegrityError("apk_pkginfo")
            if key in {"pkgname", "pkgver", "arch", "datahash"}:
                if key in fields:
                    raise DownloadIntegrityError("apk_duplicate_identity")
                fields[key] = value
        if (
            fields.get("pkgname") != package.name
            or fields.get("pkgver") != package.version
            or fields.get("arch") not in {"x86_64", "noarch"}
        ):
            raise DownloadIntegrityError("apk_identity")
        expected = fields.get("datahash", "")
        if not re.fullmatch(r"[a-f0-9]{64}", expected):
            raise DownloadIntegrityError("apk_missing_datahash")
        offset = stream.tell()
        data = hashlib.sha256()
        while chunk := stream.read(256 * 1024):
            data.update(chunk)
        if data.hexdigest() != expected:
            raise DownloadIntegrityError("apk_data_checksum")
        stream.seek(0)
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
        if package.pinned_sha256 and actual != package.pinned_sha256:
            raise DownloadIntegrityError("apk_sha256")
    return {"sha256": actual, "data_sha256": expected, "data_offset": offset}


def extract(archive, package, root, *, quota=None, **_kwargs):
    if not package.sha256 or not package.data_offset:
        raise ValueError("APK must pass native verification before extraction")
    with archive.open("rb") as stream:
        stream.seek(package.data_offset)
        return extract_payload(stream, package, root, quota=quota or ExtractedQuota(root / "files"))


def copyright_text(workspace, package):
    text = package_notice(workspace, package)
    if text:
        return text
    owner = "spdx-licenses-text"
    if owner not in workspace.available:
        return ""
    if owner not in workspace.acquired:
        workspace.acquire([workspace.available[owner]], workers=1)
    identifiers = set(
        re.findall(r"[A-Za-z0-9][A-Za-z0-9.+-]*", workspace.available[package].license)
    )
    texts = []
    for (path,) in workspace.store.db.execute(
        "SELECT path FROM entries WHERE pkg=? AND kind IN ('file','link')", (owner,)
    ):
        if Path(path).name.removesuffix(".txt") in identifiers and notice_path(path):
            texts.append(workspace.resolve(owner, path).decode("utf-8", errors="replace"))
    return "\n\n".join(texts)
