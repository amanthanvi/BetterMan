"""Fedora's pinned primary/filelists catalog and data-only RPM payload reader."""

from __future__ import annotations

import io
import json
import logging
import re
import sqlite3
import subprocess
import tarfile
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

from ingestion.debian_archives import MAX_SOURCE_BYTES, ExtractedQuota, MissingSource
from ingestion.debian_indexes import (
    BINARY_PATH,
    MAN_PATH,
    Package,
    download,
    link_target,
    popularity,
    safe_path,
)
from ingestion.util import sha256_hex


@dataclass(frozen=True)
class ArchivePackage(Package):
    license: str = ""
    source: str = ""

    def __post_init__(self):
        validate_package(self, (".rpm",))


def validate_package(package, suffixes):
    if (
        not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9+_.-]*", package.name)
        or not package.version.strip()
    ):
        raise ValueError("Invalid archive package identity")
    if safe_path(package.filename) != package.filename or not package.filename.endswith(suffixes):
        raise ValueError("Invalid package archive path")
    if not re.fullmatch(r"[a-f0-9]{64}", package.sha256) or package.size <= 0:
        raise ValueError("Invalid archive package checksum/size")


def catalog(root: Path, pins_path: Path):
    from compression.zstd import open as zstd_open

    pins = json.loads(pins_path.read_text())
    mirror = pins["mirror"]
    repomd = root / "repomd.xml"
    download(
        f"{mirror}/repodata/repomd.xml",
        repomd,
        pins["releaseSha256"],
        fallback_url=f"{pins['fallbackMirror']}/repodata/repomd.xml"
        if pins.get("fallbackMirror")
        else None,
    )
    namespace = {"r": "http://linux.duke.edu/metadata/repo"}
    metadata = {}
    for item in ET.fromstring(repomd.read_bytes()).findall("r:data", namespace):
        kind = item.attrib["type"]
        if kind not in {"primary", "filelists"}:
            continue
        checksum = item.find("r:checksum", namespace)
        if checksum is None or checksum.attrib.get("type") != "sha256":
            raise ValueError("Fedora metadata requires SHA256")
        location = safe_path(item.find("r:location", namespace).attrib["href"])
        if not location.startswith("repodata/") or not location.endswith(".xml.zst"):
            raise ValueError("Unexpected Fedora metadata path")
        path = root / f"{kind}.xml.zst"
        download(
            f"{mirror}/{location}",
            path,
            checksum.text,
            int(item.findtext("r:size", namespaces=namespace)),
            fallback_url=f"{pins['fallbackMirror']}/{location}"
            if pins.get("fallbackMirror")
            else None,
        )
        metadata[kind] = path
    if set(metadata) != {"primary", "filelists"}:
        raise ValueError("Missing Fedora primary/filelists metadata")
    counts = popularity(pins)
    available = {}
    package_ids = set()
    common = "{http://linux.duke.edu/metadata/common}"
    rpm = "{http://linux.duke.edu/metadata/rpm}"
    with zstd_open(metadata["primary"], "rb") as stream:
        for _event, element in ET.iterparse(stream, events=("end",)):
            if element.tag != common + "package":
                continue
            arch = element.findtext(common + "arch")
            if arch not in {"x86_64", "noarch"}:
                element.clear()
                continue
            name = element.findtext(common + "name")
            version = element.find(common + "version").attrib
            checksum = element.find(common + "checksum")
            if checksum.attrib.get("type") != "sha256":
                raise ValueError("Fedora packages require SHA256")
            fmt = element.find(common + "format")
            identity = f"{version['epoch']}:{version['ver']}-{version['rel']}"
            package_ids.add(checksum.text)
            elected = pins.get("packageVersions", {}).get(name)
            if elected is not None and elected != identity:
                element.clear()
                continue
            if name in available:
                raise ValueError("Multiple Fedora package versions require an explicit pin")
            available[name] = ArchivePackage(
                name,
                f"{version['epoch']}:{version['ver']}-{version['rel']}",
                element.find(common + "location").attrib["href"],
                checksum.text,
                int(element.find(common + "size").attrib["package"]),
                counts.get(name, 0),
                depends=tuple(
                    e.attrib["name"] for e in fmt.findall(rpm + "requires/" + rpm + "entry")
                ),
                provides=tuple(
                    e.attrib["name"] for e in fmt.findall(rpm + "provides/" + rpm + "entry")
                ),
                license=fmt.findtext(rpm + "license", ""),
                source=fmt.findtext(rpm + "sourcerpm", ""),
            )
            element.clear()
    for name, version in pins.get("packageVersions", {}).items():
        if name not in available or available[name].version != version:
            raise ValueError("Pinned Fedora version unavailable")
    selected = set()
    db = sqlite3.connect(root / "owners.sqlite3")
    db.execute("CREATE TABLE IF NOT EXISTS owners(path TEXT,pkg TEXT,PRIMARY KEY(path,pkg))")
    files = "{http://linux.duke.edu/metadata/filelists}"
    with zstd_open(metadata["filelists"], "rb") as stream:
        for _event, element in ET.iterparse(stream, events=("end",)):
            if element.tag != files + "package":
                continue
            name = element.attrib["name"]
            package = available.get(name)
            if package is None or element.attrib.get("arch") not in {"x86_64", "noarch"}:
                element.clear()
                continue
            if element.attrib.get("pkgid") not in package_ids:
                raise ValueError("Fedora filelists/primary package digest mismatch")
            if element.attrib["pkgid"] != package.sha256:
                element.clear()
                continue
            for item in element.findall(files + "file"):
                path = item.text.lstrip("/")
                manual = MAN_PATH.fullmatch(path) and path.startswith(
                    ("usr/share/man/", "usr/lib/jvm/")
                )
                if manual:
                    selected.add(name)
                if manual or BINARY_PATH.fullmatch(path) or notice_path(path):
                    path = safe_path(path)
                    db.execute("INSERT OR IGNORE INTO owners VALUES (?,?)", (path, name))
            element.clear()
    db.commit()
    db.close()
    return pins, [available[n] for n in sorted(selected)], available


