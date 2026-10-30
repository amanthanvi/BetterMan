"""Debian archive acquisition and streaming mandoc parsing; no package installation."""

from __future__ import annotations

import dataclasses
import hashlib
import json
import logging
import os
import resource
import shutil
import sqlite3
import sys
import threading
import time
import uuid
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, ThreadPoolExecutor, wait
from itertools import islice
from pathlib import Path

from ingestion.convex_client import ingest_activation_deadline
from ingestion.debian_alternatives import parse_alternatives
from ingestion.debian_archives import ArchiveStore, ExtractedQuota, MissingSource, extract
from ingestion.debian_indexes import (
    MAN_PATH,
    PINS,
    Package,
    available_packages,
    catalog,
    debian_cdn_enabled,
    download,
    popularity,
    private_registrations,
)
from ingestion.debian_licenses import copyright_text
from ingestion.ingest_runner import (
    _NAME_RE,
    _AliasRow,
    _bounded_futures,
    _PageRow,
    _PageSpool,
    _parse_source,
    _ParseContext,
    _resolve_aliases,
)
from ingestion.man_scan import ManSource
from ingestion.mandoc_parser import is_so_stub
from ingestion.package_set import FULL_PACKAGE_SET_BY_DISTRO, FULL_PACKAGE_SET_DEBIAN
from ingestion.util import sha256_hex

log = logging.getLogger("betterman.ingestion")
CURATED_ALTERNATIVES = {
    ("awk", "1"): ("gawk", "gawk", "1"),
    ("vi", "1"): ("vim-common", "vim", "1"),
    ("nc", "1"): ("netcat-openbsd", "nc_openbsd", "1"),
}

# Full-catalog default-group elections differ from the curated apt package pass.
ARCHIVE_COMMAND_PACKAGES = {"netcat-openbsd": "netcat-traditional"}

# Debian renames alternatives targets in archives without rewriting every .so.
# Two manpages-dev 6.9.1 stubs also refer to the old section suffix. These are
# exact pinned-corpus repairs, never a fuzzy basename or host-filesystem lookup.
SOURCE_TARGETS = {
    "usr/share/man/man1/kadmin.1": ("krb5-user", "usr/share/man/man1/kadmin.mit.1"),
    "usr/share/man/man1/php.1": ("php8.4-cli", "usr/share/man/man1/php8.4.1"),
    "usr/share/man/man2/PR_MPX_ENABLE_MANAGEMENT.2const": (
        "manpages-dev",
        "usr/share/man/man2/PR_MPX_ENABLE_MANAGEMENT.2",
    ),
    "usr/share/man/man2/PR_TASK_PERF_EVENTS_DISABLE.2const": (
        "manpages-dev",
        "usr/share/man/man2/PR_TASK_PERF_EVENTS_DISABLE.2",
    ),
}


def require_job_budget(phase: str):
    deadline = ingest_activation_deadline()
    if deadline is not None and time.time() >= deadline:
        raise RuntimeError(f"Job budget exhausted during Debian {phase}; release remains inactive")


def sample_packages(packages: list[Package], limit: int | None, distro="debian") -> list[Package]:
    if limit is None:
        return packages
    if limit < 1:
        raise ValueError("Package limit must be positive")
    curated_names = set(
        FULL_PACKAGE_SET_DEBIAN if distro == "debian" else FULL_PACKAGE_SET_BY_DISTRO[distro]
    ) | {value[0] for value in CURATED_ALTERNATIVES.values()}
    curated_names |= {"perl-doc", "libssl-doc", "mariadb-client"}
    curated = sorted(
        (p for p in packages if p.name in curated_names or p.name.startswith("postgresql-client-")),
        key=lambda p: p.name,
    )
    rest = sorted(
        (p for p in packages if p not in curated), key=lambda p: sha256_hex(p.name.encode())
    )
    return (curated + rest)[:limit]


