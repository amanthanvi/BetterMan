from __future__ import annotations

import argparse
import logging
import os

from ingestion.db import iso_utc_now, json_dumps
from ingestion.docker_runner import run_ingest_container
from ingestion.ingest_runner import ingest as ingest_dataset

logger = logging.getLogger("betterman.ingestion")


def _log(event: str, **fields: object) -> None:
    logger.info(json_dumps({"ts": iso_utc_now(), "event": event, **fields}))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="betterman-ingestion")
    sub = parser.add_subparsers(dest="cmd", required=True)

    ingest = sub.add_parser("ingest", help="Ingest man pages into Postgres")
    ingest.add_argument(
        "--distro",
        choices=["debian", "ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"],
        default="debian",
        help="Distribution to ingest (affects base image and package manager)",
    )
    ingest.add_argument("--sample", action="store_true", help="Ingest a small sample set")
    ingest.add_argument(
        "--activate",
        default=None,
        action=argparse.BooleanOptionalAction,
        help="Mark the dataset release as active after ingestion",
    )
    ingest.add_argument("--in-container", action="store_true", help=argparse.SUPPRESS)

    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.cmd == "ingest":
        activate = bool(args.activate) if args.activate is not None else (not args.sample)
        if args.in_container:
            return _run_ingest_in_container(
                sample=args.sample,
                activate=activate,
                distro=args.distro,
            )

        return run_ingest_container(sample=args.sample, activate=activate, distro=args.distro)

    raise AssertionError("unreachable")


def _run_ingest_in_container(*, sample: bool, activate: bool, distro: str) -> int:
    database_url = os.environ.get("INGEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        database_url = "postgresql://betterman:betterman@postgres:5432/betterman"

    image_ref = os.environ.get("BETTERMAN_IMAGE_REF")
    image_digest = os.environ.get("BETTERMAN_IMAGE_DIGEST")
    git_sha = os.environ.get("BETTERMAN_INGEST_GIT_SHA", "unknown")

    if not image_ref or not image_digest:
        _log("ingest_error", error="Missing BETTERMAN_IMAGE_REF / BETTERMAN_IMAGE_DIGEST")
        return 2

    try:
        result = ingest_dataset(
            sample=sample,
            activate=activate,
            database_url=database_url,
            image_ref=image_ref,
            image_digest=image_digest,
            git_sha=git_sha,
            distro=distro,
        )
    except RuntimeError as exc:
        _log("ingest_error", error=str(exc))
        return 2
    except Exception as exc:  # noqa: BLE001
        _log("ingest_error", error=str(exc))
        return 1

    _log(
        "ingest_done",
        total=result.total,
        succeeded=result.succeeded,
        hardFailed=result.hard_failed,
        datasetReleaseId=result.dataset_release_id,
        published=result.published,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
