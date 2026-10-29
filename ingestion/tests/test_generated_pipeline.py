from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from generated_fixtures import TAR_TLDR, golden_page, tldr_tree

from ingestion.generated import cli
from ingestion.generated.budget import BudgetConfig, BudgetGovernor, BudgetPaused, Checkpoint
from ingestion.generated.pipeline import (
    GeneratedPart,
    Generator,
    ResultCache,
    build_record,
    deterministic,
    examples_needed,
)
from ingestion.generated.provider import (
    Completion,
    Provider,
    ProviderConfig,
    ProviderError,
    UsageLimitExceeded,
)
from ingestion.generated.selector import Candidate, Priority, select
from ingestion.generated.store import GeneratedStore
from ingestion.generated.tldr import TldrIndex

SATURDAY = datetime(2026, 10, 31, 12, tzinfo=UTC).timestamp()
SHA = "a" * 64
COMMIT = "0" * 40


def tar(sha: str = SHA):
    return golden_page("tar.1", name="tar", sha=sha)


def answer(
    examples, summary="Creates, lists and extracts files in tape or disk archives.", phrases=None
):
    return json.dumps(
        {
            "summary": summary,
            "examples": [{"description": d, "command": c} for d, c in examples],
            "taskPhrases": phrases
            or ["extract a tar file", "create a tar archive", "list archive contents"],
        }
    )


class FakeProvider(Provider):
    def __init__(self, *replies):
        self.config = ProviderConfig(provider="fake", model="fake-model", api_key="k")
        self.replies = list(replies)
        self.calls = []

    def send(self, messages, *, max_tokens):
        self.calls.append(messages)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return Completion(text=reply, prompt_tokens=900, completion_tokens=300)


def make_generator(provider, tmp_path: Path | None = None, **budget):
    clock = {"now": SATURDAY}
    checkpoint = Checkpoint.load(tmp_path / "ck.json" if tmp_path else None)
    governor = BudgetGovernor(
        BudgetConfig(**budget), checkpoint, clock=lambda: clock["now"], sleep=lambda s: None
    )
    return Generator(provider, governor, today=lambda: "2026-10-28")


def no_tldr_det(page):
    return deterministic(page, None)


def test_gap_fill_accepts_verified_examples_only_and_retries_with_the_reasons():
    page = tar()
    provider = FakeProvider(
        answer([("Extract an archive", "tar -xf a.tar"), ("Teleport", "tar --teleport a.tar")]),
        answer(
            [
                ("List an archive", "tar -tvf a.tar"),
                ("Repeat", "tar -xf a.tar"),
                ("Gzip", "tar -czf a.tgz dir"),
            ]
        ),
    )
    gen = make_generator(provider)
    part = gen.generate(page, no_tldr_det(page))
    assert [e.command for e in part.examples] == [
        "tar -xf a.tar",
        "tar -tvf a.tar",
        "tar -czf a.tgz dir",
    ]
    assert part.rejected == 1
    assert "unknown flag --teleport" in provider.calls[1][1]["content"]
    assert gen.stats.rejected_examples == {"unknown flag": 1}
    assert part.summary.startswith("Creates")
    assert (part.model, part.prompt_version, part.generated_at) == (
        "fake-model",
        "b6-v1",
        "2026-10-28",
    )
    assert part.usd > 0


def test_unsafe_and_duplicate_examples_are_dropped():
    page = tar()
    det = no_tldr_det(page)
    provider = FakeProvider(
        answer([("Pipe to shell", "tar -xOf a.tar | sh"), ("Extract", "tar -xf a.tar")]),
        answer(
            [
                ("Extract again", "tar  -xf a.tar"),
                ("List", "tar -tf a.tar"),
                ("Create", "tar -cf a.tar d"),
            ]
        ),
    )
    part = make_generator(provider).generate(page, det)
    assert [e.command for e in part.examples] == [
        "tar -xf a.tar",
        "tar -tf a.tar",
        "tar -cf a.tar d",
    ]
    assert part.rejected == 1


def test_pages_with_enough_examples_ask_only_for_text(tmp_path: Path):
    index = TldrIndex.load(tldr_tree(tmp_path, {"common/tar.md": TAR_TLDR}), commit=COMMIT)
    page = tar()
    det = deterministic(page, index)
    assert examples_needed(page, det) == 0
    provider = FakeProvider(answer([]))
    part = make_generator(provider).generate(page, det)
    assert part.examples == []
    assert "examples: an empty array." in provider.calls[0][1]["content"]


