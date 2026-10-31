"""Bounded, no-upload archive rehearsal. Never constructs a Convex client."""

import argparse
import json
import resource
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.debian_indexes import MAN_PATH
from ingestion.debian_licenses import copyright_text
from ingestion.debian_pipeline import Workspace, parse_workspace
from ingestion.ingest_runner import (
    _COMMAND_PAGES,
    _iter_license_items,
    _LicenseSpool,
    _PageSpool,
    _require_command_pages,
)
from ingestion.package_set import FULL_PACKAGE_SET_BY_DISTRO
from ingestion.util import sha256_hex


def measure(root, distro, limit, curated=False, largest=False):
    notice_text = copyright_text
    if distro in {"fedora", "arch", "alpine"}:
        from ingestion.standard_licenses import license_text as notice_text
    started = time.monotonic()
    workspace = Workspace(root, limit=limit, distro=distro)
    if largest:
        workspace.packages = sorted(workspace.all_manual_packages, key=lambda p: (-p.size, p.name))[
            :limit
        ]
    if curated:
        requested = FULL_PACKAGE_SET_BY_DISTRO[distro]
        routes = {_COMMAND_PAGES[p] for p in requested if p in _COMMAND_PAGES}
        if distro == "alpine":
            routes.add(("httpd", "8"))
        selected = set(requested) | set(workspace.registrations["packages"])
        if distro == "alpine":
            allowed = workspace.command_owner_allowances()
            selected.update(n for _route, _expected, owners in allowed.values() for n in owners)
            selected = {
                n
                for n in selected
                if n in workspace.available and (n in requested or n.endswith("-doc"))
            }
        for path, pkg in workspace.owners.execute("SELECT path,pkg FROM owners"):
            match = MAN_PATH.fullmatch(path)
            if match and (match[1].lower(), match[2][:1]) in routes:
                selected.add(pkg)
        workspace.packages = [
            workspace.available[n] for n in sorted(selected) if n in workspace.available
        ]
    indexed = time.monotonic()
    workspace.acquire()
    acquired = time.monotonic()
    with (
        TemporaryDirectory(prefix="sample-", dir=root) as temp,
        _PageSpool(Path(temp) / "pages.sqlite3") as spool,
    ):
        providers, failures = parse_workspace(workspace, spool, workers=2)
        parsed = time.monotonic()
        canonical = [p for p in spool.refs() if p.page_id not in providers]
        owners = {}
        if curated:
            owners = workspace.require_command_owners()
            _require_command_pages(
                distro=distro,
                requested=FULL_PACKAGE_SET_BY_DISTRO[distro],
                pages=canonical,
                aliases=workspace.aliases,
                sample=False,
            )
        notices = _LicenseSpool(spool.connection)
        used = (
            {p.name for p in workspace.packages}
            | {p.source_package for p in spool.refs()}
            | {a["sourcePackage"] for a in workspace.alias_providers}
        )
        for pkg in sorted(used):
            text = notice_text(workspace, pkg)
            if text.strip():
                notices[pkg] = text
        for _ in _iter_license_items(
            licenses=notices,
            distro=distro,
            dataset_release_id="b2-local-audit",
            stored=distro in {"fedora", "arch", "alpine"},
        ):
            pass
        if distro == "alpine":
            from ingestion.alpine_archives import write_sha256_pins

            write_sha256_pins(workspace)
        rss_factor = 1 if sys.platform == "darwin" else 1024
        report = {
            "distro": distro,
            "scope": "local, no upload; all curated-route index competitors"
            if curated
            else "local, no-upload bounded sample",
            "pinsSha256": sha256_hex(
                (
                    Path(__file__).resolve().parents[1]
                    / "data"
                    / {
                        "ubuntu": "ubuntu-noble.json",
                        "fedora": "fedora-44.json",
                        "arch": "arch-20261001.json",
                        "alpine": "alpine-v3.23.json",
                    }[distro]
                ).read_bytes()
            ),
            "fullPackages": len(workspace.all_manual_packages),
            "fullArchiveBytes": sum(p.size for p in workspace.all_manual_packages),
            "fullArchiveMaxBytes": max(p.size for p in workspace.all_manual_packages),
            "samplePackages": len(workspace.packages),
            "acquiredPackages": len(workspace.acquired),
            "downloadedBytes": workspace.downloaded,
            "archiveFallbacks": workspace.archive_fallbacks,
            "indexSeconds": indexed - started,
            "acquireSeconds": acquired - indexed,
            "parseSeconds": parsed - acquired,
            "licenseSeconds": time.monotonic() - parsed,
            "pages": len(spool),
            "providers": len(providers),
            "aliases": len(workspace.aliases),
            "sourceBytes": workspace.extracted_quota.used,
            "spoolBytes": (Path(temp) / "pages.sqlite3").stat().st_size,
            "parentPeakRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * rss_factor,
            "childPeakRssBytes": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss
            * rss_factor,
            "commandOwners": owners,
            "parseFailures": failures,
            "unresolved": [m for m in workspace.missing if m["error"] != "Unsupported route name"],
            "unsupportedRoutes": [
                m for m in workspace.missing if m["error"] == "Unsupported route name"
            ],
            "verifiedLicenses": len(notices),
            "standardLicenseMetadata": getattr(workspace, "standard_license_metadata", {}),
            "standardLicenseTextSource": getattr(workspace, "standard_license_provenance", None),
            "maxLicenseBytes": max((len(notices[p].encode()) for p in notices), default=0),
            "packagesWithoutLicenseText": sorted(used - set(notices)),
            "packages": [
                {"name": p.name, "sha256": workspace.available[p.name].sha256, "bytes": p.size}
                for p in workspace.packages
            ],
        }
    workspace.store.db.close()
    workspace.owners.close()
    (root / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--distro", choices=["ubuntu", "fedora", "arch", "alpine"], required=True)
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--packages", type=int, default=50)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--curated", action="store_true")
    mode.add_argument("--largest", action="store_true", help="Bounded largest-archive rehearsal")
    args = parser.parse_args()
    report = measure(args.workdir.resolve(), args.distro, args.packages, args.curated, args.largest)
    print(json.dumps({k: v for k, v in report.items() if k != "packages"}, indent=2))
    if report["parseFailures"] or report["unresolved"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
