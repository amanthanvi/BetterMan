from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

from ingestion.generated import cli, ledger
from ingestion.generated.ledger import (
    WORKFLOW_PATH,
    Artifact,
    InvalidCheckpoint,
    LedgerRecoveryError,
    checkpoint_from_zip,
    parse_artifacts,
    recover,
)

NOW = datetime(2026, 10, 31, 12, tzinfo=UTC)
GOOD = {"version": 1, "ledger": [[1_793_000_000, 0.25]], "pausedUntil": 0, "totals": {"usd": 0.25}}


def zipped(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return buf.getvalue()


def artifact(id: int, days_ago: float, *, expired=False, trusted=True) -> Artifact:
    return Artifact(id, NOW - timedelta(days=days_ago), expired, 1000 + id, trusted)


def api_item(
    id,
    branch="main",
    repo=1,
    head_repo=1,
    name="generated-layer-state",
    days_ago=1,
    event="schedule",
    path=WORKFLOW_PATH,
):
    created = (NOW - timedelta(days=days_ago)).isoformat().replace("+00:00", "Z")
    return {
        "id": id,
        "name": name,
        "expired": False,
        "created_at": created,
        "workflow_run": {
            "id": 500 + id,
            "head_branch": branch,
            "repository_id": repo,
            "head_repository_id": head_repo,
            "event": event,
            "path": path,
        },
    }


def test_trust_needs_name_branch_repository_workflow_and_event():
    payload = {
        "artifacts": [
            api_item(1, days_ago=6),
            api_item(2, branch="feature", days_ago=1),
            api_item(3, head_repo=99, days_ago=2),
            api_item(4, name="other", days_ago=0),
            # Same name, same branch, another workflow.
            api_item(5, path=".github/workflows/other.yml", days_ago=3),
            api_item(6, event="pull_request", days_ago=4),
            api_item(7, event="pull_request_target", days_ago=4.5),
            api_item(8, event="workflow_dispatch", path=f"{WORKFLOW_PATH}@refs/heads/main"),
            api_item(9, event=None, path=None, days_ago=5),
        ]
    }
    parsed = parse_artifacts(payload, branch="main")
    assert {a.id: a.trusted for a in parsed} == {
        1: True,
        2: False,
        3: False,
        5: False,
        6: False,
        7: False,
        8: True,
        9: False,
    }


def test_newest_trusted_ledger_is_restored(tmp_path: Path):
    good = zipped({"checkpoint.json": json.dumps(GOOD).encode()})
    fetched = []

    def fetch(a: Artifact) -> bytes:
        fetched.append(a.id)
        return good

    arts = [artifact(9, 0, trusted=False), artifact(1, 1), artifact(2, 2)]
    dest = tmp_path / "state" / "checkpoint.json"
    assert recover(arts, fetch=fetch, dest=dest, now=NOW) == "restored artifact 1 from run 1001"
    assert fetched == [1]  # untrusted 9 is never downloaded, older 2 is not needed
    assert json.loads(dest.read_text()) == GOOD


@pytest.mark.parametrize(
    "newest",
    [
        OSError("download failed"),
        b"not a zip",
        zipped({"checkpoint.json": b'{"version": 2}'}),
        zipped({"checkpoint.json": b"{}", "../evil": b"x"}),
    ],
)
def test_an_unreadable_newest_ledger_never_falls_back_to_an_older_one(tmp_path: Path, newest):
    # Re-check of #434: the older ledger would drop the spend recorded since.
    old = zipped({"checkpoint.json": json.dumps(GOOD).encode()})

    def fetch(a: Artifact) -> bytes:
        if a.id == 1:
            if isinstance(newest, Exception):
                raise newest
            return newest
        return old

    dest = tmp_path / "c.json"
    with pytest.raises(LedgerRecoveryError, match="artifact 1"):
        recover([artifact(1, 0.1), artifact(2, 1)], fetch=fetch, dest=dest, now=NOW)
    assert not dest.exists()


def test_fresh_start_only_without_a_trusted_ledger_in_the_window(tmp_path: Path):
    def fetch(a: Artifact) -> bytes:
        raise AssertionError("no download expected")

    dest = tmp_path / "c.json"
    assert recover([], fetch=fetch, dest=dest, now=NOW).startswith("fresh:")
    untrusted = [artifact(1, 0, trusted=False)]
    assert recover(untrusted, fetch=fetch, dest=dest, now=NOW).startswith("fresh:")
    old = [artifact(1, 95, expired=True)]
    assert recover(old, fetch=fetch, dest=dest, now=NOW).startswith("fresh:")
    with pytest.raises(LedgerRecoveryError, match="expired"):
        recover([artifact(1, 10, expired=True)], fetch=fetch, dest=dest, now=NOW)
    assert not dest.exists()


@pytest.mark.parametrize(
    "checkpoint",
    [
        {"version": 1, "ledger": [[1, "x"]]},
        {"version": 1, "ledger": [[1, 2, 3]]},
        {"version": 1, "ledger": {}},
        {"version": 1, "ledger": [], "pausedUntil": "soon"},
        {"version": 1, "ledger": [], "totals": {"usd": [1]}},
        {"version": 1, "ledger": [[True, 1]]},
        [],
    ],
)
def test_malformed_checkpoints_are_rejected(checkpoint):
    with pytest.raises(InvalidCheckpoint):
        checkpoint_from_zip(zipped({"checkpoint.json": json.dumps(checkpoint).encode()}))


def fake_gh(pages: list[list[dict]], runs: dict[int, dict] | None = None):
    calls: list[str] = []

    def run(argv, **kwargs):
        path = argv[-1]
        calls.append(path)
        if "/actions/runs/" in path:
            run_id = int(path.rsplit("/", 1)[1])
            detail = (runs or {}).get(run_id) or {
                "id": run_id,
                "event": "schedule",
                "path": WORKFLOW_PATH,
                "workflow_id": 7,
                "head_branch": "main",
                "repository": {"id": 1},
                "head_repository": {"id": 1},
            }
            return SimpleNamespace(stdout=json.dumps(detail).encode())
        page = int(path.rsplit("page=", 1)[1])
        batch = pages[page - 1] if page <= len(pages) else []
        total = sum(len(p) for p in pages)
        body = {"total_count": total, "artifacts": batch}
        return SimpleNamespace(stdout=json.dumps(body).encode())

    return run, calls


def bare(item: dict) -> dict:
    """An artifact as the listing API returns it: no event or workflow path."""
    run = item["workflow_run"]
    keys = ("id", "head_branch", "repository_id", "head_repository_id")
    item["workflow_run"] = {k: run[k] for k in keys}
    return item


def test_inventory_pages_past_100_newer_other_branch_artifacts(monkeypatch):
    first = [bare(api_item(i, branch="feature", days_ago=0.1)) for i in range(100)]
    second = [bare(api_item(101, days_ago=1))]
    run, calls = fake_gh([first, second])
    monkeypatch.setattr(ledger.subprocess, "run", run)
    inventory = ledger.gh_artifacts("o/r", branch="main", now=NOW)
    trusted = [a for a in parse_artifacts(inventory, branch="main") if a.trusted]
    assert [a.id for a in trusted] == [101]
    assert any("page=2" in c for c in calls)
    # Run details are fetched only for default-branch candidates.
    assert [c for c in calls if "/actions/runs/" in c] == ["repos/o/r/actions/runs/601"]


def test_inventory_reads_the_run_for_workflow_identity(monkeypatch):
    def run_detail(run_id, event, path):
        return {
            "id": run_id,
            "event": event,
            "path": path,
            "head_branch": "main",
            "repository": {"id": 1},
            "head_repository": {"id": 1},
        }

    items = [bare(api_item(1, days_ago=1)), bare(api_item(2, days_ago=2))]
    run, _ = fake_gh(
        [items],
        runs={
            501: run_detail(501, "schedule", ".github/workflows/other.yml"),
            502: run_detail(502, "pull_request", WORKFLOW_PATH),
        },
    )
    monkeypatch.setattr(ledger.subprocess, "run", run)
    parsed = parse_artifacts(ledger.gh_artifacts("o/r", branch="main", now=NOW), branch="main")
    assert not any(a.trusted for a in parsed)


def test_inventory_stops_at_the_window_and_fails_on_endless_pages(monkeypatch):
    old_page = [bare(api_item(i, days_ago=40)) for i in range(100)]
    run, calls = fake_gh([old_page, old_page, old_page])
    monkeypatch.setattr(ledger.subprocess, "run", run)
    ledger.gh_artifacts("o/r", branch="main", now=NOW)
    assert sum("page=" in c for c in calls) == 1

    recent = [bare(api_item(i, branch="feature", days_ago=0.1)) for i in range(100)]
    run, _ = fake_gh([recent] * 5)
    monkeypatch.setattr(ledger.subprocess, "run", run)
    with pytest.raises(LedgerRecoveryError, match="without reaching"):
        ledger.gh_artifacts("o/r", branch="main", now=NOW, max_pages=3)


def test_cli_exits_non_zero_when_recovery_fails(monkeypatch, tmp_path: Path):
    def inventory(repo, branch):
        return {"artifacts": [api_item(1, days_ago=-1)]}

    def broken(repo):
        def fetch(a):
            raise OSError("boom")

        return fetch

    monkeypatch.setattr(ledger, "gh_artifacts", inventory)
    monkeypatch.setattr(ledger, "gh_fetch", broken)
    argv = ["restore-ledger", "--repo", "o/r", "--branch", "main", "--dest", str(tmp_path / "c")]
    assert cli.main(argv) == 1
    monkeypatch.setattr(ledger, "gh_artifacts", lambda repo, branch: {"artifacts": []})
    assert cli.main(argv) == 0

    def gh_down(repo, branch):
        raise ledger.subprocess.CalledProcessError(1, ["gh"])

    monkeypatch.setattr(ledger, "gh_artifacts", gh_down)
    assert cli.main(argv) == 1