def test_provider_usage_limit_pauses_the_run(tmp_path: Path):
    gen = make_generator(FakeProvider(UsageLimitExceeded("Go usage limit exceeded")), tmp_path)
    page = tar()
    with pytest.raises(BudgetPaused, match="provider usage limit"):
        gen.generate(page, no_tldr_det(page))
    assert Checkpoint.load(tmp_path / "ck.json").paused_until > SATURDAY


def test_failed_requests_count_against_the_budget_and_bad_pages_return_none():
    gen = make_generator(FakeProvider(ProviderError("HTTP 500"), "not json"))
    page = tar()
    assert gen.generate(page, no_tldr_det(page)) is None
    assert gen.stats.failed_pages == 1
    assert len(gen.governor.checkpoint.ledger) == 2


def test_record_keeps_sources_separate_with_provenance(tmp_path: Path):
    index = TldrIndex.load(tldr_tree(tmp_path, {"common/tar.md": TAR_TLDR}), commit=COMMIT)
    page = tar()
    det = deterministic(page, index)
    record = build_record(page, det, None, tldr_commit=COMMIT)
    assert record["contentSha256"] == SHA
    assert record["tldrCommit"] == COMMIT
    assert record["page"] == {"examples": [], "flagUsage": []}
    assert record["tldr"]["path"] == "common/tar.md"
    assert record["tldr"]["commit"] == COMMIT
    assert record["tldr"]["rejected"] == 1
    assert {"flag": "-f", "count": 3} in record["tldr"]["flagUsage"]
    first = record["tldr"]["examples"][0]
    assert [first["command"][a:b] for a, b in first["placeholders"]] == [
        "path/to/target.tar",
        "path/to/file1 path/to/file2 ...",
    ]
    assert "generated" not in record


def test_selector_orders_priority_then_commands_with_options():
    candidates = [
        Candidate("passwd", "5", "1" * 64),
        Candidate("zip", "1", "2" * 64, "zip", True),
        Candidate("ip", "8", "3" * 64, "iproute2", True),
        Candidate("printf", "3", "4" * 64),
        Candidate("true", "1", "5" * 64, "coreutils", False),
        Candidate("tar", "1", "6" * 64, "tar", True),
        Candidate("tar-dup", "1", "6" * 64, "tar", True),
        Candidate("bash", "1", "7" * 64, "bash", True),
    ]
    priority = Priority.parse(["# popular", "pkg:coreutils", "tar(1)"])
    names = [c.name for c in select(candidates, priority=priority)]
    assert names == ["true", "tar", "bash", "zip", "ip", "passwd"]
    assert [c.name for c in select(candidates, limit=2)] == ["bash", "tar"]


class FakeClient:
    def __init__(self):
        self.posts = []

    def _get_json(self, path):
        return {"schemaVersion": 2}

    def post(self, path, payload):
        self.posts.append((path, payload))
        if path == "/ingest/generated/candidates":
            done = payload["cursor"] is not None
            name = "tar" if done else "cpio"
            return {
                "items": [
                    {
                        "name": name,
                        "section": "1",
                        "contentSha256": name * 8,
                        "hasRecord": done,
                        "promptVersion": "b6-v1" if done else None,
                        "tldrCommit": None,
                    }
                ],
                "isDone": done,
                "continueCursor": "next",
            }
        if path == "/ingest/generated/inputs":
            return {
                "pages": [
                    {
                        "name": p["name"],
                        "section": "1",
                        "contentSha256": p["name"] * 8,
                        "options": [],
                        "doc": None,
                    }
                    for p in payload["pages"]
                ]
            }
        return {"inserted": len(payload["records"]), "updated": 0}


def test_store_pages_candidates_and_batches_writes():
    client = FakeClient()
    store = GeneratedStore(client)
    store.require_contract()
    items = list(store.candidates(stage="staging", distro="debian", section="1"))
    assert [i.candidate.name for i in items] == ["cpio", "tar"]
    assert items[1].prompt_version == "b6-v1"
    pages = store.inputs(stage="staging", distro="debian", pages=[i.candidate for i in items] * 6)
    assert len(pages) == 12 and pages[0].doc == {"toc": [], "blocks": []}
    assert pages[0].content_sha256 == "cpio" * 8
    assert store.upsert([{"contentSha256": str(i)} for i in range(30)]) == {
        "inserted": 30,
        "updated": 0,
    }
    assert [len(p["records"]) for path, p in client.posts if path == "/ingest/generated"] == [25, 5]


