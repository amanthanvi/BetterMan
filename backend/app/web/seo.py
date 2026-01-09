from __future__ import annotations

from datetime import UTC
from urllib.parse import quote
from xml.etree import ElementTree as ET

from fastapi import APIRouter, Request
from fastapi.params import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import PlainTextResponse, Response

from app.core.config import Settings
from app.db.models import DatasetRelease, ManPage
from app.db.session import get_session
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()

_SUPPORTED_DISTROS = ("debian", "ubuntu", "fedora")


def _public_base_url(request: Request) -> str:
    settings: Settings | None = getattr(request.app.state, "settings", None)
    base_url = settings.public_base_url if settings and settings.public_base_url else str(request.base_url)
    return base_url.rstrip("/")


async def _get_active_release(session: AsyncSession, *, distro: str) -> DatasetRelease | None:
    q = (
        select(DatasetRelease)
        .where(DatasetRelease.is_active)
        .order_by(DatasetRelease.ingested_at.desc())
        .limit(1)
    )
    if hasattr(DatasetRelease, "distro"):
        q = q.where(getattr(DatasetRelease, "distro") == distro)
    return await session.scalar(q)


def _xml_bytes(root: ET.Element) -> bytes:
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _iso_z(dt) -> str:
    try:
        return dt.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except Exception:  # noqa: BLE001
        return ""


@router.get("/robots.txt", include_in_schema=False)
async def robots_txt(request: Request) -> Response:
    base = _public_base_url(request)
    body = "\n".join(
        [
            "User-agent: *",
            "Allow: /",
            "Disallow: /api/",
            f"Sitemap: {base}/sitemap.xml",
            "",
        ]
    )

    cache_control = "public, max-age=3600"
    etag = compute_weak_etag("robots", body)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    res = PlainTextResponse(body, media_type="text/plain; charset=utf-8")
    set_cache_headers(res, etag=etag, cache_control=cache_control)
    return res


@router.get("/sitemap.xml", include_in_schema=False)
async def sitemap_index(
    request: Request,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> Response:
    base = _public_base_url(request)

    distros: list[str]
    releases: dict[str, DatasetRelease] = {}

    if hasattr(DatasetRelease, "distro"):
        distros = list(_SUPPORTED_DISTROS)
        for distro in distros:
            release = await _get_active_release(session, distro=distro)
            if release is not None:
                releases[distro] = release
    else:
        distros = ["debian"]
        release = await _get_active_release(session, distro="debian")
        if release is not None:
            releases["debian"] = release

    cache_control = "public, max-age=3600"
    etag = compute_weak_etag("sitemap-index", *sorted([r.dataset_release_id for r in releases.values()]))
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    root = ET.Element("sitemapindex", attrib={"xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9"})

    for distro in distros:
        release = releases.get(distro)
        if release is None:
            continue
        node = ET.SubElement(root, "sitemap")
        ET.SubElement(node, "loc").text = f"{base}/sitemap-{distro}.xml"
        lastmod = _iso_z(release.ingested_at)
        if lastmod:
            ET.SubElement(node, "lastmod").text = lastmod

    res = Response(content=_xml_bytes(root), media_type="application/xml")
    set_cache_headers(res, etag=etag, cache_control=cache_control)
    return res


@router.get("/sitemap-{distro}.xml", include_in_schema=False)
async def sitemap_distro(
    request: Request,
    distro: str,
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> Response:
    if distro not in _SUPPORTED_DISTROS:
        return Response(status_code=404)
    if not hasattr(DatasetRelease, "distro") and distro != "debian":
        return Response(status_code=404)

    release = await _get_active_release(session, distro=distro)
    if release is None:
        return Response(status_code=404)

    cache_control = "public, max-age=3600"
    etag = compute_weak_etag("sitemap", distro, release.dataset_release_id)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    base = _public_base_url(request)
    root = ET.Element("urlset", attrib={"xmlns": "http://www.sitemaps.org/schemas/sitemap/0.9"})

    rows = await session.execute(
        select(ManPage.name, ManPage.section)
        .where(ManPage.dataset_release_id == release.id)
        .order_by(ManPage.name.asc(), ManPage.section.asc())
    )

    for name, section in rows.all():
        if not isinstance(name, str) or not name:
            continue
        if not isinstance(section, str) or not section:
            continue
        node = ET.SubElement(root, "url")
        ET.SubElement(node, "loc").text = f"{base}/man/{quote(name, safe='')}/{quote(section, safe='')}"

    res = Response(content=_xml_bytes(root), media_type="application/xml")
    set_cache_headers(res, etag=etag, cache_control=cache_control)
    return res