class Workspace:
    distro = "debian"
    pins = {}

    def __init__(self, root: Path, *, limit: int | None = None, distro="debian"):
        self.distro = distro
        if distro not in {"debian", "ubuntu", "fedora", "arch", "alpine"}:
            raise ValueError("Unsupported deb archive distro")
        pins_path = (
            PINS
            if distro == "debian"
            else PINS.with_name(
                {
                    "ubuntu": "ubuntu-noble.json",
                    "fedora": "fedora-44.json",
                    "arch": "arch-20261001.json",
                    "alpine": "alpine-v3.23.json",
                }[distro]
            )
        )
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        fingerprint = sha256_hex(pins_path.read_bytes())
        marker = self.root / "pins.sha256"
        if marker.exists() and marker.read_text() != fingerprint:
            raise ValueError("Workspace belongs to different archive pins")
        marker.write_text(fingerprint)
        if distro in {"fedora", "arch", "alpine"}:
            if distro == "fedora":
                from ingestion.fedora_archives import catalog as archive_catalog
            elif distro == "arch":
                from ingestion.arch_archives import catalog as archive_catalog
            else:
                from ingestion.alpine_archives import catalog as archive_catalog

            self.pins, self.all_manual_packages, self.available = archive_catalog(
                self.root / "indexes", pins_path
            )
            self.registrations = {"packages": {}}
        else:
            self.pins, self.all_manual_packages = (
                catalog(self.root / "indexes")
                if distro == "debian"
                else catalog(self.root / "indexes", pins_path)
            )
            self.registrations = (
                private_registrations(PINS.parent / self.pins["privateManuals"])
                if self.pins.get("privateManuals")
                else private_registrations()
            )
            self.available = available_packages(self.root / "indexes", popularity(self.pins))
        self.packages = sample_packages(self.all_manual_packages, limit, distro)
        selection_path = self.root / "selection.json"
        if selection_path.exists():
            selection = json.loads(selection_path.read_text())
            if selection["limit"] != limit:
                raise ValueError("Workspace was created for a different sample limit")
            by_name = {package.name: package for package in self.all_manual_packages}
            self.packages = [by_name[name] for name in selection["packages"]]
        else:
            selection_path.write_text(
                json.dumps({"limit": limit, "packages": [p.name for p in self.packages]})
            )
        # Retain the original curated pass, including runtime packages such as
        # vim-tiny whose manual slaves live in vim-common. Their postinst data
        # supplies alternatives; they are never installed.
        selected_names = {p.name for p in self.packages}
        self.curated_packages = [
            self.available[n]
            # G++ and vim-tiny have alternatives but no manual-owned archive
            # paths. Their control scripts still participate in a full election.
            for n in sorted(
                set(FULL_PACKAGE_SET_BY_DISTRO[distro])
                | ({"g++", "vim-tiny"} if distro in {"debian", "ubuntu"} else set())
            )
            if n in self.available and n not in selected_names
        ]
        self.store = ArchiveStore(
            self.root,
            registrations=self.registrations,
            source_targets=self.pins.get("sourceTargets"),
        )
        if distro == "alpine":
            for name, checksum, actual, data, offset in self.store.db.execute(
                "SELECT * FROM apk_hashes"
            ):
                package = self.available.get(name)
                if package and package.control_checksum == checksum:
                    self.available[name] = dataclasses.replace(
                        package, sha256=actual, data_sha256=data, data_offset=offset
                    )
            self.packages = [self.available[p.name] for p in self.packages]
            self.curated_packages = [self.available[p.name] for p in self.curated_packages]
        self.owners = sqlite3.connect(self.root / "indexes" / "owners.sqlite3")
        self.acquired = {p.name for p in self.available.values() if self.store.complete(p)}
        # Never resolve through stale/incomplete extraction records. Keep the
        # hashed source files for recovery, but reconstruct their index from a
        # verified archive when that package is next needed.
        stale = {
            row[0] for row in self.store.db.execute("SELECT name FROM packages")
        } - self.acquired
        with self.store.db:
            for name in stale:
                self.store.db.execute("DELETE FROM entries WHERE pkg=?", (name,))
                self.store.db.execute("DELETE FROM packages WHERE name=?", (name,))
                self.store.db.execute("DELETE FROM receipts WHERE pkg=?", (name,))
        self.cached_packages = len(self.acquired)
        self.downloaded = 0
        self.archive_fallbacks = 0
        self.cache = Path(
            os.environ.get(
                f"BETTERMAN_{distro.upper()}_CACHE_DIR", str(self.root.parent / "archives")
            )
        ).resolve()
        self.cache.mkdir(parents=True, exist_ok=True)
        self.cache_limit = int(
            os.environ.get(f"BETTERMAN_{distro.upper()}_CACHE_MAX_BYTES", str(2 * 1024**3))
        )
        if not 1024**3 <= self.cache_limit <= 2 * 1024**3:
            raise ValueError("Archive cache limit must be between 1 GiB and 2 GiB")

        extracted_limit = int(
            os.environ.get(f"BETTERMAN_{distro.upper()}_EXTRACTED_MAX_BYTES", str(4 * 1024**3))
        )
        if not 16 * 1024**2 <= extracted_limit <= 4 * 1024**3:
            raise ValueError("Extracted-file disk limit must be between 16 MiB and 4 GiB")
        self.extracted_quota = ExtractedQuota(self.root / "files", extracted_limit)
        self._disk_lock = threading.Lock()
        self._reserved = 0
        self._inflight = set()
        self.missing: list[dict] = []

    def _acquire(self, package: Package):
        archive_budget = (4 if self.distro == "arch" else 1) * 1024**3
        if package.size > archive_budget:
            raise ValueError("Package exceeds bounded archive budget")
        require_job_budget("acquisition")
        cdn = debian_cdn_enabled() if self.distro == "debian" else True
        cdn_base = self.pins.get("cdn", "https://deb.debian.org/debian")
        if self.distro not in {"debian", "ubuntu"}:
            cdn = bool(self.pins.get("cdn"))
        suffix = self.pins.get("archiveSuffix", ".deb")
        cache_key = getattr(package, "cache_key", package.sha256)
        snapshot_url = f"{self.pins['mirror']}/{package.filename}"
        fallbacks = []
        with self._disk_lock:
            if (
                shutil.disk_usage(self.root).free
                < self._reserved + package.size + 512 * 1024 * 1024
            ):
                raise RuntimeError("Insufficient workspace disk for bounded archive extraction")
            self._reserved += package.size
            self._inflight.add(f"{cache_key}{suffix}")
        archive = self.cache / f"{cache_key}{suffix}"
        try:
            started = time.monotonic()
            verified = {}
            verify_options = {}
            if self.distro == "alpine":
                from ingestion.alpine_archives import verify

                verify_options = {"verify": lambda path: verified.update(verify(path, package))}
            size = download(
                f"{cdn_base}/{package.filename}" if cdn else snapshot_url,
                archive,
                None if self.distro == "alpine" else package.sha256,
                package.size,
                fallback_url=snapshot_url
                if cdn
                else (
                    f"{self.pins['fallbackMirror']}/{package.filename}"
                    if self.pins.get("fallbackMirror")
                    else None
                ),
                on_fallback=fallbacks.append,
                **verify_options,
            )
            if self.distro == "alpine":
                package = dataclasses.replace(package, **verified)
            downloaded = time.monotonic()
            archive.touch()
            extractor = extract
            if self.distro == "fedora":
                from ingestion.fedora_archives import extract as extractor
            elif self.distro == "arch":
                from ingestion.arch_archives import extract as extractor
            elif self.distro == "alpine":
                from ingestion.alpine_archives import extract as extractor
            entries = extractor(
                archive,
                package,
                self.root,
                quota=self.extracted_quota,
                registrations=getattr(self, "registrations", None),
            )
            extracted = time.monotonic()
        finally:
            with self._disk_lock:
                self._reserved -= package.size
                self._inflight.discard(f"{cache_key}{suffix}")
                self._evict_archives()
        return package, entries, size, downloaded - started, extracted - downloaded, len(fallbacks)

    def _evict_archives(self):
        # Called under the disk lock. In-flight archives are excluded; complete
        # extracted packages remain resumable independently of archive eviction.
        used = sum(
            p.stat().st_size for p in self.cache.glob("*" + self.pins.get("archiveSuffix", ".deb"))
        )
        for candidate in sorted(
            self.cache.glob("*" + self.pins.get("archiveSuffix", ".deb")),
            key=lambda p: p.stat().st_mtime,
        ):
            if used <= self.cache_limit:
                break
            if candidate.name in self._inflight:
                continue
            used -= candidate.stat().st_size
            candidate.unlink()

    def acquire(self, packages=None, *, workers=2):
        workers = min(2, max(1, workers))
        pending = list(
            {
                p.name: p
                for p in (self.packages + self.curated_packages if packages is None else packages)
                if p.name not in self.acquired
            }.values()
        )
        if workers > 1 and any(p.size > 1024**3 for p in pending):
            self.acquire([p for p in pending if p.size <= 1024**3], workers=workers)
            self.acquire([p for p in pending if p.size > 1024**3], workers=1)
            return
        # Consume restored archives before fresh downloads can evict them.
        suffix = self.pins.get("archiveSuffix", ".deb")
        pending.sort(
            key=lambda p: (
                not (self.cache / f"{getattr(p, 'cache_key', p.sha256)}{suffix}").is_file()
            )
        )
        started = time.monotonic()
        download_seconds = extract_seconds = 0
        cache_hits = fallback_count = 0
        with ThreadPoolExecutor(max_workers=workers) as executor:
            remaining = iter(pending)
            futures = {executor.submit(self._acquire, p) for p in islice(remaining, workers)}
            while futures:
                done, futures = wait(futures, return_when=FIRST_COMPLETED)
                for future in done:
                    package, entries, size, fetched, extracted, fallbacks = future.result()
                    download_seconds += fetched
                    extract_seconds += extracted
                    cache_hits += size == 0
                    fallback_count += fallbacks
                    self.archive_fallbacks += fallbacks
                    self.store.add(package, entries)
                    if self.distro == "alpine":
                        self.available[package.name] = package
                        with self.owners:
                            self.owners.executemany(
                                "INSERT OR IGNORE INTO owners VALUES (?,?)",
                                [(entry[1], entry[0]) for entry in entries],
                            )
                    self.acquired.add(package.name)
                    self.downloaded += size
                    if len(self.acquired) % 100 == 0:
                        log.info(
                            json.dumps(
                                {
                                    "event": "deb_extraction_progress",
                                    "packages": len(self.acquired),
                                    "downloadWorkerSeconds": round(download_seconds, 3),
                                    "extractWorkerSeconds": round(extract_seconds, 3),
                                    "elapsedSeconds": round(time.monotonic() - started, 3),
                                    "archiveCacheHits": cache_hits,
                                    "archiveFallbacks": fallback_count,
                                }
                            )
                        )
                    if (next_package := next(remaining, None)) is not None:
                        futures.add(executor.submit(self._acquire, next_package))

        log.info(
            json.dumps(
                {
                    "event": "deb_acquisition_complete",
                    "packages": len(pending),
                    "downloadWorkerSeconds": round(download_seconds, 3),
                    "extractWorkerSeconds": round(extract_seconds, 3),
                    "elapsedSeconds": round(time.monotonic() - started, 3),
                    "archiveCacheHits": cache_hits,
                    "archiveFallbacks": fallback_count,
                }
            )
        )

    def resolve(self, package: str, path: str, **kwargs):
        for _ in range(32):
            try:
                return self.store.resolve(package, path, **kwargs)
            except MissingSource as exc:
                repair = (
                    SOURCE_TARGETS
                    if self.distro == "debian"
                    else self.pins.get("sourceTargets", {})
                ).get(exc.path)
                if repair:
                    owner, target = repair
                    if owner not in self.acquired:
                        self.acquire([self.available[owner]], workers=1)
                    with self.store.db:
                        self.store.db.execute(
                            "INSERT OR IGNORE INTO entries VALUES (?,?,?,?,NULL)",
                            (exc.package, exc.path, "link", target),
                        )
                    continue
                names = []
                for candidate in [exc.path, exc.path + ".gz", exc.path + ".xz"]:
                    names.extend(
                        r[0]
                        for r in self.owners.execute(
                            "SELECT pkg FROM owners WHERE path=?", (candidate,)
                        )
                    )
                if exc.path.startswith("usr/share/doc/"):
                    names.append(exc.path.split("/")[3])
                candidates = [
                    self.available[n]
                    for n in set(names)
                    if n in self.available and n not in self.acquired
                ]
                if not candidates:
                    raise
                self.acquire(
                    sorted(candidates, key=lambda p: (-p.installed, p.name))[:1], workers=1
                )
        raise ValueError("Documentation dependency chain exceeds 32 packages")

    def binary_target(self, package: str, path: str):
        # Follow archive-owned executable links as data, never run a binary.
        # This proves clang++ and clang denote the same executable without
        # guessing from their spelling or borrowing another program's manual.
        path = path.lstrip("/")
        seen = set()
        for _ in range(64):
            if (package, path) in seen:
                raise ValueError("Executable link cycle")
            seen.add((package, path))
            row = self.store.db.execute(
                "SELECT pkg,kind,target FROM entries WHERE pkg=? AND path=? "
                "AND kind IN ('binary-link','binary-file')",
                (package, path),
            ).fetchone()
            if row is None:
                row = self.store.db.execute(
                    "SELECT e.pkg,e.kind,e.target FROM entries e JOIN packages p ON p.name=e.pkg "
                    "WHERE e.path=? AND e.kind IN ('binary-link','binary-file') "
                    "ORDER BY p.installed DESC,e.pkg LIMIT 1",
                    (path,),
                ).fetchone()
            if row is None:
                owners = [
                    self.available[r[0]]
                    for r in self.owners.execute("SELECT pkg FROM owners WHERE path=?", (path,))
                    if r[0] in self.available and r[0] not in self.acquired
                ]
                if not owners:
                    raise ValueError("Executable target is unavailable")
                self.acquire(sorted(owners, key=lambda p: (-p.installed, p.name))[:1], workers=1)
                seen.remove((package, path))
                continue
            package, kind, target = row
            if kind == "binary-file":
                return path
            path = target
        raise ValueError("Executable link depth exceeds limit")

    def alternative_rank(self, package, priority, name, section):
        metadata = self.available[package]
        preferred = CURATED_ALTERNATIVES.get((name, section), (None,))[0] == package
        default_installed = metadata.priority in {"required", "important", "standard"}
        return (
            not default_installed,
            -priority if default_installed else -metadata.installed,
            -metadata.installed if default_installed else -priority,
            not preferred,
            package,
        )

    def command_owner_allowances(self):
        from ingestion.ingest_runner import _COMMAND_PAGE_EXCLUSIONS, _COMMAND_PAGES

        providers = {}
        for package in self.available.values():
            for name in package.provides:
                providers.setdefault(name, set()).add(package.name)
        result = {}
        requested_packages = (
            FULL_PACKAGE_SET_DEBIAN
            if self.distro == "debian"
            else FULL_PACKAGE_SET_BY_DISTRO[self.distro]
        )
        for requested in requested_packages:
            if requested not in _COMMAND_PAGES or requested in _COMMAND_PAGE_EXCLUSIONS.get(
                self.distro, {}
            ):
                continue
            name, section = (
                ("httpd", "8")
                if self.distro == "alpine" and requested == "apache2"
                else _COMMAND_PAGES[requested]
            )
            expected_package = (
                ARCHIVE_COMMAND_PACKAGES.get(requested, requested)
                if self.distro == "debian"
                else requested
            )
            allowed, pending = set(), [expected_package]
            # Match apt_install's explicit companion request; mount is not a util-linux dependency.
            if requested == "util-linux":
                pending.append("mount")
            while pending:
                current = pending.pop()
                if current in allowed:
                    continue
                allowed.add(current)
                if current in self.available:
                    pending.extend(self.available[current].depends)
                else:
                    # Only a virtual name is satisfied by its providers; a real
                    # package (make) is not by another that Provides it (make-guile).
                    pending.extend(providers.get(current, ()))
            if self.distro == "alpine":
                runtime = [self.available[n] for n in allowed if n in self.available]
                for doc in self.available.values():
                    if (
                        doc.name.endswith("-doc")
                        and doc.source
                        and "docs" in doc.install_if
                        and any(
                            doc.source == package.source and doc.version == package.version
                            for package in runtime
                        )
                    ):
                        allowed.add(doc.name)
            result[requested] = ((name, section), expected_package, allowed)
        return result

    def require_command_owners(self):
        actual = {}
        # Use the finalized publication map, including elected alias targets.
        for (name, section), owner in sorted(
            self.published_route_owners.items(),
            key=lambda row: (row[0][0], len(row[0][1]), row[0][1]),
        ):
            actual.setdefault((name, section[:1]), owner)
        result = {}
        for requested, (
            route,
            expected_package,
            allowed,
        ) in self.command_owner_allowances().items():
            if route not in actual:
                continue  # The existing missing-page gate reports absent routes.
            name, section = route
            owner = actual[route]
            if owner not in allowed:
                raise RuntimeError(
                    f"publish blocked: wrong command-page owner for {name}({section}): "
                    f"{owner} is not {expected_package} or its dependency/provider"
                )
            result[requested] = owner
        return result

    def sources(self):
        # Rebuild RPM-generated links from this selection's election on each pass.
        if self.distro == "fedora":
            with self.store.db:
                self.store.db.execute("DELETE FROM entries WHERE kind='generated-link'")
        curated_owners = (
            {}
            if self.distro == "debian"
            else {
                route: allowed
                for route, _expected, allowed in self.command_owner_allowances().values()
            }
        )
        selected = {p.name for p in self.packages} | {
            p.name for p in getattr(self, "curated_packages", [])
        }
        rows = [
            (pkg, path, name, section, None)
            for pkg, path, name, section in self.store.manuals()
            if pkg in selected
        ]
        ordinary_routes = {(row[2], row[3]) for row in rows}
        # Route keys remain normalized, but an uppercase archive basename must
        # not displace a generated lowercase command (FTP versus ftp).
        ordinary_spellings = {(MAN_PATH.fullmatch(row[1])[1], row[3]) for row in rows}
        alternative_spellings = {}
        self.alternatives_skipped = []
        self.alternatives_audit = []
        candidates = {}
        for pkg, file in self.store.db.execute(
            "SELECT pkg,file FROM entries WHERE kind='control' ORDER BY pkg"
        ).fetchall():
            if pkg not in selected:
                continue
            offers, skipped = parse_alternatives(Path(file).read_text())
            self.alternatives_skipped.extend({"package": pkg, **item} for item in skipped)
            for offer in offers:
                target, section = offer.target, offer.section
                if offer.binary:
                    executable = Path(target).name.lower()
                    matches = [
                        (path, sec)
                        for owner, path, name, sec, rank in rows
                        if owner == pkg and name == executable and rank is None
                    ]
                    if not matches:
                        try:
                            executable = Path(self.binary_target(pkg, target)).name.lower()
                            matches = [
                                (path, sec)
                                for owner, path, name, sec, rank in rows
                                if owner == pkg and name == executable and rank is None
                            ]
                        except ValueError:
                            # No resolvable binary link: report the missing manual below.
                            pass
                    if len(matches) != 1:
                        self.alternatives_skipped.append(
                            {
                                "package": pkg,
                                "group": offer.group,
                                "reason": "binary target has no unique same-package English manual",
                                "target": target,
                            }
                        )
                        target = None
                    else:
                        target, section = matches[0]
                candidates.setdefault((offer.name, section), []).append(
                    (pkg, target, offer.priority)
                )
        for (name, section), offers in sorted(candidates.items()):
            if (name, section) in ordinary_spellings:
                self.alternatives_skipped.append(
                    {
                        "name": name,
                        "section": section,
                        "reason": "package-owned manual occupies route",
                    }
                )
                continue
            ranked = sorted(
                offers, key=lambda item: self.alternative_rank(item[0], item[2], name, section)
            )
            winner, target, _priority = ranked[0]
            try:
                if target is None:
                    raise ValueError("winning provider has no English manual")
                self.resolve(winner, target)
            except (ValueError, FileNotFoundError) as exc:
                self.alternatives_skipped.append(
                    {
                        "package": winner,
                        "name": name,
                        "section": section,
                        "reason": "winning provider has no English manual; route omitted",
                        "detail": str(exc),
                    }
                )
                continue
            if self.distro == "fedora":
                with self.store.db:
                    self.store.db.executemany(
                        "INSERT OR IGNORE INTO entries VALUES (?,?,?,?,NULL)",
                        [
                            (
                                winner,
                                f"usr/share/man/man{section}/{name}.{section}{suffix}",
                                "generated-link",
                                target,
                            )
                            for suffix in ("", ".gz", ".xz", ".bz2", ".zst")
                        ],
                    )
            for pkg, path, priority in ranked:
                if path is not None:
                    normalized = name.lower()
                    rows.append((pkg, path, normalized, section, priority))
                    alternative_spellings[(pkg, path, normalized, section, priority)] = name
        prepared = []
        extras = set()
        for pkg, path, name, section, priority in sorted(
            set(rows), key=lambda row: (*row[:4], row[4] is None, row[4] or 0)
        ):
            if not _NAME_RE.fullmatch(name):
                self.missing.append(
                    {"package": pkg, "path": path, "error": "Unsupported route name"}
                )
                continue
            try:
                owner, final_path, raw = self.resolve(pkg, path, details=True, follow_stubs=False)
                resolved_identity = MAN_PATH.fullmatch(final_path)
                alias = (
                    priority is not None
                    or is_so_stub(raw) is not None
                    or (
                        resolved_identity is not None
                        and (resolved_identity[1].lower(), resolved_identity[2].lower())
                        != (name, section)
                    )
                )
                target = None
                if alias:
                    target_owner, target_path, raw = self.resolve(pkg, path, details=True)
                    match = MAN_PATH.fullmatch(target_path)
                    if not match:
                        raise ValueError("Alias target has no manual identity")
                    target = (match[1].lower(), match[2].lower(), target_owner)
                    if target[:2] == (name, section):
                        alias = False
                    elif target_owner not in selected:
                        extras.add((target_owner, target_path, *target[:2]))
                spelling = (
                    alternative_spellings[(pkg, path, name, section, priority)]
                    if priority is not None
                    else MAN_PATH.fullmatch(path)[1]
                )
                rank = (
                    name,
                    section,
                    spelling != name,
                    pkg not in curated_owners.get((name, section[:1]), {pkg}),
                    priority is not None,
                    *(
                        self.alternative_rank(pkg, priority, name, section)
                        if priority is not None
                        else (False, -self.available[pkg].installed, 0, False, pkg)
                    ),
                    path,
                )
                prepared.append((rank, pkg, path, name, section, alias, target))
                if priority is not None:
                    self.alternatives_audit.append(
                        {
                            "name": name,
                            "section": section,
                            "package": pkg,
                            "priority": priority,
                            "spelling": spelling,
                            "target": target,
                            "sourcePath": path,
                        }
                    )
            except (ValueError, FileNotFoundError) as exc:
                item = {"package": pkg, "path": path, "error": str(exc)}
                (self.alternatives_skipped if priority is not None else self.missing).append(item)
        for pkg, path, name, section in extras:
            rank = (
                name,
                section,
                MAN_PATH.fullmatch(path)[1] != name,
                pkg not in curated_owners.get((name, section[:1]), {pkg}),
                False,
                False,
                -self.available[pkg].installed,
                0,
                False,
                pkg,
                path,
            )
            prepared.append((rank, pkg, path, name, section, False, None))
        self.alias_candidates = []
        self.route_winners = {}
        identities = set()
        for _, pkg, path, name, section, alias, target in sorted(
            prepared, key=lambda item: item[0]
        ):
            identity = (pkg, path, name, section)
            if identity in identities:
                continue
            identities.add(identity)
            self.route_winners.setdefault((name, section), (pkg, path, alias))
            if alias:
                self.alias_candidates.append(
                    {
                        "name": name,
                        "section": section,
                        "targetName": target[0],
                        "targetSection": target[1],
                        "targetPackage": target[2],
                        "sourcePackage": pkg,
                        "sourcePath": path,
                    }
                )
            # Keep only route references in memory, never all resolved bodies.
            yield pkg, path, name, section, alias, b"" if alias else self.resolve(pkg, path)
        self.alternative_defaults = [
            a
            for a in self.alternatives_audit
            if self.route_winners.get((a["name"], a["section"]), ())[:2]
            == (a["package"], a["sourcePath"])
        ]
        self.restored_names = sorted(
            {(a["name"], a["section"]) for a in self.alternative_defaults} - ordinary_routes
        )


