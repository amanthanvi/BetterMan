"""Debian archive acquisition and streaming mandoc parsing; no package installation."""

from __future__ import annotations

import dataclasses
import hashlib
import json
import logging
import resource
import shutil
import sqlite3
import sys
import threading
import time
import uuid
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path

from ingestion.convex_client import ingest_activation_deadline
from ingestion.debian_archives import ArchiveStore, MissingSource, extract
from ingestion.debian_indexes import (
    PINS,
    Package,
    available_packages,
    catalog,
    download,
    popularity,
)
from ingestion.ingest_runner import (
    _NAME_RE,
    _bounded_futures,
    _PageSpool,
    _parse_source,
    _ParseContext,
)
from ingestion.man_scan import ManSource
from ingestion.package_set import FULL_PACKAGE_SET_DEBIAN
from ingestion.util import sha256_hex

log = logging.getLogger("betterman.ingestion")
CURATED_ALTERNATIVES = {
    ("awk", "1"): ("gawk", "gawk", "1"),
    ("vi", "1"): ("vim-common", "vim", "1"),
    ("editor", "1"): ("vim-common", "vim", "1"),
    ("pager", "1"): ("less", "less", "1"),
    ("nc", "1"): ("netcat-openbsd", "nc_openbsd", "1"),
}

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


def sample_packages(packages: list[Package], limit: int | None) -> list[Package]:
    if limit is None:
        return packages
    if limit < 1:
        raise ValueError("Package limit must be positive")
    curated_names = set(FULL_PACKAGE_SET_DEBIAN) | {
        value[0] for value in CURATED_ALTERNATIVES.values()
    }
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
    def __init__(self, root: Path, *, limit: int | None = None):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        fingerprint = sha256_hex(PINS.read_bytes())
        marker = self.root / "pins.sha256"
        if marker.exists() and marker.read_text() != fingerprint:
            raise ValueError("Workspace belongs to different archive pins")
        marker.write_text(fingerprint)
        self.pins, self.all_manual_packages = catalog(self.root / "indexes")
        self.packages = sample_packages(self.all_manual_packages, limit)
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
        self.available = available_packages(self.root / "indexes", popularity(self.pins))
        self.store = ArchiveStore(self.root)
        self.owners = sqlite3.connect(self.root / "indexes" / "owners.sqlite3")
        self.acquired = {row[0] for row in self.store.db.execute("SELECT name FROM packages")}
        self.cached_packages = len(self.acquired)
        self.downloaded = 0
        self._disk_lock = threading.Lock()
        self._reserved = 0
        self.missing: list[dict] = []

    def _acquire(self, package: Package):
        if package.size > 1024 * 1024 * 1024:
            raise ValueError("Package exceeds 1 GiB archive budget")
        require_job_budget("acquisition")
        with self._disk_lock:
            if (
                shutil.disk_usage(self.root).free
                < self._reserved + package.size + 512 * 1024 * 1024
            ):
                raise RuntimeError("Insufficient workspace disk for bounded archive extraction")
            self._reserved += package.size
        archive = self.root / "downloads" / f"{package.name}.deb"
        try:
            size = download(
                f"{self.pins['mirror']}/{package.filename}", archive, package.sha256, package.size
            )
            return package, extract(archive, package, self.root), size
        finally:
            archive.unlink(missing_ok=True)
            with self._disk_lock:
                self._reserved -= package.size

    def acquire(self, packages=None, *, workers=4):
        pending = [
            p
            for p in (self.packages if packages is None else packages)
            if p.name not in self.acquired
        ]
        with ThreadPoolExecutor(max_workers=workers) as executor:
            for _pkg, future in _bounded_futures(executor, self._acquire, iter(pending), workers):
                package, entries, size = future.result()
                self.store.add(package, entries)
                self.acquired.add(package.name)
                self.downloaded += size
                if len(self.acquired) % 100 == 0:
                    log.info(
                        json.dumps(
                            {"event": "deb_extraction_progress", "packages": len(self.acquired)}
                        )
                    )

    def resolve(self, package: str, path: str) -> bytes:
        for _ in range(32):
            try:
                return self.store.resolve(package, path)
            except MissingSource as exc:
                repair = SOURCE_TARGETS.get(exc.path)
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

    def sources(self):
        selected = {p.name for p in self.packages}
        # Materialize only route references; bodies stay in files and SQLite.
        rows = [row for row in self.store.manuals() if row[0] in selected]
        for (name, section), (pkg, target, target_section) in CURATED_ALTERNATIVES.items():
            candidates = [
                row for row in rows if row[0] == pkg and row[2:] == (target, target_section)
            ]
            if candidates:
                rows.append((pkg, candidates[0][1], name, section))

        # Curated names win independent of future completion order. Otherwise
        # popcon installed count, package name, and original path break ties.
        def order(row):
            pkg, path, name, section = row
            preferred = CURATED_ALTERNATIVES.get((name, section), (None,))[0] == pkg
            return (name, section, not preferred, -self.available[pkg].installed, pkg, path)

        seen = set()
        for row in sorted(set(rows), key=order):
            pkg, path, name, section = row
            if not _NAME_RE.fullmatch(name):
                self.missing.append(
                    {"package": pkg, "path": path, "error": "Unsupported route name"}
                )
                continue
            try:
                raw = self.resolve(pkg, path)
            except (ValueError, FileNotFoundError) as exc:
                self.missing.append({"package": pkg, "path": path, "error": str(exc)})
                continue
            key = (name, section)
            primary = key not in seen
            seen.add(key)
            yield pkg, path, name, section, primary, raw


