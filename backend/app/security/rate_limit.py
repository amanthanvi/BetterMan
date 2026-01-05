from __future__ import annotations

import time

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.errors import APIError
from app.core.logging import get_logger


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
        logger.warning("redis_error_allowing_request", key=key)
