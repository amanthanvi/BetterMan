from __future__ import annotations

import io
import json
from email.message import Message
from urllib.error import HTTPError, URLError

import pytest

from ingestion.generated.provider import (
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    OpenAICompatibleProvider,
    ProviderConfig,
    ProviderError,
    RecordedProvider,
    TransientProviderError,
    UsageLimitExceeded,
    parse_completion,
)

KEY = "sk-test-not-a-real-key"
MESSAGES = [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}]


def completion(text: str = "{}", **extra) -> dict:
    return {
        "choices": [{"message": {"content": text}}],
        "usage": {"prompt_tokens": 1000, "completion_tokens": 300},
        **extra,
    }


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code: int, body: str = "", retry_after: str | None = None) -> HTTPError:
    headers = Message()
    if retry_after is not None:
        headers["Retry-After"] = retry_after
    return HTTPError("https://example.test", code, "error", headers, io.BytesIO(body.encode()))


class Opener:
    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return FakeResponse(json.dumps(outcome).encode())


def provider(opener, **config):
    return OpenAICompatibleProvider(ProviderConfig(api_key=KEY, **config), opener=opener)


def test_config_reads_env_and_never_shows_the_key():
    config = ProviderConfig.from_env({"OPENCODE_GO_API_KEY": f" {KEY} "})
    assert config.api_key == KEY
    assert config.base_url == DEFAULT_BASE_URL
    assert config.model == DEFAULT_MODEL == "deepseek-v4.1-flash"
    assert KEY not in repr(config)
    swapped = ProviderConfig.from_env(
        {
            "BETTERMAN_GEN_API_KEY": "other",
            "BETTERMAN_GEN_BASE_URL": "https://api.example.test/v1/",
            "BETTERMAN_GEN_MODEL": "some-model",
            "BETTERMAN_GEN_PROVIDER": "example",
        }
    )
    assert (swapped.base_url, swapped.model, swapped.provider) == (
        "https://api.example.test/v1",
        "some-model",
        "example",
    )
    assert not ProviderConfig.from_env({}).has_key


def test_requires_a_key():
    with pytest.raises(ProviderError):
        OpenAICompatibleProvider(ProviderConfig())


def test_sends_an_openai_compatible_json_request():
    opener = Opener(completion('{"summary": "x"}', opencode={"allowance": 0.0004}))
    result = provider(opener).send(MESSAGES, max_tokens=700)
    request, timeout = opener.requests[0]
    body = json.loads(request.data)
    assert request.full_url == f"{DEFAULT_BASE_URL}/chat/completions"
    assert body["model"] == DEFAULT_MODEL
    assert body["response_format"] == {"type": "json_object"}
    assert body["max_tokens"] == 700
    assert request.get_header("Authorization") == f"Bearer {KEY}"
    assert request.get_header("User-agent").startswith("betterman-generated-layer/")
    assert len(request.get_header("X-opencode-session")) == 32
    assert timeout == 60.0
    assert result.text == '{"summary": "x"}'
    assert (result.prompt_tokens, result.completion_tokens, result.billed_usd) == (
        1000,
        300,
        0.0004,
    )


@pytest.mark.parametrize(
    ("error", "retry_after"),
    [
        (http_error(503), None),
        (http_error(429, "slow down", retry_after="7"), 7.0),
        (http_error(408), None),
        (URLError("reset"), None),
        (TimeoutError(), None),
    ],
)
def test_transient_failures_are_one_attempt_marked_retryable(error, retry_after):
    opener = Opener(error, completion())
    with pytest.raises(TransientProviderError) as excinfo:
        provider(opener).send(MESSAGES, max_tokens=10)
    assert excinfo.value.retry_after == retry_after
    assert len(opener.requests) == 1  # the caller retries, through the governor


def test_usage_limit_is_its_own_error():
    opener = Opener(http_error(429, '{"error":"Go usage limit exceeded"}'), completion())
    with pytest.raises(UsageLimitExceeded):
        provider(opener).send(MESSAGES, max_tokens=10)
    assert len(opener.requests) == 1


def test_client_errors_are_final_and_do_not_echo_the_key():
    opener = Opener(http_error(400, "bad request"), completion())
    with pytest.raises(ProviderError) as excinfo:
        provider(opener).send(MESSAGES, max_tokens=10)
    assert KEY not in str(excinfo.value)
    assert len(opener.requests) == 1


def test_parse_completion_rejects_malformed_payloads():
    with pytest.raises(ProviderError):
        parse_completion({"choices": []})
    with pytest.raises(ProviderError):
        parse_completion([])
    cached = parse_completion(
        completion(
            usage={
                "prompt_tokens": 10,
                "completion_tokens": 2,
                "prompt_tokens_details": {"cached_tokens": 4},
            }
        )
    )
    assert cached.cached_tokens == 4
    assert cached.billed_usd is None
    assert cached.usage_reported
    bare = parse_completion({"choices": [{"message": {"content": "{}"}}]})
    assert not bare.usage_reported and bare.prompt_tokens == 0


def test_recorded_provider_replays_by_prompt():
    recorded = RecordedProvider({RecordedProvider.key(MESSAGES): completion("ok")})
    assert recorded.send(MESSAGES, max_tokens=1).text == "ok"
    with pytest.raises(ProviderError):
        recorded.send([{"role": "user", "content": "other"}], max_tokens=1)