def test_cli_run_generates_caches_and_skips_unchanged_pages(tmp_path: Path, monkeypatch):
    tldr_root = tldr_tree(tmp_path / "tldr", {"common/tar.md": TAR_TLDR})
    page = golden_page("ls.1", name="ls", sha="b" * 64)
    monkeypatch.setattr(
        cli,
        "_candidates_from_cache",
        lambda cache, distro: (
            [Candidate(page.name, page.section, page.content_sha256, None, True)],
            {page.content_sha256: page},
        ),
    )
    provider = FakeProvider(answer([("Long list", "ls -l"), ("All", "ls -a"), ("Sizes", "ls -lh")]))
    monkeypatch.setattr(cli, "OpenAICompatibleProvider", lambda config: provider)
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "k")
    monkeypatch.setenv("BETTERMAN_GEN_ALLOW_PEAK", "1")
    out = tmp_path / "records.jsonl"
    argv = [
        "run",
        "--source",
        "cache",
        "--cache",
        str(tmp_path),
        "--tldr",
        str(tldr_root),
        "--cache-dir",
        str(tmp_path / "parts"),
        "--checkpoint",
        str(tmp_path / "ck.json"),
        "--out",
        str(out),
    ]
    assert cli.main(argv) == 0
    record = json.loads(out.read_text().splitlines()[0])
    assert record["generated"]["model"] == "fake-model"
    assert [e["command"] for e in record["generated"]["examples"]] == ["ls -l", "ls -a", "ls -lh"]
    assert Checkpoint.load(tmp_path / "ck.json").totals["requests"] == 1

    # The content hash is unchanged, so the cached part is reused with no call.
    assert cli.main(argv) == 0
    assert len(provider.calls) == 1
    again = json.loads(out.read_text().splitlines()[0])
    assert again["generated"] == record["generated"]


def test_cli_without_a_key_only_estimates_model_text(tmp_path: Path, monkeypatch, caplog):
    page = golden_page("ls.1", name="ls", sha="c" * 64)
    monkeypatch.setattr(
        cli,
        "_candidates_from_cache",
        lambda cache, distro: (
            [Candidate(page.name, page.section, page.content_sha256, None, True)],
            {page.content_sha256: page},
        ),
    )
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)
    monkeypatch.delenv("BETTERMAN_GEN_API_KEY", raising=False)
    monkeypatch.setattr(cli, "OpenAICompatibleProvider", lambda config: pytest.fail("no calls"))
    caplog.set_level("INFO")
    assert cli.main(["run", "--source", "cache", "--cache", str(tmp_path), "--no-tldr"]) == 0
    summary = next(
        json.loads(r.message) for r in caplog.records if "generation_summary" in r.message
    )
    assert summary["dryRun"] is False
    assert summary["records"] == 1
    assert summary["wouldGenerate"] == 1
    assert summary["estimatedOffPeakUsd"] >= 0


def test_result_cache_ignores_non_hash_keys(tmp_path: Path):
    cache = ResultCache(tmp_path)
    assert cache.get("../../etc/passwd") is None


def test_cli_convex_run_skips_unchanged_pages_and_dry_run_writes_nothing(monkeypatch, caplog):
    client = FakeClient()
    monkeypatch.setattr("ingestion.convex_client.ConvexIngestClient", lambda **kwargs: client)
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)
    monkeypatch.delenv("BETTERMAN_GEN_API_KEY", raising=False)
    caplog.set_level("INFO")
    base = ["run", "--source", "convex", "--sections", "1", "--no-tldr"]
    assert cli.main([*base, "--dry-run"]) == 0
    assert not any(path == "/ingest/generated" for path, _ in client.posts)
    fetched = [p["pages"] for path, p in client.posts if path == "/ingest/generated/inputs"]
    assert fetched == [[{"name": "cpio", "section": "1"}]]
    summary = next(
        json.loads(r.message) for r in caplog.records if "generation_summary" in r.message
    )
    assert summary["skippedUnchanged"] == 1

    assert cli.main([*base, "--no-llm"]) == 0
    writes = [p["records"] for path, p in client.posts if path == "/ingest/generated"]
    assert len(writes) == 1 and writes[0][0]["contentSha256"] == "cpio" * 8


def test_coverage_report_counts_tldr_and_gaps(tmp_path: Path):
    index = TldrIndex.load(tldr_tree(tmp_path, {"common/tar.md": TAR_TLDR}), commit=COMMIT)
    pages = [
        tar(),
        golden_page("ls.1", name="ls"),
        golden_page("ssh_config.5", name="ssh_config", section="5"),
    ]
    report = cli.coverage(pages, index)
    counts = report["counts"]
    assert counts["pages"] == 3 and counts["indexedPages"] == 3
    assert counts["tldrMappedPages"] == 1
    assert counts["tldrExamplesVerified"] == 3 and counts["tldrExamplesRejected"] == 1
    assert report["tldrRejectionReasons"] == {"unknown flag": 1}
    assert report["topRejectedFlags"] == {"--teleport": 1}
    # ls needs generated examples; tar has tldr's three; ssh_config has no options.
    assert report["gaps"]["pagesNeedingExamples"] == 1
    assert report["estimate"]["offPeakUsdPerPage"] > 0


