"""Acquisition/parser benchmark; explicit upload is hard-confined to local Convex."""

import argparse
import gzip
import json
import time
from pathlib import Path

from ingestion.debian_pipeline import benchmark


def audit_command_pages(workspace, *, workers=2):
    """Full Contents audit plus a no-upload replay of every curated command owner."""
    from tempfile import TemporaryDirectory

    from ingestion.debian_indexes import MAN_PATH
    from ingestion.debian_licenses import copyright_text
    from ingestion.debian_pipeline import parse_workspace
    from ingestion.ingest_runner import (
        _COMMAND_PAGE_EXCLUSIONS,
        _COMMAND_PAGE_OWNERS,
        _COMMAND_PAGES,
        _iter_license_items,
        _LicenseSpool,
        _PageSpool,
        _require_command_pages,
    )
    from ingestion.package_set import FULL_PACKAGE_SET_DEBIAN

    expected = {p: _COMMAND_PAGES[p] for p in FULL_PACKAGE_SET_DEBIAN if p in _COMMAND_PAGES}
    sources = {route: [] for route in expected.values()}
    private_packages = set()
    for path, pkg in workspace.owners.execute("SELECT path,pkg FROM owners ORDER BY path,pkg"):
        match = MAN_PATH.fullmatch(path)
        route = (match[1].lower(), match[2][:1]) if match else None
        if route in sources:
            sources[route].append({"package": pkg, "path": path})
        if match and path.startswith("usr/share/") and not path.startswith("usr/share/man/"):
            private_packages.add(pkg)
    selected = set(FULL_PACKAGE_SET_DEBIAN) | set(_COMMAND_PAGE_OWNERS["debian"].values())
    selected |= private_packages
    selected.update(source["package"] for items in sources.values() for source in items)
    workspace.packages = [
        workspace.available[n] for n in sorted(selected) if n in workspace.available
    ]
    workspace.acquire()
    with TemporaryDirectory(prefix="command-audit-", dir=workspace.root) as temporary:
        with _PageSpool(Path(temporary) / "pages.sqlite3") as spool:
            providers, failures = parse_workspace(workspace, spool, workers=workers)
            canonical = [p for p in spool.refs() if p.page_id not in providers]
            license_packages = {p.source_package for p in spool.refs() if p.source_package}
            license_packages.update(a["sourcePackage"] for a in workspace.alias_providers)
            licenses = _LicenseSpool(spool.connection)
            for pkg in sorted(license_packages):
                licenses[pkg] = copyright_text(workspace, pkg)
            for _item in _iter_license_items(
                licenses=licenses,
                distro="debian",
                dataset_release_id=f"audit-{workspace.pins['releaseSha256']}",
            ):
                pass
            present = {(p.name, p.section[:1]) for p in canonical} | {
                (a.name, a.section[:1]) for a in workspace.aliases
            }
            report = []
            for pkg in FULL_PACKAGE_SET_DEBIAN:
                if pkg not in expected:
                    report.append({"package": pkg, "status": "non-command"})
                    continue
                name, section = expected[pkg]
                reason = _COMMAND_PAGE_EXCLUSIONS["debian"].get(pkg)
                winner = next(
                    (
                        value
                        for (n, s), value in workspace.route_winners.items()
                        if n == name and s[:1] == section
                    ),
                    None,
                )
                report.append(
                    {
                        "package": pkg,
                        "name": name,
                        "section": section,
                        "status": "excluded"
                        if reason
                        else "present"
                        if (name, section) in present
                        else "missing",
                        "reason": reason,
                        "catalogSources": sources[(name, section)],
                        "resolvedOwner": winner[0] if winner else None,
                        "resolvedPath": winner[1] if winner else None,
                    }
                )
            # Exercise exactly the publish gate; never enable its escape hatch.
            _require_command_pages(
                distro="debian",
                requested=FULL_PACKAGE_SET_DEBIAN,
                pages=canonical,
                aliases=workspace.aliases,
                sample=False,
            )
    return {
        "scope": "complete pinned Contents-all/amd64 and curated-owner archive parse; no upload",
        "releaseSha256": workspace.pins["releaseSha256"],
        "fullManualPackages": len(workspace.all_manual_packages),
        "acquiredPackages": len(workspace.acquired),
        "privateManualPackages": sorted(private_packages),
        "verifiedLicenses": len(license_packages),
        "commands": report,
        "parseFailures": failures,
        "unresolvedSources": workspace.missing,
    }


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


def audit_case_collisions(indexes, alternatives=()):
    """Scan both complete, Release-verified English Contents indexes, no archives."""
    from ingestion.debian_indexes import MAN_PATH

    spellings = {}
    for filename in ["main-Contents-all.gz", "main-Contents-amd64.gz"]:
        with gzip.open(indexes / filename, "rt") as lines:
            for line in lines:
                fields = line.rstrip().rsplit(None, 1)
                match = MAN_PATH.fullmatch(fields[0]) if len(fields) == 2 else None
                if match:
                    key = (match[1].lower(), match[2].lower())
                    spellings.setdefault(key, set()).add(match[1])
    collisions = {key: names for key, names in spellings.items() if len(names) > 1}
    affected_alternatives = {
        (a["name"], a["section"]): spellings[(a["name"], a["section"])]
        for a in alternatives
        if (a["name"], a["section"]) in spellings
        and any(
            name != a.get("spelling", a["name"]) for name in spellings[(a["name"], a["section"])]
        )
    }
    examples = {key: set() for key in collisions.keys() | affected_alternatives.keys()}
    for filename in ["main-Contents-all.gz", "main-Contents-amd64.gz"]:
        with gzip.open(indexes / filename, "rt") as lines:
            for line in lines:
                fields = line.rstrip().rsplit(None, 1)
                match = MAN_PATH.fullmatch(fields[0]) if len(fields) == 2 else None
                if match and (match[1].lower(), match[2].lower()) in examples:
                    examples[(match[1].lower(), match[2].lower())].add((fields[0], fields[1]))

    def records(routes):
        return [
            {
                "name": key[0],
                "section": key[1],
                "spellings": sorted(routes[key]),
                "sources": [
                    {"path": path, "owners": packages} for path, packages in sorted(examples[key])
                ],
            }
            for key in sorted(routes)
        ]

    return {
        "scope": "complete Release-verified Contents-all and Contents-amd64, English manual roots",
        "normalizedRoutes": len(spellings),
        "realPageCollisionCount": len(collisions),
        "realPageCollisions": records(collisions),
        "auditedAlternativeCollisionCount": len(affected_alternatives),
        "auditedAlternativeCollisions": records(affected_alternatives),
    }


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
        "caseCollisions": audit_case_collisions(
            workspace.root / "indexes", workspace.alternatives_audit
        ),
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
    parser.add_argument("--audit-command-pages", action="store_true")
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
    if args.audit_command_pages:
        if (
            args.local_upload
            or args.download_only
            or args.audit_alternatives
            or args.audit_active_alternatives
        ):
            parser.error("command-page audit cannot combine with other modes")
        from ingestion.debian_pipeline import Workspace

        report = audit_command_pages(
            Workspace(args.workdir.resolve(), limit=args.packages), workers=args.workers
        )
        (args.workdir / "command-pages-audit.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        return
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
