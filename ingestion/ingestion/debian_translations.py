"""Translated Debian manuals (B3, #395) from the B1 pinned, digest-checked archives.

Only translations Debian ships count: manpages-xx(-dev) from man-pages-l10n and
any package's usr/share/man/<lang>/ root. Nothing is machine-translated. Each
language publishes as its own release (locale, distro=debian), staging only;
prod needs the translated-release promotion authorization in Convex.
"""

from __future__ import annotations

import gzip
import json
import lzma
import re
import sqlite3
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.convex_client import ConvexIngestClient, encode_json
from ingestion.db import iso_utc_now
from ingestion.debian_indexes import (
    PINS,
    TRANSLATION_ROOTS,
    Package,
    download,
    localized_manual,
    popularity,
    records,
    release_checksums,
    require_private_package,
    safe_path,
)
from ingestion.debian_licenses import copyright_text
from ingestion.debian_pipeline import (
    ArchiveParseInput,
    Workspace,
    parse_archive_source,
    require_job_budget,
)
from ingestion.ingest_runner import (
    _NAME_RE,
    IngestResult,
    _AliasRow,
    _bounded_futures,
    _build_dataset_release_id,
    _build_license_packages,
    _ingest_worker_count,
    _iter_license_items,
    _LicenseSpool,
    _log,
    _package_batch_digest,
    _page_batch_limits,
    _PageSpool,
    _resolve_aliases,
    _resolved_page_payloads,
    _upload_pages,
    _upload_worker_count,
)
from ingestion.mandoc_parser import is_so_stub
from ingestion.util import sha256_hex

CONFLICT_POLICY = "most popcon installs, then package name, then path; others dropped"
_COPYRIGHT_PATH = re.compile(r"^usr/share/doc/[^/]+/copyright(?:\.gz)?$")
_TH = re.compile(rb"^[.']\s*TH[ \t]+(.*)$", re.MULTILINE)
# A dotted release number; dates ("1. März 2001", "10 May 2011") never match.
_VERSIONISH = re.compile(r"\d+\.\d+")


def primary_packages(locale: str) -> tuple[str, str]:
    """man-pages-l10n's binary packages for a locale (manpages-pt-br for pt-BR)."""
    base = f"manpages-{locale.lower()}"
    return base, f"{base}-dev"


def translation_catalog(root: Path, roots: frozenset[str]) -> tuple[dict, list[Package]]:
    """Packages owning a requested translated root, from the same pinned indexes as B1."""
    pins = json.loads(PINS.read_text())
    mirror = pins["mirror"].rstrip("/")
    suite = f"dists/{pins['suite']}"
    root.mkdir(parents=True, exist_ok=True)
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
                if len(fields) != 2:
                    continue
                manual = localized_manual(fields[0], roots) is not None
                if manual:
                    selected.update(owner.rsplit("/", 1)[-1] for owner in fields[1].split(","))
                if manual or _COPYRIGHT_PATH.fullmatch(fields[0]):
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
    for package in packages:
        require_private_package(package)
    missing = selected - {package.name for package in packages}
    if missing:
        raise ValueError(f"Contents packages missing from Packages: {sorted(missing)[:10]}")
    return pins, sorted(packages, key=lambda package: (-package.installed, package.name))


def documented_version(raw: bytes) -> str | None:
    """The .TH source field ("GNU tar 1.34"): the upstream release a translation documents.

    man(7) only; mdoc's .Os rarely names the program's version. Returns None
    unless the field carries a dotted release number, so a bare "GNU" or a
    date in that field never claims a version.
    """
    match = _TH.search(raw[:65536])
    if match is None:
        return None
    text = match[1].decode("utf-8", errors="replace")
    fields = re.findall(r'"((?:[^"\\]|\\.)*)"|(\S+)', text)
    values = [quoted or bare for quoted, bare in fields]
    if len(values) < 4:
        return None
    source = re.sub(r"\\[-&]", lambda m: "-" if m[0] == "\\-" else "", values[3])
    source = re.sub(r"\\f[BIRP]|\\f\(..|\\f\[[^]]*]", "", source)
    source = " ".join(source.split())[:120]
    return source if _VERSIONISH.search(source) else None


