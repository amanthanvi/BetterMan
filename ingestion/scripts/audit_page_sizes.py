"""Measure pinned Debian/Ubuntu manual sizes without upload or package installation."""

import argparse
import gzip
import json
import re
import tarfile
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from pathlib import Path
from tempfile import TemporaryDirectory

from ingestion.debian_archives import MAX_SOURCE_BYTES, data_member
from ingestion.debian_indexes import MAN_PATH, download, manual_registered
from ingestion.debian_pipeline import Workspace
from ingestion.util import sha256_hex


def measure_source(row):
    from ingestion.ingest_runner import _parse_source, _ParseContext, _stored_page_size
    from ingestion.man_scan import ManSource

    try:
        raw = gzip.decompress(Path(row["sourceFile"]).read_bytes())
        page = _parse_source(
            ManSource(Path(row["path"]), row["name"], row["section"]),
            raw,
            _ParseContext("debian", "amd64", {}, {}),
        )
        return row | {"storedBytes": _stored_page_size(page)}
    except Exception as exc:  # noqa: BLE001
        match = re.search(r"stored page payload (\d+) bytes exceeds", str(exc))
        return row | ({"storedBytes": int(match[1])} if match else {"error": str(exc)})


def measure(root, workers):
    rows = [
        row
        for path in (root / "receipts").glob("*.json")
        for row in json.loads(path.read_text())
        if "sourceFile" in row
    ]
    rows.sort(key=lambda row: (-row["sourceBytes"], row["path"], row["package"]))
    output = root / "measurements"
    output.mkdir(exist_ok=True)
    done = {p.stem: json.loads(p.read_text()) for p in output.glob("*.json")}
    pending = [row for row in rows if Path(row["sourceFile"]).stem not in done]
    with ProcessPoolExecutor(max_workers=workers) as executor:
        for i, row in enumerate(executor.map(measure_source, pending), 1):
            key = Path(row["sourceFile"]).stem
            path = output / (key + ".json")
            temporary = path.with_suffix(".tmp")
            temporary.write_text(json.dumps(row) + "\n")
            temporary.replace(path)
            done[key] = row
            if i % 25 == 0 or "error" in row or row.get("storedBytes", 0) > 8 * 1024**2:
                print(
                    json.dumps(
                        {
                            "measured": len(done),
                            "path": row["path"],
                            "storedBytes": row.get("storedBytes"),
                            "error": row.get("error"),
                        }
                    ),
                    flush=True,
                )
    report = {
        "measuredSources": len(rows),
        "topStored": sorted(
            (r for r in done.values() if "storedBytes" in r),
            key=lambda r: (-r["storedBytes"], r["path"], r["package"]),
        )[:20],
        "topSources": sorted(
            done.values(), key=lambda r: (-r["sourceBytes"], r["path"], r["package"])
        )[:10],
        "overLimit": [r for r in done.values() if r.get("storedBytes", 0) > 8 * 1024**2],
        "errors": [r for r in done.values() if "error" in r],
    }
    (root / "measurements.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report), flush=True)


def manual_sizes(stream, package, registrations, sources):
    rows = []
    with tarfile.open(fileobj=data_member(stream), mode="r|*") as archive:
        for member in archive:
            path = member.name.removeprefix("./")
            if not member.isfile() or not manual_registered(package.name, path, registrations):
                continue
            data = archive.extractfile(member).read(MAX_SOURCE_BYTES + 1)
            if data.startswith(b"\x1f\x8b"):
                data = gzip.decompress(data)
            match = MAN_PATH.fullmatch(path)
            row = {
                "package": package.name,
                "version": package.version,
                "path": path,
                "name": match[1].lower(),
                "section": match[2].lower(),
                "sourceBytes": len(data),
                "sha256": package.sha256,
            }
            rows.append(row)
            if len(data) >= 128 * 1024:
                key = sha256_hex((package.sha256 + "/" + path).encode())
                destination = sources / (key + ".gz")
                destination.write_bytes(gzip.compress(data, mtime=0))
                row["sourceFile"] = str(destination)
    return rows


def audit(root, distro, workers):
    workspace = Workspace(root / "catalog", limit=1, distro=distro)
    sources = root / "sources"
    sources.mkdir(exist_ok=True)
    receipts = root / "receipts"
    receipts.mkdir(exist_ok=True)
    packages = workspace.all_manual_packages
    print(
        json.dumps(
            {
                "distro": distro,
                "packages": len(packages),
                "archiveBytes": sum(p.size for p in packages),
            }
        ),
        flush=True,
    )

    def inspect(package):
        receipt = receipts / (package.sha256 + ".json")
        if receipt.exists():
            return json.loads(receipt.read_text())
        with TemporaryDirectory(prefix="verified-", dir=root) as directory:
            archive = Path(directory) / "package.deb"
            mirror = (
                "https://deb.debian.org/debian" if distro == "debian" else workspace.pins["mirror"]
            )
            download(
                mirror + "/" + package.filename,
                archive,
                package.sha256,
                package.size,
                fallback_url=(
                    workspace.pins["mirror"] if distro == "debian" else workspace.pins["cdn"]
                )
                + "/"
                + package.filename,
            )
            with archive.open("rb") as stream:
                rows = manual_sizes(stream, package, workspace.registrations, sources)
        temporary = receipt.with_suffix(".tmp")
        temporary.write_text(json.dumps(rows) + "\n")
        temporary.replace(receipt)
        return rows

    rows, errors = [], []
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(inspect, p): p for p in packages}
        for i, future in enumerate(as_completed(futures), 1):
            try:
                rows.extend(future.result())
            except Exception as exc:  # noqa: BLE001
                errors.append({"package": futures[future].name, "error": str(exc)})
                print(json.dumps(errors[-1]), flush=True)
            if i % 100 == 0:
                print(
                    json.dumps(
                        {
                            "distro": distro,
                            "scannedPackages": i,
                            "manuals": len(rows),
                            "errors": len(errors),
                        }
                    ),
                    flush=True,
                )
    report = {
        "distro": distro,
        "pins": workspace.pins,
        "packages": len(packages),
        "manuals": len(rows),
        "topSources": sorted(rows, key=lambda r: (-r["sourceBytes"], r["path"], r["package"]))[
            :100
        ],
        "largeSources": [row for row in rows if "sourceFile" in row],
        "errors": errors,
    }
    (root / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    workspace.store.db.close()
    workspace.owners.close()
    print(
        json.dumps(
            {k: v for k, v in report.items() if k not in {"pins", "topSources", "largeSources"}}
        ),
        flush=True,
    )
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--distro", choices=["debian", "ubuntu"], required=True)
    parser.add_argument("--workdir", type=Path, required=True)
    parser.add_argument("--workers", type=int, choices=range(1, 33), default=16)
    parser.add_argument("--measure", action="store_true", help="Parse scanned sources >=128 KiB")
    args = parser.parse_args()
    args.workdir.mkdir(parents=True, exist_ok=True)
    if args.measure:
        measure(args.workdir.resolve(), args.workers)
    elif audit(args.workdir.resolve(), args.distro, args.workers)["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