def test_convex_dry_run_reads_a_bounded_sample(monkeypatch, caplog):
    class ManyPages(FakeClient):
        def post(self, path, payload):
            if path == "/ingest/generated/candidates":
                self.posts.append((path, payload))
                return {
                    "items": [
                        {
                            "name": f"p{i:03}",
                            "section": "1",
                            "contentSha256": f"p{i:03}" * 16,
                            "hasRecord": False,
                            "promptVersion": None,
                            "tldrCommit": None,
                        }
                        for i in range(120)
                    ],
                    "isDone": True,
                }
            if path == "/ingest/generated/inputs":
                self.posts.append((path, payload))
                return {
                    "pages": [
                        {
                            "name": p["name"],
                            "section": "1",
                            "contentSha256": p["name"] * 16,
                            "options": [],
                            "doc": None,
                        }
                        for p in payload["pages"]
                    ]
                }
            return super().post(path, payload)

    client = ManyPages()
    monkeypatch.setattr("ingestion.convex_client.ConvexIngestClient", lambda **kwargs: client)
    caplog.set_level("INFO")
    assert cli.main(["run", "--source", "convex", "--sections", "1", "--no-tldr", "--dry-run"]) == 0
    fetched = sum(len(p["pages"]) for path, p in client.posts if path == "/ingest/generated/inputs")
    assert fetched == 50
    summary = next(
        json.loads(r.message) for r in caplog.records if "generation_summary" in r.message
    )
    assert summary["extrapolated"] == 70
    assert summary["wouldGenerate"] == 120


def test_suppressed_parts_are_never_regenerated(monkeypatch):
    class Suppressed(FakeClient):
        def post(self, path, payload):
            if path == "/ingest/generated/candidates":
                self.posts.append((path, payload))
                return {
                    "items": [
                        {
                            "name": "tar",
                            "section": "1",
                            "contentSha256": "t" * 64,
                            "hasRecord": True,
                            "promptVersion": None,
                            "tldrCommit": None,
                            "suppressed": ["generated"],
                        }
                    ],
                    "isDone": True,
                }
            return super().post(path, payload)

    client = Suppressed()
    monkeypatch.setattr("ingestion.convex_client.ConvexIngestClient", lambda **kwargs: client)
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "k")
    monkeypatch.setattr(cli, "OpenAICompatibleProvider", lambda config: FakeProvider())
    assert cli.main(["run", "--source", "convex", "--sections", "1", "--no-tldr"]) == 0
    assert not any(path == "/ingest/generated/inputs" for path, _ in client.posts)
    # FakeProvider() has no replies: any model call would raise IndexError.


def test_cli_runs_pages_concurrently_and_stops_after_a_pause(tmp_path: Path, monkeypatch):
    import threading
    import time

    pages = [golden_page("ls.1", name="ls", sha=f"{i:064x}") for i in range(20)]
    monkeypatch.setattr(
        cli,
        "_candidates_from_cache",
        lambda cache, distro: (
            [Candidate(p.name, p.section, p.content_sha256, None, True) for p in pages],
            {p.content_sha256: p for p in pages},
        ),
    )
    reply = answer([("Long list", "ls -l"), ("All", "ls -a"), ("Sizes", "ls -lh")])

    class Concurrent(FakeProvider):
        def __init__(self):
            super().__init__()
            self.lock = threading.Lock()
            self.threads = set()

        def send(self, messages, *, max_tokens):
            with self.lock:
                self.threads.add(threading.get_ident())
                self.calls.append(messages)
                count = len(self.calls)
            if count == 5:
                raise UsageLimitExceeded("Go usage limit exceeded")
            time.sleep(0.01)  # overlap, so more than one worker runs
            return Completion(text=reply, prompt_tokens=900, completion_tokens=300)

    provider = Concurrent()
    monkeypatch.setattr(cli, "OpenAICompatibleProvider", lambda config: provider)
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "k")
    monkeypatch.setenv("BETTERMAN_GEN_ALLOW_PEAK", "1")
    monkeypatch.setenv("BETTERMAN_GEN_CONCURRENCY", "3")
    out = tmp_path / "records.jsonl"
    argv = [
        "run",
        "--source",
        "cache",
        "--cache",
        str(tmp_path),
        "--no-tldr",
        "--checkpoint",
        str(tmp_path / "ck.json"),
        "--out",
        str(out),
    ]
    assert cli.main(argv) == 0
    records = [json.loads(line) for line in out.read_text().splitlines()]
    assert len(records) == 20  # page parts still upload for every page
    generated = [r for r in records if "generated" in r]
    # Requests already in flight when Go refuses may finish; no new page starts.
    assert len(provider.calls) <= 5 + 3
    assert 4 <= len(generated) == len(provider.calls) - 1
    assert len(provider.threads) > 1
    assert Checkpoint.load(tmp_path / "ck.json").paused_until > 0


