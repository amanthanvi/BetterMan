from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlparse

import pg8000.dbapi


@dataclass(frozen=True)
class PostgresDsn:
    user: str
    password: str
    host: str
    port: int
    database: str


def parse_postgres_dsn(database_url: str) -> PostgresDsn:
    url = database_url.strip()
    url = url.replace("postgresql+asyncpg://", "postgresql://", 1)

    parsed = urlparse(url)
    if parsed.scheme not in {"postgresql", "postgres"}:
        raise ValueError("DATABASE_URL must start with postgresql:// or postgres://")

    if not parsed.hostname:
        raise ValueError("DATABASE_URL missing hostname")
    if not parsed.username:
        raise ValueError("DATABASE_URL missing username")
    if parsed.password is None:
        raise ValueError("DATABASE_URL missing password")
    if not parsed.path or parsed.path == "/":
        raise ValueError("DATABASE_URL missing database name")

    return PostgresDsn(
        user=parsed.username,
        password=parsed.password,
        host=parsed.hostname,
        port=parsed.port or 5432,
        database=parsed.path.lstrip("/"),
    )


def connect(database_url: str) -> pg8000.dbapi.Connection:
    dsn = parse_postgres_dsn(database_url)
    return pg8000.dbapi.connect(
        user=dsn.user,
        password=dsn.password,
        host=dsn.host,
        port=dsn.port,
        database=dsn.database,
    )


def iso_utc_now() -> str:
    return datetime.now(tz=UTC).isoformat()


def json_dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def uuid4() -> uuid.UUID:
    return uuid.uuid4()
