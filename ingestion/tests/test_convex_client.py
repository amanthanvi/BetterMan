import json
import re
import ssl
from http.client import HTTPException, IncompleteRead, RemoteDisconnected
from io import BytesIO
from pathlib import Path
from unittest.mock import Mock
from urllib.error import HTTPError, URLError

import pytest

from ingestion.convex_client import (
    REQUIRED_DECLARATION_COUNTS,
    REQUIRED_FUNCTIONS,
    REQUIRED_SCHEMA_VERSION,
    ActivationPending,
    ConvexContractError,
    ConvexIngestClient,
)


def _http_error(status: int, body: bytes = b"") -> HTTPError:
    return HTTPError("https://test.convex.site/ingest/pages", status, "Failure", {}, BytesIO(body))


@pytest.mark.parametrize(
    "failure",
    [
        _http_error(503, b"outage"),
        _http_error(429, b"slow down"),
        URLError("unreachable"),
        TimeoutError("timed out"),
        RemoteDisconnected("closed"),
        IncompleteRead(b""),
        ssl.SSLError("decryption failed"),
        BytesIO(b"<html>bad gateway</html>"),
        BytesIO(b"\xff\xfe"),
    ],
    ids=[
        "503",
        "429",
        "unreachable",
        "timeout",
        "disconnect",
        "incomplete-read",
        "ssl",
        "non-json-body",
        "non-utf8-body",
    ],
)
def test_idempotent_posts_retry_transient_failures(monkeypatch, failure):
    request = Mock(side_effect=[failure, BytesIO(b'{"inserted":1,"skipped":0}')])
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    sleep = Mock()
    monkeypatch.setattr("ingestion.convex_client.time.sleep", sleep)
    client = ConvexIngestClient("https://test.convex.site", "test-secret")
    assert client.post("/ingest/pages/storage", {}) == {"inserted": 1, "skipped": 0}
    assert request.call_count == 2
    sleep.assert_called_once()


def _unreadable_http_error(status: int, read_error: BaseException) -> HTTPError:
    class UnreadableError(HTTPError):
        def read(self, *args: object, **kwargs: object) -> bytes:
            raise read_error

    return UnreadableError(
        "https://test.convex.site/ingest/pages",
        status,
        "Failure",
        {},
        BytesIO(b""),
    )


@pytest.mark.parametrize(
    "read_error",
    [IncompleteRead(b""), TimeoutError("timed out")],
    ids=["incomplete-read", "timeout"],
)
def test_503_retries_when_error_body_cannot_be_read(monkeypatch, read_error):
    request = Mock(
        side_effect=[
            _unreadable_http_error(503, read_error),
            BytesIO(b'{"inserted":1,"skipped":0}'),
        ]
    )
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    sleep = Mock()
    monkeypatch.setattr("ingestion.convex_client.time.sleep", sleep)
    client = ConvexIngestClient("https://test.convex.site", "test-secret")
    assert client.post("/ingest/pages/storage", {}) == {"inserted": 1, "skipped": 0}
    assert request.call_count == 2
    sleep.assert_called_once_with(1.0)


@pytest.mark.parametrize(
    "read_error",
    [IncompleteRead(b""), TimeoutError("timed out")],
    ids=["incomplete-read", "timeout"],
)
def test_unreadable_503_stays_bounded(monkeypatch, read_error):
    def fail(*_args: object, **_kwargs: object) -> None:
        raise _unreadable_http_error(503, read_error)

    request = Mock(side_effect=fail)
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    client = ConvexIngestClient("https://test.convex.site", "test-secret")
    with pytest.raises(RuntimeError, match="HTTP 503"):
        client.post("/ingest/pages/storage", {})
    assert request.call_count == 3


def test_retries_are_bounded(monkeypatch):
    request = Mock(side_effect=URLError("unreachable"))
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    with pytest.raises(RuntimeError, match="unreachable"):
        ConvexIngestClient("https://test.convex.site", "test-secret").post("/ingest/aliases", {})
    assert request.call_count == 3


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409])
def test_client_errors_fail_immediately(monkeypatch, status):
    request = Mock(side_effect=_http_error(status, b"rejected"))
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    with pytest.raises(RuntimeError, match=f"HTTP {status}: rejected"):
        ConvexIngestClient("https://test.convex.site", "test-secret").post("/ingest/licenses", {})
    request.assert_called_once()


