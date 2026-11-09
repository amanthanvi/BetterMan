"""Bounded, no-upload archive rehearsal. Never constructs a Convex client."""

import argparse
import json
import resource
import sys
import threading
import time
from collections import Counter
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.convex_client import encode_json
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
from ingestion.standard_licenses import NO_LICENSE_TEXT
from ingestion.util import sha256_hex


class LocalPublication:
    """Exercise publisher serialization and declarations without a network client."""

    def __init__(self, root):
        self.root = root
        self.release = None
        self.counts = Counter()
        self.lock = threading.Lock()

    def post(self, path, payload):
        field = {
            "/ingest/license-packages": "packages",
            "/ingest/pages/storage": "pages",
            "/ingest/aliases": "aliases",
            "/ingest/licenses": "licenses",
        }
        raw = encode_json(payload)
        if path == "/ingest/release":
            self.release = payload
            (self.root / "release.json").write_bytes(raw)
        else:
            with self.lock:
                self.counts[field[path]] += len(payload[field[path]])
        return {}


def measure_full(root, distro):
    from ingestion.debian_publish import publish_workspace

    started = time.monotonic()
    workspace = Workspace(root, distro=distro)
    indexed = time.monotonic()
    workspace.acquire()
    acquired = time.monotonic()
    local = LocalPublication(root)
    result = publish_workspace(
        workspace, local, activate=False, dataset_stage="staging", git_sha="local-no-upload"
    )
    release = local.release
    manifest = release["packageManifest"]
    assert local.counts["pages"] == result.succeeded
    assert local.counts["licenses"] == release["licenseCount"]
    assert local.counts["packages"] == len(manifest["packages"])
    assert local.counts["aliases"] == len(workspace.alias_providers)
    failures = manifest["parseFailures"]
    report = {
        "distro": distro,
        "scope": "full local acquisition and publisher rehearsal; no upload or activation",
        "fullPackages": len(workspace.all_manual_packages),
        "acquiredPackages": len(workspace.acquired),
        "downloadedBytes": workspace.downloaded,
        "archiveFallbacks": workspace.archive_fallbacks,
        "indexSeconds": indexed - started,
        "acquireSeconds": acquired - indexed,
        "publisherSeconds": time.monotonic() - acquired,
        "pages": result.succeeded,
        "canonicalPages": release["pageCount"],
        "aliases": release["aliasCount"],
        "licenses": release["licenseCount"],
        "standardTextFills": sum(
            bool(p.get("standardLicenseIdentifiers")) for p in manifest["packages"]
        ),
        "recordedLicenseGaps": sum(
            bool(p.get("missingLicenseIdentifiers") or p.get("licenseExpressionError"))
            for p in manifest["packages"]
        ),
        "noticeLinkGaps": getattr(workspace, "notice_link_gaps", {}),
        "parseFailures": failures,
        "missingSources": manifest["missingSources"],
        "oversizedPages": [p for p in failures if "stored page payload" in p["error"]],
        "fatalErrors": 0,
    }
    workspace.store.db.close()
    workspace.owners.close()
    (root / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


def measure(root, distro, limit, curated=False, largest=False, package_names=None):
    notice_text = copyright_text
    if distro in {"fedora", "arch", "alpine"}:
        from ingestion.standard_licenses import license_text as notice_text
    started = time.monotonic()
    workspace = Workspace(root, limit=limit, distro=distro)
    if package_names:
        workspace.require_allowed_packages(package_names)
        workspace.packages = [workspace.available[n] for n in sorted(set(package_names))]
        workspace.curated_packages = []
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
        packages_with_text = set()
        used = (
            {p.name for p in workspace.packages}
            | {p.source_package for p in spool.refs()}
            | {a["sourcePackage"] for a in workspace.alias_providers}
        )
        for pkg in sorted(used):
            text = notice_text(workspace, pkg)
            if text.strip():
                notices[pkg] = text
                if text.splitlines()[0] != NO_LICENSE_TEXT:
                    packages_with_text.add(pkg)
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
            "verifiedLicenses": len(packages_with_text),
            "standardLicenseMetadata": getattr(workspace, "standard_license_metadata", {}),
            "noticeLinkGaps": getattr(workspace, "notice_link_gaps", {}),
            "standardLicenseTextSource": getattr(workspace, "standard_license_provenance", None),
            "maxLicenseBytes": max((len(notices[p].encode()) for p in notices), default=0),
            "packagesWithoutLicenseText": sorted(used - packages_with_text),
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
    mode.add_argument("--full", action="store_true", help="Rehearse the complete publisher locally")
    mode.add_argument("--curated", action="store_true")
    mode.add_argument("--largest", action="store_true", help="Bounded largest-archive rehearsal")
    mode.add_argument(
        "--package",
        action="append",
        dest="package_names",
        help="Rehearse only these exact pinned packages; repeat for several",
    )
    args = parser.parse_args()
    if args.full:
        print(json.dumps(measure_full(args.workdir.resolve(), args.distro), indent=2))
        return
    report = measure(
        args.workdir.resolve(),
        args.distro,
        args.packages,
        args.curated,
        args.largest,
        args.package_names,
    )
    print(json.dumps({k: v for k, v in report.items() if k != "packages"}, indent=2))
    if report["parseFailures"] or report["unresolved"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
