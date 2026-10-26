from __future__ import annotations

import logging
import os
import platform
import re
from collections import Counter
from collections.abc import Iterator
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

from ingestion.alpine import (
    apk_arch,
    apk_install,
    apk_packages,
)
from ingestion.alpine import (
    build_manpath_to_package as build_manpath_to_package_apk,
)
from ingestion.alpine import (
    mandoc_pkg_version as mandoc_pkg_version_apk,
)
from ingestion.alpine import package_license_ids as apk_license_ids
from ingestion.arch import (
    build_manpath_to_package as build_manpath_to_package_pacman,
)
from ingestion.arch import (
    mandoc_pkg_version as mandoc_pkg_version_pacman,
)
from ingestion.arch import package_license_ids as pacman_license_ids
from ingestion.arch import (
    pacman_arch,
    pacman_install,
    pacman_packages,
)
from ingestion.convex_client import ConvexIngestClient, encode_json
from ingestion.db import iso_utc_now, json_dumps
from ingestion.debian import (
    apt_install,
    dpkg_arch,
    dpkg_packages,
)
from ingestion.debian import (
    build_manpath_to_package as build_manpath_to_package_dpkg,
)
from ingestion.debian import (
    mandoc_pkg_version as mandoc_pkg_version_dpkg,
)
from ingestion.doc_model import OptionItem, SeeAlsoRef
from ingestion.fedora import (
    build_manpath_to_package as build_manpath_to_package_rpm,
)
from ingestion.fedora import (
    dnf_install,
    rpm_arch,
    rpm_packages,
)
from ingestion.fedora import (
    mandoc_pkg_version as mandoc_pkg_version_rpm,
)
from ingestion.freebsd import (
    freebsd_arch,
    pkg_install,
    pkg_packages,
)
from ingestion.macos import is_permissive_manpage, macos_arch, macos_version
from ingestion.man_scan import ManSource, scan_man_sources
from ingestion.mandoc import read_roff, render_html
from ingestion.mandoc_parser import is_so_stub, parse_mandoc_html, so_target_name_section
from ingestion.package_set import FULL_PACKAGE_SET_BY_DISTRO
from ingestion.util import normalize_ws, sha256_hex

_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._+-]*$")
_PKG_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9.+-]+$")
_DOC_ROOT = Path("/usr/share/doc")
_LICENSE_ROOT = Path("/usr/share/licenses")
_ALPINE_SPDX_ROOT = Path("/usr/share/spdx/text")
_BASE_PROVENANCE = {
    "freebsd": (
        "freebsd-base",
        "FreeBSD base-system manual pages",
        "https://www.freebsd.org/copyright/",
    ),
    "macos": (
        "macos-base",
        "macOS license-filtered base-system manual pages (BSD-licensed subset)",
        "https://opensource.apple.com/",
    ),
}
_MAN_HREF_RE = re.compile(
    r"^/man/(?P<name>[a-z0-9][a-z0-9._+-]*)(?:/(?P<section>[1-9][a-z0-9]*))?$"
)

logger = logging.getLogger("betterman.ingestion")
_PAGE_BATCH_FAILURE_LIMIT = 3


def _log(event: str, **fields: object) -> None:
    logger.info(json_dumps({"ts": iso_utc_now(), "event": event, **fields}))


@dataclass(frozen=True)
class IngestResult:
    dataset_release_id: str
    total: int
    succeeded: int
    hard_failed: int
    published: bool


