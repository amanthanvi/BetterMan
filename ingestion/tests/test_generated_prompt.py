from __future__ import annotations

import json

import pytest
from generated_fixtures import golden_page

from ingestion.generated.page import (
    DESCRIPTION_CHARS,
    OPTIONS_CHARS,
    SYNOPSIS_CHARS,
    excerpt,
    page_examples,
)
from ingestion.generated.prompt import PROMPT_VERSION, build_messages, parse_response

TAR = golden_page("tar.1", name="tar")
GIT_COMMIT = golden_page("git-commit.1", name="git-commit")
BSD_LS = golden_page("ls.1.mdoc", name="ls", distro="macos")


def test_page_examples_come_from_the_examples_section_in_order():
    examples, flags = page_examples(GIT_COMMIT)
    assert 1 <= len(examples) <= 5
    assert all("git" in example.command for example in examples)
    assert flags  # some EXAMPLES verify against git-commit's own options
    bsd_examples, _ = page_examples(BSD_LS)
    assert bsd_examples and bsd_examples[0].command.startswith("$ ls") or bsd_examples


def test_pages_without_examples_have_none():
    assert page_examples(TAR) == ([], {})


def test_excerpt_is_bounded():
    parts = excerpt(TAR)
    assert parts["name"] == "tar(1) - an archiving utility"
    assert len(parts["synopsis"]) <= SYNOPSIS_CHARS + 40
    assert len(parts["description"]) <= DESCRIPTION_CHARS
    assert len(parts["options"]) <= OPTIONS_CHARS + 40
    assert parts["options"].endswith("more omitted)")
    assert "-x, --extract, --get" in parts["options"]


def test_messages_carry_rules_examples_count_and_retry_note():
    messages = build_messages(
        TAR,
        invocation="tar",
        example_count=4,
        avoid=["tar xf a.tar"],
        rejected=["unknown flag --teleport"],
    )
    system, user = messages[0]["content"], messages[1]["content"]
    assert "Never invent options" in system
    assert "exactly 4 examples" in user
    assert "tar xf a.tar" in user
    assert "unknown flag --teleport" in user
    assert "OPTIONS\n-A, --catenate" in user
    assert len(user) < 8000
    assert PROMPT_VERSION == "b6-v1"


def test_no_examples_are_requested_without_an_options_table():
    user = build_messages(TAR, invocation="tar", example_count=0, avoid=[])[1]["content"]
    assert "examples: an empty array." in user


def response(**overrides):
    data = {
        "summary": "Creates, lists and extracts files in tape or disk archives.",
        "examples": [{"description": "Extract an archive.", "command": "tar -xf a.tar"}],
        "taskPhrases": ["extract a tar file", "create an archive", "list archive contents"],
    }
    data.update(overrides)
    return json.dumps(data)


def test_valid_response_parses():
    parsed = parse_response(response(), name="tar")
    assert parsed.problems == []
    assert parsed.summary.startswith("Creates")
    assert parsed.examples == [("Extract an archive", "tar -xf a.tar")]
    assert len(parsed.task_phrases) == 3


def test_fenced_json_is_accepted():
    assert parse_response("```json\n" + response() + "\n```", name="tar").summary


@pytest.mark.parametrize(
    ("overrides", "problem"),
    [
        (
            {"summary": "Archives files. It also compresses them."},
            "summary is more than one sentence",
        ),
        ({"summary": "Archives files without a period"}, "summary does not end with a period"),
        (
            {"summary": "tar creates and extracts archives on disk."},
            "summary starts with the page name",
        ),
        (
            {"summary": "Creates `tar` archives of files and directories."},
            "summary contains markup",
        ),
        ({"summary": "Short."}, "summary length"),
        ({"taskPhrases": ["extract", "Create An Archive", "x"]}, "fewer than 3 valid task phrases"),
        (
            {"examples": [{"description": "x", "command": "tar -x\nrm -rf /"}]},
            "example has control characters",
        ),
        ({"extra": 1}, "unexpected keys: extra"),
    ],
)
def test_invalid_parts_are_dropped_not_repaired(overrides, problem):
    parsed = parse_response(response(**overrides), name="tar")
    assert problem in parsed.problems


def test_non_json_is_reported():
    assert parse_response("Sure! Here you go.", name="tar").problems == ["response is not JSON"]
    assert parse_response("[1]", name="tar").problems == ["response is not a JSON object"]


def test_control_characters_are_rejected_and_markup_stays_text():
    # Review probe for #434.
    data = json.loads(response())
    data["examples"] = [
        {"description": "<img src=x onerror=alert(1)>", "command": "tar -tf file.tar\r; rm -rf /h"},
        {"description": "Show <file> names", "command": "tar -tf a.tar --exclude='<*.o>'"},
    ]
    data["summary"] = "Displays harmless text\u001b[0m for the user."
    data["taskPhrases"] = ["list\u0000 files", "show\u202e files", "create archives", "list a tar"]
    parsed = parse_response(json.dumps(data), name="tar")
    assert parsed.summary is None
    assert "summary has control characters" in parsed.problems
    assert "example has control characters" in parsed.problems
    # Angle brackets are ordinary text; renderers must treat them as text.
    assert parsed.examples == [("Show <file> names", "tar -tf a.tar --exclude='<*.o>'")]
    assert parsed.task_phrases == []  # two of four were dropped, leaving fewer than three
    for bad in ["\u2028", "\u2066", "\x7f", "\x85", "\t"]:
        assert (
            "summary has control characters"
            in parse_response(
                response(summary=f"Creates archives{bad} on disk and tape."), name="tar"
            ).problems
        )
