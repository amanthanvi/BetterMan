"""Pinned Arch files databases and data-only package extraction."""

from __future__ import annotations

import json
import re
import sqlite3
import tarfile
from pathlib import Path

from ingestion.debian_archives import MAX_SOURCE_BYTES, ExtractedQuota
from ingestion.debian_indexes import BINARY_PATH, MAN_PATH, download, popularity, safe_path
from ingestion.fedora_archives import (
    ArchivePackage,
    extract_payload,
    notice_path,
    validate_package,
)
from ingestion.fedora_archives import (
    copyright_text as package_notice,
)


class ArchPackage(ArchivePackage):
    def __post_init__(self):
        validate_package(self, (".pkg.tar.zst", ".pkg.tar.xz"))


def fields(text):
    result = {}
    for block in text.strip().split("\n\n"):
        lines = block.splitlines()
        if not lines or not re.fullmatch(r"%[A-Z0-9_]+%", lines[0]):
            raise ValueError("Invalid Arch database field")
        key = lines[0].strip("%")
        if key in result:
            raise ValueError("Duplicate Arch database field")
        result[key] = lines[1:]
    return result


def catalog(root: Path, pins_path: Path):
    pins = json.loads(pins_path.read_text())
    counts = popularity(pins)
    root.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(root / "owners.sqlite3")
    db.execute("CREATE TABLE IF NOT EXISTS owners(path TEXT,pkg TEXT,PRIMARY KEY(path,pkg))")
    available, selected = {}, set()
    for repo in pins["repositories"]:
        path = root / f"{repo['name']}.files"
        relative = f"{repo['name']}/os/x86_64/{repo['name']}.files"
        download(
            f"{pins.get('cdn', pins['mirror'])}/{relative}",
            path,
            repo["sha256"],
            repo["size"],
            fallback_url=f"{pins['mirror']}/{relative}" if pins.get("cdn") else None,
        )
        pending = {}
        with tarfile.open(path, mode="r|*") as archive:
            for member in archive:
                if not member.isfile():
                    continue
                member_path = safe_path(member.name)
                directory, kind = member_path.rsplit("/", 1)
                if kind not in {"desc", "files"}:
                    continue
                if member.size > MAX_SOURCE_BYTES:
                    raise ValueError("Oversized Arch package metadata")
                entry = pending.setdefault(directory, {})
                if kind in entry:
                    raise ValueError("Duplicate Arch package metadata")
                entry[kind] = fields(
                    archive.extractfile(member).read(MAX_SOURCE_BYTES + 1).decode("utf-8")
                )
                if len(pending) > 2:
                    raise ValueError("Noncontiguous Arch package metadata")
                if set(entry) != {"desc", "files"}:
                    continue
                desc = entry["desc"]
                name = desc["NAME"][0]
                if name in available:
                    raise ValueError("Duplicate Arch package identity")
                filename = safe_path(desc["FILENAME"][0])
                if "/" in filename or desc["ARCH"][0] not in {"x86_64", "any"}:
                    raise ValueError("Invalid Arch archive identity")
                package = ArchPackage(
                    name,
                    desc["VERSION"][0],
                    f"{repo['name']}/os/x86_64/{filename}",
                    desc["SHA256SUM"][0],
                    int(desc["CSIZE"][0]),
                    counts.get(name, 0),
                    depends=tuple(
                        re.split(r"[<>=]", item, maxsplit=1)[0] for item in desc.get("DEPENDS", [])
                    ),
                    provides=tuple(
                        re.split(r"[<>=]", item, maxsplit=1)[0] for item in desc.get("PROVIDES", [])
                    ),
                    license=" AND ".join(desc.get("LICENSE", [])),
                    source=desc.get("BASE", [name])[0],
                )
                available[name] = package
                for item in entry["files"].get("FILES", []):
                    manual = MAN_PATH.fullmatch(item) and item.startswith(
                        ("usr/share/man/", "usr/lib/jvm/")
                    )
                    if manual:
                        selected.add(name)
                    if manual or BINARY_PATH.fullmatch(item) or notice_path(item):
                        db.execute(
                            "INSERT OR IGNORE INTO owners VALUES (?,?)", (safe_path(item), name)
                        )
                del pending[directory]
        if pending:
            raise ValueError("Incomplete Arch package metadata")
        db.commit()
    db.close()
    return pins, [available[n] for n in sorted(selected)], available


def extract(archive, package, root, *, quota=None, **_kwargs):
    with archive.open("rb") as stream:
        return extract_payload(stream, package, root, quota=quota or ExtractedQuota(root / "files"))


def copyright_text(workspace, package):
    text = package_notice(workspace, package)
    if text:
        return text
    # Arch's licenses package supplies the exact declared SPDX texts; read only
    # verified archive entries, never the host's installed license directory.
    if "licenses" not in workspace.available:
        return ""
    if "licenses" not in workspace.acquired:
        workspace.acquire([workspace.available["licenses"]], workers=1)
    identifiers = set(
        re.findall(r"[A-Za-z0-9][A-Za-z0-9.+-]*", workspace.available[package].license)
    )
    texts = []
    for (path,) in workspace.store.db.execute(
        "SELECT path FROM entries WHERE pkg='licenses' AND kind IN ('file','link')"
    ):
        if Path(path).name.removesuffix(".txt") in identifiers and notice_path(path):
            texts.append(workspace.resolve("licenses", path).decode("utf-8", errors="replace"))
    return "\n\n".join(texts)
