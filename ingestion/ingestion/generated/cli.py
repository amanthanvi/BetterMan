"""Generated-layer commands.

    python -m ingestion.generated.cli fetch-tldr --dest DIR
    python -m ingestion.generated.cli coverage --cache DIR --tldr DIR
    python -m ingestion.generated.cli run --source convex --distro debian --dry-run

Without a generation key, `run` only estimates model text; page and tldr
examples are still built. `--dry-run` writes nothing at all.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import logging
import os
import subprocess
import sys
from collections import Counter
from collections.abc import Iterable, Iterator
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path

from ingestion.db import iso_utc_now, json_dumps
from ingestion.generated.budget import (
    BudgetConfig,
    BudgetGovernor,
    BudgetPaused,
    Checkpoint,
    token_cost,
)
from ingestion.generated.page import PageInput
from ingestion.generated.pipeline import (
    Deterministic,
    Generator,
    ResultCache,
    build_record,
    deterministic,
    examples_needed,
    generation_allowed,
)
from ingestion.generated.prompt import PROMPT_VERSION, build_messages
from ingestion.generated.provider import OpenAICompatibleProvider, ProviderConfig
from ingestion.generated.safety import is_destructive
from ingestion.generated.selector import INDEXED_SECTIONS, Candidate, Priority, select
from ingestion.generated.tldr import TLDR_COMMIT, TldrIndex, fetch_pinned

logger = logging.getLogger("betterman.generated")
DISTROS = ["debian", "ubuntu", "fedora", "arch", "alpine", "freebsd", "macos"]
# Output tokens assumed per request for estimates; responses are about 300-450.
ESTIMATED_OUTPUT_TOKENS = 450
# Go refused requests at about 8 concurrent agents; stay well below that.
DEFAULT_CONCURRENCY = 3
MAX_CONCURRENCY = 4
# Pages whose content a Convex dry run reads before it extrapolates.
DRY_RUN_INPUT_SAMPLE = 50


def _log(event: str, **fields: object) -> None:
    logger.info(json_dumps({"ts": iso_utc_now(), "event": event, **fields}))


# --- cached mandoc HTML (<cache>/<distro>/html/<name>.<section>.html.gz) ---


def _parse_cached(args: tuple[str, str]) -> PageInput | None:
    from ingestion.mandoc_parser import parse_mandoc_html

    distro, path = args
    stem = Path(path).name.removesuffix(".html.gz")
    name, _, section = stem.rpartition(".")
    if not name:
        return None
    raw = Path(path).read_bytes()
    try:
        parsed = parse_mandoc_html(gzip.decompress(raw).decode("utf-8", errors="replace"))
    except Exception:  # noqa: BLE001 - a broken cached page is skipped and counted
        return None
    return PageInput(
        distro=distro,
        name=name,
        section=section,
        # The cache has no roff source; the HTML hash stands in for it.
        content_sha256=hashlib.sha256(raw).hexdigest(),
        description=parsed.description,
        synopsis=parsed.synopsis or [],
        options=[option.model_dump() for option in parsed.options or []],
        doc=parsed.doc.model_dump(),
    )


def cached_pages(cache: Path, distro: str, *, workers: int | None = None) -> Iterator[PageInput]:
    paths = sorted((cache / distro / "html").glob("*.html.gz"))
    jobs = [(distro, str(path)) for path in paths]
    with ProcessPoolExecutor(max_workers=workers or min(8, os.cpu_count() or 1)) as pool:
        for page in pool.map(_parse_cached, jobs, chunksize=32):
            if page is not None:
                yield page


# --- coverage report ---


def coverage(pages: Iterable[PageInput], tldr: TldrIndex) -> dict:
    counts: Counter[str] = Counter()
    reasons: Counter[str] = Counter()
    rejected_flags: Counter[str] = Counter()
    input_tokens = 0
    need_by_tier: Counter[str] = Counter()
    for page in pages:
        counts["pages"] += 1
        indexed = page.section in INDEXED_SECTIONS
        command = page.section in {"1", "8", "6"}
        counts["commandPages"] += command
        counts["indexedPages"] += indexed
        counts["pagesWithOptions"] += bool(page.table)
        det = deterministic(page, tldr)
        counts["pagesWithOwnExamples"] += bool(det.page_examples)
        counts["ownExamples"] += len(det.page_examples)
        if det.tldr is not None:
            counts["tldrMappedPages"] += 1
            total = det.tldr.verified + len(det.tldr.rejected)
            counts["tldrExamplesSeen"] += total
            counts["tldrExamplesVerified"] += det.tldr.verified
            counts["tldrExamplesKept"] += len(det.tldr.examples)
            counts["tldrExamplesRejected"] += len(det.tldr.rejected)
            counts["tldrPagesWithVerifiedExample"] += bool(det.tldr.examples)
            counts["tldrPagesAllRejected"] += total > 0 and not det.tldr.examples
            for _, problems in det.tldr.rejected:
                for problem in problems:
                    reasons[_reason(problem)] += 1
                    if problem.startswith("unknown flag "):
                        rejected_flags[problem.split()[2]] += 1
        if indexed:
            need = examples_needed(page, det)
            counts["indexedPagesAtTarget"] += det.example_count >= 3
            need_by_tier["examplesToGenerate"] += need
            need_by_tier["pagesNeedingExamples"] += need > 0
            messages = build_messages(
                page,
                invocation=page.name,
                example_count=min(5, need + 2) if need else 0,
                avoid=det.commands()[:5],
            )
            input_tokens += sum(len(m["content"]) for m in messages) // 4 + 16
    indexed = counts["indexedPages"] or 1
    mean_in = input_tokens / indexed
    per_page = token_cost(int(mean_in), ESTIMATED_OUTPUT_TOKENS)
    return {
        "tldrCommit": tldr.commit,
        "counts": dict(counts),
        "gaps": dict(need_by_tier),
        "tldrRejectionReasons": dict(reasons.most_common()),
        "topRejectedFlags": dict(rejected_flags.most_common(15)),
        "estimate": {
            "indexedPages": counts["indexedPages"],
            "meanInputTokens": round(mean_in),
            "assumedOutputTokens": ESTIMATED_OUTPUT_TOKENS,
            "offPeakUsdPerPage": round(per_page, 6),
            "offPeakUsdOneAttempt": round(per_page * counts["indexedPages"], 2),
        },
    }


def _reason(problem: str) -> str:
    if problem.startswith("unknown flag"):
        return "unknown flag"
    if problem.startswith("does not run"):
        return "does not run the command"
    return problem


# --- run ---


def _load_tldr(args: argparse.Namespace) -> TldrIndex | None:
    if args.no_tldr:
        return None
    root = Path(args.tldr) if args.tldr else fetch_pinned(Path(args.work) / "tldr-pages")
    return TldrIndex.load(root, commit=TLDR_COMMIT)


def _estimate_usd(page: PageInput, det: Deterministic) -> float:
    need = examples_needed(page, det)
    messages = build_messages(
        page,
        invocation=page.name,
        example_count=min(5, need + 2) if need else 0,
        avoid=det.commands()[:5],
    )
    tokens = sum(len(m["content"]) for m in messages) // 4 + 16
    return token_cost(tokens, ESTIMATED_OUTPUT_TOKENS)


def _concurrency() -> int:
    raw = os.environ.get("BETTERMAN_GEN_CONCURRENCY") or DEFAULT_CONCURRENCY
    return max(1, min(int(raw), MAX_CONCURRENCY))


def _candidates_from_cache(
    cache: Path, distro: str
) -> tuple[list[Candidate], dict[str, PageInput]]:
    inputs = {page.content_sha256: page for page in cached_pages(cache, distro)}
    candidates = [
        Candidate(p.name, p.section, p.content_sha256, p.source_package, bool(p.table))
        for p in inputs.values()
    ]
    return candidates, inputs


def run(args: argparse.Namespace) -> int:
    provider_config = ProviderConfig.from_env()
    dry_run = args.dry_run
    llm = not args.no_llm
    if llm and not provider_config.has_key and not dry_run:
        # Page and tldr examples cost nothing; model text is only estimated.
        _log("generation_estimate_only", reason="no generation API key configured")
    tldr = _load_tldr(args)
    priority = Priority.load(Path(args.priority) if args.priority else None)
    sections = tuple(args.sections.split(",")) if args.sections else INDEXED_SECTIONS

    store = None
    remote: dict[str, object] = {}
    if args.source == "convex":
        from ingestion.convex_client import ConvexIngestClient
        from ingestion.generated.store import GeneratedStore

        client = ConvexIngestClient(
            http_url=os.environ.get("CONVEX_HTTP_URL") or os.environ.get("CONVEX_URL", ""),
            ingest_secret=os.environ.get("CONVEX_INGEST_SECRET", ""),
        )
        store = GeneratedStore(client)
        store.require_contract()
        candidates = []
        for section in sections:
            for item in store.candidates(stage=args.stage, distro=args.distro, section=section):
                candidates.append(item.candidate)
                remote[item.candidate.content_sha256] = item
        inputs: dict[str, PageInput] = {}
    else:
        if not args.cache:
            raise SystemExit("--cache is required with --source cache")
        candidates, inputs = _candidates_from_cache(Path(args.cache), args.distro)

    chosen = select(candidates, priority=priority, sections=sections, limit=args.limit)
    cache = ResultCache(Path(args.cache_dir) if args.cache_dir else None)
    checkpoint = Checkpoint.load(Path(args.checkpoint) if args.checkpoint else None)
    governor = BudgetGovernor(BudgetConfig.from_env(), checkpoint)
    generator = None
    concurrency = _concurrency()
    if llm and not dry_run and provider_config.has_key:
        generator = Generator(OpenAICompatibleProvider(provider_config), governor)

    totals: Counter[str] = Counter()
    estimated_usd = 0.0
    sampled = 0
    # Unchanged rows whose pages (e.g. in a new release) lack B7 flag counts.
    stale_usage: list[str] = []
    records: list[dict] = []
    out = open(args.out, "w", encoding="utf-8") if args.out else None  # noqa: SIM115
    paused: BudgetPaused | None = None
    try:
        for start in range(0, len(chosen), 50):
            batch = chosen[start : start + 50]
            todo = []
            for candidate in batch:
                state = remote.get(candidate.content_sha256)
                # An operator-suppressed part, or a destructive command that
                # never gets model text, counts as fresh: never pay for it.
                fresh_llm = state is not None and (
                    is_destructive(candidate.name)
                    or "generated" in state.suppressed
                    or (
                        state.prompt_version is not None
                        and (not args.refresh_prompt or state.prompt_version == PROMPT_VERSION)
                    )
                )
                fresh_tldr = state is not None and (
                    "tldr" in state.suppressed
                    or state.tldr_commit == (tldr.commit if tldr else None)
                )
                # Without model calls this run (none wanted, paused, or no key)
                # a row whose page and tldr parts are current needs nothing.
                no_model = not llm or paused is not None or (generator is None and not dry_run)
                if (
                    state is not None
                    and state.has_record
                    and not getattr(args, "refresh_page", False)
                    and fresh_tldr
                    and (fresh_llm or no_model)
                ):
                    totals["skippedUnchanged"] += 1
                    if not state.flag_usage_current:
                        stale_usage.append(candidate.content_sha256)
                    continue
                todo.append((candidate, fresh_llm))
            if store is not None and dry_run and sampled >= DRY_RUN_INPUT_SAMPLE:
                # A dry run reads a bounded sample and extrapolates the rest.
                totals["extrapolated"] += len(todo)
                if llm:
                    # A page refresh also selects rows whose model text is current.
                    unpaid = sum(1 for _, fresh_llm in todo if not fresh_llm)
                    mean = estimated_usd / max(1, totals["wouldGenerate"])
                    estimated_usd += mean * unpaid
                    totals["wouldGenerate"] += unpaid
                continue
            if store is not None and todo:
                for page in store.inputs(
                    stage=args.stage, distro=args.distro, pages=[c for c, _ in todo]
                ):
                    inputs[page.content_sha256] = page
                sampled += len(todo)
            prepared = []
            for candidate, fresh_llm in todo:
                page = inputs.pop(candidate.content_sha256, None)
                if page is None:
                    totals["missingInput"] += 1
                    continue
                det = deterministic(page, tldr)
                generated = cache.get(page.content_sha256)
                if generated is not None:
                    totals["cacheHits"] += 1
                want_llm = llm and generated is None and not fresh_llm
                if want_llm and not generation_allowed(page):
                    want_llm = False
                    totals["destructiveSkipped"] += 1
                if want_llm and generator is None:
                    estimated_usd += _estimate_usd(page, det)
                    totals["wouldGenerate"] += 1
                prepared.append([page, det, generated, fresh_llm, want_llm])
            if generator is not None and paused is None:
                work = [item for item in prepared if item[4]]

                def generate(item: list) -> None:
                    nonlocal paused
                    if paused is not None:
                        return
                    try:
                        item[2] = generator.generate(item[0], item[1])
                    except BudgetPaused as exc:
                        paused = paused or exc

                with ThreadPoolExecutor(max_workers=concurrency) as pool:
                    list(pool.map(generate, work))
                for item in work:
                    if item[2] is not None:
                        cache.put(item[0].content_sha256, item[2])
                        totals["generated"] += 1
                if paused is not None:
                    _log("generation_paused", reason=paused.reason, resumeAt=paused.resume_at)
            for page, det, generated, fresh_llm, _ in prepared:
                record = build_record(
                    page, det, generated, tldr_commit=tldr.commit if tldr else None
                )
                if fresh_llm:
                    # Keep the stored generated part; this upsert refreshes the rest.
                    record.pop("generated", None)
                records.append(record)
                if out:
                    out.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
                totals["records"] += 1
            if store is not None and records and not dry_run and not args.no_write:
                result = store.upsert(records)
                totals["inserted"] += result["inserted"]
                totals["updated"] += result["updated"]
            records = []
    finally:
        if out:
            out.close()
        checkpoint.save()
    if store is not None and stale_usage and not dry_run and not args.no_write:
        totals["flagUsageScheduled"] = store.propagate_flag_usage(stale_usage)
    if store is not None and store.skipped:
        totals["inputTooLarge"] = len(store.skipped)
        _log("generation_inputs_skipped", pages=store.skipped[:20])
    summary: dict[str, object] = {
        "dryRun": dry_run,
        "selected": len(chosen),
        **totals,
        "promptVersion": PROMPT_VERSION,
        "model": provider_config.model,
        "provider": provider_config.provider,
    }
    if generator is not None:
        summary["requests"] = generator.stats.requests
        summary["runUsd"] = round(governor.run_spend, 4)
        summary["rejectedExamples"] = dict(generator.stats.rejected_examples)
        summary["invalidResponses"] = dict(generator.stats.invalid_responses)
        summary["failedPages"] = generator.stats.failed_pages
        summary["finishReasons"] = dict(generator.stats.finish_reasons)
        summary["contentShapes"] = dict(generator.stats.content_shapes)
    else:
        summary["estimatedOffPeakUsd"] = round(estimated_usd, 4)
    if paused is not None:
        summary["paused"] = str(paused)
    _log("generation_summary", **summary)
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(prog="betterman-generated")
    sub = parser.add_subparsers(dest="cmd", required=True)

    fetch = sub.add_parser("fetch-tldr", help="Fetch the pinned tldr-pages commit")
    fetch.add_argument("--dest", required=True)

    cov = sub.add_parser("coverage", help="tldr coverage and cost over cached mandoc HTML")
    cov.add_argument("--cache", required=True, help="<cache>/<distro>/html/*.html.gz")
    cov.add_argument("--tldr", required=True, help="tldr-pages checkout")
    cov.add_argument("--distro", action="append", choices=DISTROS)
    cov.add_argument("--out")

    run_p = sub.add_parser("run", help="Build generated-layer records")
    run_p.add_argument("--source", choices=["convex", "cache"], default="convex")
    run_p.add_argument("--cache", help="cached mandoc HTML root, for --source cache")
    run_p.add_argument("--distro", choices=DISTROS, default="debian")
    run_p.add_argument("--stage", choices=["staging", "prod"], default="staging")
    run_p.add_argument("--sections", help=f"comma list, default {','.join(INDEXED_SECTIONS)}")
    run_p.add_argument("--priority", help="priority list: name, name(section) or pkg:name")
    run_p.add_argument("--limit", type=int)
    run_p.add_argument("--tldr", help="tldr-pages checkout; default fetches the pinned commit")
    run_p.add_argument("--no-tldr", action="store_true")
    run_p.add_argument("--no-llm", action="store_true", help="tldr and page examples only")
    run_p.add_argument(
        "--refresh-page",
        action="store_true",
        help="rebuild page and tldr examples on existing rows",
    )
    run_p.add_argument("--dry-run", action="store_true", help="no model calls and no writes")
    run_p.add_argument("--no-write", action="store_true", help="call the model but do not upload")
    run_p.add_argument(
        "--refresh-prompt",
        action="store_true",
        help=f"regenerate records made with a prompt other than {PROMPT_VERSION}",
    )
    run_p.add_argument("--checkpoint", help="budget ledger, carried between runs")
    run_p.add_argument("--cache-dir", help="generated parts by content hash")
    run_p.add_argument("--work", default=".generated-work")
    run_p.add_argument("--out", help="also write records as JSONL")

    restore = sub.add_parser(
        "restore-ledger", help="Recover the budget ledger from earlier default-branch runs"
    )
    restore.add_argument("--repo", required=True)
    restore.add_argument("--branch", required=True)
    restore.add_argument("--dest", required=True)

    args = parser.parse_args(argv)
    if args.cmd == "restore-ledger":
        from ingestion.generated import ledger

        try:
            inventory = ledger.gh_artifacts(args.repo, branch=args.branch)
            artifacts = ledger.parse_artifacts(inventory, branch=args.branch)
            outcome = ledger.recover(
                artifacts, fetch=ledger.gh_fetch(args.repo), dest=Path(args.dest)
            )
        except (
            ledger.LedgerRecoveryError,
            subprocess.CalledProcessError,
            ValueError,
            KeyError,
        ) as exc:
            _log("ledger_recovery_failed", error=str(exc))
            return 1
        _log("ledger_recovery", outcome=outcome)
        return 0
    if args.cmd == "fetch-tldr":
        fetch_pinned(Path(args.dest))
        _log("tldr_fetched", commit=TLDR_COMMIT, dest=args.dest)
        return 0
    if args.cmd == "coverage":
        tldr = TldrIndex.load(Path(args.tldr))
        report = {}
        for distro in args.distro or ["debian"]:
            report[distro] = coverage(cached_pages(Path(args.cache), distro), tldr)
            _log("tldr_coverage", distro=distro, **report[distro]["counts"])
        text = json.dumps(report, indent=2, sort_keys=True)
        if args.out:
            Path(args.out).write_text(text + "\n", encoding="utf-8")
        else:
            sys.stdout.write(text + "\n")
        return 0
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
