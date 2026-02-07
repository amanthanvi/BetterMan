from __future__ import annotations

import gzip
import logging
import re
import uuid
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
from ingestion.db import connect, iso_utc_now, json_dumps, uuid4
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
    database_url: str,
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
    else:
        raise RuntimeError(f"unsupported distro: {distro}")

    man_root = Path("/usr/share/man")
    sources = _filter_sources(scan_man_sources(man_root, sample=sample))

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
    else:
        packages = apk_packages()
        arch = apk_arch()
        mandoc_version = mandoc_pkg_version_apk(packages)
        manpath_to_pkg = build_manpath_to_package_apk()

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

    conn = connect(database_url)
    try:
        cur = conn.cursor()
        release_uuid = uuid4()

        cur.execute(
            """
            INSERT INTO dataset_releases
                (
                    id,
                    dataset_release_id,
                    locale,
                    distro,
                    image_ref,
                    image_digest,
                    package_manifest,
                    is_active
                )
            VALUES
                (%s::uuid, %s, %s, %s, %s, %s, %s::jsonb, %s)
            """,
            (
                str(release_uuid),
                dataset_release_id,
                locale,
                distro,
                image_ref,
                image_digest,
                json_dumps(package_manifest),
                False,
            ),
        )

        _resolve_doc_links_and_see_also(pages=parsed_pages)

        inserted_pages: list[_PageRow] = []
        insert_failed = 0
        insert_started = monotonic()

        for i, row in enumerate(parsed_pages, start=1):
            sp = f"page_{i}"
            cur.execute(f"SAVEPOINT {sp}")

            try:
                cur.execute(
                    """
                    INSERT INTO man_pages
                        (
                            id, dataset_release_id, name, section, title, description,
                            source_path, source_package, source_package_version,
                            content_sha256, has_parse_warnings
                        )
                    VALUES
                        (
                            %s::uuid, %s::uuid, %s, %s, %s, %s,
                            %s, %s, %s,
                            %s, %s
                        )
                    """,
                    (
                        str(row.page_id),
                        str(release_uuid),
                        row.name,
                        row.section,
                        row.title,
                        row.description,
                        row.source_path,
                        row.source_package,
                        row.source_package_version,
                        row.content_sha256,
                        row.has_parse_warnings,
                    ),
                )

                cur.execute(
                    """
                    INSERT INTO man_page_content
                        (man_page_id, doc, plain_text, synopsis, options, see_also)
                    VALUES
                        (%s::uuid, %s::jsonb, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                    """,
                    (
                        str(row.page_id),
                        json_dumps(row.doc),
                        row.plain_text,
                        json_dumps(row.synopsis) if row.synopsis is not None else None,
                        json_dumps(row.options) if row.options is not None else None,
                        json_dumps(row.see_also) if row.see_also is not None else None,
                    ),
                )

                doc_text = normalize_ws(f"{row.headings_text} {row.plain_text}")
                cur.execute(
                    """
                    INSERT INTO man_page_search (man_page_id, tsv, name_norm, desc_norm)
                    VALUES
                        (
                            %s::uuid,
                            (
                                setweight(to_tsvector('simple', %s), 'A') ||
                                setweight(to_tsvector('simple', %s), 'B') ||
                                setweight(to_tsvector('simple', %s), 'C')
                            ),
                            %s,
                            %s
                        )
                    """,
                    (
                        str(row.page_id),
                        row.name,
                        row.description,
                        doc_text,
                        row.name.lower(),
                        row.description.lower(),
                    ),
                )
            except Exception as exc:  # noqa: BLE001 (batch ingestion)
                insert_failed += 1
                cur.execute(f"ROLLBACK TO SAVEPOINT {sp}")
                cur.execute(f"RELEASE SAVEPOINT {sp}")
                _log(
                    "page_insert_failed",
                    name=row.name,
                    section=row.section,
                    path=row.source_path,
                    error=str(exc),
                )
                continue

            cur.execute(f"RELEASE SAVEPOINT {sp}")
            inserted_pages.append(row)

            if i % 100 == 0:
                elapsed = monotonic() - insert_started
                rate = i / elapsed if elapsed > 0 else 0.0
                remaining = max(0, len(parsed_pages) - i)
                eta_s = int(remaining / rate) if rate > 0 else None
                _log(
                    "insert_progress",
                    processed=i,
                    total=len(parsed_pages),
                    pct=round((i / len(parsed_pages)) * 100.0, 2) if parsed_pages else 0.0,
                    etaSeconds=eta_s,
                )

        if insert_failed:
            _resolve_doc_links_and_see_also(pages=inserted_pages)
            for row in inserted_pages:
                cur.execute(
                    """
                    UPDATE man_page_content
                    SET doc = %s::jsonb, see_also = %s::jsonb
                    WHERE man_page_id = %s::uuid
                    """,
                    (
                        json_dumps(row.doc),
                        json_dumps(row.see_also) if row.see_also is not None else None,
                        str(row.page_id),
                    ),
                )

        _insert_links(cur, pages=inserted_pages)
        _insert_licenses(cur, pages=inserted_pages)

        succeeded = len(inserted_pages)
        hard_failed = parse_failed + insert_failed
        hard_fail_rate = (hard_failed / total) if total else 0.0
        success_rate = (succeeded / total) if total else 0.0
        publish_allowed = success_rate >= 0.80 and hard_fail_rate <= 0.02

        published = False
        if publish_allowed and activate:
            cur.execute(
                """
                UPDATE dataset_releases
                SET is_active = FALSE
                WHERE locale = %s AND distro = %s AND is_active = TRUE
                """,
                (locale, distro),
            )
            cur.execute(
                "UPDATE dataset_releases SET is_active = TRUE WHERE id = %s::uuid",
                (str(release_uuid),),
            )
            published = True

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

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
    base = ["mandoc", "man-db"]
    if sample:
        if distro == "fedora":
            return [
                *base,
                "bash",
                "coreutils",
                "curl",
                "openssh-clients",
                "tar",
            ]
        return [
            *base,
            "bash",
            "coreutils",
            "curl",
            "openssh-client",
            "tar",
        ]

    out: list[str] = []
    seen: set[str] = set()
    pkg_set = FULL_PACKAGE_SET_BY_DISTRO.get(distro) or FULL_PACKAGE_SET_BY_DISTRO["debian"]
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