def test_pages_checked_against_the_current_tldr_commit_are_skipped(tmp_path: Path, monkeypatch):
    from ingestion.generated.tldr import TLDR_COMMIT

    tldr_root = tldr_tree(tmp_path / "tldr", {"common/tar.md": TAR_TLDR})

    class Checked(FakeClient):
        def post(self, path, payload):
            if path == "/ingest/generated/candidates":
                self.posts.append((path, payload))
                return {
                    "items": [
                        {
                            "name": "zzz",
                            "section": "1",
                            "contentSha256": "zzz" * 8,
                            "hasRecord": True,
                            "promptVersion": "b6-v1",
                            "tldrCommit": TLDR_COMMIT,
                        },
                        {
                            "name": "old",
                            "section": "1",
                            "contentSha256": "old" * 8,
                            "hasRecord": True,
                            "promptVersion": "b6-v1",
                            "tldrCommit": "1" * 40,
                        },
                    ],
                    "isDone": True,
                }
            return super().post(path, payload)

    client = Checked()
    monkeypatch.setattr("ingestion.convex_client.ConvexIngestClient", lambda **kwargs: client)
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)
    monkeypatch.delenv("BETTERMAN_GEN_API_KEY", raising=False)
    argv = ["run", "--source", "convex", "--sections", "1", "--tldr", str(tldr_root)]
    assert cli.main(argv) == 0
    fetched = [p["pages"] for path, p in client.posts if path == "/ingest/generated/inputs"]
    assert fetched == [[{"name": "old", "section": "1"}]]
    written = [p["records"] for path, p in client.posts if path == "/ingest/generated"]
    assert written[0][0]["tldrCommit"] == TLDR_COMMIT
    assert "generated" not in written[0][0]  # paid-for text is kept


def test_store_requests_deferred_pages_again():
    class Deferring(FakeClient):
        def post(self, path, payload):
            if path == "/ingest/generated/inputs":
                self.posts.append((path, payload))
                first, *rest = payload["pages"]
                return {
                    "pages": [
                        {"name": first["name"], "section": "1", "contentSha256": first["name"] * 8}
                    ],
                    "deferred": rest,
                }
            return super().post(path, payload)

    client = Deferring()
    pages = [Candidate(name, "1", name * 8) for name in ("aa", "bb", "cc")]
    store = GeneratedStore(client)
    loaded = store.inputs(stage="staging", distro="debian", pages=pages)
    assert [p.name for p in loaded] == ["aa", "bb", "cc"]
    assert len(client.posts) == 3

    class Skipping(FakeClient):
        def post(self, path, payload):
            if path == "/ingest/generated/inputs":
                return {
                    "pages": [],
                    "deferred": [],
                    "skipped": [
                        {
                            "name": "gcc",
                            "section": "1",
                            "reason": "input too large",
                            "bytes": 9_000_000,
                        }
                    ],
                }
            return super().post(path, payload)

    store = GeneratedStore(Skipping())
    assert store.inputs(stage="staging", distro="debian", pages=[Candidate("gcc", "1", "g")]) == []
    assert store.skipped[0]["reason"] == "input too large"


def test_without_a_key_current_rows_are_not_read_again(monkeypatch):
    from ingestion.generated.tldr import TLDR_COMMIT

    class Current(FakeClient):
        def post(self, path, payload):
            if path == "/ingest/generated/candidates":
                self.posts.append((path, payload))
                return {
                    "items": [
                        {
                            "name": "cur",
                            "section": "1",
                            "contentSha256": "cur" * 8,
                            "hasRecord": True,
                            "promptVersion": None,
                            "tldrCommit": TLDR_COMMIT,
                        }
                    ],
                    "isDone": True,
                }
            return super().post(path, payload)

    client = Current()
    monkeypatch.setattr("ingestion.convex_client.ConvexIngestClient", lambda **kwargs: client)
    monkeypatch.delenv("OPENCODE_GO_API_KEY", raising=False)
    monkeypatch.delenv("BETTERMAN_GEN_API_KEY", raising=False)
    monkeypatch.setattr(cli, "_load_tldr", lambda args: TldrIndex({}, commit=TLDR_COMMIT))
    assert cli.main(["run", "--source", "convex", "--sections", "1"]) == 0
    assert not any(path == "/ingest/generated/inputs" for path, _ in client.posts)
    # A dry run still reads it, to estimate the model text it lacks.
    assert cli.main(["run", "--source", "convex", "--sections", "1", "--dry-run"]) == 0
    assert any(path == "/ingest/generated/inputs" for path, _ in client.posts)


