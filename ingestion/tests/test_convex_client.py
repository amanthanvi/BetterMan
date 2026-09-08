from io import BytesIO
from unittest.mock import Mock
from urllib.error import HTTPError

import pytest

from ingestion.convex_client import ActivationPending, ConvexIngestClient


def test_activation_retries_pending_http_conflict(monkeypatch):
    response = BytesIO(b'{"pending":false,"datasetReleaseId":"new"}')
    request = Mock(
        side_effect=[
            HTTPError(
                "https://test.convex.site", 409, "Conflict", {}, BytesIO(b'{"pending":true}')
            ),
            response,
        ]
    )
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    result = ConvexIngestClient("https://test.convex.site", "test-secret").activate_release(
        {"datasetReleaseId": "new"}, timeout_seconds=10
    )
    assert result == {"pending": False, "datasetReleaseId": "new"}
    assert request.call_count == 2
    assert all(0 < call.kwargs["timeout"] <= 10 for call in request.call_args_list)


def test_post_distinguishes_pending_activation(monkeypatch):
    error = HTTPError("https://test.convex.site", 409, "Conflict", {}, BytesIO(b'{"pending":true}'))
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(side_effect=error))
    with pytest.raises(ActivationPending):
        ConvexIngestClient("https://test.convex.site", "test-secret").post("/ingest/activate", {})


@pytest.mark.parametrize(
    ("path", "status", "body"),
    [
        ("/ingest/activate", 409, b'{"pending":false}'),
        ("/ingest/activate", 409, b"invalid-json"),
        ("/ingest/activate", 409, b"[]"),
        ("/ingest/activate", 503, b'{"pending":true}'),
        ("/ingest/pages", 409, b'{"pending":true}'),
    ],
)
def test_other_http_errors_are_not_retried(monkeypatch, path, status, body):
    error = HTTPError("https://test.convex.site", status, "Failure", {}, BytesIO(body))
    request = Mock(side_effect=error)
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    client = ConvexIngestClient("https://test.convex.site", "test-secret")
    with pytest.raises(RuntimeError, match=f"Convex ingest HTTP {status}"):
        if path == "/ingest/activate":
            client.activate_release({"datasetReleaseId": "new"})
        else:
            client.post(path, {})
    request.assert_called_once()


def test_activation_waits_for_hydration(monkeypatch):
    post = Mock(side_effect=[{"pending": True}, {"pending": False, "datasetReleaseId": "new"}])
    pause = Mock()
    monkeypatch.setattr(ConvexIngestClient, "post", post)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", pause)
    client = ConvexIngestClient("https://test.convex.site", "test-secret")
    assert client.activate_release({"datasetReleaseId": "new"})["pending"] is False
    assert post.call_count == 2
    pause.assert_called_once()


@pytest.mark.parametrize("result", [{}, {"pending": False, "datasetReleaseId": "other"}])
def test_activation_rejects_invalid_success(monkeypatch, result):
    monkeypatch.setattr(ConvexIngestClient, "post", Mock(return_value=result))
    with pytest.raises(RuntimeError):
        ConvexIngestClient("https://test.convex.site", "test-secret").activate_release(
            {"datasetReleaseId": "new"}
        )


def test_activation_timeout_does_not_report_publication(monkeypatch):
    monkeypatch.setattr(ConvexIngestClient, "post", Mock(return_value={"pending": True}))
    monkeypatch.setattr("ingestion.convex_client.time.monotonic", Mock(side_effect=[0, 0, 3, 3]))
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    with pytest.raises(RuntimeError, match="hydration deadline"):
        ConvexIngestClient("https://test.convex.site", "test-secret").activate_release(
            {"datasetReleaseId": "new"}, timeout_seconds=2
        )


def test_activation_propagates_failure(monkeypatch):
    monkeypatch.setattr(ConvexIngestClient, "post", Mock(side_effect=RuntimeError("unavailable")))
    with pytest.raises(RuntimeError, match="unavailable"):
        ConvexIngestClient("https://test.convex.site", "test-secret").activate_release(
            {"datasetReleaseId": "new"}
        )
