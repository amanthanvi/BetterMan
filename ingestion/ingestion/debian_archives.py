"""Selective .deb extraction. No installation, filesystem links or maintainer scripts."""

from __future__ import annotations

import bz2
import gzip
import lzma
import posixpath
import re
import sqlite3
import tarfile
from pathlib import Path

from ingestion.debian_indexes import BINARY_PATH, MAN_PATH, Package, safe_path
from ingestion.mandoc_parser import is_so_stub
from ingestion.util import sha256_hex

MAX_SOURCE_BYTES = 16 * 1024 * 1024
COPYRIGHT = re.compile(r"^usr/share/doc/[^/]+/copyright(?:\.gz)?$")


class MissingSource(FileNotFoundError):
    def __init__(self, package: str, path: str):
        self.package, self.path = package, path
        super().__init__(f"{package}:{path}")


class MemberReader:
    def __init__(self, stream, remaining: int):
        self.stream, self.remaining = stream, remaining

    def read(self, size=-1):
        size = self.remaining if size < 0 else min(size, self.remaining)
        data = self.stream.read(size)
        self.remaining -= len(data)
        return data


def data_member(stream, prefix="data.tar"):
    if stream.read(8) != b"!<arch>\n":
        raise ValueError("Not a Debian ar archive")
    version = False
    while header := stream.read(60):
        if len(header) != 60 or header[-2:] != b"`\n":
            raise ValueError("Malformed Debian ar header")
        name = header[:16].decode("ascii").strip().rstrip("/")
        size = int(header[48:58])
        if size < 0:
            raise ValueError("Invalid ar member size")
        start = stream.tell()
        if name == "debian-binary":
            if size != 4:
                raise ValueError("Unsupported Debian archive version")
            version = stream.read(4) == b"2.0\n"
        elif name.startswith(prefix):
            if not version:
                raise ValueError("Unsupported Debian archive version")
            return MemberReader(stream, size)
        stream.seek(start + size + size % 2)
    raise ValueError(f"Debian archive has no {prefix} member")


def postinst_from_archive(archive: Path) -> str:
    with archive.open("rb") as stream:
        try:
            member = data_member(stream, "control.tar")
        except ValueError as exc:
            if "has no control.tar" in str(exc):
                return ""
            raise
        with tarfile.open(fileobj=member, mode="r|*") as tar:
            for item in tar:
                if item.name.removeprefix("./") == "postinst" and item.isfile():
                    if item.size > MAX_SOURCE_BYTES:
                        raise ValueError("Oversized maintainer script")
                    return (
                        tar.extractfile(item)
                        .read(MAX_SOURCE_BYTES + 1)
                        .decode("utf-8", errors="strict")
                    )
    return ""


