from __future__ import annotations

import json
import logging
import math
import os
import ssl
import time
from dataclasses import dataclass, field
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

logger = logging.getLogger("betterman.ingestion")

# Release, page, alias, and license posts are idempotent: the server returns
# the existing release for an identical manifest and skips rows it already
# stored, so a 5xx, 429, or transport failure is retried a bounded number of
# times. Generated-layer reads and content-hash upserts are idempotent too.
# Activation posts once; its caller owns the pending-hydration loop.
_RETRIED_PATHS = (
    "/ingest/release",
    "/ingest/pages",
    "/ingest/aliases",
    "/ingest/licenses",
    "/ingest/license-packages",
    "/ingest/generated",
)
_MAX_ATTEMPTS = 3
_RETRY_BACKOFF_SECONDS = 1.0


class ActivationPending(RuntimeError):
    pass


class ConvexContractError(RuntimeError):
    """The deployed Convex app does not satisfy this ingest client's contract."""


# Keep these aligned with convex/ingestContract.ts. Ingestion refuses to write
# until GET /ingest/contract advertises the same schema version, functions,
# declaration counts, and activate-pending flag. Alignment test:
# tests/test_ingest_contract.py. v6 retains v5 uploads and adds verified
# promotion-source reads and compare-and-swap promotion.
REQUIRED_SCHEMA_VERSION = 6
REQUIRED_FUNCTIONS = (
    "ingest.createRelease",
    "ingest.insertStoredPages",
    "ingest.insertLicensePackages",
    "ingest.insertAliases",
    "ingest.insertLicenses",
    "ingest.activateRelease",
    "ingest.getPromotionSource",
    "ingest.promoteActiveReleases",
)
REQUIRED_DECLARATION_COUNTS = ("pageCount", "aliasCount", "licenseCount", "providerCount")
_CONTRACT_PATH = "/ingest/contract"


def _contract_read_error(exc: BaseException) -> ConvexContractError:
    if isinstance(exc, TimeoutError):
        detail = f"timed out: {exc}"
    elif isinstance(exc, UnicodeDecodeError):
        detail = f"response was not UTF-8: {exc}"
    else:
        detail = str(exc)
    return ConvexContractError(
        "Could not read the deployed Convex ingest contract "
        f"({detail}). Deploy Convex before ingestion writes."
    )


def _http_error_detail(exc: HTTPError) -> str:
    try:
        return _clip(exc.read().decode("utf-8", errors="replace"))
    except (TimeoutError, UnicodeDecodeError, HTTPException, ConnectionError) as read_exc:
        raise _contract_read_error(read_exc) from read_exc


def _post_error_detail(exc: HTTPError) -> str:
    """Read an HTTP error body. A failed read does not change the status.

    Page uploads retry from the status code. IncompleteRead, a timeout, or a
    connection reset while reading a 5xx or 429 body must stay inside the
    retry loop.
    """
    try:
        return exc.read().decode("utf-8", errors="replace")
    except (TimeoutError, HTTPException, ConnectionError) as read_exc:
        return f"unreadable error body ({read_exc})"


def _clip(detail: str) -> str:
    text = " ".join(detail.split())
    if len(text) > 300:
        return text[:300] + "..."
    return text


