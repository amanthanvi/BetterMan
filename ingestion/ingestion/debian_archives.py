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

from ingestion.debian_indexes import MAN_PATH, Package, safe_path
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


def data_member(stream):
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
        elif name.startswith("data.tar"):
            if not version:
                raise ValueError("Unsupported Debian archive version")
            return MemberReader(stream, size)
        stream.seek(start + size + size % 2)
    raise ValueError("Debian archive has no data member")


def extract(archive: Path, package: Package, root: Path) -> list[tuple]:
    """Stream past unrelated members; write only man sources and copyrights."""
    files = root / "files"
    files.mkdir(parents=True, exist_ok=True)
    entries = []
    with archive.open("rb") as stream, tarfile.open(fileobj=data_member(stream), mode="r|*") as tar:
        for member in tar:
            # Ignore arbitrary payload filenames (including valid Linux '\\'
            # names). Only documentation members can ever reach a write path.
            raw_path = member.name.removeprefix("./")
            if not raw_path.startswith(("usr/share/man/", "usr/share/doc/")):
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
                if not target.startswith(("usr/share/man/", "usr/share/doc/")):
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
            CREATE INDEX IF NOT EXISTS entries_path ON entries(path);
        """)

    def add(self, package: Package, entries: list[tuple]):
        with self.db:
            self.db.execute(
                "INSERT OR REPLACE INTO packages VALUES (?,?)", (package.name, package.installed)
            )
            self.db.executemany("INSERT OR REPLACE INTO entries VALUES (?,?,?,?,?)", entries)

    def resolve(self, package: str, path: str, seen=None):
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
                "SELECT target FROM entries WHERE pkg=? AND path=? AND kind='link'",
                (package, parent),
            ).fetchone()
            if link:
                return self.resolve(package, posixpath.join(link[0], name), seen)
            raise MissingSource(package, path)
        owner, kind, target, file = entry
        if kind == "blocked":
            raise ValueError("Documentation link leaves archive documentation roots")
        if kind == "link":
            return self.resolve(owner, target, seen)
        data = source_bytes(Path(file))
        stub = is_so_stub(data)

        def include(target):
            if target.startswith("/"):
                resolved = target.lstrip("/")
            elif target.startswith("man"):
                resolved = "usr/share/man/" + target
            else:
                resolved = posixpath.join(posixpath.dirname(path), target)
            resolved = safe_path(posixpath.normpath(resolved))
            if not resolved.startswith("usr/share/man/"):
                raise ValueError("Roff include escapes manual root")
            return self.resolve(owner, resolved, set(seen))

        if stub:
            return include(stub)
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
        return data

    def manuals(self):
        for pkg, path in self.db.execute("SELECT pkg,path FROM entries ORDER BY pkg,path"):
            match = MAN_PATH.fullmatch(path)
            if match:
                yield pkg, path, match.group(1).lower(), match.group(2).lower()
