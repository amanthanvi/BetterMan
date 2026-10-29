"""Synthetic scale experiment, hard-confined to this worktree's local backend.

Run pnpm convex:check and configure its local CONVEX_INGEST_SECRET as
bm2-scale-local first. This never accepts a remote deployment or deploy key.
The report measures logical JSON/file bytes, not billable index storage.
"""

from __future__ import annotations

import argparse
import json
import logging
import resource
import time
import tracemalloc
import uuid
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen

from ingestion.convex_client import ConvexIngestClient, encode_json
from ingestion.ingest_runner import (
    _build_sitemap_page_map,
    _iter_license_items,
    _LicenseSpool,
    _package_batch_digest,
    _PageRow,
    _PageSpool,
    _resolved_page_payloads,
    _upload_pages,
)
from ingestion.util import sha256_hex

ROOT = Path(__file__).resolve().parents[2]


def local_config() -> dict:
    config = json.loads((ROOT / ".convex/local/default/config.json").read_text())
    env = {}
    for line in (ROOT / ".env.local").read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep:
            env[key] = value.split(" #")[0].strip()
    for key, port in [
        ("VITE_CONVEX_URL", config["ports"]["cloud"]),
        ("VITE_CONVEX_SITE_URL", config["ports"]["site"]),
    ]:
        if env.get(key) != f"http://127.0.0.1:{port}":
            raise RuntimeError("Scale probe requires this worktree's loopback deployment")
    return config


class LocalAdmin:
    def __init__(self, config):
        self.url = f"http://127.0.0.1:{config['ports']['cloud']}"
        self.key = config["adminKey"]

    def call(self, kind: str, function: str, args: dict):
        req = Request(
            f"{self.url}/api/{kind}",
            data=encode_json(
                {
                    "path": function,
                    "args": args,
                    "format": "json",
                }
            ),
            headers={"Authorization": f"Convex {self.key}", "Content-Type": "application/json"},
        )
        with urlopen(req, timeout=120) as response:
            data = json.load(response)
        if data.get("status") != "success":
            raise RuntimeError(
                f"Local function failed: {function}: {data.get('errorMessage', '')[:300]}"
            )
        return data["value"]


def synthetic_page(i: int, count: int, salt: str = "") -> _PageRow:
    name = "foo::bar" if i == 0 else f"page{i:05}"
    text = f"{name} {salt}: " + "synthetic manual text " * 180
    links = [
        {
            "type": "link",
            "linkType": "internal",
            "href": f"/man/page{(i + j) % count:05}/3",
            "inlines": [{"type": "text", "text": "reference"}],
        }
        for j in range(1, 5)
    ]
    return _PageRow(
        page_id=f"page-{i}",
        name=name,
        section="3",
        title=f"{name}(3)",
        description="Synthetic scale fixture",
        source_path=f"man3/{name}.3",
        source_package=f"pkg{i % 17300:05}",
        source_package_version="1" * 80,
        content_sha256=sha256_hex(text.encode()),
        has_parse_warnings=False,
        doc={
            "blocks": [{"type": "paragraph", "inlines": [{"type": "text", "text": text}, *links]}],
            "toc": [],
        },
        plain_text=text,
        synopsis=None,
        options=[{"anchorId": "opt-a", "flags": "-a", "description": "All"}],
        see_also=None,
        headings_text="",
        see_also_refs=[],
    )


