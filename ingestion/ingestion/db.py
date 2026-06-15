from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime


def iso_utc_now() -> str:
    return datetime.now(tz=UTC).isoformat()


def json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def uuid4() -> uuid.UUID:
    return uuid.uuid4()
