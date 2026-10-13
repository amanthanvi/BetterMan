from __future__ import annotations

import sqlite3
from contextlib import closing
from unittest.mock import Mock

import pytest
from test_resume import _resume_harness, _run_resume_ingest

from ingestion import ingest_runner
from ingestion.resume import ReleaseCheckpoint, encoded_json


def _page(name, text=""):
    return {"externalId": name, "name": name, "section": "1", "doc": {"text": text}}


def test_byte_batches_measure_exact_utf8_request_and_preserve_order(monkeypatch):
    pages = [_page(str(i), 'é\\"' * (i + 1)) for i in range(80)]
    monkeypatch.setattr(ingest_runner, "_PAGE_BATCH_BYTES", 2048)
    batches = list(ingest_runner._page_batches(enumerate(pages), release_id="é-release"))
    assert [page for batch in batches for _, page in batch] == pages
    assert len(batches) > 1
    for index, batch in enumerate(batches):
        payload = {"datasetReleaseId": "é-release", "pages": [page for _, page in batch]}
        assert len(encoded_json(payload)) <= 2048
        if index < len(batches) - 1:
            payload["pages"].append(batches[index + 1][0][1])
            assert len(encoded_json(payload)) > 2048, "flush must follow encoded bytes"


def test_small_pages_use_more_than_twenty_entries_and_remain_transaction_bounded():
    pages = [_page(str(i)) for i in range(600)]
    batches = list(ingest_runner._page_batches(enumerate(pages), release_id="release"))
    assert [len(batch) for batch in batches] == [512, 88]
    assert list(ingest_runner._page_batches([], release_id="release")) == []


def test_bisect_isolates_poison_and_uploads_later_pages_in_order(monkeypatch):
    pages = [_page(name) for name in ["a", "bad", "c", "d", "e"]]
    successful = []
    attempts = []
    events = []
    monkeypatch.setattr(
        ingest_runner, "_log", lambda event, **fields: events.append((event, fields))
    )

    def post(_route, payload):
        names = [page["name"] for page in payload["pages"]]
        attempts.append(names)
        if "bad" in names:
            raise RuntimeError("INVALID_PAGE")
        successful.extend(names)
        return {"inserted": len(names), "skipped": 0}

    failed = ingest_runner._upload_page_batch(
        list(enumerate(pages)), release_id="r", client=Mock(post=post), checkpoint=None
    )
    assert successful == ["a", "c", "d", "e"]
    assert failed == [pages[1]]
    assert attempts[0] == ["a", "bad", "c", "d", "e"]
    assert [fields["name"] for event, fields in events if event == "page_upload_failed"] == ["bad"]


def test_bisect_acknowledges_only_accepted_halves_and_leaves_poison_pending(tmp_path):
    pages = [_page(name) for name in ["a", "bad", "c", "d"]]
    with ReleaseCheckpoint(
        directory=tmp_path, http_url="https://test.convex.site", release_id="r"
    ) as cp:
        cp.prepare(signature={}, metadata={}, items={"pages": pages})

        def post(_route, payload):
            if any(page["name"] == "bad" for page in payload["pages"]):
                raise RuntimeError("INVALID_PAGE")
            return {"inserted": len(payload["pages"]), "skipped": 0}

        assert ingest_runner._upload_page_batch(
            list(cp.pending("pages")), release_id="r", client=Mock(post=post), checkpoint=cp
        ) == [pages[1]]
        assert cp.uploaded_count("pages") == 3
        assert list(cp.pending("pages")) == [(1, pages[1])]


def test_oversized_singleton_is_failed_without_posting_and_later_pages_continue(monkeypatch):
    monkeypatch.setattr(ingest_runner, "_PAGE_BATCH_BYTES", 300)
    pages = [_page("a"), _page("huge", "x" * 1000), _page("b")]
    client = Mock()
    failed = []
    for batch in ingest_runner._page_batches(enumerate(pages), release_id="r"):
        failed.extend(
            ingest_runner._upload_page_batch(batch, release_id="r", client=client, checkpoint=None)
        )
    assert failed == [pages[1]]
    assert [call.args[1]["pages"][0]["name"] for call in client.post.call_args_list] == ["a", "b"]


