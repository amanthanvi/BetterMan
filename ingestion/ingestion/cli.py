from __future__ import annotations

import argparse
import logging
import os
import subprocess
from pathlib import Path

from ingestion.convex_client import (
    ConvexIngestClient,
    activation_timeout_seconds,
    ingest_activation_deadline,
)
from ingestion.db import iso_utc_now, json_dumps
from ingestion.docker_runner import run_ingest_container
from ingestion.ingest_runner import ingest as ingest_dataset

logger = logging.getLogger("betterman.ingestion")


def _log(event: str, **fields: object) -> None:
    logger.info(json_dumps({"ts": iso_utc_now(), "event": event, **fields}))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="betterman-ingestion")
    sub = parser.add_subparsers(dest="cmd", required=True)

    ingest = sub.add_parser("ingest", help="Ingest man pages into Convex")
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
    ingest.add_argument(
        "--debian-full", action="store_true", help="Opt in to full Debian archive ingestion"
    )
    ingest.add_argument(
        "--debian-translation",
        choices=["de", "fr", "es", "pt-BR", "ja", "ru"],
        help="Opt in to one language's translated Debian manuals (staging only)",
    )
    ingest.add_argument("--in-container", action="store_true", help=argparse.SUPPRESS)

    activation = sub.add_parser(
        "activate", help="Resume activation of an uploaded release without re-ingestion"
    )
    activation.add_argument("--release-id", required=True)
    activation.add_argument("--stage", choices=["staging", "prod"], default="staging")
    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        activation_timeout_seconds()
        ingest_activation_deadline()
    except ValueError as exc:
        _log("ingest_error", error=str(exc))
        return 2

    if args.cmd == "activate":
        url = os.environ.get("CONVEX_HTTP_URL") or os.environ.get("CONVEX_URL")
        secret = os.environ.get("CONVEX_INGEST_SECRET")
        if not url or not secret:
            _log("ingest_error", error="Missing Convex URL or ingest secret")
            return 2
        try:
            client = ConvexIngestClient(url, secret)
            client.require_deployed_contract()
            result = client.activate_release(
                {
                    "datasetReleaseId": args.release_id,
                    "stage": args.stage,
                    "activatedAt": iso_utc_now(),
                }
            )
        except (RuntimeError, ValueError) as exc:
            _log("ingest_error", error=str(exc))
            return 2
        _log("activation_done", **result)
        return 0

    if args.cmd == "ingest":
        opt_in = "--debian-translation" if args.debian_translation else "--debian-full"
        if (args.debian_full or args.debian_translation) and os.environ.get(
            "BETTERMAN_DATASET_STAGE", "staging"
        ).strip().lower() == "prod":
            _log(
                "ingest_error",
                error=f"{opt_in} cannot use stage prod; ingest to staging "
                "and use the gated promotion workflow",
            )
            return 2
        if args.debian_translation and (
            args.distro != "debian" or args.debian_full or args.in_container
        ):
            _log(
                "ingest_error",
                error="--debian-translation needs --distro debian and its own host run, "
                "not --debian-full or --in-container",
            )
            return 2
        activate = bool(args.activate) if args.activate is not None else (not args.sample)
        if args.debian_translation:
            return _run_ingest(
                sample=args.sample,
                activate=activate,
                distro="debian",
                image_ref="deb-archives",
                image_digest="pinned",
                translation=args.debian_translation,
            )
        if (
            args.distro == "debian"
            and args.debian_full
            and not args.sample
            and not args.in_container
        ):
            return _run_ingest(
                sample=False,
                activate=activate,
                distro="debian",
                image_ref="deb-archives",
                image_digest="pinned",
                archive_mode=True,
            )
        if args.in_container:
            return _run_ingest_in_container(
                sample=args.sample,
                activate=activate,
                distro=args.distro,
            )

        if args.distro in {"freebsd", "macos"}:
            return _run_ingest_on_host(
                sample=args.sample,
                activate=activate,
                distro=args.distro,
            )

        return run_ingest_container(sample=args.sample, activate=activate, distro=args.distro)

    raise AssertionError("unreachable")


def _run_ingest_in_container(*, sample: bool, activate: bool, distro: str) -> int:
    image_ref = os.environ.get("BETTERMAN_IMAGE_REF")
    image_digest = os.environ.get("BETTERMAN_IMAGE_DIGEST")
    if not image_ref or not image_digest:
        _log("ingest_error", error="Missing BETTERMAN_IMAGE_REF / BETTERMAN_IMAGE_DIGEST")
        return 2
    return _run_ingest(
        sample=sample,
        activate=activate,
        distro=distro,
        image_ref=image_ref,
        image_digest=image_digest,
    )


def _run_ingest_on_host(*, sample: bool, activate: bool, distro: str) -> int:
    return _run_ingest(
        sample=sample,
        activate=activate,
        distro=distro,
        image_ref=os.environ.get("BETTERMAN_IMAGE_REF", f"host:{distro}"),
        image_digest=os.environ.get("BETTERMAN_IMAGE_DIGEST", "unknown"),
    )


def _run_ingest(
    *,
    sample: bool,
    activate: bool,
    distro: str,
    image_ref: str,
    image_digest: str,
    archive_mode: bool = False,
    translation: str | None = None,
) -> int:
    convex_url = os.environ.get("CONVEX_HTTP_URL") or os.environ.get("CONVEX_URL")
    ingest_secret = os.environ.get("CONVEX_INGEST_SECRET")
    dataset_stage = os.environ.get("BETTERMAN_DATASET_STAGE", "staging")
    if not convex_url or not ingest_secret:
        _log("ingest_error", error="Missing CONVEX_HTTP_URL/CONVEX_URL or CONVEX_INGEST_SECRET")
        return 2

    repo_root = Path(__file__).resolve().parents[2]
    git_sha = os.environ.get("BETTERMAN_INGEST_GIT_SHA") or _git_sha(repo_root)

    try:
        ingest_function = ingest_dataset
        if archive_mode:
            from ingestion.debian_publish import ingest_debian

            ingest_function = ingest_debian
        if translation:
            from functools import partial

            from ingestion.debian_translations import ingest_debian_translation

            ingest_function = partial(ingest_debian_translation, locale=translation)
        result = ingest_function(
            sample=sample,
            activate=activate,
            convex_url=convex_url,
            ingest_secret=ingest_secret,
            dataset_stage=dataset_stage,
            image_ref=image_ref,
            image_digest=image_digest,
            git_sha=git_sha,
            distro=distro,
        )
    except (RuntimeError, ValueError) as exc:
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


def _git_sha(repo_root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=repo_root,
            text=True,
        ).strip()
    except Exception:  # noqa: BLE001
        return "unknown"


if __name__ == "__main__":
    raise SystemExit(main())
