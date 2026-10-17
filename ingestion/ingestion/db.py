from __future__ import annotations

import json
from datetime import UTC, datetime


def iso_utc_now() -> str:
    return datetime.now(tz=UTC).isoformat()


def json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