def test_release_creation_retries_but_activation_posts_once(monkeypatch):
    request = Mock(side_effect=[_http_error(503, b"outage"), BytesIO(b'{"existed":true}')])
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    client = ConvexIngestClient("https://test.convex.site", "test-secret")
    assert client.post("/ingest/release", {}) == {"existed": True}
    assert request.call_count == 2

    request = Mock(side_effect=_http_error(503, b"outage"))
    monkeypatch.setattr("ingestion.convex_client.urlopen", request)
    with pytest.raises(RuntimeError, match="HTTP 503"):
        client.post("/ingest/activate", {})
    request.assert_called_once()


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


def _contract_body(**overrides: object) -> bytes:
    payload = {
        "schemaVersion": REQUIRED_SCHEMA_VERSION,
        "functions": list(REQUIRED_FUNCTIONS),
        "declarationCounts": list(REQUIRED_DECLARATION_COUNTS),
        "activatePending": True,
    }
    payload.update(overrides)
    return json.dumps(payload).encode()


def test_require_deployed_contract_accepts_a_matching_deployment(monkeypatch):
    monkeypatch.setattr(
        "ingestion.convex_client.urlopen", Mock(return_value=BytesIO(_contract_body()))
    )
    client = ConvexIngestClient("https://test.convex.site", "test-secret")
    result = client.require_deployed_contract()
    assert result["schemaVersion"] == REQUIRED_SCHEMA_VERSION
    assert "ingest.activateRelease" in result["functions"]


def test_require_deployed_contract_accepts_extra_functions(monkeypatch):
    body = _contract_body(functions=[*REQUIRED_FUNCTIONS, "ingest.promoteActiveReleases"])
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(return_value=BytesIO(body)))
    ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