def footprint(admin: LocalAdmin, release_id: str) -> dict:
    totals = {"documents": 0, "jsonBytes": 0, "storageBytes": 0}
    tables = {}
    for table in [
        "datasetReleases",
        "manPageAliases",
        "manPages",
        "manPageProviders",
        "manPageAliasProviders",
        "releaseProviderUploadShards",
        "manPageSearchDocuments",
        "manPageLinks",
        "manPageOptionFlags",
        "licensePackages",
        "licenses",
        "releaseSectionStats",
        "releaseManifests",
        "releasePackageBatches",
        "releasePageUploadShards",
    ]:
        cursor = None
        total = {key: 0 for key in totals}
        while True:
            batch = admin.call(
                "query",
                "maintenance:measureReleaseBatch",
                {
                    "datasetReleaseId": release_id,
                    "cursor": cursor,
                    "table": table,
                },
            )
            for key in total:
                total[key] += batch[key]
            if batch["isDone"]:
                break
            cursor = batch["continueCursor"]
        tables[table] = total
        for key in totals:
            totals[key] += total[key]
    return {**totals, "tables": tables}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=20000)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--prune-release-id")
    parser.add_argument("--output", type=Path, default=ROOT / ".perf-results/ingest-scale.json")
    args = parser.parse_args()
    if not 1 <= args.pages <= 200000 or not 1 <= args.workers <= 8:
        parser.error("pages must be 1..200000 and workers 1..8")
    config = local_config()
    admin = LocalAdmin(config)
    if args.prune_release_id:
        if not args.prune_release_id.startswith("local-scale-"):
            parser.error("Only this probe's local-scale releases may be pruned")
        started = time.monotonic()
        batches = 0
        deleted = 0
        while True:
            batch = admin.call(
                "mutation",
                "maintenance:deleteInactiveReleaseBatch",
                {
                    "datasetReleaseId": args.prune_release_id,
                    "confirmDatasetReleaseId": args.prune_release_id,
                    "maxDocs": 2000,
                },
            )
            batches += 1
            deleted += batch["deleted"]
            if batch["deletedRelease"]:
                break
            if not batch["deleted"]:
                raise RuntimeError("Pruning made no progress")
        report = {
            "releaseId": args.prune_release_id,
            "batches": batches,
            "deleted": deleted,
            "seconds": time.monotonic() - started,
            "note": (
                "Release-owned rows only; shared content blobs remain "
                "for the separately gated orphan sweep."
            ),
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return
    info = admin.call("query", "queries:getInfo", {"distro": "debian"})
    if info["datasetReleaseId"] != "uninitialized" and not info["datasetReleaseId"].startswith(
        "local-scale-"
    ):
        raise RuntimeError("Refusing to replace unrelated local fixture pointers")
    client = ConvexIngestClient(f"http://127.0.0.1:{config['ports']['site']}", "bm2-scale-local")
    client.require_deployed_contract()
    release_id = f"local-scale-{uuid.uuid4()}"
    timings = {}
    started = time.monotonic()
    tracemalloc.start()
    with TemporaryDirectory(prefix="betterman-scale-") as directory:
        with _PageSpool(Path(directory) / "pages.sqlite3") as spool:
            phase = time.monotonic()
            for i in range(args.pages):
                spool.append(synthetic_page(i, args.pages, release_id))
            timings["spoolSeconds"] = time.monotonic() - phase
            refs = list(spool.refs())
            packages = [
                {"name": f"pkg{i:05}", "version": "1" * 80, "hasLicenseText": True}
                for i in range(17300)
            ]
            batches = [packages[i : i + 200] for i in range(0, len(packages), 200)]
            manifest = {
                "packages": [{"name": p["name"], "version": p["version"]} for p in packages]
            }
            phase = time.monotonic()
            client.post(
                "/ingest/release",
                {
                    "datasetReleaseId": release_id,
                    "locale": "en",
                    "distro": "debian",
                    "imageRef": "synthetic-local",
                    "imageDigest": "synthetic-local",
                    "ingestedAt": "2026-10-28",
                    "packageManifest": manifest,
                    "pageCount": args.pages,
                    "aliasCount": 0,
                    "licenseCount": len(packages),
                    "sectionTotals": [
                        {"section": section, "total": total}
                        for section, total in Counter(p.section for p in refs).items()
                    ],
                    "packageBatches": [
                        {
                            "digest": _package_batch_digest(b),
                            "count": len(b),
                            "licenseCount": len(b),
                        }
                        for b in batches
                    ],
                },
            )
            for i, batch in enumerate(batches):
                client.post(
                    "/ingest/license-packages",
                    {"datasetReleaseId": release_id, "batchIndex": i, "packages": batch},
                )
            timings["declarationSeconds"] = time.monotonic() - phase
            phase = time.monotonic()
            _upload_pages(
                client,
                dataset_release_id=release_id,
                limits=(20, 8 * 1024 * 1024),
                pages=_resolved_page_payloads(spool, refs, _build_sitemap_page_map(pages=refs)),
                total=args.pages,
                workers=args.workers,
            )
            timings["uploadSeconds"] = time.monotonic() - phase
            notices = _LicenseSpool(spool.connection)
            for pkg in packages:
                notices[pkg["name"]] = f"Synthetic copyright notice for {pkg['name']}. " * 3
            phase = time.monotonic()
            batch = []
            for item in _iter_license_items(
                licenses=notices, distro="debian", dataset_release_id=release_id
            ):
                batch.append(item)
                if len(batch) == 10:
                    client.post(
                        "/ingest/licenses", {"datasetReleaseId": release_id, "licenses": batch}
                    )
                    batch = []
            if batch:
                client.post("/ingest/licenses", {"datasetReleaseId": release_id, "licenses": batch})
            timings["licenseSeconds"] = time.monotonic() - phase
            phase = time.monotonic()
            client.activate_release(
                {"datasetReleaseId": release_id, "stage": "prod", "activatedAt": "2026-10-28"}
            )
            timings["activationSeconds"] = time.monotonic() - phase
            peak = tracemalloc.get_traced_memory()[1]
            spool_bytes = (Path(directory) / "pages.sqlite3").stat().st_size
    tracemalloc.stop()
    measured = footprint(admin, release_id)
    lookup = admin.call(
        "query",
        "maintenance:measurePageLookup",
        {"distro": "debian", "name": "foo::bar", "section": "3"},
    )
    measured["jsonBytes"] += lookup["releaseJsonBytes"]
    deep = admin.call(
        "query",
        "queries:listSection",
        {
            "distro": "debian",
            "section": "3",
            "limit": 2,
            "cursor": f"page{max(1, args.pages - 10):05}",
            "offset": args.pages - 9,
        },
    )
    search = admin.call(
        "query",
        "queries:search",
        {"distro": "debian", "q": "Foo::Bar(3)", "section": None, "limit": 5, "offset": 0},
    )
    if not any(p["name"] == "foo::bar" for p in search["results"]) or not deep["results"]:
        raise RuntimeError("Perl search or deep pagination failed")
    result = {
        "releaseId": release_id,
        "pages": args.pages,
        "packages": 17300,
        "workers": args.workers,
        "timings": timings,
        "totalSeconds": time.monotonic() - started,
        "pagesPerSecond": args.pages / timings["uploadSeconds"],
        "pythonPeakAllocatedBytes": peak,
        "pythonMaxRssPlatformUnits": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "spoolBytes": spool_bytes,
        "manifestBytes": len(encode_json(manifest)),
        "footprint": measured,
        "metadataLookup": lookup,
        "limits": (
            "Synthetic English pages; JSON bytes exclude index overhead. "
            "RSS units: bytes on macOS, KiB on Linux. No cloud spend measured."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({key: value for key, value in result.items() if key != "footprint"}, indent=2))
    print(
        json.dumps(
            {"footprint": {key: value for key, value in measured.items() if key != "tables"}}
        )
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    main()
