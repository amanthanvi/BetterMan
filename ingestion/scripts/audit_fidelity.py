"""Audit cached mandoc HTML locally; never constructs clients or writes datasets.

From the repository root (no package-script entry is needed):
  PYTHONPATH=ingestion ingestion/.venv/bin/python ingestion/scripts/audit_fidelity.py \
    --cache /tmp/issue416/out --baseline /tmp/issue416b/baseline_mandoc_parser.py \
    --output /tmp/issue416b/final.jsonl

All cached *.html.gz files are checked, including unchanged pages.
Exact equality is independent of diagnostic alignment: above 40k tokens,
autojunk=True finds equal anchors, then differing partitions are refined with
autojunk=False. Character-identical partitions use linear boundary grouping;
huge unsplittable partitions are explicitly reported and excluded from diff counts. Exit 1 means
residual fidelity findings, 2 means a parse/read error. JSONL retains every page;
its sibling .summary.json aggregates counts. Baseline and candidate are identified by
path and SHA256 in the summary. Use snapshots when another worker may edit them.
There is no token-count skip or sampling cap.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import json
import sys
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from fidelity import (
    TOKENS,
    body_text,
    check_fidelity,
    inline_text,
    loose_runs,
    walk_blocks,
)  # noqa: E402

BASELINE = CANDIDATE = None


def load_parser(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def initialize(baseline: str, candidate: str) -> None:
    global BASELINE, CANDIDATE
    BASELINE = load_parser("fidelity_baseline", baseline)
    CANDIDATE = load_parser("fidelity_candidate", candidate)


def identities(doc: dict) -> list[tuple[str, str]]:
    result = []
    for block in walk_blocks(doc["blocks"]):
        if block["type"] in {"heading", "code_block"} and block.get("id"):
            result.append((block["type"], block["id"]))
        elif block["type"] == "definition_list":
            result.extend(("definition", item["id"]) for item in block["items"])
    return result


def measure(html: str, parsed, runs: list[str]) -> dict:
    doc = parsed.doc.model_dump()
    result = check_fidelity(html, doc)
    text = TOKENS.findall(body_text(doc["blocks"]))
    # This diagnostic counts contiguous retained runs; page alignment is the
    # multiplicity-sensitive guard when identical prose recurs elsewhere.
    result["loose_runs_missing"] = sum(
        not any(text[i : i + len(tokens)] == tokens for i in range(len(text) - len(tokens) + 1))
        for run in runs
        if (tokens := TOKENS.findall(run))
    )
    result["bullet_paragraphs"] = sum(
        inline_text(block["inlines"]).strip().startswith(("•", "·"))
        for block in walk_blocks(doc["blocks"])
        if block["type"] == "paragraph"
    )
    result["docbook_bullet_paragraphs"] = result["bullet_paragraphs"] if result["docbook"] else 0
    return result


def audit(path: str) -> dict:
    row = {"path": path, "distro": Path(path).parents[1].name}
    try:
        raw = Path(path).read_bytes()
        html = gzip.decompress(raw).decode("utf-8")
        row["html_gz_sha256"] = hashlib.sha256(raw).hexdigest()
        runs = loose_runs(html)
        row["loose_runs"] = len(runs)
        old = BASELINE.parse_mandoc_html(html)
        new = CANDIDATE.parse_mandoc_html(html)
        before, after = old.doc.model_dump(), new.doc.model_dump()
        row["before"] = measure(html, old, runs)
        row["after"] = row["before"] if before == after else measure(html, new, runs)
        row["ids_order_equal"] = identities(before) == identities(after)
        row["toc_equal"] = before["toc"] == after["toc"]
        row["option_tuples_equal"] = [
            (o.flags, o.argument, o.anchorId) for o in old.options or []
        ] == [(o.flags, o.argument, o.anchorId) for o in new.options or []]
        row["option_anchors_equal"] = [o.anchorId for o in old.options or []] == [
            o.anchorId for o in new.options or []
        ]
        row["option_count_before"] = len(old.options or [])
        row["option_count_after"] = len(new.options or [])
        row["option_rows_changed"] = sum(
            (a.flags, a.argument) != (b.flags, b.argument)
            for a, b in zip(old.options or [], new.options or [], strict=False)
        )
        row["plain_text_equal"] = old.plain_text == new.plain_text
        row["doc_equal"] = before == after
    except Exception as exc:  # Report individual failures and continue the corpus.
        row["error"] = f"{type(exc).__name__}: {str(exc)[:200]}"
    return row


def count_row(counts: Counter, row: dict) -> None:
    counts["pages"] += 1
    if "error" in row:
        counts["errors"] += 1
        return
    counts["loose_run_pages"] += bool(row["loose_runs"])
    counts["loose_runs"] += row["loose_runs"]
    for key in (
        "ids_order_equal",
        "toc_equal",
        "option_tuples_equal",
        "plain_text_equal",
        "doc_equal",
    ):
        counts[key + "_changed"] += not row[key]
    counts["option_anchor_order_changes"] += not row["option_anchors_equal"]
    counts["option_count_change_pages"] += row["option_count_before"] != row["option_count_after"]
    counts["option_count_before"] += row["option_count_before"]
    counts["option_count_after"] += row["option_count_after"]
    counts["option_rows_changed"] += row["option_rows_changed"]
    for label in ("before", "after"):
        result = row[label]
        for key in (
            "definitions_checked",
            "definitions_without_source_id",
            "normalized_markers",
            "loose_runs_missing",
            "bullet_paragraphs",
            "docbook_bullet_paragraphs",
        ):
            counts[f"{label}_{key}"] += result[key]
        counts[f"{label}_loose_runs_missing_pages"] += bool(result["loose_runs_missing"])
        counts[f"{label}_bullet_paragraph_pages"] += bool(result["bullet_paragraphs"])
        counts[f"{label}_docbook_bullet_paragraph_pages"] += bool(
            result["docbook_bullet_paragraphs"]
        )
        counts[f"{label}_perdef_pages"] += bool(result["definitions"])
        counts[f"{label}_perdef_failures"] += len(result["definitions"])
        page = result["page"]
        counts[f"{label}_alignment_unresolved_partitions"] += len(page["unresolved_partitions"])
        counts[f"{label}_alignment_pages"] += not page["equal"]
        for key in ("missing", "extra", "whitespace"):
            counts[f"{label}_alignment_{key}"] += page[key]
            counts[f"{label}_alignment_{key}_pages"] += bool(page[key])


def audit_exit_status(counts: Counter) -> int:
    if counts["errors"]:
        return 2
    return int(
        any(
            counts[key]
            for key in (
                "after_alignment_pages",
                "after_perdef_pages",
                "ids_order_equal_changed",
                "toc_equal_changed",
                "option_anchor_order_changes",
                "option_count_change_pages",
                "plain_text_equal_changed",
            )
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument(
        "--candidate",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "ingestion/mandoc_parser.py",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be positive")
    paths = sorted(str(path) for path in args.cache.glob("*/html/*.html.gz"))
    if not paths:
        parser.error("--cache contains no */html/*.html.gz files")
    summary = {"cache": str(args.cache.resolve()), "expected_pages": len(paths)}
    for label in ("baseline", "candidate"):
        path = getattr(args, label).resolve()
        summary[label] = {
            "path": str(path),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
    counts = Counter()
    distros = {}
    with ProcessPoolExecutor(
        max_workers=args.workers,
        initializer=initialize,
        initargs=(str(args.baseline.resolve()), str(args.candidate.resolve())),
    ) as pool:
        with args.output.open("x") as output:
            for index, row in enumerate(pool.map(audit, paths, chunksize=8), 1):
                output.write(json.dumps(row, ensure_ascii=False) + "\n")
                output.flush()
                count_row(counts, row)
                count_row(distros.setdefault(row["distro"], Counter()), row)
                if index % 500 == 0:
                    print(f"Audited {index}/{len(paths)}", flush=True)
    summary.update(counts=dict(counts), distros={k: dict(v) for k, v in distros.items()})
    args.output.with_suffix(".summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return audit_exit_status(counts)


if __name__ == "__main__":
    raise SystemExit(main())
