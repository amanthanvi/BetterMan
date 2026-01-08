import pytest
from redis.exceptions import RedisError

from app.core.errors import APIError
from app.security import rate_limit


class _BrokenRedis:
    async def incr(self, *_args, **_kwargs):
        raise RedisError("boom")

    async def expire(self, *_args, **_kwargs):
        raise AssertionError("expire() should not be called when incr() fails")


async def test_rate_limit_falls_back_to_memory(monkeypatch) -> None:
    monkeypatch.setattr(rate_limit.time, "time", lambda: 1_700_000_000.0)
    rate_limit._memory_buckets.clear()

    redis = _BrokenRedis()

    await rate_limit.enforce_rate_limit(redis=redis, key="ip:1.2.3.4", limit=2, window_seconds=60)
    await rate_limit.enforce_rate_limit(redis=redis, key="ip:1.2.3.4", limit=2, window_seconds=60)

    with pytest.raises(APIError) as excinfo:
        await rate_limit.enforce_rate_limit(
            redis=redis,
            key="ip:1.2.3.4",
            limit=2,
            window_seconds=60,
        )
    assert excinfo.value.status_code == 429
