"""Durable, destination-scoped upload plans for explicit release-ID retries.

The plan is committed before release creation. Receipts are committed only
after successful POSTs; an uncertain POST is replayed using server dedupe.
"""

from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

from ingestion.convex_client import convex_http_url
from ingestion.util import sha256_hex

_VERSION = 1


def encoded_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def state_directory() -> Path:
    default = Path.home() / ".cache" / "betterman" / "ingestion"
    return Path(os.environ.get("BETTERMAN_INGEST_STATE_DIR", str(default))).expanduser().resolve()


class ReleaseCheckpoint:
    def __init__(self, *, directory: Path, http_url: str, release_id: str) -> None:
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        identity = encoded_json([convex_http_url(http_url), release_id])
        self.path = directory / f"{sha256_hex(identity)}.sqlite3"
        self.connection = sqlite3.connect(self.path)
        self.path.chmod(0o600)
        # Containers install packages as root. Keep the mounted checkpoint
        # readable by its host owner for backup/cache and host-side recovery.
        uid = os.environ.get("BETTERMAN_INGEST_STATE_UID")
        gid = os.environ.get("BETTERMAN_INGEST_STATE_GID")
        if os.geteuid() == 0 and uid is not None and gid is not None:
            os.chown(self.path, int(uid), int(gid))
        # Full synchronous durability: losing a receipt is safe, inventing one isn't.
        self.connection.execute("PRAGMA synchronous=FULL")
        self.connection.executescript(
            "CREATE TABLE IF NOT EXISTS plan ("
            "id INTEGER PRIMARY KEY, json TEXT NOT NULL, digest TEXT NOT NULL, release_id TEXT);"
            "CREATE TABLE IF NOT EXISTS uploads ("
            "kind TEXT NOT NULL, ordinal INTEGER NOT NULL, json TEXT NOT NULL,"
            "digest TEXT NOT NULL, uploaded INTEGER NOT NULL DEFAULT 0,"
            "PRIMARY KEY (kind, ordinal));"
        )

    def __enter__(self) -> ReleaseCheckpoint:
        return self

    def __exit__(self, *_args: object) -> None:
        self.connection.close()

    def load(self, signature: dict) -> dict | None:
        row = self.connection.execute("SELECT json, digest FROM plan WHERE id = 1").fetchone()
        if row is None:
            return None
        if sha256_hex(row[0]) != row[1]:
            raise RuntimeError("Release checkpoint declaration is corrupt")
        plan = json.loads(row[0])
        if plan.get("version") != _VERSION or plan.get("signature") != signature:
            raise RuntimeError(
                "Release checkpoint does not match this command/provenance; use a new --release-id"
            )
        return plan["metadata"]

    def prepare(self, *, signature: dict, metadata: dict, items: dict[str, list[dict]]) -> None:
        plan = {"version": _VERSION, "signature": signature, "metadata": metadata}
        text = encoded_json(plan)
        with self.connection:
            # Never overwrite a previously prepared declaration or its payloads.
            self.connection.execute(
                "INSERT INTO plan (id, json, digest) VALUES (1, ?, ?)",
                (text, sha256_hex(text)),
            )
            for kind, values in items.items():
                self.connection.executemany(
                    "INSERT INTO uploads (kind, ordinal, json, digest) VALUES (?, ?, ?, ?)",
                    (
                        (kind, i, text, sha256_hex(text))
                        for i, value in enumerate(values)
                        for text in [encoded_json(value)]
                    ),
                )

    def image_digest_for(self, signature: dict) -> str | None:
        """Resolve the original Docker image without rebuilding the frozen plan."""
        row = self.connection.execute("SELECT json, digest FROM plan WHERE id = 1").fetchone()
        if row is None:
            return None
        if sha256_hex(row[0]) != row[1]:
            raise RuntimeError("Release checkpoint declaration is corrupt")
        saved = json.loads(row[0])["signature"]
        digest = saved["imageDigest"]
        # Every caller-chosen input still has to match. Only the immutable
        # digest is supplied by the checkpoint rather than today's mutable tag.
        self.load(signature | {"imageDigest": digest})
        return digest

    def confirm_release(self, result: dict, *, resuming: bool) -> None:
        previous = self.connection.execute("SELECT release_id FROM plan WHERE id = 1").fetchone()[0]
        if not resuming and result["existed"]:
            raise RuntimeError(
                "Release already exists without its original checkpoint; use a new ID"
            )
        if previous is not None and previous != result["releaseId"]:
            raise RuntimeError("Checkpoint release was removed/recreated; use a new --release-id")
        if self.uploaded_count() and not result["existed"]:
            raise RuntimeError("Checkpoint receipts refer to a missing release; use a new ID")
        with self.connection:
            self.connection.execute(
                "UPDATE plan SET release_id = ? WHERE id = 1", (result["releaseId"],)
            )

    def pending(self, kind: str) -> Iterator[tuple[int, dict]]:
        last = -1
        while True:
            cursor = self.connection.execute(
                "SELECT ordinal, json, digest FROM uploads "
                "WHERE kind = ? AND uploaded = 0 AND ordinal > ? ORDER BY ordinal LIMIT 32",
                (kind, last),
            )
            rows = cursor.fetchall()
            cursor.close()
            if not rows:
                return
            # Do not hold a SQLite cursor/transaction across a POST or a yield:
            # interrupted requests must release every lock before a retry opens.
            for ordinal, text, digest in rows:
                if sha256_hex(text) != digest:
                    raise RuntimeError(f"Release checkpoint {kind} payload {ordinal} is corrupt")
                last = ordinal
                yield ordinal, json.loads(text)

    def acknowledge(self, kind: str, ordinals: list[int]) -> None:
        with self.connection:
            self.connection.executemany(
                "UPDATE uploads SET uploaded = 1 WHERE kind = ? AND ordinal = ?",
                ((kind, ordinal) for ordinal in ordinals),
            )

    def uploaded_count(self, kind: str | None = None) -> int:
        if kind is None:
            query, args = "SELECT COUNT(*) FROM uploads WHERE uploaded = 1", ()
        else:
            query, args = "SELECT COUNT(*) FROM uploads WHERE uploaded = 1 AND kind = ?", (kind,)
        return self.connection.execute(query, args).fetchone()[0]