@pytest.mark.parametrize(
    ("payload", "match"),
    [
        ({"schemaVersion": 0}, "schemaVersion"),
        ({"functions": ["ingest.createRelease"]}, "missing functions"),
        ({"declarationCounts": ["pageCount"]}, "declaration counts"),
        ({"activatePending": False}, "activatePending"),
    ],
)
def test_require_deployed_contract_rejects_a_partial_deployment(monkeypatch, payload, match):
    monkeypatch.setattr(
        "ingestion.convex_client.urlopen",
        Mock(return_value=BytesIO(_contract_body(**payload))),
    )
    with pytest.raises(ConvexContractError, match=match):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_fails_fast_when_the_route_is_missing(monkeypatch):
    error = HTTPError(
        "https://test.convex.site/ingest/contract",
        404,
        "Not Found",
        {},
        BytesIO(b"missing"),
    )
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(side_effect=error))
    with pytest.raises(ConvexContractError, match="404"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_rejects_a_bad_secret(monkeypatch):
    error = HTTPError(
        "https://test.convex.site/ingest/contract",
        401,
        "Unauthorized",
        {},
        BytesIO(b'{"error":{"code":"UNAUTHORIZED"}}'),
    )
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(side_effect=error))
    with pytest.raises(ConvexContractError, match="ingest secret"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_rejects_a_non_json_body(monkeypatch):
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(return_value=BytesIO(b"not-json")))
    with pytest.raises(ConvexContractError, match="not JSON"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_rejects_an_empty_body(monkeypatch):
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(return_value=BytesIO(b"")))
    with pytest.raises(ConvexContractError, match="empty"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_reports_other_http_failures(monkeypatch):
    error = HTTPError(
        "https://test.convex.site/ingest/contract",
        503,
        "Unavailable",
        {},
        BytesIO(b"upstream down"),
    )
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(side_effect=error))
    with pytest.raises(ConvexContractError, match="HTTP 503"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


@pytest.mark.parametrize(
    ("failure", "match"),
    [
        ("utf-8", "not UTF-8"),
        (HTTPException("truncated"), "truncated"),
        (ConnectionError("reset"), "reset"),
    ],
)
def test_require_deployed_contract_wraps_a_broken_read(monkeypatch, failure, match):
    class BrokenBody(BytesIO):
        def read(self, *args, **kwargs):
            if failure == "utf-8":
                return b"\xff"
            raise failure

    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(return_value=BrokenBody(b"")))
    with pytest.raises(ConvexContractError, match=match):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_skips_the_error_body_for_a_missing_route(monkeypatch):
    class StallingError(HTTPError):
        def read(self, *args, **kwargs):
            raise TimeoutError("stalled")

    error = StallingError(
        "https://test.convex.site/ingest/contract",
        404,
        "Not Found",
        {},
        BytesIO(b""),
    )
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(side_effect=error))
    with pytest.raises(ConvexContractError, match="404"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_wraps_a_timeout_while_reading_an_error_body(monkeypatch):
    class StallingError(HTTPError):
        def read(self, *args, **kwargs):
            raise TimeoutError("stalled")

    error = StallingError(
        "https://test.convex.site/ingest/contract",
        500,
        "Server Error",
        {},
        BytesIO(b""),
    )
    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(side_effect=error))
    with pytest.raises(ConvexContractError, match="timed out"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_wraps_a_disconnect_before_the_response(monkeypatch):
    monkeypatch.setattr(
        "ingestion.convex_client.urlopen",
        Mock(side_effect=RemoteDisconnected("closed")),
    )
    with pytest.raises(ConvexContractError, match="closed"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_wraps_a_read_timeout(monkeypatch):
    class SlowBody(BytesIO):
        def read(self, *args, **kwargs):
            raise TimeoutError("timed out")

    monkeypatch.setattr("ingestion.convex_client.urlopen", Mock(return_value=SlowBody(b"")))
    with pytest.raises(ConvexContractError, match="timed out"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_require_deployed_contract_reports_an_unreachable_deployment(monkeypatch):
    monkeypatch.setattr(
        "ingestion.convex_client.urlopen",
        Mock(side_effect=URLError("deployment unavailable")),
    )
    with pytest.raises(ConvexContractError, match="Could not reach Convex"):
        ConvexIngestClient("https://test.convex.site", "test-secret").require_deployed_contract()


def test_required_contract_matches_convex_source():
    source = (Path(__file__).resolve().parents[2] / "convex" / "ingestContract.ts").read_text(
        encoding="utf-8"
    )
    version = re.search(r"INGEST_CONTRACT_SCHEMA_VERSION = (\d+);", source)
    functions = re.search(r"functions: \[([^\]]+)\]", source)
    counts = re.search(r"declarationCounts: \[([^\]]+)\]", source)
    pending = re.search(r"activatePending: (true|false)", source)
    assert version is not None
    assert functions is not None
    assert counts is not None
    assert pending is not None
    assert int(version.group(1)) == REQUIRED_SCHEMA_VERSION
    assert re.findall(r'"([^"]+)"', functions.group(1)) == list(REQUIRED_FUNCTIONS)
    assert re.findall(r'"([^"]+)"', counts.group(1)) == list(REQUIRED_DECLARATION_COUNTS)
    assert pending.group(1) == "true"


def test_confirmed_activation_is_accepted_at_deadline(monkeypatch):
    clock = Mock(return_value=0)

    def activate(*args, **kwargs):
        clock.return_value = 3
        return {"pending": False, "datasetReleaseId": "new"}

    monkeypatch.setattr(ConvexIngestClient, "post", activate)
    monkeypatch.setattr("ingestion.convex_client.time.monotonic", clock)
    result = ConvexIngestClient("https://test.convex.site", "test-secret").activate_release(
        {"datasetReleaseId": "new"}, timeout_seconds=2
    )
    assert result["pending"] is False


def test_activation_propagates_failure(monkeypatch):
    monkeypatch.setattr(ConvexIngestClient, "post", Mock(side_effect=RuntimeError("unavailable")))
    with pytest.raises(RuntimeError, match="unavailable"):
        ConvexIngestClient("https://test.convex.site", "test-secret").activate_release(
            {"datasetReleaseId": "new"}
        )


def test_default_activation_survives_more_than_five_minutes(monkeypatch):
    post = Mock(side_effect=[{"pending": True}, {"pending": False, "datasetReleaseId": "large"}])
    monkeypatch.setattr(ConvexIngestClient, "post", post)
    monkeypatch.setattr("ingestion.convex_client.time.sleep", Mock())
    monkeypatch.setattr(
        "ingestion.convex_client.time.monotonic", Mock(side_effect=[0, 0, 301, 302])
    )
    assert (
        ConvexIngestClient("http://127.0.0.1:33311", "local").activate_release(
            {"datasetReleaseId": "large"}
        )["pending"]
        is False
    )
    assert post.call_count == 2
