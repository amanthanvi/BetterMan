from __future__ import annotations

import time
from dataclasses import dataclass

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.errors import APIError
from app.core.logging import get_logger


@dataclass
class _Counter:
    count: int
    expires_at: float


_MEMORY_MAX_BUCKETS = 10_000
_memory_buckets: dict[str, _Counter] = {}
_memory_last_gc_at = 0.0


def _gc_memory_buckets(*, now: float) -> None:
    global _memory_last_gc_at

    # Avoid scanning the dict on every request.
    if now - _memory_last_gc_at < 5:
        return

    _memory_last_gc_at = now

    expired = [k for k, v in _memory_buckets.items() if v.expires_at <= now]
    for k in expired:
        _memory_buckets.pop(k, None)

    if len(_memory_buckets) > _MEMORY_MAX_BUCKETS:
        # Best-effort safety valve: keep bounded memory usage when Redis is down.
        for k in list(_memory_buckets.keys())[: len(_memory_buckets) - _MEMORY_MAX_BUCKETS]:
            _memory_buckets.pop(k, None)


def _enforce_in_memory_rate_limit(
    *, key: str, now_bucket: int, limit: int, window_seconds: int
) -> None:
    now = time.time()
    _gc_memory_buckets(now=now)

    bucket_key = f"rl:{key}:{now_bucket}"
    counter = _memory_buckets.get(bucket_key)
    if counter is None or counter.expires_at <= now:
        counter = _Counter(count=0, expires_at=(now_bucket + 1) * window_seconds)
        _memory_buckets[bucket_key] = counter

    counter.count += 1
    if counter.count > limit:
        raise APIError(status_code=429, code="RATE_LIMITED", message="Too many requests")


async def enforce_rate_limit(
    *,
    redis: Redis,
    key: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    logger = get_logger(action="rate_limit")
    now_bucket = int(time.time() / window_seconds)
    redis_key = f"rl:{key}:{now_bucket}"

    try:
        current = await redis.incr(redis_key)
        if current == 1:
            await redis.expire(redis_key, window_seconds)

        if current > limit:
            raise APIError(status_code=429, code="RATE_LIMITED", message="Too many requests")
    except APIError:
        raise
    except RedisError:
        logger.warning("redis_error_fallback_to_memory", key=key)
        _enforce_in_memory_rate_limit(
            key=key,
            now_bucket=now_bucket,
            limit=limit,
            window_seconds=window_seconds,
        )
