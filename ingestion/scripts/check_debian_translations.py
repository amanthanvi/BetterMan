"""Translated-manual census and bounded sample (#395); upload is hard-confined to local Convex.

Counts every translated path in the pinned Contents index, then acquires a
bounded package sample per language (man-pages-l10n first), parses it, and
projects pages and storage to the full language. With --local-upload it
publishes each sample to this worktree's loopback deployment (staging) and
measures the real per-table footprint, like check_debian_archives.
"""

import argparse
import json
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.debian_indexes import TRANSLATION_ROOTS
from ingestion.debian_translations import TranslationWorkspace, parse_translation
from ingestion.ingest_runner import _PageSpool


def sample_report(workspace: TranslationWorkspace, locale: str, *, workers: int) -> dict:
    sampled = {p.name for p in workspace.packages}
    root = TRANSLATION_ROOTS[locale]
    sample_paths = sum(1 for row in workspace.store.localized_manuals(root) if row[0] in sampled)
    started = time.monotonic()
    with (
        TemporaryDirectory(prefix=f"probe-{locale}-", dir=workspace.root) as temporary,
        _PageSpool(Path(temporary) / "pages.sqlite3") as spool,
    ):
        aliases, failures, documented = parse_translation(workspace, locale, spool, workers=workers)
        pages = list(spool)
        doc_bytes = sum(len(json.dumps(p.doc, separators=(",", ":")).encode()) for p in pages)
        with_options = sum(1 for p in pages if p.options)
        report = {
            "contentsPaths": workspace.contents_paths(locale),
            "samplePackages": sorted({p.source_package for p in pages if p.source_package}),
            "samplePaths": sample_paths,
            "pages": len(pages),
            "aliases": len(aliases),
            "droppedCopies": len(workspace.dropped),
            "unresolved": len(workspace.missing),
            "parseFailures": len(failures),
            "withDescription": sum(1 for p in pages if p.description),
            "withSynopsis": sum(1 for p in pages if p.synopsis),
            "withOptions": with_options,
            "optionRows": sum(len(p.options or []) for p in pages),
            "withDocumentedVersion": len(documented),
            "docJsonBytesPerPage": round(doc_bytes / max(1, len(pages))),
            "parseSeconds": round(time.monotonic() - started, 3),
            "failures": failures[:10],
            "missing": workspace.missing[:10],
            "documentedVersionExamples": sorted(set(documented.values()))[:8],
        }
    # Routes (pages + aliases) per translated path in the sample scale to the language.
    routes = report["pages"] + report["aliases"]
    ratio = report["pages"] / sample_paths if sample_paths else 0
    report["projectedPages"] = round(report["contentsPaths"] * ratio)
    report["projectedAliases"] = round(
        report["contentsPaths"] * (report["aliases"] / sample_paths if sample_paths else 0)
    )
    report["sampleRoutes"] = routes
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--locales", default=",".join(TRANSLATION_ROOTS))
    parser.add_argument("--packages", type=int, default=12, help="Packages per language")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument(
        "--local-upload",
        action="store_true",
        help="Publish each sample to this worktree's loopback deployment (staging)",
    )
    args = parser.parse_args()
    locales = [locale.strip() for locale in args.locales.split(",") if locale.strip()]
    if not 1 <= args.packages <= 400 or not 1 <= args.workers <= 8:
        parser.error("packages must be 1..400 and workers 1..8")
    admin = client = None
    if args.local_upload:
        import os

        from ingestion.convex_client import ConvexIngestClient
        from scripts.check_scale import LocalAdmin, local_config

        if os.environ.get("CONVEX_DEPLOY_KEY"):
            raise RuntimeError("Local translation probe refuses deploy keys")
        config = local_config()
        admin = LocalAdmin(config)
        client = ConvexIngestClient(
            f"http://127.0.0.1:{config['ports']['site']}", "bm2-scale-local"
        )
        client.require_deployed_contract()
    reports = {}
    for locale in locales:
        workspace = TranslationWorkspace(
            args.workdir.resolve() / TRANSLATION_ROOTS[locale],
            locales=[locale],
            limit=args.packages,
        )
        started = time.monotonic()
        workspace.acquire(workers=args.workers)
        report = {
            "allPackages": len(workspace.all_manual_packages),
            "allArchiveBytes": sum(p.size for p in workspace.all_manual_packages),
            "sampleArchiveBytes": sum(p.size for p in workspace.packages),
            "acquireSeconds": round(time.monotonic() - started, 3),
            **sample_report(workspace, locale, workers=args.workers),
        }
        if client is not None:
            from ingestion.debian_translations import publish_translation
            from scripts.check_scale import footprint

            result = publish_translation(
                workspace,
                locale,
                client,
                activate=True,
                dataset_stage="staging",
                git_sha="local-l10n-probe",
            )
            measured = footprint(admin, result.dataset_release_id)
            pages = max(1, report["pages"])
            scale = report["projectedPages"] / pages
            report["releaseId"] = result.dataset_release_id
            report["footprint"] = measured
            report["projection"] = {
                "scale": round(scale, 3),
                "documents": round(measured["documents"] * scale),
                "jsonBytes": round(measured["jsonBytes"] * scale),
                "storageBytes": round(measured["storageBytes"] * scale),
            }
        reports[locale] = report
        print(json.dumps({locale: report}, ensure_ascii=False), flush=True)
    output = args.workdir / "translations-report.json"
    output.write_text(json.dumps(reports, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