def notice_path(path):
    return path.startswith(
        ("usr/share/licenses/", "usr/share/spdx/text/", "usr/share/texlive/licenses/")
    ) or (
        path.startswith(
            (
                "usr/share/doc/",
                "usr/share/kvirc/",
                "usr/lib/",
                "usr/lib64/",
                "usr/include/llvm/",
            )
        )
        and bool(
            re.search(
                r"(?:^|/)(?:copying|copyright|licen[cs]es?|notice)(?:[._-][^/]*)?(?:/|$)",
                path,
                re.I,
            )
        )
    )


def extract_payload(stream, package, root, *, quota):
    files = root / "files"
    files.mkdir(parents=True, exist_ok=True)
    entries = []
    with tarfile.open(fileobj=stream, mode="r|*") as archive:
        for member in archive:
            path = member.name.removeprefix("./")
            manual = path.startswith(("usr/share/man/", "usr/lib/jvm/")) and MAN_PATH.fullmatch(
                path
            )
            binary = BINARY_PATH.fullmatch(path)
            notice = notice_path(path)
            if not (manual or binary or notice):
                if path.startswith("usr/share/man/"):
                    safe_path(path)
                continue
            path = safe_path(path)
            if member.issym() or member.islnk():
                target = link_target(path, member.linkname, symbolic=member.issym())
                allowed = (
                    BINARY_PATH.fullmatch(target)
                    if binary
                    else MAN_PATH.fullmatch(target) or notice_path(target)
                )
                entries.append(
                    (
                        package.name,
                        path,
                        "binary-link" if binary and allowed else "link" if allowed else "blocked",
                        target,
                        None,
                    )
                )
            elif member.isfile() and binary:
                entries.append((package.name, path, "binary-file", None, None))
            elif member.isfile():
                if member.size > MAX_SOURCE_BYTES:
                    raise ValueError("Oversized archive documentation member")
                destination = files / sha256_hex(f"{package.name}/{path}".encode())
                quota.write(destination, archive.extractfile(member), member.size)
                entries.append((package.name, path, "file", None, str(destination)))
    return entries


def extract(archive, package, root, *, quota=None, **_kwargs):
    quota = quota or ExtractedQuota(root / "files")
    # libarchive reads RPM payloads; converting to a tar stream never installs
    # packages or invokes their scriptlets, and creates no filesystem links.
    with (
        tempfile.TemporaryFile() as errors,
        subprocess.Popen(
            ["bsdtar", "-cf", "-", f"@{archive}"],
            stdout=subprocess.PIPE,
            stderr=errors,
        ) as process,
    ):
        try:
            entries = extract_payload(process.stdout, package, root, quota=quota)
        finally:
            process.stdout.close()
        if process.wait() != 0:
            raise ValueError("libarchive could not read verified RPM payload")
    files = root / "files"
    for tag, script in rpm_scripts(archive):
        path = f"@control/rpm-{tag}"
        destination = files / sha256_hex(f"{package.name}/{path}".encode())
        quota.write(destination, io.BytesIO(script), len(script))
        entries.append((package.name, path, "control", None, str(destination)))
    return entries


