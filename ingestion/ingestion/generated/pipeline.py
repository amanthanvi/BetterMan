"""Assemble one page's generated-layer record.

Order of sources: the page's own EXAMPLES, then tldr-pages, then generated
examples only for the remaining gap. Generated examples must pass the same
flag verifier as tldr; failures are dropped and the model is asked again once.
"""

from __future__ import annotations

import json
import random
import re
import threading
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path

from ingestion.generated.budget import BudgetGovernor, token_cost
from ingestion.generated.flags import (
    invocations_for,
    simple_invocation_problems,
    verify_command,
)
from ingestion.generated.page import PageInput, page_examples
from ingestion.generated.prompt import PROMPT_VERSION, build_messages, parse_response
from ingestion.generated.provider import (
    Completion,
    Provider,
    ProviderError,
    TransientProviderError,
    UsageLimitExceeded,
)
from ingestion.generated.safety import has_forbidden_chars, is_destructive
from ingestion.generated.tldr import Example, TldrIndex, TldrResult, tldr_examples

TARGET_EXAMPLES = 3
MAX_EXAMPLES = 5
# Destructive or remote-execution shapes a generated example must never show.
_UNSAFE = re.compile(
    r"rm\s+-[a-z]*r[a-z]*f?\s+/(?:\s|$)|\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b|mkfs|of=/dev/|:\(\)\s*\{"
)


@dataclass
class Deterministic:
    page_examples: list[Example]
    page_flags: Counter[str]
    tldr: TldrResult | None
    tldr_commit: str | None
    tldr_title: list[str] | None

    @property
    def example_count(self) -> int:
        return len(self.page_examples) + (len(self.tldr.examples) if self.tldr else 0)

    def commands(self) -> list[str]:
        tldr = self.tldr.examples if self.tldr else []
        return [example.command for example in [*self.page_examples, *tldr]]


def deterministic(page: PageInput, tldr: TldrIndex | None) -> Deterministic:
    examples, flags = page_examples(page)
    result = None
    title = None
    tldr_page = (
        tldr.lookup(distro=page.distro, name=page.name, section=page.section) if tldr else None
    )
    if tldr_page is not None:
        title = tldr_page.title.split()
        result = tldr_examples(tldr_page, name=page.name, table=page.table)
    return Deterministic(
        page_examples=examples,
        page_flags=flags,
        tldr=result,
        tldr_commit=tldr.commit if tldr and tldr_page else None,
        tldr_title=title,
    )


def generation_allowed(page: PageInput) -> bool:
    """Destructive commands (rm, dd, mkfs, ...) get no model text at all."""
    return not is_destructive(page.name)


def examples_needed(page: PageInput, det: Deterministic, target: int = TARGET_EXAMPLES) -> int:
    """Generated examples fill the gap to `target`, only when there is an options table."""
    if not page.table or not generation_allowed(page):
        return 0
    return max(0, target - det.example_count)


@dataclass
class GeneratedPart:
    provider: str
    model: str
    prompt_version: str
    generated_at: str
    summary: str | None
    examples: list[Example]
    task_phrases: list[str]
    rejected: int
    prompt_tokens: int = 0
    completion_tokens: int = 0
    usd: float = 0.0

    def to_json(self) -> dict:
        data: dict = {
            "provider": self.provider,
            "model": self.model,
            "promptVersion": self.prompt_version,
            "generatedAt": self.generated_at,
            "examples": [example.to_json() for example in self.examples],
            "taskPhrases": self.task_phrases,
            "rejected": self.rejected,
        }
        if self.summary:
            data["summary"] = self.summary
        return data

    @classmethod
    def from_json(cls, data: dict) -> GeneratedPart:
        return cls(
            provider=data["provider"],
            model=data["model"],
            prompt_version=data["promptVersion"],
            generated_at=data["generatedAt"],
            summary=data.get("summary"),
            examples=[
                Example(
                    e["description"], e["command"], tuple(map(tuple, e.get("placeholders", [])))
                )
                for e in data.get("examples", [])
            ],
            task_phrases=list(data.get("taskPhrases", [])),
            rejected=int(data.get("rejected", 0)),
        )


@dataclass
class GenerationStats:
    requests: int = 0
    rejected_examples: Counter[str] = field(default_factory=Counter)
    invalid_responses: Counter[str] = field(default_factory=Counter)
    failed_pages: int = 0
    finish_reasons: Counter[str] = field(default_factory=Counter)
    content_shapes: Counter[str] = field(default_factory=Counter)