@dataclasses.dataclass(frozen=True)
class ArchiveParseInput:
    package: str
    path: str
    name: str
    section: str
    raw: bytes
    version: str
    distro: str = "debian"


def parse_archive_source(item: ArchiveParseInput) -> _PageRow:
    page = _parse_source(
        ManSource(Path(item.path), item.name, item.section),
        item.raw,
        _ParseContext(item.distro, "amd64", {}, {}),
    )
    return dataclasses.replace(
        page,
        page_id=sha256_hex(
            f"{item.distro}/{item.package}/{item.path}/{item.name}/{item.section}".encode()
        )[:32],
        source_package=item.package,
        source_package_version=item.version,
    )


def parse_workspace(workspace: Workspace, spool: _PageSpool, *, workers=4):
    def inputs():
        for pkg, path, name, section, alias, raw in workspace.sources():
            require_job_budget("parsing")
            if alias:
                continue
            yield ArchiveParseInput(
                pkg, path, name, section, raw, workspace.available[pkg].version, workspace.distro
            )

    providers = set()
    seen_routes = set()
    failed = []
    with ProcessPoolExecutor(max_workers=workers) as executor:
        for item, future in _bounded_futures(
            executor, parse_archive_source, iter(inputs()), workers * 2
        ):
            try:
                page = future.result()
                spool.append(page)
                key = (page.name, page.section)
                if key in seen_routes:
                    providers.add(page.page_id)
                seen_routes.add(key)
            except Exception as exc:  # noqa: BLE001
                failed.append({"package": item.package, "path": item.path, "error": str(exc)})
    refs = list(spool.refs())
    canonical = {(p.name, p.section): p for p in refs if p.page_id not in providers}
    parsed_targets = {(p.name, p.section, p.source_package) for p in refs}
    by_route = {}
    for item in workspace.alias_candidates:
        key = (item["name"], item["section"])
        # A different package's page cannot stand in for a failed alias target.
        if (
            workspace.route_winners[key] == (item["sourcePackage"], item["sourcePath"], True)
            and (item["targetName"], item["targetSection"], item["targetPackage"]) in parsed_targets
        ):
            by_route.setdefault(key, item)
    aliases = _resolve_aliases(
        aliases=[
            _AliasRow(a["name"], a["section"], a["targetName"], a["targetSection"], a["sourcePath"])
            for a in by_route.values()
        ],
        pages=refs,
    )
    workspace.aliases = aliases
    # An exact-case alternative may own the normalized route ahead of a real
    # differently-cased page. That real page remains an explicit provider.
    alias_keys = {(a.name, a.section) for a in aliases}
    for key in alias_keys:
        if key in canonical:
            providers.add(canonical[key].page_id)
    workspace.alias_providers = [
        a
        | {
            "providerOnly": (a["name"], a["section"]) not in alias_keys
            or by_route.get((a["name"], a["section"])) != a
        }
        for a in workspace.alias_candidates
    ]
    workspace.published_route_owners = {
        (p.name, p.section): p.source_package for p in refs if p.page_id not in providers
    }
    workspace.published_route_owners.update(
        {
            (a["name"], a["section"]): a["targetPackage"]
            for a in workspace.alias_providers
            if not a["providerOnly"]
        }
    )
    return providers, failed


