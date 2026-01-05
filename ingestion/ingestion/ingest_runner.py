from __future__ import annotations

import gzip
import re
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from ingestion.db import connect, json_dumps, uuid4
from ingestion.debian import (
    apt_install,
    build_manpath_to_package,
    dpkg_arch,
    dpkg_packages,
    mandoc_pkg_version,
)
from ingestion.doc_model import OptionItem, SeeAlsoRef
from ingestion.man_scan import ManSource, scan_man_sources
from ingestion.mandoc import render_html
from ingestion.mandoc_parser import parse_mandoc_html
from ingestion.util import normalize_ws, sha256_hex

_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._+\\-]*$")


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
) -> IngestResult:
    requested = _content_packages(sample=sample)
    apt_install(requested)

    man_root = Path("/usr/share/man")
    sources = _filter_sources(scan_man_sources(man_root, sample=sample))

    packages = dpkg_packages()
    arch = dpkg_arch()
    mandoc_version = mandoc_pkg_version(packages)

    dataset_release_id = _build_dataset_release_id(git_sha=git_sha, mandoc_version=mandoc_version)
    package_manifest = {
        "imageRef": image_ref,
        "imageDigest": image_digest,
        "locale": "C.UTF-8",
        "arch": arch,
        "requestedPackages": requested,
        "packages": [
            {"name": name, "version": version} for name, version in sorted(packages.items())
        ],
        "mandocPackageVersion": mandoc_version,
        "generatedAt": datetime.now(tz=UTC).isoformat(),
    }

    manpath_to_pkg = build_manpath_to_package()

    parsed_pages: list[_PageRow] = []
    hard_failed = 0
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
            hard_failed += 1
            print(f"[hard-fail] {src.path}: {exc}", file=sys.stderr)

    total = len(sources)
    succeeded = len(parsed_pages)
    hard_fail_rate = (hard_failed / total) if total else 0.0
    success_rate = (succeeded / total) if total else 0.0

    publish_allowed = success_rate >= 0.80 and hard_fail_rate <= 0.02

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
                    image_ref,
                    image_digest,
                    package_manifest,
                    is_active
                )
            VALUES
                (%s::uuid, %s, %s, %s, %s, %s::jsonb, %s)
            """,
            (
                str(release_uuid),
                dataset_release_id,
                locale,
                image_ref,
                image_digest,
                json_dumps(package_manifest),
                False,
            ),
        )

        for row in parsed_pages:
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

        _insert_links(cur, pages=parsed_pages)
        _insert_licenses(cur, pages=parsed_pages)

        published = False
        if publish_allowed and activate:
            cur.execute(
                """
                UPDATE dataset_releases
                SET is_active = FALSE
                WHERE locale = %s AND is_active = TRUE
                """,
                (locale,),
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
    for src in sources:
        name_norm = src.name.strip().lower()
        if not _NAME_RE.fullmatch(name_norm):
            continue
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


def _build_dataset_release_id(*, git_sha: str, mandoc_version: str | None) -> str:
    ts = datetime.now(tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    mandoc_part = f"mandoc:{mandoc_version}" if mandoc_version else "mandoc:unknown"
    sha = git_sha or "unknown"
    return f"{ts}+{sha}+{mandoc_part}"


def _content_packages(*, sample: bool) -> list[str]:
    base = ["mandoc", "man-db"]
    if sample:
        return [
            *base,
            "bash",
            "coreutils",
            "curl",
            "openssh-client",
            "tar",
        ]

    return [
        *base,
        "manpages",
        "bash",
        "coreutils",
        "util-linux",
        "findutils",
        "grep",
        "sed",
        "gawk",
        "curl",
        "wget",
        "openssh-client",
        "rsync",
        "netcat-openbsd",
        "systemd",
        "vim",
        "less",
        "git",
        "make",
        "gcc",
        "gdb",
        "nginx",
        "apache2",
        "postgresql-client",
        "default-mysql-client",
    ]


def _insert_links(cur: object, *, pages: list[_PageRow]) -> None:
    index: dict[tuple[str, str], str] = {(p.name, p.section): str(p.page_id) for p in pages}
    by_name: dict[str, list[str]] = {}
    for p in pages:
        by_name.setdefault(p.name, []).append(p.section)

    seen: set[tuple[str, str]] = set()
    for page in pages:
        from_id = str(page.page_id)
        for name, section in page.see_also_refs:
            if not name:
                continue
            section_resolved = section
            if section_resolved is None:
                candidates = by_name.get(name, [])
                if len(candidates) == 1:
                    section_resolved = candidates[0]
            if section_resolved is None:
                continue

            to_id = index.get((name, section_resolved))
            if to_id is None or to_id == from_id:
                continue

            key = (from_id, to_id)
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
