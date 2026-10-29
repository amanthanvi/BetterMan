"""Publish an archive workspace through the bounded, versioned ingest client."""

from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.convex_client import ConvexIngestClient, encode_json
from ingestion.db import iso_utc_now
from ingestion.debian_pipeline import Workspace, parse_workspace, require_job_budget
from ingestion.ingest_runner import (
    IngestResult,
    _build_dataset_release_id,
    _build_license_packages,
    _build_sitemap_page_map,
    _ingest_worker_count,
    _iter_license_items,
    _LicenseSpool,
    _package_batch_digest,
    _page_batch_limits,
    _PageSpool,
    _require_command_pages,
    _resolved_page_payloads,
    _upload_pages,
    _upload_worker_count,
)
from ingestion.package_set import FULL_PACKAGE_SET_DEBIAN


def copyright_text(workspace: Workspace, package: str) -> str:
    paths = [
        row[0]
        for row in workspace.store.db.execute(
            "SELECT path FROM entries WHERE pkg=? "
            "AND (path LIKE 'usr/share/doc/%/copyright' "
            "OR path LIKE 'usr/share/doc/%/copyright.gz') ORDER BY path",
            (package,),
        )
    ]
    if not paths:
        paths = [f"usr/share/doc/{package}/copyright"]
    texts = []
    for path in paths:
        text = workspace.resolve(package, path).decode("utf-8", errors="replace")
        if text.strip() and text not in texts:
            texts.append(text)
    if not texts:
        raise RuntimeError(f"Missing nonblank archive copyright: {package}")
    return "\n\n".join(texts)


def ingest_debian(
    *,
    activate: bool,
    convex_url: str,
    ingest_secret: str,
    dataset_stage: str,
    git_sha: str,
    **_kwargs,
) -> IngestResult:
    import shutil
    import sys

    if sys.version_info < (3, 14) or not shutil.which("mandoc"):
        raise RuntimeError("Debian archive ingestion requires Python 3.14 and mandoc")
    client = ConvexIngestClient(convex_url, ingest_secret)
    client.require_deployed_contract()  # Before acquisition or any writes.
    import os

    from ingestion.debian_indexes import PINS
    from ingestion.util import sha256_hex

    base = Path(__file__).resolve().parents[2] / ".cache" / "debian"
    root = Path(os.environ.get("BETTERMAN_DEBIAN_WORKDIR", str(base / "workspaces")))
    # A different lock cannot reuse extracted state, even in the same runner path.
    root = root / sha256_hex(PINS.read_bytes())
    workspace = Workspace(root)
    workspace.acquire()
    return publish_workspace(
        workspace, client, activate=activate, dataset_stage=dataset_stage, git_sha=git_sha
    )


def publish_workspace(
    workspace: Workspace,
    client: ConvexIngestClient,
    *,
    activate: bool,
    dataset_stage: str,
    git_sha: str,
    sample: bool = False,
) -> IngestResult:
    import time

    workspace.timings = {}
    with (
        TemporaryDirectory(prefix="publish-", dir=workspace.root) as temporary,
        _PageSpool(Path(temporary) / "pages.sqlite3") as spool,
    ):
        providers, failures = parse_workspace(workspace, spool, workers=_ingest_worker_count())
        refs = list(spool.refs())
        canonical = [ref for ref in refs if ref.page_id not in providers]
        failed = len(failures) + len(workspace.missing)
        total = len(refs) + len(workspace.aliases) + failed
        if not canonical or failed / total > 0.02:
            raise RuntimeError(f"Archive parse gate failed: {failed}/{total} sources")
        if not sample:
            _require_command_pages(
                distro="debian",
                requested=FULL_PACKAGE_SET_DEBIAN,
                pages=canonical,
                aliases=workspace.aliases,
                sample=False,
            )
        release_id = _build_dataset_release_id(
            git_sha=git_sha, mandoc_version="host", distro="debian"
        )
        licenses = _LicenseSpool(spool.connection)
        used = {p.name for p in workspace.packages} | {
            p.source_package for p in refs if p.source_package
        }
        used |= {a["sourcePackage"] for a in workspace.alias_providers}
        published_packages = [workspace.available[name] for name in sorted(used)]
        for package in published_packages:
            require_job_budget("copyright collection")
            licenses[package.name] = copyright_text(workspace, package.name)
        manifest = {
            "acquisition": "deb-extraction",
            "imageRef": workspace.pins["mirror"],
            "imageDigest": workspace.pins["releaseSha256"],
            "arch": "amd64",
            "distro": "debian",
            "pins": workspace.pins,
            "popularitySource": "popcon by_inst installed",
            "alternatives": "postinst priority, popcon, package/path; curated awk/vi/nc policy",
            "alternativesSkipped": workspace.alternatives_skipped,
            "packages": [
                {
                    "name": p.name,
                    "version": p.version,
                    "sha256": p.sha256,
                    "installed": p.installed,
                }
                for p in published_packages
            ],
            "missingSources": workspace.missing,
            "parseFailures": failures,
        }
        declarations = _build_license_packages(
            package_manifest=manifest, packages_with_text=set(licenses)
        )
        batches = [declarations[i : i + 200] for i in range(0, len(declarations), 200)]
        # Check every notice before creating the release; never truncate.
        for _item in _iter_license_items(
            licenses=licenses, distro="debian", dataset_release_id=release_id
        ):
            pass
        require_job_budget("release creation")
        client.post(
            "/ingest/release",
            {
                "datasetReleaseId": release_id,
                "locale": "en",
                "distro": "debian",
                "imageRef": workspace.pins["mirror"],
                "imageDigest": workspace.pins["releaseSha256"],
                "ingestedAt": iso_utc_now(),
                "packageManifest": manifest,
                "pageCount": len(canonical),
                "providerCount": len(providers) + len(workspace.alias_providers),
                "aliasCount": len(workspace.aliases),
                "licenseCount": len(licenses),
                "sectionTotals": [
                    {"section": section, "total": count}
                    for section, count in sorted(Counter(p.section for p in canonical).items())
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
        sitemap = _build_sitemap_page_map(pages=canonical)
        sitemap.update({page_id: 1 for page_id in providers})

        def payloads():
            for payload in _resolved_page_payloads(spool, canonical, sitemap):
                require_job_budget("page upload")
                if payload["externalId"] in providers:
                    payload["providerOnly"] = True
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
        for index in range(0, len(workspace.alias_providers), 100):
            require_job_budget("alias upload")
            client.post(
                "/ingest/aliases",
                {
                    "datasetReleaseId": release_id,
                    "aliases": workspace.alias_providers[index : index + 100],
                },
            )
        license_started = time.monotonic()
        pending = []
        for notice in _iter_license_items(
            licenses=licenses, distro="debian", dataset_release_id=release_id
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
        workspace.timings["licenseUploadSeconds"] = time.monotonic() - license_started
        activation_started = time.monotonic()
        if activate:
            client.activate_release(
                {
                    "datasetReleaseId": release_id,
                    "stage": dataset_stage,
                    "activatedAt": iso_utc_now(),
                }
            )
        workspace.timings["activationSeconds"] = time.monotonic() - activation_started
        return IngestResult(release_id, total, len(spool), failed, activate)