def _estimate_tokens(messages: list[dict[str, str]]) -> int:
    return sum(len(message["content"]) for message in messages) // 4 + 16


class Generator:
    def __init__(
        self,
        provider: Provider,
        governor: BudgetGovernor,
        *,
        max_output_tokens: int = 2048,
        max_attempts: int = 2,
        today: Callable[[], str] = lambda: datetime.now(UTC).date().isoformat(),
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.provider = provider
        self.governor = governor
        self.max_output_tokens = max_output_tokens
        self.max_attempts = max_attempts
        self.today = today
        self._sleep = sleep
        self.stats = GenerationStats()
        self._stats_lock = threading.Lock()

    def _count(self, field_name: str, key: str | None = None) -> None:
        with self._stats_lock:
            if key is None:
                setattr(self.stats, field_name, getattr(self.stats, field_name) + 1)
            else:
                getattr(self.stats, field_name)[key] += 1

    def _request(self, messages: list[dict[str, str]]) -> Completion | None:
        """One logical request. Every HTTP attempt, retries included, passes the
        governor (budget and requests per minute) and is charged.

        Anything but a successful response with valid usage is charged its
        worst case: the prompt estimate plus max_tokens at the peak list price.
        Raises BudgetPaused.
        """
        worst = token_cost(_estimate_tokens(messages), self.max_output_tokens, peak=True)
        attempts = max(1, self.provider.config.max_attempts)
        for attempt in range(1, attempts + 1):
            self.governor.acquire(worst)
            self._count("requests")
            # Once sent, an attempt is recorded exactly once, in `finally`,
            # whatever happens next, so its reservation is always released.
            # Only a successful response with valid usage may cost less than
            # the worst case; Go's reported allowance may then replace the
            # computed cost. Refusals, failures and bad usage pay the worst case.
            charge = worst
            completion: Completion | None = None
            delay: float | None = None
            try:
                completion = self.provider.send(messages, max_tokens=self.max_output_tokens)
                if completion.usage_reported:
                    charge = self.governor.cost(
                        completion.prompt_tokens,
                        completion.completion_tokens,
                        completion.cached_tokens,
                    )
                    if completion.billed_usd is not None:
                        charge = completion.billed_usd
            except UsageLimitExceeded:
                raise self.governor.provider_limit() from None
            except TransientProviderError as exc:
                # A timed-out or failed attempt may still have been billed.
                self._count("invalid_responses", f"provider: {exc}"[:80])
                if attempt < attempts:
                    delay = exc.retry_after
                    if delay is None:
                        delay = self.provider.config.backoff_seconds * 2 ** (attempt - 1)
                        delay += random.uniform(0, 1)
            except ProviderError as exc:
                self._count("invalid_responses", f"provider: {exc}"[:80])
                return None
            finally:
                self.governor.record(charge, reserved=worst)
            if completion is not None:
                return replace(completion, billed_usd=charge)
            if delay is not None:
                self._sleep(min(delay, 120.0))
        return None

    def generate(self, page: PageInput, det: Deterministic) -> GeneratedPart | None:
        """Raises BudgetPaused when the governor or provider stops the run."""
        if not generation_allowed(page):
            return None
        need = examples_needed(page, det)
        invocations = invocations_for(page.name, det.tldr_title)
        invocation = " ".join(invocations[0])
        seen = {" ".join(command.split()) for command in det.commands()}
        accepted: list[Example] = []
        summary: str | None = None
        phrases: list[str] = []
        notes: list[str] = []
        rejected = 0
        part = GeneratedPart(
            provider=self.provider.config.provider,
            model=self.provider.config.model,
            prompt_version=PROMPT_VERSION,
            generated_at=self.today(),
            summary=None,
            examples=[],
            task_phrases=[],
            rejected=0,
        )
        for _ in range(self.max_attempts):
            remaining = need - len(accepted)
            # Ask for two spare examples to absorb verifier rejections.
            requested = min(MAX_EXAMPLES, remaining + 2) if remaining > 0 else 0
            messages = build_messages(
                page,
                invocation=invocation,
                example_count=requested,
                avoid=sorted(seen)[:5],
                rejected=notes,
            )
            completion = self._request(messages)
            if completion is None:
                continue
            part.prompt_tokens += completion.prompt_tokens
            part.completion_tokens += completion.completion_tokens
            part.usd += completion.billed_usd or 0.0
            self._count("finish_reasons", completion.finish_reason)
            self._count("content_shapes", completion.content_shape)
            parsed = parse_response(completion.text, name=page.name)
            for problem in parsed.problems:
                if problem == "response is not JSON":
                    problem = (
                        f"{problem} (finish_reason={completion.finish_reason}, "
                        f"content_shape={completion.content_shape})"
                    )
                self._count("invalid_responses", problem)
            summary = summary or parsed.summary
            phrases = phrases or parsed.task_phrases
            notes = []
            for description, command in parsed.examples if remaining > 0 else []:
                key = " ".join(command.split())
                if key in seen:
                    continue
                # One simple invocation of this page's command, nothing else.
                problems = simple_invocation_problems(command, invocations)
                check = verify_command(command, invocations=invocations, table=page.table)
                problems.extend(p for p in check.problems if p not in problems)
                if _UNSAFE.search(command):
                    problems.append("unsafe command")
                if has_forbidden_chars(command) or has_forbidden_chars(description):
                    problems.append("control characters")
                if problems:
                    rejected += 1
                    notes.extend(problems)
                    for problem in problems:
                        self._count("rejected_examples", _reason(problem))
                    continue
                seen.add(key)
                if len(accepted) < need:
                    accepted.append(Example(description=description, command=command))
            if summary and phrases and len(accepted) >= need:
                break
            if not notes and parsed.problems:
                notes = parsed.problems
        if not summary and not phrases and not accepted:
            self._count("failed_pages")
            return None
        part.summary = summary
        part.examples = accepted
        part.task_phrases = phrases
        part.rejected = rejected
        return part


def _reason(problem: str) -> str:
    if problem.startswith("unknown flag"):
        return "unknown flag"
    if problem.startswith(("does not run", "does not start with")):
        return "does not run the command"
    if problem.startswith("wrapper prefix"):
        return "wrapper prefix"
    return problem


MAX_FLAG_USAGE_ROWS = 64


def flag_usage(counts: Counter[str]) -> list[dict]:
    top = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:MAX_FLAG_USAGE_ROWS]
    return [{"flag": flag, "count": count} for flag, count in sorted(top)]