def ingest(
    *,
    sample: bool,
    activate: bool,
    convex_url: str,
    ingest_secret: str,
    dataset_stage: str,
    image_ref: str,
    image_digest: str,
    git_sha: str,
    locale: str = "en",
    distro: str = "debian",
) -> IngestResult:
    # Verify the deployed functions and schema version before installing
    # packages or posting a release. Shipping both sides in one commit does
    # not prove the deployment is current.
    client = ConvexIngestClient(http_url=convex_url, ingest_secret=ingest_secret)
    contract = client.require_deployed_contract()
    _log("ingest_contract_ok", schemaVersion=contract.get("schemaVersion"))
    workers = _ingest_worker_count()
    batch_limits = _page_batch_limits()

    requested = _content_packages(sample=sample, distro=distro)
    if distro in {"debian", "ubuntu"}:
        apt_install(requested)
    elif distro == "fedora":
        dnf_install(requested)
    elif distro == "arch":
        pacman_install(requested)
    elif distro == "alpine":
        apk_install(requested)
    elif distro == "freebsd":
        pkg_install(requested)
    elif distro == "macos":
        pass
    else:
        raise RuntimeError(f"unsupported distro: {distro}")

    man_roots = [Path("/usr/share/man")]
    if distro == "freebsd":
        man_roots.extend([Path("/usr/local/man"), Path("/usr/local/share/man")])

    sources: list[ManSource] = []
    for man_root in man_roots:
        if not man_root.exists():
            continue
        sources.extend(scan_man_sources(man_root, sample=sample))

    sources = _filter_sources(sources)
    if distro == "macos":
        sources = _filter_macos_sources(sources)

    if distro in {"debian", "ubuntu"}:
        packages = dpkg_packages()
        arch = dpkg_arch()
        mandoc_version = mandoc_pkg_version_dpkg(packages)
        manpath_to_pkg = build_manpath_to_package_dpkg()
    elif distro == "fedora":
        packages = rpm_packages()
        arch = rpm_arch()
        mandoc_version = mandoc_pkg_version_rpm(packages)
        manpath_to_pkg = build_manpath_to_package_rpm([src.path for src in sources])
    elif distro == "arch":
        packages = pacman_packages()
        arch = pacman_arch()
        mandoc_version = mandoc_pkg_version_pacman(packages)
        manpath_to_pkg = build_manpath_to_package_pacman()
    elif distro == "alpine":
        packages = apk_packages()
        arch = apk_arch()
        mandoc_version = mandoc_pkg_version_apk(packages)
        manpath_to_pkg = build_manpath_to_package_apk()
    elif distro == "freebsd":
        packages = pkg_packages()
        arch = freebsd_arch()
        mandoc_version = None
        manpath_to_pkg = {}
    else:
        packages = {}
        arch = macos_arch()
        mandoc_version = None
        manpath_to_pkg = {}

    if distro in _BASE_PROVENANCE:
        base_package = _BASE_PROVENANCE[distro][0]
        packages[base_package] = (
            macos_version() if distro == "macos" else platform.release()
        ) or "unknown"

    dataset_release_id = _build_dataset_release_id(
        git_sha=git_sha, mandoc_version=mandoc_version, distro=distro
    )
    package_manifest = {
        "imageRef": image_ref,
        "imageDigest": image_digest,
        "distro": distro,
        "locale": "C.UTF-8",
        "arch": arch,
        "requestedPackages": requested,
        "packages": [
            {"name": name, "version": version} for name, version in sorted(packages.items())
        ],
        "mandocPackageVersion": mandoc_version,
        "generatedAt": datetime.now(tz=UTC).isoformat(),
    }
    if distro == "macos":
        package_manifest["osVersion"] = macos_version()

    parsed_pages, aliases, parse_failed = _parse_sources(
        sources,
        _ParseContext(distro=distro, arch=arch, packages=packages, manpath_to_pkg=manpath_to_pkg),
        workers=workers,
    )

    total = len(sources)

    _resolve_doc_links_and_see_also(pages=parsed_pages)
    aliases = _resolve_aliases(aliases=aliases, pages=parsed_pages)
    _require_command_pages(
        distro=distro, requested=requested, pages=parsed_pages, aliases=aliases, sample=sample
    )

    # Aliases count as handled sources for the success gate, but the release
    # page count, section totals, and sitemaps only cover parsed pages.
    succeeded = len(parsed_pages)
    handled = succeeded + len(aliases)
    hard_failed = parse_failed
    hard_fail_rate = (hard_failed / total) if total else 0.0
    success_rate = (handled / total) if total else 0.0
    publish_allowed = success_rate >= 0.80 and hard_fail_rate <= 0.02

    page_links = _build_page_links(pages=parsed_pages)
    sitemap_pages = _build_sitemap_page_map(pages=parsed_pages)
    licenses = _collect_licenses(pages=parsed_pages, distro=distro)
    license_packages = _build_license_packages(
        package_manifest=package_manifest,
        packages_with_text=set(licenses),
    )

    client.post(
        "/ingest/release",
        {
            "datasetReleaseId": dataset_release_id,
            "locale": locale,
            "distro": distro,
            "imageRef": image_ref,
            "imageDigest": image_digest,
            "ingestedAt": datetime.now(tz=UTC).isoformat(),
            "packageManifest": package_manifest,
            "pageCount": succeeded,
            "aliasCount": len(aliases),
            "licenseCount": len(licenses),
            "sectionTotals": [
                {"section": section, "total": total}
                for section, total in sorted(Counter(p.section for p in parsed_pages).items())
            ],
            "licensePackages": license_packages,
        },
    )

    _upload_pages(
        client,
        dataset_release_id=dataset_release_id,
        limits=batch_limits,
        pages=[
            _page_payload(
                row,
                sitemap_page=sitemap_pages[row.page_id],
                links=page_links.get(row.page_id, []),
            )
            for row in parsed_pages
        ],
    )

    if licenses:
        license_items = [
            {
                "packageName": package_name,
                "licenseId": f"pkg:{package_name}",
                "licenseName": package_name,
                "licenseText": text,
                "sourceUrl": (_BASE_PROVENANCE[distro][2] if distro in _BASE_PROVENANCE else None),
            }
            for package_name, text in sorted(licenses.items())
        ]
        for start in range(0, len(license_items), 10):
            client.post(
                "/ingest/licenses",
                {
                    "datasetReleaseId": dataset_release_id,
                    "licenses": license_items[start : start + 10],
                },
            )

    if aliases:
        alias_items = [
            {
                "name": alias.name,
                "section": alias.section,
                "targetName": alias.target_name,
                "targetSection": alias.target_section,
            }
            for alias in aliases
        ]
        for start in range(0, len(alias_items), 200):
            client.post(
                "/ingest/aliases",
                {
                    "datasetReleaseId": dataset_release_id,
                    "aliases": alias_items[start : start + 200],
                },
            )

    published = False
    if publish_allowed and activate:
        client.activate_release(
            {
                "stage": dataset_stage,
                "datasetReleaseId": dataset_release_id,
                "activatedAt": datetime.now(tz=UTC).isoformat(),
            },
        )
        published = True

    _log(
        "ingest_summary",
        datasetReleaseId=dataset_release_id,
        total=total,
        succeeded=succeeded,
        aliases=len(aliases),
        failed=hard_failed,
        published=published,
        publishAllowed=publish_allowed,
    )

    if not publish_allowed:
        raise RuntimeError(
            f"publish blocked: success_rate={success_rate:.3f}, hard_fail_rate={hard_fail_rate:.3f}"
        )

    return IngestResult(
        dataset_release_id=dataset_release_id,
        total=total,
        succeeded=succeeded,
        hard_failed=hard_failed,
        published=published,
    )


