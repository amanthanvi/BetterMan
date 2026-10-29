"""Recover the budget ledger from earlier workflow runs.

An artifact is trusted only when it has the expected name and comes from a
`schedule` or `workflow_dispatch` run of generate-layer.yml on the default
branch of this repository. Only the newest trusted ledger inside the longest
budget window matters: if it cannot be downloaded or validated, recovery
fails rather than fall back to an older ledger and forget recent spend.
Starting fresh is allowed only when no trusted ledger exists in that window.
"""

from __future__ import annotations

import io
import json
import logging
import math
import subprocess
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from ingestion.generated.budget import CHECKPOINT_VERSION, GO_WINDOWS

logger = logging.getLogger("betterman.generated")

ARTIFACT_NAME = "generated-layer-state"
WORKFLOW_PATH = ".github/workflows/generate-layer.yml"
TRUSTED_EVENTS = frozenset({"schedule", "workflow_dispatch"})
PAGE_SIZE = 100
MAX_PAGES = 50
MEMBER = "checkpoint.json"
MAX_CHECKPOINT_BYTES = 64 * 1024 * 1024
HORIZON = timedelta(seconds=max(seconds for _, seconds, _ in GO_WINDOWS)) + timedelta(days=1)


class LedgerRecoveryError(RuntimeError):
    pass


class InvalidCheckpoint(ValueError):
    pass


@dataclass(frozen=True)
class Artifact:
    id: int
    created_at: datetime
    expired: bool
    run_id: int | None
    trusted: bool


def _trusted(item: dict, run: dict, *, branch: str) -> bool:
    path = str(run.get("path") or "").split("@", 1)[0]
    return (
        item.get("name") == ARTIFACT_NAME
        and run.get("head_branch") == branch
        and run.get("head_repository_id") is not None
        and run.get("head_repository_id") == run.get("repository_id")
        and run.get("event") in TRUSTED_EVENTS
        and path == WORKFLOW_PATH
    )


def parse_artifacts(payload: dict, *, branch: str) -> list[Artifact]:
    """Artifacts, newest first. `workflow_run` must carry the run's event and
    workflow path (`gh_artifacts` adds them); without them nothing is trusted."""
    artifacts = []
    for item in payload.get("artifacts", []):
        if item.get("name") != ARTIFACT_NAME:
            continue
        run = item.get("workflow_run") or {}
        artifacts.append(
            Artifact(
                id=int(item["id"]),
                created_at=_created(item),
                expired=bool(item.get("expired")),
                run_id=run.get("id"),
                trusted=_trusted(item, run, branch=branch),
            )
        )
    return sorted(artifacts, key=lambda a: a.created_at, reverse=True)


def _created(item: dict) -> datetime:
    return datetime.fromisoformat(str(item["created_at"]).replace("Z", "+00:00"))