def build_record(
    page: PageInput,
    det: Deterministic,
    generated: GeneratedPart | None,
    *,
    tldr_commit: str | None = None,
) -> dict:
    """The upsert payload for /ingest/generated, keyed by content hash.

    `tldr_commit` records which tldr-pages commit was checked, so a page that
    tldr does not cover is not re-read on every run.
    """
    record: dict = {
        "contentSha256": page.content_sha256,
        "page": {
            "examples": [example.to_json() for example in det.page_examples],
            "flagUsage": flag_usage(det.page_flags),
        },
    }
    if det.tldr is not None and det.tldr_commit:
        record["tldr"] = {
            "commit": det.tldr_commit,
            "path": det.tldr.path,
            "examples": [example.to_json() for example in det.tldr.examples],
            "rejected": len(det.tldr.rejected),
            "flagUsage": flag_usage(det.tldr.flags),
        }
    if tldr_commit:
        record["tldrCommit"] = tldr_commit
    if generated is not None:
        record["generated"] = generated.to_json()
    _require_plain_text(record)
    return record


def _require_plain_text(value: object, path: str = "record") -> None:
    """The writer's last check; convex/_generatedLayer.ts repeats it.

    Only the manual's own example commands may span lines.
    """
    if isinstance(value, str):
        multiline = path.startswith("record.page.examples") and path.endswith(".command")
        if has_forbidden_chars(value, multiline=multiline):
            raise ValueError(f"control characters in {path}")
    elif isinstance(value, dict):
        for key, item in value.items():
            _require_plain_text(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _require_plain_text(item, f"{path}.{index}" if not isinstance(item, dict) else path)


class ResultCache:
    """Generated parts on disk, keyed by content hash; unchanged pages are skipped."""

    def __init__(self, root: Path | None) -> None:
        self.root = root

    def _path(self, sha: str) -> Path:
        assert self.root is not None
        return self.root / sha[:2] / f"{sha}.json"

    def get(self, sha: str) -> GeneratedPart | None:
        if self.root is None or not re.fullmatch(r"[0-9a-f]{16,64}", sha):
            return None
        path = self._path(sha)
        if not path.exists():
            return None
        return GeneratedPart.from_json(json.loads(path.read_text(encoding="utf-8")))

    def put(self, sha: str, part: GeneratedPart) -> None:
        if self.root is None or not re.fullmatch(r"[0-9a-f]{16,64}", sha):
            return
        path = self._path(sha)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(part.to_json(), sort_keys=True), encoding="utf-8")