@dataclass(frozen=True)
class _PageRow:
    page_id: str
    name: str
    section: str
    title: str
    description: str
    source_path: str
    source_package: str | None
    source_package_version: str | None
    content_sha256: str
    has_parse_warnings: bool
    doc: dict
    plain_text: str
    synopsis: list[str] | None
    options: list[dict] | None
    see_also: list[dict] | None
    headings_text: str
    see_also_refs: list[tuple[str, str | None]]


@dataclass
class _AliasRow:
    name: str
    section: str
    target_name: str
    target_section: str
    source_path: str


def _alias_for_source(src: ManSource, raw: bytes) -> _AliasRow | None:
    """Return an alias row when the source is a bare `.so` include stub."""
    target = is_so_stub(raw)
    if target is None:
        return None
    parsed = so_target_name_section(target)
    if parsed is None:
        return None
    target_name, target_section = parsed
    if (target_name, target_section) == (src.name, src.section):
        return None
    return _AliasRow(
        name=src.name,
        section=src.section,
        target_name=target_name,
        target_section=target_section,
        source_path=str(src.path),
    )


def _resolve_aliases(*, aliases: list[_AliasRow], pages: list[_PageRow]) -> list[_AliasRow]:
    """Keep aliases whose target is a parsed page, following stub chains.

    A stub may point at another stub. Follow the chain until it reaches a
    parsed page; the visited set stops cycles, and an acyclic chain can never
    be longer than the number of aliases. Chains that never reach a real page
    are dropped.
    """
    index = {(p.name, p.section) for p in pages}
    by_key = {(a.name, a.section): a for a in aliases}
    out: list[_AliasRow] = []
    for alias in aliases:
        target = (alias.target_name, alias.target_section)
        seen = {(alias.name, alias.section)}
        while target not in index and target in by_key and target not in seen:
            seen.add(target)
            nxt = by_key[target]
            target = (nxt.target_name, nxt.target_section)
        if target not in index:
            _log("alias_unresolved", path=alias.source_path, target=f"{target[0]}({target[1]})")
            continue
        out.append(
            _AliasRow(
                name=alias.name,
                section=alias.section,
                target_name=target[0],
                target_section=target[1],
                source_path=alias.source_path,
            )
        )
    return out


def _filter_sources(sources: list[ManSource]) -> list[ManSource]:
    out: list[ManSource] = []
    seen: set[tuple[str, str]] = set()
    for src in sorted(sources, key=lambda s: str(s.path)):
        name_norm = src.name.strip().lower()
        if not _NAME_RE.fullmatch(name_norm):
            continue

        key = (name_norm, src.section)
        if key in seen:
            continue
        seen.add(key)
        out.append(ManSource(path=src.path, name=name_norm, section=src.section))
    return out


def _filter_macos_sources(sources: list[ManSource]) -> list[ManSource]:
    out: list[ManSource] = []
    for src in sources:
        try:
            raw = read_roff(src.path)
        except Exception:  # noqa: BLE001
            continue
        if not is_permissive_manpage(raw):
            continue
        out.append(src)
    return out


