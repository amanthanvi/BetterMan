from __future__ import annotations

import http.client
import json
import random
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Batch uploads are idempotent server-side (the server skips already-stored
# content), so transient failures may be retried. Release creation and
# activation keep their single-attempt semantics.
_IDEMPOTENT_PREFIXES = ("/ingest/pages", "/ingest/aliases", "/ingest/licenses")
_MAX_ATTEMPTS = 3


class ActivationPending(RuntimeError):
    pass


def convex_http_url(raw: str) -> str:
    value = raw.strip().rstrip("/")
    if not value:
        raise ValueError("CONVEX_HTTP_URL or CONVEX_URL is required")
    if value.endswith(".convex.cloud"):
        return f"{value.removesuffix('.convex.cloud')}.convex.site"
    return value


@dataclass(frozen=True)
class ConvexIngestClient:
    http_url: str
    ingest_secret: str

    def __post_init__(self) -> None:
        if not self.ingest_secret.strip():
            raise ValueError("CONVEX_INGEST_SECRET is required")

    def activate_release(self, payload: dict, *, timeout_seconds: float = 300) -> dict:
        deadline = time.monotonic() + timeout_seconds
        while (remaining := deadline - time.monotonic()) > 0:
            try:
                result = self.post("/ingest/activate", payload, timeout_seconds=min(120, remaining))
            except ActivationPending:
                result = {"pending": True}
            if result.get("pending") is False:
                if result.get("datasetReleaseId") != payload.get("datasetReleaseId"):
                    raise RuntimeError("Activation returned a different release")
                return result
            if result.get("pending") is not True:
                raise RuntimeError("Activation response is missing readiness status")
            time.sleep(min(2, max(0, deadline - time.monotonic())))
        raise RuntimeError("Release activation did not finish within the hydration deadline")

    def post(self, path: str, payload: object, *, timeout_seconds: float = 120) -> dict:
        attempts = _MAX_ATTEMPTS if path.startswith(_IDEMPOTENT_PREFIXES) else 1
        for attempt in range(1, attempts + 1):
            if attempt > 1:
                # Bounded backoff with jitter: 0.5s, 1s (+ up to 0.25s).
                time.sleep(0.5 * (2 ** (attempt - 2)) + random.uniform(0, 0.25))
            try:
                return self._post_once(path, payload, timeout_seconds=timeout_seconds)
            except _TransientPostError as exc:
                if attempt == attempts:
                    raise exc.final from exc
        raise AssertionError("unreachable")

    def _post_once(self, path: str, payload: object, *, timeout_seconds: float = 120) -> dict:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        url = f"{convex_http_url(self.http_url)}/{path.lstrip('/')}"
        req = Request(
            url,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.ingest_secret}",
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
            },
        )

        try:
            with urlopen(req, timeout=timeout_seconds) as res:
                raw = res.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            if exc.code == 409 and path == "/ingest/activate":
                try:
                    pending = json.loads(detail)
                except ValueError:
                    pending = None
                if isinstance(pending, dict) and pending.get("pending") is True:
                    raise ActivationPending("Related metadata hydration is pending") from exc
            error: RuntimeError = RuntimeError(f"Convex ingest HTTP {exc.code}: {detail}")
            if exc.code >= 500:
                raise _TransientPostError(error) from exc
            raise error from exc
        except URLError as exc:
            error = RuntimeError(f"Convex ingest request failed: {exc.reason}")
            raise _TransientPostError(error) from exc
        except (TimeoutError, ConnectionError, http.client.IncompleteRead) as exc:
            # Response-level transport failures (socket timeouts surface as
            # plain TimeoutError, disconnects as ConnectionError subclasses,
            # truncated bodies as IncompleteRead) — transient and retryable on
            # idempotent paths.
            error = RuntimeError(f"Convex ingest transport failed: {exc}")
            raise _TransientPostError(error) from exc

        if not raw:
            return {}
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise RuntimeError("Convex ingest response was not a JSON object")
        return data


class _TransientPostError(Exception):
    """A retryable post failure; `final` is the RuntimeError surfaced after retries."""

    def __init__(self, final: RuntimeError) -> None:
        super().__init__(str(final))
        self.final = final