# Review probes for #434 (P1-1, P1-2).
def test_destructive_suffixes_never_become_verified_examples():
    page = tar()
    page.doc = {"toc": [], "blocks": []}
    provider = FakeProvider(
        answer([("Inspect an archive", "tar -tf archive.tar; rm -rf /home/user/Documents")]),
        answer([("Inspect", "tar -tf a.tar && rm a.tar"), ("Pipe", "tar -cf - d | ssh h x")]),
    )
    gen = make_generator(provider)
    part = gen.generate(page, no_tldr_det(page))
    assert part.examples == []
    assert part.rejected == 3
    assert gen.stats.rejected_examples["more than one command"] == 3


def test_destructive_pages_get_no_model_text(tmp_path: Path, monkeypatch):
    from ingestion.generated.safety import DESTRUCTIVE_COMMANDS, is_destructive

    for name in [
        "rm",
        "rmdir",
        "shred",
        "dd",
        "mkfs",
        "mkfs.ext4",
        "mke2fs",
        "wipefs",
        "fdisk",
        "sfdisk",
        "parted",
        "truncate",
        "git-clean",
        "git-reset",
    ]:
        assert is_destructive(name), name
    for name in ["tar", "ls", "mkfifo", "mkdir", "git-commit", "rsync"]:
        assert not is_destructive(name), name
    assert len(DESTRUCTIVE_COMMANDS) == len(set(DESTRUCTIVE_COMMANDS))

    rm = golden_page("ls.1", name="rm", sha="d" * 64)
    assert examples_needed(rm, no_tldr_det(rm)) == 0
    provider = FakeProvider()
    assert make_generator(provider).generate(rm, no_tldr_det(rm)) is None
    assert provider.calls == []

    monkeypatch.setattr(
        cli,
        "_candidates_from_cache",
        lambda cache, distro: (
            [Candidate(rm.name, rm.section, rm.content_sha256, None, True)],
            {rm.content_sha256: rm},
        ),
    )
    monkeypatch.setattr(cli, "OpenAICompatibleProvider", lambda config: FakeProvider())
    monkeypatch.setenv("OPENCODE_GO_API_KEY", "k")
    out = tmp_path / "r.jsonl"
    argv = ["run", "--source", "cache", "--cache", str(tmp_path), "--no-tldr", "--out", str(out)]
    assert cli.main(argv) == 0
    assert "generated" not in json.loads(out.read_text())