def _contract_problems(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return ["response was not a JSON object"]
    problems: list[str] = []
    version = payload.get("schemaVersion")
    if type(version) is not int or version != REQUIRED_SCHEMA_VERSION:
        problems.append(f"schemaVersion {version!r} != {REQUIRED_SCHEMA_VERSION}")
    functions = payload.get("functions")
    if not isinstance(functions, list):
        problems.append("functions is missing")
    else:
        missing = [name for name in REQUIRED_FUNCTIONS if name not in functions]
        if missing:
            problems.append("missing functions: " + ", ".join(missing))
    counts = payload.get("declarationCounts")
    if not isinstance(counts, list):
        problems.append("declarationCounts is missing")
    else:
        missing_counts = [name for name in REQUIRED_DECLARATION_COUNTS if name not in counts]
        if missing_counts:
            problems.append("missing declaration counts: " + ", ".join(missing_counts))
    if payload.get("activatePending") is not True:
        problems.append("activatePending is not true")
    return problems


def _activation_pending(detail: str) -> bool:
    try:
        pending = json.loads(detail)
    except ValueError:
        return False
    return isinstance(pending, dict) and pending.get("pending") is True


def _json_object(raw: str) -> dict:
    if not raw:
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise RuntimeError("Convex ingest response was not a JSON object")
    return data


def encode_json(payload: object) -> bytes:
    """Serialize exactly the bytes post() sends, so callers can size batches."""
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def convex_http_url(raw: str) -> str:
    value = raw.strip().rstrip("/")
    if not value:
        raise ValueError("CONVEX_HTTP_URL or CONVEX_URL is required")
    if value.endswith(".convex.cloud"):
        return f"{value.removesuffix('.convex.cloud')}.convex.site"
    return value


DEFAULT_ACTIVATION_TIMEOUT_SECONDS = 45 * 60
MAX_ACTIVATION_TIMEOUT_SECONDS = 45 * 60


def activation_timeout_seconds() -> float:
    raw = os.environ.get(
        "BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS", str(DEFAULT_ACTIVATION_TIMEOUT_SECONDS)
    )
    try:
        value = float(raw)
    except ValueError:
        raise ValueError("BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS must be a number") from None
    if not 0 < value <= MAX_ACTIVATION_TIMEOUT_SECONDS:
        raise ValueError("BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS must be >0 and <=2700")
    return value


def ingest_activation_deadline() -> float | None:
    raw = os.environ.get("BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS")
    if raw is None:
        return None
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(
            "BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS must be a Unix timestamp"
        ) from None
    if not math.isfinite(value) or value <= 0:
        raise ValueError("BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS must be finite and positive")
    return value


@dataclass(frozen=True)
class ConvexIngestClient:
    http_url: str
    ingest_secret: str
    activation_timeout: float = field(default_factory=activation_timeout_seconds)
    activation_deadline: float | None = field(default_factory=ingest_activation_deadline)

    def __post_init__(self) -> None:
        if not 0 < self.activation_timeout <= MAX_ACTIVATION_TIMEOUT_SECONDS:
            raise ValueError("Activation timeout must be >0 and <=2700 seconds")
        if not self.ingest_secret.strip():
            raise ValueError("CONVEX_INGEST_SECRET is required")

    def require_deployed_contract(self) -> dict:
        """Read GET /ingest/contract and fail before any ingest write.

        A 404 means this client's functions are not deployed yet. A mismatched
        schema version, function list, declaration count, or activate-pending
        flag means the deployment is older or newer than this client. Either
        case raises ConvexContractError and must stop the run.
        """
        try:
            payload = self._get_json(_CONTRACT_PATH)
        except HTTPError as exc:
            if exc.code == 404:
                raise ConvexContractError(
                    "Deployed Convex does not advertise the ingest contract "
                    "(GET /ingest/contract returned 404). "
                    "Deploy Convex before ingestion writes."
                ) from exc
            if exc.code == 401:
                raise ConvexContractError(
                    "Convex rejected the ingest secret for GET /ingest/contract. "
                    "Ingestion will not write."
                ) from exc
            detail = _http_error_detail(exc)
            raise ConvexContractError(
                "Could not read the deployed Convex ingest contract "
                f"(HTTP {exc.code}: {detail}). Deploy Convex before ingestion writes."
            ) from exc
        except URLError as exc:
            raise ConvexContractError(
                "Could not reach Convex to verify the ingest contract "
                f"({exc.reason}). Deploy Convex before ingestion writes."
            ) from exc

        problems = _contract_problems(payload)
        if problems:
            raise ConvexContractError(
                "Deployed Convex ingest contract does not match this client: "
                + "; ".join(problems)
                + ". Deploy Convex before ingestion writes."
            )
        return payload

    def _get_json(self, path: str, *, timeout_seconds: float = 30) -> object:
        url = f"{convex_http_url(self.http_url)}/{path.lstrip('/')}"
        req = Request(
            url,
            method="GET",
            headers={
                "Authorization": f"Bearer {self.ingest_secret}",
                "Accept": "application/json",
            },
        )
        try:
            with urlopen(req, timeout=timeout_seconds) as res:
                try:
                    raw = res.read().decode("utf-8")
                except (TimeoutError, UnicodeDecodeError, HTTPException, ConnectionError) as exc:
                    raise _contract_read_error(exc) from exc
        except TimeoutError as exc:
            raise _contract_read_error(exc) from exc
        except (HTTPException, ConnectionError) as exc:
            raise _contract_read_error(exc) from exc
        if not raw:
            raise ConvexContractError(
                "Deployed Convex ingest contract response was empty. "
                "Deploy Convex before ingestion writes."
            )
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise ConvexContractError(
                "Deployed Convex ingest contract response was not JSON. "
                "Deploy Convex before ingestion writes."
            ) from exc

    def activate_release(self, payload: dict, *, timeout_seconds: float | None = None) -> dict:
        if timeout_seconds is None:
            timeout_seconds = self.activation_timeout
        if not 0 < timeout_seconds <= MAX_ACTIVATION_TIMEOUT_SECONDS:
            raise ValueError("Activation timeout must be >0 and <=2700 seconds")
        # The matrix records this absolute deadline before checkout/setup,
        # including Docker/VM acquisition and parse/upload in the job budget.
        if self.activation_deadline is not None:
            timeout_seconds = min(timeout_seconds, self.activation_deadline - time.time())
            if timeout_seconds <= 0:
                raise RuntimeError(
                    "Ingestion job budget exhausted before activation; "
                    f"release {payload.get('datasetReleaseId')} remains resumable. "
                    "Use the activate command with the same release ID and stage."
                )
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
        raise RuntimeError(
            "Release activation did not finish within the hydration deadline; "
            f"release {payload.get('datasetReleaseId')} remains sealed and resumable. "
            "Use the activate command with the same release ID and stage; do not re-ingest."
        )

    def post(self, path: str, payload: object, *, timeout_seconds: float = 120) -> dict:
        url = f"{convex_http_url(self.http_url)}/{path.lstrip('/')}"
        req = Request(
            url,
            data=encode_json(payload),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.ingest_secret}",
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
            },
        )

        attempts = _MAX_ATTEMPTS if path.startswith(_RETRIED_PATHS) else 1
        for attempt in range(1, attempts + 1):
            try:
                with urlopen(req, timeout=timeout_seconds) as res:
                    raw = res.read().decode("utf-8")
                result = _json_object(raw)
            except HTTPError as exc:
                detail = _post_error_detail(exc)
                if exc.code == 409 and path == "/ingest/activate" and _activation_pending(detail):
                    raise ActivationPending("Related metadata hydration is pending") from exc
                cause = exc
                retryable = exc.code >= 500 or exc.code == 429
                error = RuntimeError(f"Convex ingest HTTP {exc.code}: {detail}")
            except URLError as exc:
                cause, retryable = exc, True
                error = RuntimeError(f"Convex ingest request failed: {exc.reason}")
            except (
                TimeoutError,
                HTTPException,
                ConnectionError,
                ssl.SSLError,
                UnicodeDecodeError,
                json.JSONDecodeError,
            ) as exc:
                cause, retryable = exc, True
                error = RuntimeError(f"Convex ingest request failed: {exc}")
            else:
                return result
            if not retryable or attempt == attempts:
                raise error from cause
            logger.warning("Convex ingest %s attempt %d failed, retrying: %s", path, attempt, error)
            time.sleep(_RETRY_BACKOFF_SECONDS * attempt)