def _insert_links(cur: object, *, pages: list[_PageRow]) -> None:
    index: dict[tuple[str, str], str] = {(p.name, p.section): str(p.page_id) for p in pages}
    by_name: dict[str, list[str]] = {}
    for p in pages:
        by_name.setdefault(p.name, []).append(p.section)
    inserted_ids = set(index.values())

    seen: set[tuple[str, str, str]] = set()
    for page in pages:
        from_id = str(page.page_id)
        if page.see_also:
            for ref in page.see_also:
                to_id = ref.get("resolvedPageId")
                if not isinstance(to_id, str) or not to_id:
                    continue
                if to_id not in inserted_ids:
                    continue
                if to_id == from_id:
                    continue

                key = (from_id, to_id, "see_also")
                if key in seen:
                    continue
                seen.add(key)
                cur.execute(
                    """
                    INSERT INTO man_page_links (from_page_id, to_page_id, link_type)
                    VALUES (%s::uuid, %s::uuid, %s)
                    """,
                    (from_id, to_id, "see_also"),
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
                    to_id = index.get((name, candidates[0]))
                else:
                    # ambiguous, but still linkable via /man/{name}
                    continue
            else:
                to_id = index.get((name, section))

            if to_id is None or to_id == from_id:
                continue

            key = (from_id, to_id, "xref")
            if key in seen:
                continue
            seen.add(key)
            cur.execute(
                """
                INSERT INTO man_page_links (from_page_id, to_page_id, link_type)
                VALUES (%s::uuid, %s::uuid, %s)
                """,
                (from_id, to_id, "xref"),
            )


def _insert_licenses(cur: object, *, pages: list[_PageRow]) -> None:
    packages = {p.source_package for p in pages if p.source_package}
    if not packages:
        return

    license_ids: dict[str, str] = {}
    for pkg in sorted(packages):
        license_uuid = str(uuid4())
        text = _read_debian_copyright(pkg)
        if text is None:
            continue
        cur.execute(
            """
            INSERT INTO licenses (id, license_id, license_name, license_text, source_url)
            VALUES (%s::uuid, %s, %s, %s, %s)
            """,
            (
                license_uuid,
                f"pkg:{pkg}",
                pkg,
                text,
                None,
            ),
        )
        license_ids[pkg] = license_uuid

    for page in pages:
        if not page.source_package:
            continue
        license_uuid = license_ids.get(page.source_package)
        if license_uuid is None:
            continue
        attribution = None
        if page.source_package_version:
            attribution = f"{page.source_package} {page.source_package_version}"
        cur.execute(
            """
            INSERT INTO man_page_license_map (man_page_id, license_id, attribution_text)
            VALUES (%s::uuid, %s::uuid, %s)
            """,
            (str(page.page_id), license_uuid, attribution),
        )


def _read_debian_copyright(pkg: str) -> str | None:
    path = Path(f"/usr/share/doc/{pkg}/copyright")
    if not path.exists():
        return None
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