class TranslationWorkspace(Workspace):
    """A B1 workspace whose selection is the translated roots, not English manuals."""

    def __init__(self, root: Path, *, locales, limit: int | None = None):
        unknown = sorted(set(locales) - set(TRANSLATION_ROOTS))
        if unknown or not locales:
            raise ValueError(f"Unsupported translation locales: {unknown or 'none'}")
        self.locales = tuple(dict.fromkeys(locales))
        self.localized_roots = frozenset(TRANSLATION_ROOTS[locale] for locale in self.locales)
        super().__init__(root, limit=limit)

    def _catalog(self):
        return translation_catalog(self.root / "indexes", self.localized_roots)

    def _curated(self):
        # English curated/alternative packages are not part of a translation.
        return []

    def _sample(self, packages, limit):
        if limit is None:
            return packages
        if limit < 1:
            raise ValueError("Package limit must be positive")
        primary = {name for locale in self.locales for name in primary_packages(locale)}
        first = sorted((p for p in packages if p.name in primary), key=lambda p: p.name)
        rest = sorted(
            (p for p in packages if p.name not in primary),
            key=lambda p: sha256_hex(p.name.encode()),
        )
        return (first + rest)[:limit]

    def contents_paths(self, locale: str) -> int:
        root = TRANSLATION_ROOTS[locale]
        with sqlite3.connect(self.root / "indexes" / "owners.sqlite3") as owners:
            return owners.execute(
                "SELECT COUNT(DISTINCT path) FROM owners WHERE path LIKE ?",
                (f"usr/share/man/{root}/man%",),
            ).fetchone()[0]

    def translated_sources(self, locale: str):
        """Yield (pkg, path, name, section, alias, target, raw) per translated route.

        Same conflict rule as B1's ordinary pages, without alternatives: the
        most-installed package owns a route; other copies are recorded only.
        """
        root = TRANSLATION_ROOTS[locale]
        selected = {p.name for p in self.packages}
        self.missing = []
        self.dropped = []
        winners = {}
        rows = sorted(
            (row for row in self.store.localized_manuals(root) if row[0] in selected),
            key=lambda row: (row[2], row[3], -self.available[row[0]].installed, row[0], row[1]),
        )
        for pkg, path, name, section in rows:
            if not _NAME_RE.fullmatch(name):
                self.missing.append(
                    {"package": pkg, "path": path, "error": "Unsupported route name"}
                )
                continue
            if (name, section) in winners:
                self.dropped.append(
                    {"name": name, "section": section, "package": pkg, "sourcePath": path}
                )
                continue
            winners[(name, section)] = (pkg, path)
        for (name, section), (pkg, path) in winners.items():
            try:
                _owner, final_path, raw = self.resolve(pkg, path, details=True, follow_stubs=False)
                identity = localized_manual(final_path, {root})
                stub = is_so_stub(raw) is not None
                if identity is None and not stub:
                    # A link out of the language root (e.g. to the English page)
                    # would publish other-language text under this language.
                    raise ValueError("Translated manual resolves outside its language root")
                alias = stub or (identity[2].lower(), identity[3].lower()) != (name, section)
                target = None
                if alias:
                    target_owner, target_path, _raw = self.resolve(pkg, path, details=True)
                    match = localized_manual(target_path, {root})
                    if not match:
                        raise ValueError("Alias target has no translated manual identity")
                    target = (match[2].lower(), match[3].lower(), target_owner)
                    alias = target[:2] != (name, section)
                yield (
                    pkg,
                    path,
                    name,
                    section,
                    alias,
                    target,
                    b"" if alias else self.resolve(pkg, path),
                )
            except (ValueError, FileNotFoundError) as exc:
                self.missing.append({"package": pkg, "path": path, "error": str(exc)})


def _page_id(pkg: str, path: str, name: str, section: str) -> str:
    # Same formula as parse_archive_source; the path carries the language root.
    return sha256_hex(f"debian/{pkg}/{path}/{name}/{section}".encode())[:32]


