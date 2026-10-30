"""Publish an archive workspace through the bounded, versioned ingest client."""

from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.convex_client import ConvexIngestClient, encode_json
from ingestion.db import iso_utc_now
from ingestion.debian_licenses import copyright_text
from ingestion.debian_pipeline import Workspace, parse_workspace, require_job_budget
from ingestion.ingest_runner import (
    IngestResult,
    _build_dataset_release_id,
    _build_license_packages,
    _build_sitemap_page_map,
    _ingest_worker_count,
    _iter_license_items,
    _LicenseSpool,
    _log,
    _package_batch_digest,
    _page_batch_limits,
    _PageSpool,
    _require_command_pages,
    _resolved_page_payloads,
    _upload_pages,
    _upload_worker_count,
)
from ingestion.package_set import FULL_PACKAGE_SET_BY_DISTRO
from ingestion.popularity import PopularityPolicy


def ingest_debian(
    *,
    activate: bool,
    convex_url: str,
    ingest_secret: str,
    dataset_stage: str,
    git_sha: str,
    distro: str = "debian",
    **_kwargs,
) -> IngestResult:
    import shutil
    import sys

    if sys.version_info < (3, 14) or not shutil.which("mandoc"):
        raise RuntimeError("Full archive ingestion requires Python 3.14 and mandoc")
    client = ConvexIngestClient(convex_url, ingest_secret)
    contract = client.require_deployed_contract()  # Before acquisition or any writes.
    identities = {
        "ubuntu": "ubuntu-deb-extraction",
        "fedora": "fedora-rpm-extraction",
        "arch": "arch-pkg-extraction",
        "alpine": "alpine-apk-extraction",
    }
    if distro in identities and identities[distro] not in contract.get("acquisitions", []):
        raise RuntimeError(f"Deploy B2's v8 {distro} acquisition support before full ingestion")
    if distro in {"fedora", "arch", "alpine"} and contract.get("storedLicenseText") is not True:
        raise RuntimeError(f"Deploy stored-license support before full {distro} ingestion")
    import os

    from ingestion.debian_indexes import PINS
    from ingestion.util import sha256_hex

    if dataset_stage != "staging":
        raise ValueError("Full imports require staging and gated promotion")
    base = Path(__file__).resolve().parents[2] / ".cache" / distro
    root = Path(os.environ.get(f"BETTERMAN_{distro.upper()}_WORKDIR", str(base / "workspaces")))
    pins = (
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
    # A different lock cannot reuse extracted state, even in the same runner path.
    root = root / sha256_hex(pins.read_bytes())
    workspace = Workspace(root, distro=distro)
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

    distro = workspace.distro
    notice_text = copyright_text
    if distro == "fedora":
        from ingestion.fedora_archives import copyright_text as notice_text
    elif distro == "arch":
        from ingestion.arch_archives import copyright_text as notice_text
    elif distro == "alpine":
        from ingestion.alpine_archives import copyright_text as notice_text
    workspace.timings = {}
    started = time.monotonic()
    with (
        TemporaryDirectory(prefix="publish-", dir=workspace.root) as temporary,
        _PageSpool(Path(temporary) / "pages.sqlite3") as spool,
    ):
        providers, failures = parse_workspace(workspace, spool, workers=_ingest_worker_count())
        workspace.timings["parseSeconds"] = time.monotonic() - started
        _log("deb_parse_complete", seconds=workspace.timings["parseSeconds"], pages=len(spool))
        refs = list(spool.refs())
        canonical = [ref for ref in refs if ref.page_id not in providers]
        failed = len(failures) + len(workspace.missing)
        total = len(refs) + len(workspace.aliases) + failed
        if not canonical or failed / total > 0.02:
            raise RuntimeError(f"Archive parse gate failed: {failed}/{total} sources")
        if not sample:
            workspace.require_command_owners()
            _require_command_pages(
                distro=distro,
                requested=FULL_PACKAGE_SET_BY_DISTRO[distro],
                pages=canonical,
                aliases=workspace.aliases,
                sample=False,
            )
        release_id = _build_dataset_release_id(
            git_sha=git_sha, mandoc_version="host", distro=distro
        )
        licenses = _LicenseSpool(spool.connection)
        used = {p.name for p in workspace.packages} | {
            p.source_package for p in refs if p.source_package
        }
        used |= {a["sourcePackage"] for a in workspace.alias_providers}
        published_packages = [workspace.available[name] for name in sorted(used)]
        for package in published_packages:
            if not package.sha256:
                raise RuntimeError("Missing verified archive SHA256 before publication")
            require_job_budget("copyright collection")
            text = notice_text(workspace, package.name)
            if text.strip():
                licenses[package.name] = text
        if distro == "alpine":
            from ingestion.alpine_archives import write_sha256_pins

            write_sha256_pins(workspace)
        policy = PopularityPolicy.load()
        sitemap = _build_sitemap_page_map(pages=canonical, policy=policy)
        manifest = {
            "indexPolicy": policy.provenance(),
            "acquisition": workspace.pins["acquisition"],
            "imageRef": workspace.pins["mirror"],
            "imageDigest": workspace.pins["releaseSha256"],
            "arch": workspace.pins.get("architecture", "amd64"),
            "distro": distro,
            "pins": workspace.pins,
            "popularitySource": workspace.pins.get("popularitySource", "popcon by_inst installed"),
            "alternatives": workspace.pins.get(
                "alternatives", "postinst priority, popcon, package/path; curated awk/vi/nc policy"
            ),
            "alternativesSkipped": workspace.alternatives_skipped,
            "packages": [
                {
                    "name": p.name,
                    "version": p.version,
                    "sha256": p.sha256,
                    "installed": p.installed,
                    **(
                        {
                            "licenseExpression": p.license,
                            (
                                "sourceRpm"
                                if distro == "fedora"
                                else "origin"
                                if distro == "alpine"
                                else "packageBase"
                            ): p.source,
                        }
                        if distro in {"fedora", "arch", "alpine"}
                        else {}
                    ),
                    **(
                        {
                            "filename": p.filename,
                            "controlChecksum": p.control_checksum,
                            "dataSha256": p.data_sha256,
                        }
                        if distro == "alpine"
                        else {}
                    ),
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
            licenses=licenses,
            distro=distro,
            dataset_release_id=release_id,
            stored=distro in {"fedora", "arch", "alpine"},
        ):
            pass
        workspace.timings["metadataSeconds"] = (
            time.monotonic() - started - workspace.timings["parseSeconds"]
        )
        _log(
            "deb_metadata_complete",
            seconds=workspace.timings["metadataSeconds"],
            licenses=len(licenses),
        )
        require_job_budget("release creation")
        declaration_started = time.monotonic()
        client.post(
            "/ingest/release",
            {
                "datasetReleaseId": release_id,
                "locale": "en",
                "distro": distro,
                "imageRef": workspace.pins["mirror"],
                "imageDigest": workspace.pins["releaseSha256"],
                "ingestedAt": iso_utc_now(),
                "packageManifest": manifest,
                "pageCount": len(canonical),
                "indexablePageCount": sum(value > 0 for value in sitemap.values()),
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
        sitemap.update({page_id: 0 for page_id in providers})
        workspace.timings["declarationSeconds"] = time.monotonic() - declaration_started
        _log("deb_declarations_complete", seconds=workspace.timings["declarationSeconds"])

        def payloads():
            for payload in _resolved_page_payloads(spool, canonical, sitemap, policy=policy):
                require_job_budget("page upload")
                if payload["externalId"] in providers:
                    payload["providerOnly"] = True
                    payload["indexable"] = False
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
        _log("deb_pages_uploaded", seconds=workspace.timings["pageUploadSeconds"])
        alias_started = time.monotonic()
        for index in range(0, len(workspace.alias_providers), 100):
            require_job_budget("alias upload")
            client.post(
                "/ingest/aliases",
                {
                    "datasetReleaseId": release_id,
                    "aliases": workspace.alias_providers[index : index + 100],
                },
            )
        workspace.timings["aliasUploadSeconds"] = time.monotonic() - alias_started
        _log("deb_aliases_uploaded", seconds=workspace.timings["aliasUploadSeconds"])
        license_started = time.monotonic()
        pending = []
        for notice in _iter_license_items(
            licenses=licenses,
            distro=distro,
            dataset_release_id=release_id,
            stored=distro in {"fedora", "arch", "alpine"},
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
        _log("deb_licenses_uploaded", seconds=workspace.timings["licenseUploadSeconds"])
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
        _log("deb_publish_complete", **workspace.timings)
        return IngestResult(release_id, total, len(spool), failed, activate)
