from __future__ import annotations

import argparse


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="betterman-ingestion")
    sub = parser.add_subparsers(dest="cmd", required=True)

    ingest = sub.add_parser("ingest", help="Ingest man pages into Postgres")
    ingest.add_argument("--sample", action="store_true", help="Ingest a small sample set")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.cmd == "ingest":
        if args.sample:
            print("TODO: sample ingestion (scaffold)")
        else:
            print("TODO: full ingestion (scaffold)")
        return 0

    raise AssertionError("unreachable")


if __name__ == "__main__":
    raise SystemExit(main())