def parse_translation(workspace: TranslationWorkspace, locale: str, spool, *, workers=4):
    """Parse one language into the spool; returns aliases, failures and documented versions."""
    documented: dict[str, str] = {}
    aliases: list[_AliasRow] = []

    def inputs():
        for pkg, path, name, section, alias, target, raw in workspace.translated_sources(locale):
            require_job_budget("parsing")
            if alias:
                aliases.append(_AliasRow(name, section, target[0], target[1], path))
                continue
            version = documented_version(raw)
            if version:
                documented[_page_id(pkg, path, name, section)] = version
            yield ArchiveParseInput(pkg, path, name, section, raw, workspace.available[pkg].version)

    failed = []
    with ProcessPoolExecutor(max_workers=workers) as executor:
        for item, future in _bounded_futures(
            executor, parse_archive_source, iter(inputs()), workers * 2
        ):
            try:
                spool.append(future.result())
            except Exception as exc:  # noqa: BLE001
                failed.append({"package": item.package, "path": item.path, "error": str(exc)})
    refs = list(spool.refs())
    return _resolve_aliases(aliases=aliases, pages=refs), failed, documented


def ingest_debian_translation(
    *,
    locale: str,
    activate: bool,
    convex_url: str,
    ingest_secret: str,
    dataset_stage: str,
    git_sha: str,
    sample: bool = False,
    **_kwargs,
) -> IngestResult:
    import os
    import shutil
    import sys

    if dataset_stage != "staging":
        raise ValueError("Translated releases ingest to staging; prod uses gated promotion")
    if sys.version_info < (3, 14) or not shutil.which("mandoc"):
        raise RuntimeError("Debian archive ingestion requires Python 3.14 and mandoc")
    client = ConvexIngestClient(convex_url, ingest_secret)
    contract = client.require_deployed_contract()  # Before acquisition or any writes.
    # Notices over Convex's 1 MiB document limit upload as stored files, as in debian_publish.
    if contract.get("storedLicenseText") is not True:
        raise RuntimeError("Deploy stored-license support before translated ingestion")
    base = Path(__file__).resolve().parents[2] / ".cache" / "debian"
    root = Path(os.environ.get("BETTERMAN_DEBIAN_WORKDIR", str(base / "workspaces")))
    root = root / sha256_hex(PINS.read_bytes()) / "translations" / TRANSLATION_ROOTS[locale]
    workspace = TranslationWorkspace(root, locales=[locale], limit=6 if sample else None)
    workspace.acquire()
    return publish_translation(
        workspace,
        locale,
        client,
        activate=activate,
        dataset_stage=dataset_stage,
        git_sha=git_sha,
    )


