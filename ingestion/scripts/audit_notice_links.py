"""Audit blocked notice links in checksum-verified packages, without installation or upload."""

import argparse
import json
import tarfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.debian_indexes import MAN_PATH, download, link_target
from ingestion.debian_pipeline import Workspace
from ingestion.fedora_archives import _rpm_payload, notice_path


def read_receipt(path: Path, sha256: str) -> dict | None:
    """A finished receipt for this archive, or None (missing, partial or stale) to re-inspect."""
    try:
        row = json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return None
    if (
        not isinstance(row, dict)
        or row.get("sha256") != sha256
        or not isinstance(row.get("links"), list)
    ):
        return None
    return row


def write_receipt(path: Path, row: dict) -> None:
    # Write then rename, so an interrupted audit never leaves half a receipt to trust.
    partial = path.with_name(path.name + ".partial")
    partial.write_text(json.dumps(row, sort_keys=True) + "\n")
    partial.replace(path)


def inspect_payload(stream):
    links, regular = [], set()
    with tarfile.open(fileobj=stream, mode="r|*") as archive:
        for member in archive:
            path = member.name.removeprefix("./")
            if member.isfile():
                regular.add(path)
            elif notice_path(path) and (member.issym() or member.islnk()):
                target = link_target(path, member.linkname, symbolic=member.issym())
                if not (MAN_PATH.fullmatch(target) or notice_path(target)):
                    links.append({"path": path, "target": target})
    return [link | {"samePackageRegularFile": link["target"] in regular} for link in links]


def audit(workdir, distro, workers=4):
    workspace = Workspace(workdir / "catalog", limit=1, distro=distro)
    notice_owners = {
        owner
        for path, owner in workspace.owners.execute("SELECT path,pkg FROM owners")
        if notice_path(path)
    }
    packages = [p for p in workspace.all_manual_packages if p.name in notice_owners]
    output = workdir / "packages"
    output.mkdir(exist_ok=True)
    print(
        json.dumps(
            {
                "distro": distro,
                "manualPackages": len(workspace.all_manual_packages),
                "candidates": len(packages),
                "archiveBytes": sum(p.size for p in packages),
            }
        ),
        flush=True,
    )

    def inspect(package):
        receipt = output / f"{package.sha256}.json"
        if (row := read_receipt(receipt, package.sha256)) is not None:
            return row
        with TemporaryDirectory(prefix="verified-", dir=workdir) as directory:
            archive = Path(directory) / "archive"
            pins = workspace.pins
            download(
                f"{pins['mirror']}/{package.filename}",
                archive,
                package.sha256,
                package.size,
                fallback_url=f"{pins['fallbackMirror']}/{package.filename}"
                if pins.get("fallbackMirror")
                else None,
            )
            if distro == "fedora":
                links = _rpm_payload(archive, inspect_payload)
            else:
                with archive.open("rb") as stream:
                    links = inspect_payload(stream)
        row = {
            "package": package.name,
            "version": package.version,
            "sha256": package.sha256,
            "bytes": package.size,
            "links": links,
        }
        write_receipt(receipt, row)
        return row

    rows, errors = [], []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(inspect, p): p for p in packages}
        for future in as_completed(futures):
            package = futures[future]
            try:
                row = future.result()
                rows.append(row)
                if row["links"]:
                    print(json.dumps(row), flush=True)
            except Exception as exc:  # noqa: BLE001
                errors.append({"package": package.name, "error": str(exc)})
                print(json.dumps(errors[-1]), flush=True)
            if (len(rows) + len(errors)) % 100 == 0:
                print(json.dumps({"verified": len(rows), "errors": len(errors)}), flush=True)
    report = {
        "distro": distro,
        "pins": workspace.pins,
        "manualPackages": len(workspace.all_manual_packages),
        "candidates": len(packages),
        "verifiedPackages": len(rows),
        "packagesWithBlockedNoticeLinks": sum(bool(r["links"]) for r in rows),
        "blockedNoticeLinks": sum(len(r["links"]) for r in rows),
        "packages": sorted((r for r in rows if r["links"]), key=lambda r: r["package"]),
        "errors": errors,
    }
    (workdir / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    workspace.store.db.close()
    workspace.owners.close()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--distro", choices=["fedora", "arch"], required=True)
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 33), default=4)
    args = parser.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)
    report = audit(args.workdir.resolve(), args.distro, args.workers)
    print(json.dumps({k: v for k, v in report.items() if k not in {"pins", "packages"}}))
    if report["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
