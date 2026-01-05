from __future__ import annotations

import asyncio
import subprocess

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import Settings

_EXPECTED_TABLES = [
    "dataset_releases",
    "man_pages",
    "man_page_content",
    "man_page_search",
    "licenses",
]


async def _table_exists(conn, name: str) -> bool:
    res = await conn.execute(text("SELECT to_regclass(:table_name)"), {"table_name": f"public.{name}"})
    return res.scalar_one_or_none() is not None


async def _should_stamp_head() -> bool:
    settings = Settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    try:
        async with engine.connect() as conn:
            if await _table_exists(conn, "alembic_version"):
                return False

            existing = [await _table_exists(conn, table) for table in _EXPECTED_TABLES]
            return all(existing)
    finally:
        await engine.dispose()


def main() -> None:
    if asyncio.run(_should_stamp_head()):
        subprocess.check_call(["alembic", "stamp", "head"])

    subprocess.check_call(["alembic", "upgrade", "head"])


if __name__ == "__main__":
    main()