def publish_translation(
    workspace: TranslationWorkspace,
    locale: str,
    client: ConvexIngestClient,
    *,
    activate: bool,
    dataset_stage: str,
    git_sha: str,
) -> IngestResult:
    """Declare, upload and (optionally) activate one language's release."""
    workspace.timings = {}
    started = time.monotonic()
    with (
        TemporaryDirectory(prefix=f"publish-{locale}-", dir=workspace.root) as temporary,
        _PageSpool(Path(temporary) / "pages.sqlite3") as spool,
    ):
        aliases, failures, documented = parse_translation(
            workspace, locale, spool, workers=_ingest_worker_count()
        )
        workspace.timings["parseSeconds"] = time.monotonic() - started
        _log("deb_l10n_parse_complete", locale=locale, pages=len(spool), aliases=len(aliases))
        refs = list(spool.refs())
        failed = len(failures) + len(workspace.missing)
        total = len(refs) + len(aliases) + failed
        # The B1 parse gate: at most 2% of translated sources may fail.
        if not refs or failed / total > 0.02:
            raise RuntimeError(f"Archive parse gate failed: {failed}/{total} sources")
        release_id = _build_dataset_release_id(
            git_sha=git_sha, mandoc_version="host", distro=f"debian-{locale}"
        )
        licenses = _LicenseSpool(spool.connection)
        used = sorted({p.source_package for p in refs if p.source_package})
        published_packages = [workspace.available[name] for name in used]
        for package in published_packages:
            require_job_budget("copyright collection")
            licenses[package.name] = copyright_text(workspace, package.name)
        manifest = {
            "acquisition": workspace.pins["acquisition"],
            "imageRef": workspace.pins["mirror"],
            "imageDigest": workspace.pins["releaseSha256"],
            "arch": "amd64",
            "distro": "debian",
            "locale": locale,
            "archiveRoot": f"usr/share/man/{TRANSLATION_ROOTS[locale]}",
            "pins": workspace.pins,
            "popularitySource": "popcon by_inst installed",
            "conflictPolicy": CONFLICT_POLICY,
            "droppedCopies": workspace.dropped,
            "packages": [
                {"name": p.name, "version": p.version, "sha256": p.sha256, "installed": p.installed}
                for p in published_packages
            ],
            "missingSources": workspace.missing,
            "parseFailures": failures,
        }
        declarations = _build_license_packages(
            package_manifest=manifest, packages_with_text=set(licenses)
        )
        batches = [declarations[i : i + 200] for i in range(0, len(declarations), 200)]
        for _item in _iter_license_items(
            licenses=licenses, distro="debian", dataset_release_id=release_id, stored=True
        ):
            pass  # Check every notice before creating the release; never truncate.
        require_job_budget("release creation")
        client.post(
            "/ingest/release",
            {
                "datasetReleaseId": release_id,
                "locale": locale,
                "distro": "debian",
                "imageRef": workspace.pins["mirror"],
                "imageDigest": workspace.pins["releaseSha256"],
                "ingestedAt": iso_utc_now(),
                "packageManifest": manifest,
                "pageCount": len(refs),
                "indexablePageCount": 0,
                "aliasCount": len(aliases),
                "licenseCount": len(licenses),
                "sectionTotals": [
                    {"section": section, "total": count}
                    for section, count in sorted(Counter(p.section for p in refs).items())
                ],
                "packageBatches": [
                    {
                        "digest": _package_batch_digest(batch),
                        "count": len(batch),
                        "licenseCount": sum(bool(p["hasLicenseText"]) for p in batch),
                    }
                    for batch in batches
                ],
            },
        )
        for index, batch in enumerate(batches):
            require_job_budget("package declaration")
            client.post(
                "/ingest/license-packages",
                {"datasetReleaseId": release_id, "batchIndex": index, "packages": batch},
            )
        sitemap = dict.fromkeys((page.page_id for page in refs), 0)

        def payloads():
            for payload in _resolved_page_payloads(spool, refs, sitemap):
                require_job_budget("page upload")
                payload.update(indexable=False, popularityScore=0, sitemapPage=0)
                version = documented.get(payload["externalId"])
                if version:
                    payload["documentedVersion"] = version
                yield payload

        upload_started = time.monotonic()
        _upload_pages(
            client,
            dataset_release_id=release_id,
            limits=_page_batch_limits(),
            pages=payloads(),
            total=len(spool),
            workers=_upload_worker_count(),
        )
        workspace.timings["pageUploadSeconds"] = time.monotonic() - upload_started
        rows = [
            {
                "name": a.name,
                "section": a.section,
                "targetName": a.target_name,
                "targetSection": a.target_section,
            }
            for a in aliases
        ]
        for index in range(0, len(rows), 100):
            require_job_budget("alias upload")
            client.post(
                "/ingest/aliases",
                {"datasetReleaseId": release_id, "aliases": rows[index : index + 100]},
            )
        pending = []
        for notice in _iter_license_items(
            licenses=licenses, distro="debian", dataset_release_id=release_id, stored=True
        ):
            require_job_budget("license upload")
            if pending and (
                len(pending) >= 10 or len(encode_json([*pending, notice])) > 4 * 1024 * 1024
            ):
                client.post(
                    "/ingest/licenses", {"datasetReleaseId": release_id, "licenses": pending}
                )
                pending = []
            pending.append(notice)
        if pending:
            client.post("/ingest/licenses", {"datasetReleaseId": release_id, "licenses": pending})
        if activate:
            client.activate_release(
                {
                    "datasetReleaseId": release_id,
                    "stage": dataset_stage,
                    "activatedAt": iso_utc_now(),
                }
            )
        workspace.timings["totalSeconds"] = time.monotonic() - started
        _log("deb_l10n_publish_complete", locale=locale, **workspace.timings)
        return IngestResult(release_id, total, len(spool), failed, activate)