class Clock:
    def __init__(self):
        self.now = SATURDAY
        self.sleeps = []

    def __call__(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


def governed(opener, clock, **budget):
    from ingestion.generated.provider import OpenAICompatibleProvider

    provider = OpenAICompatibleProvider(
        ProviderConfig(api_key="fake-only", backoff_seconds=0.01), opener=opener
    )
    governor = BudgetGovernor(
        BudgetConfig(off_peak_only=False, **budget),
        Checkpoint(None),
        clock=clock,
        sleep=clock.sleep,
    )
    return Generator(
        provider, governor, max_attempts=1, sleep=clock.sleep, today=lambda: "2026-10-28"
    )


def test_every_http_attempt_passes_the_governor_and_is_charged():
    from test_generated_provider import Opener, completion

    clock = Clock()
    opener = Opener(TimeoutError(), TimeoutError(), TimeoutError(), completion(answer([])))
    gen = governed(opener, clock, requests_per_minute=1)
    page = tar()
    page.options = []
    part = gen.generate(page, no_tldr_det(page))
    assert part is not None
    ledger = gen.governor.checkpoint.ledger
    assert len(opener.requests) == len(ledger) == 4
    # Each retry waited for the one-per-minute limit, not only the backoff.
    assert [round(b[0] - a[0]) >= 60 for a, b in zip(ledger, ledger[1:], strict=False)] == [
        True
    ] * 3
    worst = ledger[0][1]
    assert worst > 0 and ledger[1][1] == ledger[2][1] == worst
    assert gen.governor.run_spend == pytest.approx(3 * worst + ledger[3][1])


def test_a_retry_that_does_not_fit_pauses_instead_of_sending():
    from test_generated_provider import Opener, completion

    opener = Opener(TimeoutError(), completion(answer([])))
    gen = governed(opener, Clock(), requests_per_minute=1, max_wait_seconds=0)
    page = tar()
    page.options = []
    with pytest.raises(BudgetPaused, match="requests per minute"):
        gen.generate(page, no_tldr_det(page))
    assert len(opener.requests) == 1


def test_a_response_without_usage_is_charged_the_worst_case():
    from test_generated_provider import Opener

    from ingestion.generated.budget import token_cost

    opener = Opener({"choices": [{"message": {"content": answer([])}}]})
    gen = governed(opener, Clock())
    page = tar()
    page.options = []
    gen.generate(page, no_tldr_det(page))
    [[_, usd]] = gen.governor.checkpoint.ledger
    assert usd > 0
    assert usd >= token_cost(1, 700, peak=True)  # at least max_tokens at the peak price


def test_writer_refuses_control_characters_but_keeps_manual_line_feeds():
    from ingestion.generated.tldr import Example

    page = tar()
    det = no_tldr_det(page)
    det.page_examples = [Example("", "$ tar -cf a.tar dir\n$ tar -tf a.tar")]
    assert build_record(page, det, None)["page"]["examples"][0]["command"].count("\n") == 1
    det.page_examples = [Example("ok", "tar -cf a\x1b[31m.tar")]
    with pytest.raises(ValueError, match="control characters"):
        build_record(page, det, None)
    det.page_examples = []
    bad = GeneratedPart("p", "m", "b6-v1", "2026-10-28", "Fine.\u202e", [], [], 0)
    with pytest.raises(ValueError, match="record.generated.summary"):
        build_record(page, det, bad)


def test_manual_examples_normalise_tabs_and_drop_control_characters():
    page = tar()
    page.doc = {
        "toc": [],
        "blocks": [
            {"type": "heading", "id": "e", "level": 2, "text": "EXAMPLES"},
            {"type": "code_block", "text": "tar\t-cf a.tar dir\r\n"},
            {"type": "code_block", "text": "tar -tf a\x07.tar"},
        ],
    }
    examples, _ = deterministic(page, None).page_examples, None
    assert [e.command for e in examples] == ["tar    -cf a.tar dir"]


# Re-check of #434: incomplete usage must never charge less than the worst case.
@pytest.mark.parametrize(
    "usage",
    [
        None,
        {},
        {"total_tokens": 1300},
        {"prompt_tokens": 1000},
        {"completion_tokens": 300},
        {"prompt_tokens": "unavailable", "completion_tokens": 300},
        {"prompt_tokens": 1000, "completion_tokens": -1},
        {"prompt_tokens": 1000.5, "completion_tokens": 300},
        {"prompt_tokens": True, "completion_tokens": 300},
        {"prompt_tokens": 1000, "completion_tokens": 300, "total_tokens": 5},
        "1300 tokens",
    ],
)
def test_incomplete_or_malformed_usage_is_charged_the_worst_case(usage):
    from test_generated_provider import Opener

    from ingestion.generated.budget import token_cost

    payload = {"choices": [{"message": {"content": answer([])}}]}
    if usage is not None:
        payload["usage"] = usage
    gen = governed(Opener(payload), Clock())
    messages = [{"role": "user", "content": "test"}]
    completion = gen._request(messages)
    worst = token_cost(len("test") // 4 + 16, gen.max_output_tokens, peak=True)
    assert completion is not None and not completion.usage_reported
    assert gen.governor.checkpoint.ledger[0][1] == pytest.approx(worst)
    assert gen.governor._reserved == 0


def test_complete_usage_is_charged_by_tokens():
    from test_generated_provider import Opener

    from ingestion.generated.budget import token_cost

    payload = {
        "choices": [{"message": {"content": answer([])}}],
        "usage": {
            "prompt_tokens": 1000,
            "completion_tokens": 300,
            "total_tokens": 1300,
            "prompt_tokens_details": {"cached_tokens": "bad"},
        },
    }
    gen = governed(Opener(payload), Clock())
    gen._request([{"role": "user", "content": "test"}])
    assert gen.governor.checkpoint.ledger[0][1] == pytest.approx(token_cost(1000, 300))


def test_an_exception_after_send_still_records_the_attempt():
    class Exploding(FakeProvider):
        def send(self, messages, *, max_tokens):
            self.calls.append(messages)
            raise RuntimeError("parser bug after the request went out")

    provider = Exploding()
    gen = make_generator(provider)
    with pytest.raises(RuntimeError, match="parser bug"):
        gen._request([{"role": "user", "content": "test"}])
    assert len(provider.calls) == len(gen.governor.checkpoint.ledger) == 1
    assert gen.governor.checkpoint.ledger[0][1] > 0
    assert gen.governor._reserved == 0


def test_a_usage_limit_records_the_attempt_and_releases_the_reservation():
    from ingestion.generated.budget import token_cost

    gen = make_generator(FakeProvider(UsageLimitExceeded("Go usage limit exceeded")))
    messages = [{"role": "user", "content": "test"}]
    with pytest.raises(BudgetPaused):
        gen._request(messages)
    # Over-counting a refusal is acceptable; under-counting is not.
    worst = token_cost(len("test") // 4 + 16, gen.max_output_tokens, peak=True)
    assert gen.governor.checkpoint.ledger[0][1] == pytest.approx(worst)
    assert gen.governor._reserved == 0


# Round-2 re-check of #434: an allowance never rescues invalid usage.
@pytest.mark.parametrize("usage", [{}, {"prompt_tokens": "bad", "completion_tokens": 1}, None])
@pytest.mark.parametrize("allowance", [0, False, {"usd": 0}, 0.0, "0", -1, float("nan")])
def test_an_allowance_never_lowers_the_charge_for_invalid_usage(usage, allowance):
    from test_generated_provider import Opener

    from ingestion.generated.budget import token_cost

    payload = {"choices": [{"message": {"content": "{}"}}], "opencode": {"allowance": allowance}}
    if usage is not None:
        payload["usage"] = usage
    gen = governed(Opener(payload), Clock())
    messages = [{"role": "user", "content": "probe"}]
    gen._request(messages)
    worst = token_cost(len("probe") // 4 + 16, gen.max_output_tokens, peak=True)
    assert gen.governor.run_spend == pytest.approx(worst)


@pytest.mark.parametrize(
    ("allowance", "expected"),
    [
        (0.0004, 0.0004),
        ({"usd": 0.0002}, 0.0002),
        (False, None),
        (float("inf"), None),
        (float("nan"), None),
        (-0.1, None),
        ("0.0004", None),
    ],
)
def test_a_valid_response_uses_only_a_finite_non_negative_allowance(allowance, expected):
    from test_generated_provider import Opener

    from ingestion.generated.budget import token_cost

    payload = {
        "choices": [{"message": {"content": "{}"}}],
        "usage": {"prompt_tokens": 1000, "completion_tokens": 300},
        "opencode": {"allowance": allowance},
    }
    gen = governed(Opener(payload), Clock())
    gen._request([{"role": "user", "content": "probe"}])
    want = expected if expected is not None else token_cost(1000, 300)
    assert gen.governor.run_spend == pytest.approx(want)


def test_unchanged_rows_hand_missing_flag_usage_to_b7(monkeypatch):
    from ingestion.generated.tldr import TLDR_COMMIT

    class NewRelease(FakeClient):
        def post(self, path, payload):
            if path == "/ingest/generated/candidates":
                self.posts.append((path, payload))
                item = {
                    "section": "1",
                    "hasRecord": True,
                    "promptVersion": "b6-v1",
                    "tldrCommit": TLDR_COMMIT,
                }
                return {
                    "items": [
                        {
                            **item,
                            "name": "new",
                            "contentSha256": "n" * 64,
                            "flagUsageCurrent": False,
                        },
                        {
                            **item,
                            "name": "old",
                            "contentSha256": "o" * 64,
                            "flagUsageCurrent": True,
                        },
                    ],
                    "isDone": True,
                }
            if path == "/ingest/generated/flag-usage":
                self.posts.append((path, payload))
                return {"scheduled": len(payload["contentSha256s"])}
            return super().post(path, payload)

    client = NewRelease()
    monkeypatch.setattr("ingestion.convex_client.ConvexIngestClient", lambda **kwargs: client)
    monkeypatch.setattr(cli, "_load_tldr", lambda args: TldrIndex({}, commit=TLDR_COMMIT))
    base = ["run", "--source", "convex", "--sections", "1"]
    assert cli.main([*base, "--dry-run"]) == 0
    assert not any(path == "/ingest/generated/flag-usage" for path, _ in client.posts)
    assert cli.main(base) == 0
    sent = [p for path, p in client.posts if path == "/ingest/generated/flag-usage"]
    assert sent == [{"contentSha256s": ["n" * 64]}]