def test_disk_receipt_failure_aborts_without_classifying_accepted_pages_as_poison():
    cp = Mock()
    cp.acknowledge.side_effect = sqlite3.OperationalError("disk full")
    client = Mock()
    client.post.return_value = {"inserted": 1, "skipped": 0}
    with pytest.raises(sqlite3.OperationalError, match="disk full"):
        ingest_runner._upload_page_batch(
            [(0, _page("a"))], release_id="r", client=client, checkpoint=cp
        )
    client.post.assert_called_once()


def test_poison_below_hard_fail_threshold_still_blocks_manifest_activation_and_resumes(
    monkeypatch, tmp_path
):
    calls, original_post = _resume_harness(monkeypatch, tmp_path, total=100)
    events = []
    monkeypatch.setattr(
        ingest_runner, "_log", lambda event, **fields: events.append((event, fields))
    )
    monkeypatch.setattr(
        ingest_runner, "_collect_licenses", lambda **_k: {"example": "License text"}
    )
    activate = Mock()
    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "activate_release", activate)

    def poison(self, route, payload):
        if route.endswith("storage") and any(p["name"] == "p005" for p in payload["pages"]):
            raise RuntimeError("INVALID_PAGE")
        if route == "/ingest/licenses":
            calls.append((route, payload))
            return {"inserted": len(payload["licenses"]), "skipped": 0}
        return original_post(self, route, payload)

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", poison)
    with pytest.raises(RuntimeError, match="hard_fail_rate=0.010, upload_failed=1"):
        _run_resume_ingest()
    activate.assert_not_called()
    declaration = calls[0][1]
    assert declaration["pageCount"] == 100
    assert declaration["sectionTotals"] == [{"section": "1", "total": 100}]
    assert any(route == "/ingest/licenses" for route, _ in calls), "continue after poison"
    summary = next(fields for event, fields in events if event == "ingest_summary")
    assert summary["succeeded"] == 99
    assert summary["failed"] == summary["uploadFailed"] == 1
    assert not summary["publishAllowed"]
    with closing(sqlite3.connect(next(tmp_path.glob("*.sqlite3")))) as connection:
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM uploads WHERE kind='pages' AND uploaded=1"
            ).fetchone()[0]
            == 99
        )
    calls.clear()
    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", original_post)
    monkeypatch.setattr(
        ingest_runner, "_prepare_release", Mock(side_effect=AssertionError("reparsed"))
    )
    result = _run_resume_ingest()
    assert result.succeeded == 100
    assert result.hard_failed == 0
    assert result.published
    assert [
        p["name"] for route, body in calls if route.endswith("storage") for p in body["pages"]
    ] == ["p005"]
    activate.assert_called_once()


def test_failed_target_alias_is_deferred_but_other_aliases_are_uploaded(monkeypatch):
    metadata = {
        "total": 4,
        "parseFailed": 0,
        "declaration": {
            "datasetReleaseId": "r",
            "pageCount": 2,
            "aliasCount": 2,
        },
    }
    items = {
        "pages": [_page("bad"), _page("good")],
        "licenses": [],
        "aliases": [
            {"name": "bad-alias", "section": "1", "targetName": "bad", "targetSection": "1"},
            {"name": "good-alias", "section": "1", "targetName": "good", "targetSection": "1"},
        ],
    }
    alias_uploads = []

    def post(route, payload):
        if route.endswith("storage") and any(page["name"] == "bad" for page in payload["pages"]):
            raise RuntimeError("INVALID_PAGE")
        if route == "/ingest/aliases":
            alias_uploads.extend(payload["aliases"])
        return {}

    with pytest.raises(RuntimeError, match="publish blocked"):
        ingest_runner._upload_release(
            metadata=metadata,
            items=items,
            checkpoint=None,
            resuming=False,
            client=Mock(post=post),
            activate=True,
            dataset_stage="staging",
        )
    assert [alias["name"] for alias in alias_uploads] == ["good-alias"]