def parse_archive_source(item):
    pkg, path, name, section, primary, raw, version = item
    page = _parse_source(
        ManSource(Path(path), name, section), raw, _ParseContext("debian", "amd64", {}, {})
    )
    return dataclasses.replace(
        page,
        page_id=sha256_hex(f"debian/{pkg}/{path}/{name}/{section}".encode())[:32],
        source_package=pkg,
        source_package_version=version,
    ), primary


def parse_workspace(workspace: Workspace, spool: _PageSpool, *, workers=4):
    def inputs():
        for pkg, path, name, section, primary, raw in workspace.sources():
            require_job_budget("parsing")
            yield pkg, path, name, section, primary, raw, workspace.available[pkg].version

    providers = set()
    seen_routes = set()
    failed = []
    with ProcessPoolExecutor(max_workers=workers) as executor:
        for item, future in _bounded_futures(
            executor, parse_archive_source, iter(inputs()), workers * 2
        ):
            try:
                page, primary = future.result()
                spool.append(page)
                key = (page.name, page.section)
                if key in seen_routes:
                    providers.add(page.page_id)
                seen_routes.add(key)
            except Exception as exc:  # noqa: BLE001
                failed.append({"package": item[0], "path": item[1], "error": str(exc)})
    return providers, failed


def benchmark(root: Path, *, limit=2000, workers=4) -> dict:
    started = time.monotonic()
    workspace = Workspace(root, limit=limit)
    indexed = time.monotonic()
    workspace.acquire(workers=workers)
    acquired = time.monotonic()
    spool_path = root / f"benchmark-{uuid.uuid4()}.sqlite3"
    with _PageSpool(spool_path) as spool:
        providers, failures = parse_workspace(workspace, spool, workers=workers)
        parsed = time.monotonic()
        from ingestion.debian_publish import copyright_text
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
            "dependencyPackages": len(workspace.acquired) - len(workspace.packages),
            "fullPackages": len(workspace.all_manual_packages),
            "fullDownloadBytes": sum(p.size for p in workspace.all_manual_packages),
            "sampleArchiveBytes": workspace.downloaded,
            "parsedPages": len(spool),
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
