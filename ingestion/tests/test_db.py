from __future__ import annotations

import pytest

from ingestion.db import parse_postgres_dsn


def test_parse_postgres_dsn_accepts_postgres_scheme() -> None:
    dsn = parse_postgres_dsn("postgres://u:p@localhost:5433/db")
    assert dsn.user == "u"
    assert dsn.password == "p"
    assert dsn.host == "localhost"
    assert dsn.port == 5433
    assert dsn.database == "db"


def test_parse_postgres_dsn_strips_leading_noise() -> None:
    dsn = parse_postgres_dsn("some noise postgresql+asyncpg://u:p@h/db")
    assert dsn.user == "u"
    assert dsn.host == "h"
    assert dsn.port == 5432
    assert dsn.database == "db"


@pytest.mark.parametrize(
    ("database_url", "match"),
    [
        ("http://u:p@h/db", "DATABASE_URL must start"),
        ("postgresql://@h/db", "missing username"),
        ("postgresql://u@h/db", "missing password"),
        ("postgresql://u:p@/db", "missing hostname"),
        ("postgresql://u:p@h/", "missing database"),
    ],
)
def test_parse_postgres_dsn_rejects_invalid(database_url: str, match: str) -> None:
    with pytest.raises(ValueError, match=match):
        parse_postgres_dsn(database_url)