def checkpoint_from_zip(data: bytes) -> bytes:
    """The checkpoint member of an artifact zip, schema-checked."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise InvalidCheckpoint("artifact is not a zip") from exc
    names = archive.namelist()
    if names != [MEMBER]:
        raise InvalidCheckpoint(f"artifact holds {names}, expected [{MEMBER!r}]")
    info = archive.getinfo(MEMBER)
    if info.file_size > MAX_CHECKPOINT_BYTES:
        raise InvalidCheckpoint("checkpoint is too large")
    raw = archive.read(MEMBER)
    validate_checkpoint(raw)
    return raw


def validate_checkpoint(raw: bytes) -> None:
    try:
        data = json.loads(raw)
    except ValueError as exc:
        raise InvalidCheckpoint("checkpoint is not JSON") from exc
    if not isinstance(data, dict) or data.get("version") != CHECKPOINT_VERSION:
        raise InvalidCheckpoint("checkpoint has the wrong version")
    ledger = data.get("ledger")
    if not isinstance(ledger, list):
        raise InvalidCheckpoint("ledger is not a list")
    for entry in ledger:
        if (
            not isinstance(entry, list)
            or len(entry) != 2
            or not all(_finite_number(value) for value in entry)
        ):
            raise InvalidCheckpoint("ledger entry is malformed")
    if not _finite_number(data.get("pausedUntil", 0)):
        raise InvalidCheckpoint("pausedUntil is malformed")
    totals = data.get("totals", {})
    if not isinstance(totals, dict) or not all(_finite_number(v) for v in totals.values()):
        raise InvalidCheckpoint("totals are malformed")


def _finite_number(value: object) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool) and math.isfinite(value)


def recover(
    artifacts: list[Artifact],
    *,
    fetch: Callable[[Artifact], bytes],
    dest: Path,
    now: datetime | None = None,
) -> str:
    """Write the newest trusted checkpoint to `dest`; return what happened.

    Only the newest trusted ledger in the window is considered. An older one is
    never used in its place: it would drop the spend recorded since.
    """
    now = now or datetime.now(UTC)
    recent = [a for a in artifacts if a.trusted and now - a.created_at <= HORIZON]
    if not recent:
        return "fresh: no trusted ledger in the last 30 days"
    newest = max(recent, key=lambda a: a.created_at)
    if newest.expired:
        raise LedgerRecoveryError(f"newest trusted ledger (artifact {newest.id}) has expired")
    try:
        raw = checkpoint_from_zip(fetch(newest))
    except (InvalidCheckpoint, OSError, subprocess.CalledProcessError) as exc:
        raise LedgerRecoveryError(
            f"newest trusted ledger (artifact {newest.id}, run {newest.run_id}) "
            f"could not be recovered: {exc}; refusing to generate with an older or empty ledger"
        ) from exc
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(raw)
    return f"restored artifact {newest.id} from run {newest.run_id}"


def _gh_json(path: str) -> dict:
    out = subprocess.run(["gh", "api", path], check=True, capture_output=True).stdout
    data = json.loads(out)
    if not isinstance(data, dict):
        raise LedgerRecoveryError(f"unexpected response from {path}")
    return data


def gh_artifacts(
    repo: str, *, branch: str, now: datetime | None = None, max_pages: int = MAX_PAGES
) -> dict:
    """Every ledger artifact in the budget window, with run event and path.

    Pages until the API runs out or a whole page is older than the window.
    Never concludes there is no history from a partial listing.
    """
    now = now or datetime.now(UTC)
    cutoff = now - HORIZON
    items: list[dict] = []
    for page in range(1, max_pages + 1):
        payload = _gh_json(
            f"repos/{repo}/actions/artifacts?name={ARTIFACT_NAME}&per_page={PAGE_SIZE}&page={page}"
        )
        batch = payload.get("artifacts", [])
        items.extend(batch)
        total = payload.get("total_count")
        if len(batch) < PAGE_SIZE or (isinstance(total, int) and page * PAGE_SIZE >= total):
            break
        if all(_created(item) < cutoff for item in batch):
            break
    else:
        raise LedgerRecoveryError(
            f"more than {max_pages * PAGE_SIZE} artifacts without reaching the budget window's end"
        )
    runs: dict[int, dict] = {}
    for item in items:
        run = item.get("workflow_run") or {}
        if item.get("name") != ARTIFACT_NAME or _created(item) < cutoff:
            continue
        if run.get("head_branch") != branch or run.get("id") is None:
            continue
        if run["id"] not in runs:
            detail = _gh_json(f"repos/{repo}/actions/runs/{run['id']}")
            runs[run["id"]] = {
                "id": detail.get("id"),
                "event": detail.get("event"),
                "path": detail.get("path"),
                "workflow_id": detail.get("workflow_id"),
                "head_branch": detail.get("head_branch"),
                "repository_id": (detail.get("repository") or {}).get("id"),
                "head_repository_id": (detail.get("head_repository") or {}).get("id"),
            }
        # The run record is authoritative for every trust field.
        item["workflow_run"] = runs[run["id"]]
    return {"artifacts": items}


def gh_fetch(repo: str) -> Callable[[Artifact], bytes]:
    def fetch(artifact: Artifact) -> bytes:
        return subprocess.run(
            ["gh", "api", f"repos/{repo}/actions/artifacts/{artifact.id}/zip"],
            check=True,
            capture_output=True,
        ).stdout

    return fetch