def benchmark(root: Path, *, limit=2000, workers=4, distro="debian") -> dict:
    started = time.monotonic()
    workspace = Workspace(root, limit=limit, distro=distro)
    indexed = time.monotonic()
    workspace.acquire(workers=workers)
    acquired = time.monotonic()
    spool_path = root / f"benchmark-{uuid.uuid4()}.sqlite3"
    with _PageSpool(spool_path) as spool:
        providers, failures = parse_workspace(workspace, spool, workers=workers)
        parsed = time.monotonic()
        from ingestion.ingest_runner import _LicenseSpool

        notices = _LicenseSpool(spool.connection)
        missing_notices = []
        largest_notice = 0
        for package in workspace.packages:
            try:
                text = copyright_text(workspace, package.name)
                notices[package.name] = text
                largest_notice = max(largest_notice, len(text.encode()))
            except (FileNotFoundError, ValueError, RuntimeError) as exc:
                missing_notices.append({"package": package.name, "error": str(exc)})
        licensed = time.monotonic()
        report = {
            "samplePackages": len(workspace.packages),
            "archiveFallbacks": workspace.archive_fallbacks,
            "cdnEnabled": debian_cdn_enabled(),
            "dependencyPackages": len(workspace.acquired) - len(workspace.packages),
            "fullPackages": len(workspace.all_manual_packages),
            "fullDownloadBytes": sum(p.size for p in workspace.all_manual_packages),
            "sampleArchiveBytes": workspace.downloaded,
            "parsedPages": len(spool),
            "aliases": len(workspace.aliases),
            "aliasProviders": len(workspace.alias_providers),
            "alternatives": workspace.alternatives_audit,
            "alternativeDefaults": workspace.alternative_defaults,
            "restoredNames": workspace.restored_names,
            "canonicalPages": len(spool) - len(providers),
            "alternativesSkipped": workspace.alternatives_skipped,
            "alternateProviders": len(providers),
            "unresolved": len(workspace.missing),
            "parseFailures": len(failures),
            "indexSeconds": indexed - started,
            "acquireSeconds": acquired - indexed,
            "parseSeconds": parsed - acquired,
            "licenseSeconds": licensed - parsed,
            "licenses": len(notices),
            "maxLicenseBytes": largest_notice,
            "missingLicenses": missing_notices,
            "cachedPackages": workspace.cached_packages,
            "parentPeakRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            * (1 if sys.platform == "darwin" else 1024),
            "largestChildPeakRssBytes": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
            * (1 if sys.platform == "darwin" else 1024),
            "sourceBytes": sum(p.stat().st_size for p in (root / "files").iterdir()),
            "spoolBytes": spool_path.stat().st_size,
            "workspaceLogicalBytes": sum(p.stat().st_size for p in root.rglob("*") if p.is_file()),
            "archiveConcurrencyBoundBytes": sum(
                sorted((p.size for p in workspace.packages), reverse=True)[:workers]
            ),
            "workers": workers,
            "pinsSha256": hashlib.sha256(PINS.read_bytes()).hexdigest(),
            "failures": failures[:20],
            "missing": workspace.missing[:20],
        }
    (root / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report
