"""A provider-swappable OpenAI-compatible chat client.

Base URL, model and key come from the environment, so moving from OpenCode Go
to another compatible endpoint is configuration. Changing provider is a spend
change that needs owner sign-off (docs/generated-layer.md).
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import ssl
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "https://opencode.ai/inference/go/openai/v1"
DEFAULT_MODEL = "deepseek-v4.1-flash"
DEFAULT_PROVIDER = "opencode-go"
USER_AGENT = "betterman-generated-layer/1 (+https://github.com/amanthanvi/BetterMan)"
_USAGE_LIMIT_MARKERS = ("usage limit", "limit exceeded", "quota")


class ProviderError(RuntimeError):
    pass


class TransientProviderError(ProviderError):
    """Timeouts, transport failures, 408/409/429 and 5xx: worth another attempt."""

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


class UsageLimitExceeded(ProviderError):
    """The provider refused for quota, not for a transient fault. Do not retry."""


@dataclass(frozen=True)
class ProviderConfig:
    base_url: str = DEFAULT_BASE_URL
    model: str = DEFAULT_MODEL
    provider: str = DEFAULT_PROVIDER
    api_key: str = field(default="", repr=False)
    timeout_seconds: float = 60.0
    max_attempts: int = 4
    backoff_seconds: float = 2.0

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> ProviderConfig:
        env = os.environ if env is None else env
        key = env.get("BETTERMAN_GEN_API_KEY") or env.get("OPENCODE_GO_API_KEY") or ""
        return cls(
            base_url=(env.get("BETTERMAN_GEN_BASE_URL") or DEFAULT_BASE_URL).rstrip("/"),
            model=env.get("BETTERMAN_GEN_MODEL") or DEFAULT_MODEL,
            provider=env.get("BETTERMAN_GEN_PROVIDER") or DEFAULT_PROVIDER,
            api_key=key.strip(),
            timeout_seconds=float(env.get("BETTERMAN_GEN_TIMEOUT_SECONDS") or 60),
            max_attempts=max(1, int(env.get("BETTERMAN_GEN_MAX_ATTEMPTS") or 4)),
        )

    @property
    def has_key(self) -> bool:
        return bool(self.api_key)


@dataclass(frozen=True)
class Completion:
    text: str
    prompt_tokens: int
    completion_tokens: int
    cached_tokens: int = 0
    # What the provider says the request counted against its allowance, in USD.
    billed_usd: float | None = None
    # False when the response had no usage block; the caller charges the worst case.
    usage_reported: bool = True
    finish_reason: str = "unknown"
    content_shape: str = "unknown"


class Provider:
    config: ProviderConfig

    def send(self, messages: list[dict[str, str]], *, max_tokens: int) -> Completion:
        """Exactly one HTTP attempt. Retrying is the caller's job, so each
        attempt can pass the budget governor."""
        raise NotImplementedError


def _usage_limit(status: int, body: str) -> bool:
    lowered = body.lower()
    return status in {402, 403, 429} and any(marker in lowered for marker in _USAGE_LIMIT_MARKERS)


def _billed(payload: Mapping[str, object]) -> float | None:
    allowance = payload.get("opencode")
    if isinstance(allowance, Mapping):
        allowance = allowance.get("allowance")
    if isinstance(allowance, Mapping):
        allowance = allowance.get("usd", allowance.get("cost"))
    # A real number only: not a bool, NaN, an infinity, a string or negative.
    if (
        isinstance(allowance, int | float)
        and not isinstance(allowance, bool)
        and math.isfinite(allowance)
        and allowance >= 0
    ):
        return float(allowance)
    return None


def parse_completion(payload: object) -> Completion:
    if not isinstance(payload, Mapping):
        raise ProviderError("completion response is not a JSON object")
    try:
        choice = payload["choices"][0]
        message = choice["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError("completion response has no message content") from exc
    if not isinstance(choice, Mapping) or not isinstance(message, Mapping):
        raise ProviderError("completion response has no message content")
    text = message.get("content")
    if text is None:
        text = ""
    if not isinstance(text, str):
        raise ProviderError("completion content is not text")
    reason = choice.get("finish_reason")
    if not isinstance(reason, str) or reason not in {
        "stop",
        "length",
        "content_filter",
        "tool_calls",
        "insufficient_system_resource",
        "aborted",
    }:
        reason = "unknown"
    stripped = text.strip()
    if not stripped:
        shape = (
            "empty_with_reasoning"
            if isinstance(message.get("reasoning_content"), str)
            and message["reasoning_content"].strip()
            else "empty"
        )
    elif stripped.startswith("```"):
        shape = "fenced"
    elif stripped.startswith("{"):
        shape = "object_start"
    elif "{" in stripped:
        shape = "text_before_object"
    else:
        shape = "other"
    usage = _usage(payload.get("usage"))
    return Completion(
        text=text,
        prompt_tokens=usage[0] if usage else 0,
        completion_tokens=usage[1] if usage else 0,
        cached_tokens=usage[2] if usage else 0,
        billed_usd=_billed(payload),
        usage_reported=usage is not None,
        finish_reason=reason,
        content_shape=shape,
    )


def _count(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
        return value
    return None


def _usage(usage: object) -> tuple[int, int, int] | None:
    """(prompt, completion, cached) tokens, or None unless the block is complete.

    Both `prompt_tokens` and `completion_tokens` must be non-negative integers;
    `total_tokens`, when present, must be their sum. Anything else is treated
    as unreported and charged the worst case. A malformed cached count only
    loses the cache discount.
    """
    if not isinstance(usage, Mapping):
        return None
    prompt = _count(usage.get("prompt_tokens"))
    completion = _count(usage.get("completion_tokens"))
    if prompt is None or completion is None:
        return None
    if "total_tokens" in usage and _count(usage["total_tokens"]) != prompt + completion:
        return None
    details = usage.get("prompt_tokens_details")
    cached = _count(details.get("cached_tokens")) if isinstance(details, Mapping) else None
    return prompt, completion, min(cached or 0, prompt)


class OpenAICompatibleProvider(Provider):
    def __init__(self, config: ProviderConfig, *, opener: Callable[..., object] = urlopen) -> None:
        if not config.has_key:
            raise ProviderError("no generation API key is configured")
        self.config = config
        self._open = opener
        # Go asks clients for a stable session id per conversation; each
        # page is its own conversation, keyed by this run.
        self._run = uuid.uuid4().hex

    def send(self, messages: list[dict[str, str]], *, max_tokens: int) -> Completion:
        body = json.dumps(
            {
                "model": self.config.model,
                "messages": messages,
                "temperature": 0.2,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
            }
        ).encode()
        session = hashlib.sha256((self._run + messages[-1]["content"]).encode()).hexdigest()[:32]
        request = Request(
            f"{self.config.base_url}/chat/completions",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {self.config.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
                "x-opencode-session": session,
            },
        )
        try:
            with self._open(request, timeout=self.config.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = _read_error(exc)
            if _usage_limit(exc.code, detail):
                raise UsageLimitExceeded(f"HTTP {exc.code}") from None
            if exc.code in {408, 409, 429} or exc.code >= 500:
                raise TransientProviderError(f"HTTP {exc.code}", _retry_after(exc)) from None
            raise ProviderError(f"HTTP {exc.code}") from None
        except (URLError, TimeoutError, HTTPException, ConnectionError, ssl.SSLError) as exc:
            raise TransientProviderError(f"request failed: {type(exc).__name__}") from None
        except (ValueError, UnicodeDecodeError):
            raise TransientProviderError("response was not JSON") from None
        return parse_completion(payload)


def _read_error(exc: HTTPError) -> str:
    try:
        return exc.read().decode("utf-8", errors="replace")
    except (TimeoutError, HTTPException, ConnectionError, OSError):
        return ""


def _retry_after(exc: HTTPError) -> float | None:
    value = exc.headers.get("Retry-After") if exc.headers else None
    try:
        return max(0.0, float(value)) if value is not None else None
    except ValueError:
        return None


class RecordedProvider(Provider):
    """Replays recorded responses keyed by the prompt; for tests and offline runs."""

    def __init__(self, responses: Mapping[str, object], config: ProviderConfig | None = None):
        self.config = config or ProviderConfig(provider="recorded", model="recorded")
        self._responses = responses
        self.calls: list[list[dict[str, str]]] = []

    @staticmethod
    def key(messages: list[dict[str, str]]) -> str:
        return hashlib.sha256(json.dumps(messages, sort_keys=True).encode()).hexdigest()

    def send(self, messages: list[dict[str, str]], *, max_tokens: int) -> Completion:
        self.calls.append(messages)
        response = self._responses.get(self.key(messages))
        if response is None:
            raise ProviderError("no recorded response for this prompt")
        if isinstance(response, Exception):
            raise response
        return parse_completion(response)