def _notice_texts(workspace, package, path, *, directory_fallback=None, seen=frozenset()):
    try:
        yield workspace.resolve(package, path).decode("utf-8", errors="replace")
    except MissingSource as exc:
        key = (exc.package, exc.path)
        if key in seen or len(seen) >= 64:
            raise ValueError("License directory link cycle") from exc
        prefix = exc.path + "/"
        # Directories have no stored file; acquire their indexed children instead.
        # "0" follows "/" in SQLite's ordering, bounding every Unicode child name.
        owners = {
            row[0]
            for row in workspace.owners.execute(
                "SELECT DISTINCT pkg FROM owners WHERE path>=? AND path<?",
                (prefix, exc.path + "0"),
            )
        }
        for owner in sorted(owners - workspace.acquired):
            workspace.acquire([workspace.available[owner]], workers=1)
        children = list(
            workspace.store.db.execute(
                "SELECT pkg,path FROM entries WHERE path>=? AND path<? "
                "AND kind IN ('file','link','blocked') ORDER BY path,pkg",
                (prefix, exc.path + "0"),
            )
        )
        if not children:
            # A distro's existing verified SPDX fallback may satisfy an absent
            # top-level directory alias, never a missing individual notice.
            if (
                directory_fallback is not None
                and path.startswith("usr/share/licenses/")
                and path.count("/") == 3
                and exc.path.startswith("usr/share/licenses/")
                and exc.path.count("/") == 3
            ):
                text = directory_fallback(exc.package, exc.path)
                if text.strip():
                    logging.warning(
                        json.dumps(
                            {
                                "event": "archive_notice_directory_fallback",
                                "package": package,
                                "path": path,
                                "target": exc.path,
                            }
                        )
                    )
                    yield text
                    return
            raise
        for owner, child in children:
            if notice_path(child):
                yield from _notice_texts(
                    workspace,
                    owner,
                    child,
                    directory_fallback=directory_fallback,
                    seen=seen | {key},
                )


def copyright_text(workspace, package, *, directory_fallback=None):
    metadata = workspace.available[package]
    if not hasattr(workspace, "notice_owners"):
        workspace.notice_owners = {
            pkg
            for path, pkg in workspace.owners.execute("SELECT path,pkg FROM owners")
            if notice_path(path)
        }
        workspace.source_siblings = {}
        for item in workspace.available.values():
            workspace.source_siblings.setdefault(item.source, set()).add(item.name)
    siblings = (
        workspace.source_siblings.get(metadata.source, set()) if metadata.source else {package}
    )
    if package not in workspace.acquired:
        workspace.acquire([metadata], workers=1)
    paths = list(
        workspace.store.db.execute(
            "SELECT pkg,path FROM entries WHERE pkg=? AND kind IN ('file','link','blocked')",
            (package,),
        )
    )
    texts = []
    for owner, path in paths:
        if notice_path(path):
            for text in _notice_texts(
                workspace, owner, path, directory_fallback=directory_fallback
            ):
                if text.strip() and text not in texts:
                    texts.append(text)
    if not texts:
        owners = workspace.notice_owners & siblings
        for owner in sorted(owners - workspace.acquired):
            workspace.acquire([workspace.available[owner]], workers=1)
        for owner, path in workspace.store.db.execute(
            "SELECT pkg,path FROM entries WHERE kind IN ('file','link','blocked')"
        ):
            if owner in siblings and notice_path(path):
                for text in _notice_texts(
                    workspace, owner, path, directory_fallback=directory_fallback
                ):
                    if text.strip() and text not in texts:
                        texts.append(text)
    # A license expression is provenance, not the license text.
    return "\n\n".join(texts)


def rpm_scripts(archive):
    """Read bounded RPM headers as data; never invoke rpm, a shell or Lua."""
    import struct

    def header(stream):
        start = stream.read(16)
        if len(start) != 16 or start[:4] != b"\x8e\xad\xe8\x01":
            raise ValueError("Invalid RPM header")
        count, size = struct.unpack(">II", start[8:])
        if count > 65536 or size > MAX_SOURCE_BYTES:
            raise ValueError("Oversized RPM header")
        records, data = stream.read(count * 16), stream.read(size)
        if len(records) != count * 16 or len(data) != size:
            raise ValueError("Truncated RPM header")
        return [
            struct.unpack(">IIII", records[i : i + 16]) for i in range(0, len(records), 16)
        ], data

    with archive.open("rb") as stream:
        lead = stream.read(96)
        if len(lead) != 96 or lead[:4] != b"\xed\xab\xee\xdb":
            raise ValueError("Invalid RPM lead")
        header(stream)
        stream.read((-stream.tell()) % 8)
        records, data = header(stream)
    scripts = []
    for tag, kind, offset, count in records:
        if tag not in {1023, 1024, 1151, 1152}:
            continue
        if kind != 6 or count != 1 or offset >= len(data):
            raise ValueError("Invalid RPM scriptlet value")
        end = data.find(b"\0", offset)
        if end < 0:
            raise ValueError("Unterminated RPM scriptlet")
        text = data[offset:end].decode("utf-8", errors="strict")
        text = text.replace("\\\n", " ")
        text = re.sub(
            r"(?m)^(\s*)(?:/usr/sbin/|/sbin/)?(?:update-)?alternatives(?=\s)",
            r"\1update-alternatives",
            text,
        )
        text = re.sub(r"\s+>/dev/null(?:\s+2>&1)?(?=\s*(?:\|\||$))", "", text)
        scripts.append((tag, text.encode()))
    return scripts
