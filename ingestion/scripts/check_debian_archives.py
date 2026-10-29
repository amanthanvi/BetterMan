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


def audit_alternatives(workspace):
    """No upload: extend the fixed corpus with the competing Debian providers."""
    from ingestion.mandoc import checked_source

    requested = set(
        (
            "nano vim-common vim-tiny vim joe less most gcc g++ clang gawk mawk original-awk "
            "xterm gnome-terminal terminator tnftp ftp.app bison byacc 9base"
        ).split()
    )
    requested.update(
        name
        for name in workspace.available
        if name.startswith(("openjdk-21-", "openjdk-25-")) and "headless" in name
    )
    absent = sorted(requested - workspace.available.keys())
    if absent:
        raise RuntimeError(f"Audit provider unavailable in pinned Packages: {absent}")
    selected = {p.name for p in workspace.packages}
    workspace.packages += [workspace.available[n] for n in sorted(requested - selected)]
    workspace.acquire()
    rejected, checked = [], 0
    original_checked = 0
    for pkg, path, name, section, alias, raw in workspace.sources():
        if alias:
            continue
        checked += 1
        original_checked += pkg in selected
        try:
            checked_source(raw)
        except RuntimeError as exc:
            rejected.append(
                {
                    "package": pkg,
                    "path": path,
                    "name": name,
                    "section": section,
                    "reason": str(exc),
                    "originalCorpus": pkg in selected,
                }
            )
    names = set("editor pager cc c++ java awk x-terminal-emulator ftp yacc view ex".split())
    defaults = []
    for item in workspace.alternative_defaults:
        if item["name"] in names:
            metadata = workspace.available[item["package"]]
            defaults.append(
                item | {"packagePriority": metadata.priority, "installed": metadata.installed}
            )
    routes = {}
    for name in sorted(names):
        winner = workspace.route_winners.get((name, "1"))
        if winner is None:
            decision = next(
                (
                    r
                    for r in workspace.alternatives_skipped
                    if r.get("name") == name and "winning provider" in r["reason"]
                ),
                {},
            )
            routes[name] = {
                "status": "omitted",
                "reason": decision.get("reason", "no registration"),
            }
            if "package" in decision:
                metadata = workspace.available[decision["package"]]
                routes[name].update(
                    registrationPackage=metadata.name,
                    packagePriority=metadata.priority,
                    installed=metadata.installed,
                )
        else:
            pkg, path, alias = winner
            owner, target, _raw = workspace.resolve(pkg, path, details=True)
            metadata = workspace.available[pkg]
            routes[name] = {
                "status": "alias" if alias else "package-owned page",
                "registrationPackage": pkg,
                "packagePriority": metadata.priority,
                "installed": metadata.installed,
                "manualPackage": owner,
                "manualPath": target,
            }
    return {
        "routes": routes,
        "scope": "fixed 2000-package corpus plus competing providers from pinned trixie/main",
        "selectedPackages": len(workspace.packages),
        "acquiredPackages": len(workspace.acquired),
        "addedProviders": sorted(requested - selected),
        "requiredProviders": sorted(requested),
        "checkedPages": checked,
        "originalCorpusCheckedPages": original_checked,
        "rejectedPages": rejected,
        "alternativeDefaults": defaults,
        "omittedOrOccupied": [r for r in workspace.alternatives_skipped if r.get("name") in names],
        "allAlternativeDefaults": workspace.alternative_defaults,
        "skipped": workspace.alternatives_skipped,
        "restoredNames": workspace.restored_names,
        "unresolved": workspace.missing,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--packages", type=int, default=2000)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--audit-active-alternatives", action="store_true")
    parser.add_argument(
        "--audit-alternatives", action="store_true", help="No-upload provider and roff-guard audit"
    )
    parser.add_argument(
        "--local-upload",
        action="store_true",
        help="Upload only to this worktree's loopback deployment",
    )
    args = parser.parse_args()
    if args.audit_alternatives:
        if args.local_upload or args.download_only or args.audit_active_alternatives:
            parser.error("provider audit cannot combine with other modes")
        from ingestion.debian_pipeline import Workspace

        report = audit_alternatives(Workspace(args.workdir.resolve(), limit=args.packages))
        (args.workdir / "alternatives-guard-audit.json").write_text(
            json.dumps(report, indent=2) + "\n"
        )
        print(
            json.dumps(
                {
                    key: value
                    for key, value in report.items()
                    if key not in {"allAlternativeDefaults", "skipped", "rejectedPages"}
                },
                indent=2,
            )
        )
        print(json.dumps({"rejectedCount": len(report["rejectedPages"])}))
        return
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
