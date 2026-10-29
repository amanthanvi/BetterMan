"""Acquisition/parser benchmark; explicit upload is hard-confined to local Convex."""

import argparse
import json
import time
from pathlib import Path

from ingestion.debian_pipeline import benchmark


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--packages", type=int, default=2000)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument(
        "--local-upload",
        action="store_true",
        help="Upload only to this worktree's loopback deployment",
    )
    args = parser.parse_args()
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
