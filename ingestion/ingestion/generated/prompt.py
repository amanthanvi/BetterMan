"""Versioned prompt templates and the strict output schema.

A new template file means a new PROMPT_VERSION. Stored records keep the
version, and a version bump alone does not regenerate unchanged pages.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from ingestion.generated.page import PageInput, excerpt
from ingestion.generated.safety import has_forbidden_chars

PROMPT_VERSION = "b6-v1"
_PROMPTS = Path(__file__).with_name("prompts")

SUMMARY_MIN_CHARS = 20
SUMMARY_MAX_CHARS = 240
EXAMPLE_DESCRIPTION_MAX = 160
EXAMPLE_COMMAND_MAX = 300
PHRASE_MAX_CHARS = 60
MAX_RESPONSE_EXAMPLES = 8

_SENTENCE_BREAK = re.compile(r"[.!?]\s+[A-Z]")
_MARKUP = re.compile(r"[`*_#<>\[\]]")


@cache
def _template(version: str) -> tuple[str, str]:
    text = (_PROMPTS / f"{version}.txt").read_text(encoding="utf-8")
    _, system, user = re.split(r"^=== (?:system|user) ===\n", text, flags=re.M)
    return system.strip(), user.rstrip() + "\n"


def build_messages(
    page: PageInput,
    *,
    invocation: str,
    example_count: int,
    avoid: list[str],
    rejected: list[str] | None = None,
    version: str = PROMPT_VERSION,
) -> list[dict[str, str]]:
    system, user = _template(version)
    parts = excerpt(page)
    if example_count:
        rule = (
            f"exactly {example_count} examples. Each command is one line that starts with "
            f"`{invocation}`. Use only options from the OPTIONS list. Write values as short "
            "lowercase placeholders such as path/to/file or 8080. Each description is a short "
            "imperative phrase, under 100 characters, without a trailing period. Prefer common, "
            "safe, non-destructive tasks."
        )
        if avoid:
            rule += " Do not repeat these existing examples: " + "; ".join(avoid[:5]) + "."
    else:
        rule = "an empty array."
    retry = ""
    if rejected:
        retry = (
            "\nA previous answer was rejected: "
            + "; ".join(rejected[:6])
            + ". Use only options listed below.\n"
        )
    content = user.format(
        page=f"{page.name}({page.section})",
        invocation=invocation,
        examples_rule=rule,
        retry_note=retry,
        **{key: value or "(none)" for key, value in parts.items()},
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": content}]


@dataclass(frozen=True)
class GeneratedText:
    summary: str | None
    examples: list[tuple[str, str]]
    task_phrases: list[str]
    problems: list[str]


def _summary(value: object, name: str) -> tuple[str | None, str | None]:
    if not isinstance(value, str):
        return None, "summary is not a string"
    if has_forbidden_chars(value):
        return None, "summary has control characters"
    text = " ".join(value.split())
    if not SUMMARY_MIN_CHARS <= len(text) <= SUMMARY_MAX_CHARS:
        return None, "summary length"
    if not text.endswith("."):
        return None, "summary does not end with a period"
    if _SENTENCE_BREAK.search(text[:-1]):
        return None, "summary is more than one sentence"
    if _MARKUP.search(text):
        return None, "summary contains markup"
    if text.lower().startswith(name.lower() + " ") or text.lower().startswith(name.lower() + "("):
        return None, "summary starts with the page name"
    return text, None


def _phrases(value: object) -> tuple[list[str], str | None]:
    if not isinstance(value, list):
        return [], "taskPhrases is not a list"
    phrases: list[str] = []
    for item in value:
        if not isinstance(item, str) or has_forbidden_chars(item):
            continue
        text = " ".join(item.split()).rstrip(".?!").strip()
        words = text.split()
        if not 2 <= len(words) <= 8 or len(text) > PHRASE_MAX_CHARS:
            continue
        if text != text.lower() or _MARKUP.search(text) or text in phrases:
            continue
        phrases.append(text)
    if len(phrases) < 3:
        return [], "fewer than 3 valid task phrases"
    return phrases[:5], None


def _examples(value: object) -> tuple[list[tuple[str, str]], list[str]]:
    if not isinstance(value, list):
        return [], ["examples is not a list"]
    examples: list[tuple[str, str]] = []
    problems: list[str] = []
    for item in value[:MAX_RESPONSE_EXAMPLES]:
        if not isinstance(item, dict):
            problems.append("example is not an object")
            continue
        description, command = item.get("description"), item.get("command")
        if not isinstance(description, str) or not isinstance(command, str):
            problems.append("example fields are not strings")
            continue
        if has_forbidden_chars(description) or has_forbidden_chars(command):
            problems.append("example has control characters")
            continue
        description = " ".join(description.split()).rstrip(".")
        command = command.strip()
        if not description or len(description) > EXAMPLE_DESCRIPTION_MAX:
            problems.append("example description length")
        elif not command or "\n" in command or len(command) > EXAMPLE_COMMAND_MAX:
            problems.append("example command shape")
        else:
            examples.append((description, command))
    return examples, problems


def parse_response(text: str, *, name: str) -> GeneratedText:
    """Validate the model's JSON. Invalid parts are dropped, never repaired."""
    try:
        data = json.loads(_strip_fence(text))
    except ValueError:
        return GeneratedText(None, [], [], ["response is not JSON"])
    if not isinstance(data, dict):
        return GeneratedText(None, [], [], ["response is not a JSON object"])
    unknown = set(data) - {"summary", "examples", "taskPhrases"}
    problems = ["unexpected keys"] if unknown else []
    summary, summary_problem = _summary(data.get("summary"), name)
    examples, example_problems = _examples(data.get("examples", []))
    phrases, phrase_problem = _phrases(data.get("taskPhrases"))
    problems.extend(p for p in (summary_problem, phrase_problem) if p)
    problems.extend(example_problems)
    return GeneratedText(summary, examples, phrases, problems)


def _strip_fence(text: str) -> str:
    text = text.strip()
    fence = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", text, flags=re.S)
    return fence.group(1) if fence else text