@dataclass(frozen=True)
class _ParseContext:
    distro: str
    arch: str
    packages: dict[str, str]
    manpath_to_pkg: dict[str, str]


@dataclass(frozen=True)
class _ParseResult:
    page: _PageRow | None = None
    alias: _AliasRow | None = None
    error: str | None = None


_MAX_INGEST_WORKERS = 8
_worker_context: _ParseContext | None = None


def _ingest_worker_count() -> int:
    value = os.environ.get("BETTERMAN_INGEST_WORKERS", "").strip()
    if not value:
        return min(_MAX_INGEST_WORKERS, os.cpu_count() or 1)
    try:
        requested = int(value)
    except ValueError:
        raise RuntimeError("BETTERMAN_INGEST_WORKERS must be an integer") from None
    return max(1, min(_MAX_INGEST_WORKERS, requested))


def _parse_sources(
    sources: list[ManSource], context: _ParseContext, *, workers: int
) -> tuple[list[_PageRow], list[_AliasRow], int]:
    pages: list[_PageRow] = []
    aliases: list[_AliasRow] = []
    failed = 0
    started = monotonic()
    results = _parse_results(sources, context, workers=workers)
    for processed, (src, result) in enumerate(zip(sources, results, strict=True), start=1):
        if result.error is not None:
            failed += 1
            _log("page_parse_failed", path=str(src.path), error=result.error)
        elif result.alias is not None:
            aliases.append(result.alias)
        elif result.page is not None:
            pages.append(result.page)

        if processed % 100 == 0:
            elapsed = monotonic() - started
            rate = processed / elapsed if elapsed > 0 else 0.0
            eta_s = int((len(sources) - processed) / rate) if rate > 0 else None
            _log(
                "parse_progress",
                processed=processed,
                total=len(sources),
                pct=round((processed / len(sources)) * 100.0, 2),
                etaSeconds=eta_s,
            )
    return pages, aliases, failed


def _parse_results(
    sources: list[ManSource], context: _ParseContext, *, workers: int
) -> Iterator[_ParseResult]:
    if workers == 1 or len(sources) < 2:
        for src in sources:
            yield _parse_one(src, context)
        return
    with ProcessPoolExecutor(
        max_workers=min(workers, len(sources)),
        initializer=_init_parse_worker,
        initargs=(context,),
    ) as executor:
        # map yields in source order, so links, aliases and sitemap pages
        # come out exactly as the sequential path produces them.
        delivered = 0
        try:
            for result in executor.map(_parse_in_worker, sources):
                yield result
                delivered += 1
        except BrokenProcessPool as exc:
            # A worker died (usually the OOM killer) and the pool cannot say
            # which page it was parsing. The first source without a result is
            # the earliest candidate.
            raise RuntimeError(
                f"parse worker pool broke before source {delivered + 1} of {len(sources)} "
                f"({sources[delivered].path}) returned; a worker was likely killed for memory"
            ) from exc


def _init_parse_worker(context: _ParseContext) -> None:
    # Ship the package maps once per worker process, not once per page.
    global _worker_context
    _worker_context = context


def _parse_in_worker(src: ManSource) -> _ParseResult:
    assert _worker_context is not None
    return _parse_one(src, _worker_context)


def _parse_one(src: ManSource, context: _ParseContext) -> _ParseResult:
    try:
        raw = read_roff(src.path)
        alias = _alias_for_source(src, raw)
        if alias is not None:
            return _ParseResult(alias=alias)
        return _ParseResult(page=_parse_source(src, raw, context))
    except Exception as exc:  # noqa: BLE001 (batch ingestion)
        # Return the message rather than raising: one bad page must not stop
        # executor.map, and arbitrary exceptions need not be picklable.
        return _ParseResult(error=str(exc))


def _page_external_id(*, distro: str, name: str, section: str) -> str:
    # Same id for the same page across runs and worker counts. Convex scopes
    # externalId to a release, and sources are already unique per (name, section).
    return sha256_hex(f"{distro}/{name}/{section}".encode())[:32]