def extract(archive: Path, package: Package, root: Path) -> list[tuple]:
    """Stream past unrelated members; write only man sources and copyrights."""
    files = root / "files"
    files.mkdir(parents=True, exist_ok=True)
    entries = []
    script = postinst_from_archive(archive)
    if script:
        destination = files / sha256_hex(f"{package.name}/@control/postinst".encode())
        destination.write_text(script)
        entries.append((package.name, "@control/postinst", "control", None, str(destination)))
    with archive.open("rb") as stream, tarfile.open(fileobj=data_member(stream), mode="r|*") as tar:
        for member in tar:
            # Ignore arbitrary payload filenames (including valid Linux '\\'
            # names). Only documentation members can ever reach a write path.
            raw_path = member.name.removeprefix("./")
            if BINARY_PATH.fullmatch(raw_path):
                path = safe_path(raw_path)
                if member.issym() or member.islnk():
                    target = member.linkname
                    if target.startswith("/"):
                        target = target.lstrip("/")
                    elif member.issym():
                        target = posixpath.join(posixpath.dirname(path), target)
                    target = safe_path(posixpath.normpath(target))
                    if BINARY_PATH.fullmatch(target):
                        entries.append((package.name, path, "binary-link", target, None))
                elif member.isfile():
                    entries.append((package.name, path, "binary-file", None, None))
                continue
            if not raw_path.startswith(("usr/share/man/", "usr/share/doc/", "usr/lib/jvm/")):
                continue
            path = safe_path(member.name)
            manual = MAN_PATH.fullmatch(path)
            notice = COPYRIGHT.fullmatch(path)
            if member.issym() or member.islnk():
                if not manual and not notice and path.count("/") != 3:
                    continue
                target = member.linkname
                if target.startswith("/"):
                    target = target.lstrip("/")
                elif member.issym():
                    target = posixpath.join(posixpath.dirname(path), target)
                target = safe_path(posixpath.normpath(target))
                if not target.startswith(("usr/share/man/", "usr/share/doc/", "usr/lib/jvm/")):
                    # Debian docs may link examples to /etc or alternatives.
                    # Keep no filesystem link and never read outside the store.
                    if manual or notice:
                        entries.append((package.name, path, "blocked", target, None))
                    continue
                entries.append((package.name, path, "link", target, None))
            elif member.isfile() and (manual or notice):
                if member.size > MAX_SOURCE_BYTES:
                    raise ValueError(f"Oversized documentation member: {package.name}:{path}")
                source = tar.extractfile(member)
                if source is None:
                    raise ValueError("Missing tar member content")
                destination = files / sha256_hex(f"{package.name}/{path}".encode())
                with destination.open("wb") as output:
                    while chunk := source.read(256 * 1024):
                        output.write(chunk)
                entries.append((package.name, path, "file", None, str(destination)))
    return entries


def source_bytes(path: Path) -> bytes:
    with path.open("rb") as raw:
        magic = raw.read(6)
    opener = (
        gzip.open
        if magic[:2] == b"\x1f\x8b"
        else lzma.open
        if magic == b"\xfd7zXZ\0"
        else bz2.open
        if magic[:3] == b"BZh"
        else open
    )
    if magic[:4] == b"\x28\xb5\x2f\xfd":
        from compression.zstd import open as zstd_open

        opener = zstd_open
    with opener(path, "rb") as stream:
        data = stream.read(MAX_SOURCE_BYTES + 1)
    if len(data) > MAX_SOURCE_BYTES:
        raise ValueError("Decompressed man source exceeds limit")
    return data


