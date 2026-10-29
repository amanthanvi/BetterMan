"""Acquisition/parser benchmark; explicit upload is hard-confined to local Convex."""

import argparse
import json
import time
from pathlib import Path

from ingestion.debian_pipeline import benchmark


def audit_routes(admin):
    names = (
        "which cc c++ view ex nawk fakeroot telnet traceroute java mt lzma mailx "
        "pinentry x-terminal-emulator ftp yacc editor pager"
    ).split()
    report = {}
    for name in names:
        args = {"distro": "debian", "name": name, "section": "1"}
        redirects = []
        for _ in range(8):
            result = admin.call("action", "content:getManByNameAndSection", args)
            if not result:
                raise RuntimeError(f"Missing audited route: {name}")
            if result["kind"] == "page":
                page = result["data"]["page"]
                report[name] = {
                    "name": page["name"],
                    "section": page["section"],
                    "package": page["sourcePackage"],
                    "redirects": redirects,
                }
                break
            redirects.append(
                {key: result[key] for key in ("name", "section", "pkg") if key in result}
            )
            args = {"distro": "debian", "name": result["name"], "section": result["section"]}
            if result.get("pkg"):
                args["pkg"] = result["pkg"]
        else:
            raise RuntimeError(f"Alias cycle during audit: {name}")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--packages", type=int, default=2000)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--audit-active-alternatives", action="store_true")
    parser.add_argument(
        "--local-upload",
        action="store_true",
        help="Upload only to this worktree's loopback deployment",
    )
    args = parser.parse_args()
    if args.audit_active_alternatives:
        import os

        from scripts.check_scale import LocalAdmin, local_config

        if os.environ.get("CONVEX_DEPLOY_KEY") or args.local_upload or args.download_only:
            parser.error("active audit is read-only and refuses deploy keys or other modes")
        report = audit_routes(LocalAdmin(local_config()))
        (args.workdir / "routes-audit.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return
    if args.download_only:
        if args.local_upload:
            parser.error("download-only cannot upload")
        from ingestion.debian_pipeline import Workspace

        started = time.monotonic()
        workspace = Workspace(args.workdir.resolve(), limit=args.packages)
        workspace.acquire(workers=args.workers)
        report = {
            "packages": len(workspace.packages),
            "downloadedBytes": workspace.downloaded,
            "cachedPackages": workspace.cached_packages,
            "seconds": time.monotonic() - started,
        }
        (args.workdir / "download-only.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report))
        return
    if args.local_upload:
        # Reuse the hard-confined local probe client: URLs must match this
        # worktree's .convex config. No deploy key or remote URL is accepted.
        import os

        from ingestion.convex_client import ConvexIngestClient
        from ingestion.debian_pipeline import Workspace
        from ingestion.debian_publish import publish_workspace
        from scripts.check_scale import LocalAdmin, footprint, local_config

        if os.environ.get("CONVEX_DEPLOY_KEY"):
            raise RuntimeError("Local archive probe refuses deploy keys")
        config = local_config()
        client = ConvexIngestClient(
            f"http://127.0.0.1:{config['ports']['site']}", "bm2-scale-local"
        )
        client.require_deployed_contract()
        workspace = Workspace(args.workdir.resolve(), limit=args.packages)
        workspace.acquire(workers=args.workers)
        started = time.monotonic()
        result = publish_workspace(
            workspace,
            client,
            activate=True,
            dataset_stage="prod",
            git_sha="local-scale-debs",
            sample=True,
        )
        report = {
            "releaseId": result.dataset_release_id,
            "seconds": time.monotonic() - started,
            "timings": workspace.timings,
            "footprint": footprint(LocalAdmin(config), result.dataset_release_id),
            "canonicalMetadataLookup": LocalAdmin(config).call(
                "query",
                "maintenance:measurePageLookup",
                {
                    "distro": "debian",
                    "name": "bash",
                    "section": "1",
                },
            ),
        }
        (args.workdir / "local-upload.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return
    print(
        json.dumps(
            benchmark(args.workdir.resolve(), limit=args.packages, workers=args.workers), indent=2
        )
    )


if __name__ == "__main__":
    main()
