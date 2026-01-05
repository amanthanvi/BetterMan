from __future__ import annotations

import argparse
import os
import sys

from ingestion.docker_runner import run_ingest_container
from ingestion.ingest_runner import ingest as ingest_dataset


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="betterman-ingestion")
    sub = parser.add_subparsers(dest="cmd", required=True)

    ingest = sub.add_parser("ingest", help="Ingest man pages into Postgres")
    ingest.add_argument("--sample", action="store_true", help="Ingest a small sample set")
    ingest.add_argument(
        "--activate",
        default=True,
        action=argparse.BooleanOptionalAction,
        help="Mark the dataset release as active after ingestion",
    )
    ingest.add_argument("--in-container", action="store_true", help=argparse.SUPPRESS)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.cmd == "ingest":
        if args.in_container:
            return _run_ingest_in_container(sample=args.sample, activate=args.activate)

        return run_ingest_container(sample=args.sample, activate=args.activate)

    raise AssertionError("unreachable")


def _run_ingest_in_container(*, sample: bool, activate: bool) -> int:
    database_url = os.environ.get("INGEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        database_url = "postgresql://betterman:betterman@postgres:5432/betterman"

    image_ref = os.environ.get("BETTERMAN_IMAGE_REF")
    image_digest = os.environ.get("BETTERMAN_IMAGE_DIGEST")
    git_sha = os.environ.get("BETTERMAN_INGEST_GIT_SHA", "unknown")

    if not image_ref or not image_digest:
        print("Missing BETTERMAN_IMAGE_REF / BETTERMAN_IMAGE_DIGEST", file=sys.stderr)
        return 2

    try:
        result = ingest_dataset(
            sample=sample,
            activate=activate,
            database_url=database_url,
            image_ref=image_ref,
            image_digest=image_digest,
            git_sha=git_sha,
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 1

    print(
        f"Ingested {result.succeeded}/{result.total} pages "
        f"(hard_failed={result.hard_failed}) "
        f"datasetReleaseId={result.dataset_release_id} "
        f"published={result.published}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
