from __future__ import annotations

import gzip
import logging
import re
import uuid
from collections import Counter
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
from ingestion.arch import (
    build_manpath_to_package as build_manpath_to_package_pacman,
)
from ingestion.arch import (
    mandoc_pkg_version as mandoc_pkg_version_pacman,
)
from ingestion.arch import (
    pacman_arch,
    pacman_install,
    pacman_packages,
)
from ingestion.convex_client import ConvexIngestClient
from ingestion.db import iso_utc_now, json_dumps, uuid4
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
from ingestion.mandoc import render_html
from ingestion.mandoc_parser import parse_mandoc_html
from ingestion.package_set import FULL_PACKAGE_SET_BY_DISTRO
from ingestion.util import normalize_ws, sha256_hex

_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._+\\-]*$")
_MAN_HREF_RE = re.compile(
    r"^/man/(?P<name>[a-z0-9][a-z0-9._+\\-]*)(?:/(?P<section>[1-9][a-z0-9]*))?$"
)

logger = logging.getLogger("betterman.ingestion")


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

    parsed_pages: list[_PageRow] = []
    parse_failed = 0
    parse_started = monotonic()
    for src in sources:
        try:
            parsed_pages.append(
                _parse_source(
                    src,
                    packages=packages,
                    manpath_to_pkg=manpath_to_pkg,
                    arch=arch,
                )
            )
        except Exception as exc:  # noqa: BLE001 (batch ingestion)
            parse_failed += 1
            _log("page_parse_failed", path=str(src.path), error=str(exc))

        processed = len(parsed_pages) + parse_failed
        if processed and processed % 100 == 0:
            elapsed = monotonic() - parse_started
            rate = processed / elapsed if elapsed > 0 else 0.0
            remaining = max(0, len(sources) - processed)
            eta_s = int(remaining / rate) if rate > 0 else None
            _log(
                "parse_progress",
                processed=processed,
                total=len(sources),
                pct=round((processed / len(sources)) * 100.0, 2) if sources else 0.0,
                etaSeconds=eta_s,
            )

    total = len(sources)

    _resolve_doc_links_and_see_also(pages=parsed_pages)

    succeeded = len(parsed_pages)
    hard_failed = parse_failed
    hard_fail_rate = (hard_failed / total) if total else 0.0
    success_rate = (succeeded / total) if total else 0.0
    publish_allowed = success_rate >= 0.80 and hard_fail_rate <= 0.02

    client = ConvexIngestClient(http_url=convex_url, ingest_secret=ingest_secret)
    page_links = _build_page_links(pages=parsed_pages)
    sitemap_pages = _build_sitemap_page_map(pages=parsed_pages)
    licenses = _collect_licenses(pages=parsed_pages)
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
            "sectionTotals": [
                {"section": section, "total": total}
                for section, total in sorted(Counter(p.section for p in parsed_pages).items())
            ],
            "licensePackages": license_packages,
        },
    )

    insert_started = monotonic()
    batch_size = 20
    for start in range(0, len(parsed_pages), batch_size):
        batch = parsed_pages[start : start + batch_size]
        client.post(
            "/ingest/pages/storage",
            {
                "datasetReleaseId": dataset_release_id,
                "pages": [
                    _page_payload(
                        row,
                        sitemap_page=sitemap_pages[str(row.page_id)],
                        links=page_links.get(str(row.page_id), []),
                    )
                    for row in batch
                ],
            },
        )

        processed = min(start + len(batch), len(parsed_pages))
        if processed % 100 == 0 or processed == len(parsed_pages):
            elapsed = monotonic() - insert_started
            rate = processed / elapsed if elapsed > 0 else 0.0
            remaining = max(0, len(parsed_pages) - processed)
            eta_s = int(remaining / rate) if rate > 0 else None
            _log(
                "insert_progress",
                processed=processed,
                total=len(parsed_pages),
                pct=round((processed / len(parsed_pages)) * 100.0, 2) if parsed_pages else 0.0,
                etaSeconds=eta_s,
            )

    if licenses:
        license_items = [
            {
                "packageName": package_name,
                "licenseId": f"pkg:{package_name}",
                "licenseName": package_name,
                "licenseText": text,
                "sourceUrl": None,
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

    published = False
    if publish_allowed and activate:
        client.post(
            "/ingest/activate",
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
    page_id: uuid.UUID
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
            raw = _read_bytes(src.path)
        except Exception:  # noqa: BLE001
            continue
        if not is_permissive_manpage(raw):
            continue
        out.append(src)
    return out


def _parse_source(
    src: ManSource,
    *,
    packages: dict[str, str],
    manpath_to_pkg: dict[str, str],
    arch: str,
) -> _PageRow:
    raw_bytes = _read_bytes(src.path)
    html_result = render_html(src.path)
    parsed = parse_mandoc_html(html_result.html)

    page_id = uuid4()
    source_path = str(src.path)
    source_package = manpath_to_pkg.get(source_path) or manpath_to_pkg.get(str(src.path.resolve()))
    source_package_version = None
    if source_package:
        source_package_version = packages.get(source_package) or packages.get(
            f"{source_package}:{arch}"
        )

    title = f"{src.name}({src.section})"

    return _PageRow(
        page_id=page_id,
        name=src.name,
        section=src.section,
        title=title,
        description=parsed.description,
        source_path=source_path,
        source_package=source_package,
        source_package_version=source_package_version,
        content_sha256=sha256_hex(raw_bytes),
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


def _read_bytes(path: Path) -> bytes:
    if path.name.endswith(".gz"):
        with gzip.open(path, "rb") as f:
            return f.read()
    return path.read_bytes()


def _build_dataset_release_id(*, git_sha: str, mandoc_version: str | None, distro: str) -> str:
    ts = datetime.now(tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    mandoc_part = f"mandoc:{mandoc_version}" if mandoc_version else "mandoc:unknown"
    sha = git_sha or "unknown"
    return f"{ts}+{distro}+{sha}+{mandoc_part}"


def _content_packages(*, sample: bool, distro: str) -> list[str]:
    if distro in {"freebsd", "macos"}:
        base: list[str] = []
    elif distro in {"arch", "alpine"}:
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
    index: dict[tuple[str, str], str] = {(p.name, p.section): str(p.page_id) for p in pages}
    by_name: dict[str, list[str]] = {}
    for p in pages:
        by_name.setdefault(p.name, []).append(p.section)

    for page in pages:
        from_id = str(page.page_id)

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
    by_id: dict[str, _PageRow] = {str(p.page_id): p for p in pages}
    by_name: dict[str, list[str]] = {}
    for p in pages:
        by_name.setdefault(p.name, []).append(p.section)

    out: dict[str, list[dict[str, str | None]]] = {}
    seen: set[tuple[str, str, str]] = set()
    for page in pages:
        from_id = str(page.page_id)
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
                    to_id = str(target.page_id) if target else None
                else:
                    # ambiguous, but still linkable via /man/{name}
                    continue
            else:
                target = index.get((name, section))
                to_id = str(target.page_id) if target else None

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


def _collect_licenses(*, pages: list[_PageRow]) -> dict[str, str]:
    packages = {p.source_package for p in pages if p.source_package}
    if not packages:
        return {}

    licenses: dict[str, str] = {}
    for pkg in sorted(packages):
        text = _read_debian_copyright(pkg)
        if text is None:
            continue
        licenses[pkg] = text

    return licenses


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
        out[str(page.page_id)] = ((index - 1) // 10_000) + 1
    return out


def _page_payload(
    row: _PageRow,
    *,
    sitemap_page: int,
    links: list[dict[str, str | None]],
) -> dict[str, object]:
    search_text = normalize_ws(f"{row.name} {row.description} {row.headings_text} {row.plain_text}")
    snippet_text = normalize_ws(f"{row.description} {row.plain_text}")
    return {
        "externalId": str(row.page_id),
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
        "searchText": search_text,
        "snippetText": snippet_text,
        "links": links,
    }


def _read_debian_copyright(pkg: str) -> str | None:
    path = Path(f"/usr/share/doc/{pkg}/copyright")
    if not path.exists():
        return None
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