class ArchiveStore:
    def __init__(self, root: Path):
        self.root = root
        self.db = sqlite3.connect(root / "archives.sqlite3")
        self.db.execute("PRAGMA cache_size=-8192")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS packages (name TEXT PRIMARY KEY, installed INTEGER);
            CREATE TABLE IF NOT EXISTS entries
                (pkg TEXT, path TEXT, kind TEXT, target TEXT, file TEXT,
                PRIMARY KEY(pkg,path));
            CREATE TABLE IF NOT EXISTS receipts(pkg TEXT PRIMARY KEY,digest TEXT,version INTEGER);
            CREATE INDEX IF NOT EXISTS entries_path ON entries(path);
        """)

    def add(self, package: Package, entries: list[tuple]):
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO packages VALUES (?,?)", (package.name, package.installed)
            )
            self.db.execute("DELETE FROM entries WHERE pkg=?", (package.name,))
            self.db.executemany("INSERT OR REPLACE INTO entries VALUES (?,?,?,?,?)", entries)
            self.db.execute(
                "INSERT OR REPLACE INTO receipts VALUES (?,?,?)", (package.name, package.sha256, 3)
            )

    def complete(self, package: Package):
        receipt = self.db.execute(
            "SELECT digest,version FROM receipts WHERE pkg=?", (package.name,)
        ).fetchone()
        return receipt == (package.sha256, 3) and all(
            Path(row[0]).is_file()
            for row in self.db.execute(
                "SELECT file FROM entries WHERE pkg=? AND file IS NOT NULL", (package.name,)
            )
        )

    def resolve(self, package: str, path: str, seen=None, *, details=False, follow_stubs=True):
        """Resolve same-package first, then popcon-ranked cross-package links/stubs."""
        seen = set() if seen is None else seen
        key = (package, path)
        if key in seen or len(seen) >= 64:
            raise ValueError("Documentation link/stub cycle")
        seen.add(key)
        candidates = [path, *(path + suffix for suffix in (".gz", ".xz", ".bz2", ".zst"))]
        entry = None
        for candidate in candidates:
            entry = self.db.execute(
                "SELECT pkg,kind,target,file FROM entries WHERE pkg=? AND path=?",
                (package, candidate),
            ).fetchone()
            if entry:
                path = candidate
                break
        if entry is None:
            for candidate in candidates:
                entry = self.db.execute(
                    """SELECT e.pkg,e.kind,e.target,e.file FROM entries e
                    JOIN packages p ON p.name=e.pkg
                    WHERE e.path=? ORDER BY p.installed DESC,e.pkg LIMIT 1""",
                    (candidate,),
                ).fetchone()
                if entry:
                    path = candidate
                    break
        if entry is None:
            # Copyright directories themselves may be links (e.g. foo-doc -> foo).
            parent, name = posixpath.split(path)
            link = self.db.execute(
                "SELECT pkg,target FROM entries WHERE pkg=? AND path=? AND kind='link'",
                (package, parent),
            ).fetchone()
            if link is None:
                link = self.db.execute(
                    "SELECT e.pkg,e.target FROM entries e JOIN packages p ON p.name=e.pkg "
                    "WHERE e.path=? AND e.kind='link' ORDER BY p.installed DESC,e.pkg LIMIT 1",
                    (parent,),
                ).fetchone()
            if link:
                return self.resolve(
                    link[0],
                    posixpath.join(link[1], name),
                    seen,
                    details=details,
                    follow_stubs=follow_stubs,
                )
            raise MissingSource(package, path)
        owner, kind, target, file = entry
        if kind == "blocked":
            raise ValueError("Documentation link leaves archive documentation roots")
        if kind == "link":
            return self.resolve(owner, target, seen, details=details, follow_stubs=follow_stubs)
        data = source_bytes(Path(file))
        stub = is_so_stub(data)

        def include(target, with_details=False):
            if target.startswith("/"):
                resolved = target.lstrip("/")
            elif target.startswith("man"):
                resolved = re.split(r"/man[1-9][^/]*/", path)[0] + "/" + target
            else:
                resolved = posixpath.join(posixpath.dirname(path), target)
            resolved = safe_path(posixpath.normpath(resolved))
            if not MAN_PATH.fullmatch(resolved):
                raise ValueError("Roff include escapes manual root")
            return self.resolve(owner, resolved, set(seen), details=with_details)

        if stub:
            if not follow_stubs:
                return (owner, path, data) if details else data
            return include(stub, details)
        # Never let mandoc open host files for non-stub .so requests either.
        lines = data.splitlines(keepends=True)
        expanded_size = len(data)
        for index, line in enumerate(lines):
            if re.match(rb"^[.']\s*so(?:\s|$)", line):
                match = re.fullmatch(rb"[.']\s*so\s+(\S+)\s*", line.strip())
                if not match:
                    raise ValueError("Unsupported roff include syntax")
                replacement = include(match.group(1).decode("utf-8")) + b"\n"
                expanded_size += len(replacement) - len(line)
                if expanded_size > MAX_SOURCE_BYTES:
                    raise ValueError("Expanded roff source exceeds limit")
                lines[index] = replacement
        if sum(map(len, lines)) > MAX_SOURCE_BYTES:
            raise ValueError("Expanded roff source exceeds limit")
        data = b"".join(lines)
        return (owner, path, data) if details else data

    def manuals(self):
        for pkg, path in self.db.execute("SELECT pkg,path FROM entries ORDER BY pkg,path"):
            match = MAN_PATH.fullmatch(path)
            if match:
                yield pkg, path, match.group(1).lower(), match.group(2).lower()
