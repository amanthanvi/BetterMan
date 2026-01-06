from __future__ import annotations

import re

from fastapi import APIRouter, Request, Response
from fastapi.params import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import APIError
from app.datasets.active import require_active_release
from app.db.models import License, ManPage, ManPageLicenseMap
from app.db.session import get_session
from app.security.deps import rate_limit_page
from app.web.http_cache import compute_weak_etag, maybe_not_modified, set_cache_headers

router = APIRouter()

_PKG_RE = re.compile(r"^[a-z0-9][a-z0-9+.-]*$")


@router.get("/licenses")
async def list_licenses(
    request: Request,
    response: Response,
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    release = await require_active_release(session)

    cache_control = "public, max-age=300"
    etag = compute_weak_etag("licenses", release.dataset_release_id)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    license_ids = (
        await session.execute(
            select(License.license_id)
            .distinct()
            .join(ManPageLicenseMap, ManPageLicenseMap.license_id == License.id)
            .join(ManPage, ManPageLicenseMap.man_page_id == ManPage.id)
            .where(ManPage.dataset_release_id == release.id)
        )
    ).scalars()

    pkgs_with_text = {
        lid.removeprefix("pkg:")
        for lid in license_ids
        if isinstance(lid, str) and lid.startswith("pkg:")
    }

    manifest = release.package_manifest if isinstance(release.package_manifest, dict) else None
    manifest_packages = []
    if manifest and isinstance(manifest.get("packages"), list):
        for pkg in manifest["packages"]:
            if not isinstance(pkg, dict):
                continue
            name = pkg.get("name")
            version = pkg.get("version")
            if not isinstance(name, str) or not isinstance(version, str):
                continue
            manifest_packages.append(
                {
                    "name": name,
                    "version": version,
                    "hasLicenseText": name in pkgs_with_text,
                }
            )

    manifest_packages.sort(key=lambda p: p["name"])

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return {
        "datasetReleaseId": release.dataset_release_id,
        "ingestedAt": release.ingested_at.isoformat(),
        "imageRef": release.image_ref,
        "imageDigest": release.image_digest,
        "packageManifest": manifest,
        "packages": manifest_packages,
    }


@router.get("/licenses/{package}")
async def get_license(
    request: Request,
    response: Response,
    package: str,
    _: None = Depends(rate_limit_page),  # noqa: B008
    session: AsyncSession = Depends(get_session),  # noqa: B008
) -> dict[str, object]:
    pkg = package.strip().lower()
    if not _PKG_RE.fullmatch(pkg):
        raise APIError(status_code=400, code="INVALID_PACKAGE", message="Invalid package name")

    release = await require_active_release(session)

    cache_control = "public, max-age=300"
    etag = compute_weak_etag("license", release.dataset_release_id, pkg)
    not_modified = maybe_not_modified(request, etag=etag, cache_control=cache_control)
    if not_modified is not None:
        return not_modified

    row = (
        await session.execute(
            select(License.license_id, License.license_name, License.license_text)
            .join(ManPageLicenseMap, ManPageLicenseMap.license_id == License.id)
            .join(ManPage, ManPageLicenseMap.man_page_id == ManPage.id)
            .where(ManPage.dataset_release_id == release.id)
            .where(License.license_id == f"pkg:{pkg}")
            .limit(1)
        )
    ).first()

    if row is None:
        raise APIError(status_code=404, code="LICENSE_NOT_FOUND", message="License not found")

    set_cache_headers(response, etag=etag, cache_control=cache_control)
    return {
        "package": pkg,
        "licenseId": row.license_id,
        "licenseName": row.license_name,
        "text": row.license_text or "",
    }