def _parse_source(src: ManSource, raw: bytes, context: _ParseContext) -> _PageRow:
    html_result = render_html(raw)
    parsed = parse_mandoc_html(html_result.html)

    source_path = str(src.path)
    manpath_to_pkg = context.manpath_to_pkg
    source_package = manpath_to_pkg.get(source_path) or manpath_to_pkg.get(str(src.path.resolve()))
    if (
        not source_package
        and context.distro in _BASE_PROVENANCE
        and src.path.is_relative_to(Path("/usr/share/man"))
    ):
        source_package = _BASE_PROVENANCE[context.distro][0]
    source_package_version = None
    if source_package:
        source_package_version = context.packages.get(source_package) or context.packages.get(
            f"{source_package}:{context.arch}"
        )

    title = f"{src.name}({src.section})"

    return _PageRow(
        page_id=_page_external_id(distro=context.distro, name=src.name, section=src.section),
        name=src.name,
        section=src.section,
        title=title,
        description=parsed.description,
        source_path=source_path,
        source_package=source_package,
        source_package_version=source_package_version,
        content_sha256=sha256_hex(raw),
        has_parse_warnings=html_result.warnings is not None,
        doc=parsed.doc.model_dump(),
        plain_text=parsed.plain_text,
        synopsis=parsed.synopsis,
        options=_dump_models(parsed.options),
        see_also=_dump_models(parsed.see_also),
        headings_text=parsed.headings_text,
        see_also_refs=[(ref.name, ref.section) for ref in (parsed.see_also or [])],
    )


def _dump_models(items: list[OptionItem] | list[SeeAlsoRef] | None) -> list[dict] | None:
    if not items:
        return None
    return [item.model_dump() for item in items]


