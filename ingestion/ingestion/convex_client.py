from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


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

    def post(self, path: str, payload: object) -> dict:
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
            with urlopen(req, timeout=120) as res:
                raw = res.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Convex ingest HTTP {exc.code}: {detail}") from exc
        except URLError as exc:
            raise RuntimeError(f"Convex ingest request failed: {exc.reason}") from exc

        if not raw:
            return {}
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise RuntimeError("Convex ingest response was not a JSON object")
        return data
