from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter

router = APIRouter()


@router.get("/info")
async def get_info() -> dict[str, object]:
    return {
        "datasetReleaseId": "uninitialized",
        "locale": "en",
        "pageCount": 0,
        "lastUpdated": datetime.now(tz=UTC).isoformat(),
    }