def _build_dataset_release_id(*, git_sha: str, mandoc_version: str | None, distro: str) -> str:
    ts = datetime.now(tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    mandoc_part = f"mandoc:{mandoc_version}" if mandoc_version else "mandoc:unknown"
    sha = git_sha or "unknown"
    return f"{ts}+{distro}+{sha}+{mandoc_part}"


def _content_packages(*, sample: bool, distro: str) -> list[str]:
    if distro in {"freebsd", "macos"}:
        base: list[str] = []
    elif distro == "alpine":
        base = ["mandoc", "spdx-licenses-text"]
    elif distro == "arch":
        base = ["mandoc"]
    else:
        base = ["mandoc", "man-db"]
    if sample:
        if distro in {"freebsd", "macos"}:
            return []

        openssh_pkg = "openssh-client"
        if distro in {"fedora"}:
            openssh_pkg = "openssh-clients"
        elif distro in {"arch"}:
            openssh_pkg = "openssh"

        return [
            *base,
            "bash",
            "coreutils",
            "curl",
            openssh_pkg,
            "tar",
        ]

    out: list[str] = []
    seen: set[str] = set()
    pkg_set = FULL_PACKAGE_SET_BY_DISTRO.get(distro)
    if pkg_set is None:
        pkg_set = FULL_PACKAGE_SET_BY_DISTRO["debian"]
    for pkg in [*base, *pkg_set]:
        if pkg in seen:
            continue
        seen.add(pkg)
        out.append(pkg)
    return out


_COMMAND_PAGES = {
    **{
        name: (name, "1")
        for name in (
            "bash",
            "curl",
            "wget",
            "rsync",
            "tar",
            "vim",
            "less",
            "git",
            "make",
            "gcc",
            "gdb",
            "openssl",
            "perl",
            "grep",
            "sed",
            "gawk",
            "systemd",
            "groff",
            "python",
            "python3",
            "mandoc",
        )
    },
    "coreutils": ("ls", "1"),
    "findutils": ("find", "1"),
    "util-linux": ("mount", "8"),
    "openssh-client": ("ssh_config", "5"),
    "openssh-clients": ("ssh_config", "5"),
    "openssh": ("ssh_config", "5"),
    "vim-enhanced": ("vim", "1"),
    "nginx": ("nginx", "8"),
    "man-db": ("man", "1"),
    "netcat-openbsd": ("nc", "1"),
    "openbsd-netcat": ("nc", "1"),
    "apache2": ("apache2", "8"),
    "apache": ("httpd", "8"),
    "httpd": ("httpd", "8"),
    "iproute2": ("ip", "8"),
    "iproute": ("ip", "8"),
    "procps": ("ps", "1"),
    "procps-ng": ("ps", "1"),
    "postgresql-client": ("psql", "1"),
    "postgresql": ("psql", "1"),
    "default-mysql-client": ("mysql", "1"),
}
# Documentation, license data, and development headers have no own command page.
_NON_COMMAND_PACKAGES = {
    "manpages",
    "manpages-dev",
    "man-pages",
    "mandoc-doc",
    "busybox-doc",
    "libssl-dev",
    "openssl-devel",
    "spdx-licenses-text",
}
_SAMPLE_PAGES = {("bash", "1"), ("ls", "1"), ("curl", "1"), ("tar", "1"), ("ssh_config", "5")}


def _require_command_pages(
    *,
    distro: str,
    requested: list[str],
    pages: list[_PageRow],
    aliases: list[_AliasRow],
    sample: bool,
) -> None:
    unclassified = sorted(set(requested) - _COMMAND_PAGES.keys() - _NON_COMMAND_PACKAGES)
    if unclassified:
        raise RuntimeError("no command-page expectation for packages: " + ", ".join(unclassified))
    expected = {
        ("httpd", "8") if distro == "alpine" and pkg == "apache2" else _COMMAND_PAGES[pkg]
        for pkg in requested
        if pkg in _COMMAND_PAGES
    }
    if sample:
        expected &= _SAMPLE_PAGES
    # Distros use section suffixes such as openssl(1ssl) and openssl(1ossl).
    present = {(p.name, p.section[:1]) for p in pages} | {(a.name, a.section[:1]) for a in aliases}
    missing = sorted(expected - present)
    if missing:
        raise RuntimeError(
            "publish blocked: missing package-set command pages: "
            + ", ".join(f"{name}({section})" for name, section in missing)
        )


def _parse_man_href(href: str) -> tuple[str, str | None] | None:
    match = _MAN_HREF_RE.match(href)
    if not match:
        return None
    name = match.group("name").strip().lower()
    section = match.group("section")
    return name, (section.strip().lower() if section else None)


def _iter_internal_doc_links(obj: object):
    if isinstance(obj, list):
        for item in obj:
            yield from _iter_internal_doc_links(item)
        return

    if not isinstance(obj, dict):
        return

    if (
        obj.get("type") == "link"
        and obj.get("linkType") == "internal"
        and isinstance(obj.get("href"), str)
    ):
        yield obj

    for v in obj.values():
        if isinstance(v, dict) or isinstance(v, list):
            yield from _iter_internal_doc_links(v)


def _resolve_doc_links_and_see_also(*, pages: list[_PageRow]) -> None:
    index: dict[tuple[str, str], str] = {(p.name, p.section): p.page_id for p in pages}
    by_name: dict[str, list[str]] = {}
    for p in pages:
        by_name.setdefault(p.name, []).append(p.section)

    for page in pages:
        from_id = page.page_id

        if page.see_also:
            for ref in page.see_also:
                ref.pop("resolvedPageId", None)

                name = str(ref.get("name") or "").strip().lower()
                if not name:
                    continue

                raw_section = ref.get("section")
                section: str | None = str(raw_section).strip().lower() if raw_section else None
                section_resolved = section
                if section_resolved is None:
                    candidates = by_name.get(name, [])
                    if len(candidates) == 1:
                        section_resolved = candidates[0]
                        ref["section"] = section_resolved

                if section_resolved is None:
                    continue

                to_id = index.get((name, section_resolved))
                if to_id is None or to_id == from_id:
                    continue

                ref["resolvedPageId"] = to_id

        for link in _iter_internal_doc_links(page.doc):
            href = link.get("href")
            if not isinstance(href, str):
                continue
            parsed = _parse_man_href(href)
            if parsed is None:
                continue

            name, section = parsed
            candidates = by_name.get(name, [])

            if section is None:
                link["linkType"] = "internal" if candidates else "unresolved"
                continue

            link["linkType"] = "internal" if (name, section) in index else "unresolved"


def _build_page_links(*, pages: list[_PageRow]) -> dict[str, list[dict[str, str | None]]]:
    index: dict[tuple[str, str], _PageRow] = {(p.name, p.section): p for p in pages}
    by_id: dict[str, _PageRow] = {p.page_id: p for p in pages}
    by_name: dict[str, list[str]] = {}
    for p in pages:
        by_name.setdefault(p.name, []).append(p.section)

    out: dict[str, list[dict[str, str | None]]] = {}
    seen: set[tuple[str, str, str]] = set()
    for page in pages:
        from_id = page.page_id
        if page.see_also:
            for ref in page.see_also:
                to_id = ref.get("resolvedPageId")
                if not isinstance(to_id, str) or not to_id:
                    continue
                target = by_id.get(to_id)
                if target is None:
                    continue
                if to_id == from_id:
                    continue

                key = (from_id, to_id, "see_also")
                if key in seen:
                    continue
                seen.add(key)
                out.setdefault(from_id, []).append(
                    {
                        "toExternalId": to_id,
                        "toName": target.name,
                        "toSection": target.section,
                        "linkType": "see_also",
                    }
                )

        for link in _iter_internal_doc_links(page.doc):
            href = link.get("href")
            if not isinstance(href, str):
                continue
            parsed = _parse_man_href(href)
            if parsed is None:
                continue

            name, section = parsed
            candidates = by_name.get(name, [])
            to_id: str | None = None

            if section is None:
                if len(candidates) == 1:
                    target = index.get((name, candidates[0]))
                    to_id = target.page_id if target else None
                else:
                    # ambiguous, but still linkable via /man/{name}
                    continue
            else:
                target = index.get((name, section))
                to_id = target.page_id if target else None

            if to_id is None or to_id == from_id:
                continue
            target = by_id.get(to_id)
            if target is None:
                continue

            key = (from_id, to_id, "xref")
            if key in seen:
                continue
            seen.add(key)
            out.setdefault(from_id, []).append(
                {
                    "toExternalId": to_id,
                    "toName": target.name,
                    "toSection": target.section,
                    "linkType": "xref",
                }
            )
    return out


def _collect_licenses(*, pages: list[_PageRow], distro: str) -> dict[str, str]:
    packages = {p.source_package for p in pages if p.source_package}
    licenses: dict[str, str] = {}
    if distro in _BASE_PROVENANCE:
        package, label, url = _BASE_PROVENANCE[distro]
        version = next(
            (p.source_package_version for p in pages if p.source_package == package), None
        )
        licenses[package] = (
            f"{label}\nOS version: {version or 'unknown'}\nSource: {url}\n"
            "Provenance record; individual source files retain their own license notices."
        )
    license_ids = {}
    if distro == "arch":
        license_ids = pacman_license_ids()
    elif distro == "alpine":
        license_ids = apk_license_ids()
    for pkg in sorted(packages):
        if distro in {"debian", "ubuntu"}:
            text = _read_debian_copyright(pkg)
        else:
            text = _read_package_licenses(pkg)
            if not text and distro == "alpine" and pkg.endswith("-doc"):
                text = _read_package_licenses(pkg.removesuffix("-doc"))
        shared = _read_spdx_licenses(
            license_ids.get(pkg, ""),
            root=_ALPINE_SPDX_ROOT if distro == "alpine" else _LICENSE_ROOT / "spdx",
        )
        if text or shared:
            licenses[pkg] = "\n\n".join(part for part in (text, shared) if part)
    return licenses


def _read_spdx_licenses(expression: str, *, root: Path) -> str | None:
    texts: list[str] = []
    for identifier in sorted(set(re.findall(r"[A-Za-z0-9][A-Za-z0-9.+-]*", expression))):
        try:
            path = (root / f"{identifier}.txt").resolve(strict=True)
            if path.is_relative_to(root.resolve(strict=True)) and path.is_file():
                texts.append(f"{identifier}\n{path.read_text(encoding='utf-8', errors='replace')}")
        except OSError:
            continue
    return f"Declared license: {expression}\n\n" + "\n\n".join(texts) if texts else None


def _read_package_licenses(pkg: str) -> str | None:
    if not _PKG_NAME_RE.fullmatch(pkg):
        return None
    try:
        root = _LICENSE_ROOT.resolve(strict=True)
        directory = (_LICENSE_ROOT / pkg).resolve(strict=True)
        if not directory.is_relative_to(root) or not directory.is_dir():
            return None
        texts: list[str] = []
        for file in sorted(directory.rglob("*")):
            resolved = file.resolve(strict=True)
            if resolved.is_relative_to(root) and resolved.is_file():
                text = resolved.read_text(encoding="utf-8", errors="replace")
                if text.strip():
                    texts.append(f"{file.relative_to(directory)}\n{text}")
        return "\n\n".join(texts) or None
    except OSError:
        return None


def _build_license_packages(
    *,
    package_manifest: dict,
    packages_with_text: set[str],
) -> list[dict[str, object]]:
    out: list[dict[str, object]] = []
    packages = package_manifest.get("packages")
    if not isinstance(packages, list):
        return out
    for pkg in packages:
        if not isinstance(pkg, dict):
            continue
        name = pkg.get("name")
        version = pkg.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            continue
        out.append(
            {
                "name": name,
                "version": version,
                "hasLicenseText": name in packages_with_text,
            }
        )
    out.sort(key=lambda item: str(item["name"]))
    return out


def _build_sitemap_page_map(*, pages: list[_PageRow]) -> dict[str, int]:
    out: dict[str, int] = {}
    for index, page in enumerate(sorted(pages, key=lambda p: (p.name, p.section)), start=1):
        out[page.page_id] = ((index - 1) // 10_000) + 1
    return out


def _page_batch_limits() -> tuple[int, int]:
    """Pages and exact request bytes per batch, each overridable by environment.

    Twenty pages keep each mutation small; eight MiB keeps a batch of large
    pages well under Convex's 16 MiB function-argument limit. Read before the
    release is created so a bad value cannot strand a half-uploaded release.
    """
    return (
        _positive_int_env("BETTERMAN_INGEST_PAGE_BATCH_ITEMS", 20),
        _positive_int_env("BETTERMAN_INGEST_PAGE_BATCH_BYTES", 8 * 1024 * 1024),
    )


def _positive_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if not raw:
        return default
    if not raw.strip().isdigit() or int(raw) < 1:
        raise RuntimeError(f"{name} must be a positive integer")
    return int(raw)


def _page_batches(
    pages: list[dict[str, object]], *, dataset_release_id: str, max_items: int, max_bytes: int
) -> Iterator[list[dict[str, object]]]:
    """Group page payloads so each request stays within max_items and max_bytes.

    Sizes are the UTF-8 bytes post() sends. A single page above max_bytes is
    posted alone; the server decides whether it fits.
    """
    envelope = len(encode_json({"datasetReleaseId": dataset_release_id, "pages": []}))
    batch: list[dict[str, object]] = []
    size = envelope
    for page in pages:
        page_bytes = len(encode_json(page))
        if batch and (len(batch) >= max_items or size + 1 + page_bytes > max_bytes):
            yield batch
            batch, size = [], envelope
        size += page_bytes + (1 if batch else 0)  # comma between entries
        batch.append(page)
    if batch:
        yield batch


def _upload_pages(
    client: ConvexIngestClient,
    *,
    dataset_release_id: str,
    limits: tuple[int, int],
    pages: list[dict[str, object]],
) -> None:
    """Post page batches; abort after three consecutive failures.

    A failed batch leaves the release short of its declared page count, so it
    can never activate. The remaining batches are still tried so one run
    reports every rejected batch, then the run fails before activation.
    """
    max_items, max_bytes = limits
    started = monotonic()
    processed = 0
    failed_batches = 0
    consecutive_failures = 0
    for batch in _page_batches(
        pages, dataset_release_id=dataset_release_id, max_items=max_items, max_bytes=max_bytes
    ):
        try:
            client.post(
                "/ingest/pages/storage", {"datasetReleaseId": dataset_release_id, "pages": batch}
            )
        except RuntimeError as exc:
            failed_batches += 1
            consecutive_failures += 1
            _log(
                "page_batch_failed",
                pages=[f"{page['name']}({page['section']})" for page in batch],
                consecutiveFailures=consecutive_failures,
                error=str(exc)[:500],
            )
            if consecutive_failures >= _PAGE_BATCH_FAILURE_LIMIT:
                raise RuntimeError(
                    f"page upload aborted after {consecutive_failures} consecutive failed batches"
                ) from exc
            continue
        consecutive_failures = 0

        before = processed
        processed += len(batch)
        if processed // 100 > before // 100 or processed == len(pages):
            elapsed = monotonic() - started
            rate = processed / elapsed if elapsed > 0 else 0.0
            remaining = max(0, len(pages) - processed)
            eta_s = int(remaining / rate) if rate > 0 else None
            _log(
                "insert_progress",
                processed=processed,
                total=len(pages),
                pct=round((processed / len(pages)) * 100.0, 2) if pages else 0.0,
                etaSeconds=eta_s,
            )

    if failed_batches:
        raise RuntimeError(
            f"{failed_batches} page batch(es) failed; release {dataset_release_id} is incomplete"
        )


def _page_payload(
    row: _PageRow,
    *,
    sitemap_page: int,
    links: list[dict[str, str | None]],
) -> dict[str, object]:
    # The server ignores searchText and keeps 240 characters of snippetText
    # (MAX_SNIPPET_TEXT_CHARS in convex/lib.ts); send only what it stores.
    snippet_text = normalize_ws(f"{row.description} {row.plain_text}")[:240]
    return {
        "externalId": row.page_id,
        "name": row.name,
        "section": row.section,
        "sitemapPage": sitemap_page,
        "title": row.title,
        "description": row.description,
        "sourcePath": row.source_path,
        "sourcePackage": row.source_package,
        "sourcePackageVersion": row.source_package_version,
        "contentSha256": row.content_sha256,
        "hasParseWarnings": row.has_parse_warnings,
        "doc": row.doc,
        "synopsis": row.synopsis,
        "options": row.options,
        "seeAlso": row.see_also,
        "searchText": "",
        "snippetText": snippet_text,
        "links": links,
    }


def _read_debian_copyright(pkg: str) -> str | None:
    # pkg comes from the distro package database, not from us. Keep it to a
    # single well-formed package name so it cannot walk out of /usr/share/doc.
    if not _PKG_NAME_RE.fullmatch(pkg):
        return None

    # Resolve before checking confinement. A lexical check is worthless here:
    # pkg cannot contain a separator, so the unresolved path is always under
    # the doc root. What it would miss is a package shipping
    # /usr/share/doc/<pkg>/copyright as a symlink pointing anywhere on the
    # host, whose contents we would then publish as license text.
    try:
        path = (_DOC_ROOT / pkg / "copyright").resolve(strict=True)
        doc_root = _DOC_ROOT.resolve(strict=True)
    except OSError:
        return None

    if not path.is_relative_to(doc_root) or not path.is_file():
        return None

    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
