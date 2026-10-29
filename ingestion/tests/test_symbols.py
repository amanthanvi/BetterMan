from ingestion.symbols import MAX_SYMBOLS, symbol_rows


def heading(text, id):
    return {"type": "heading", "text": text, "id": id}


def definitions(term, id="term", text="Definition excerpt"):
    return {
        "type": "definition_list",
        "items": [
            {
                "id": id,
                "termInlines": [{"type": "text", "text": term}],
                "definitionBlocks": [
                    {"type": "paragraph", "inlines": [{"type": "text", "text": text}]}
                ],
            }
        ],
    }


def test_definition_sections_and_config():
    for title, term, kind in [
        ("ENVIRONMENT", "LD_PRELOAD", "environment"),
        ("FILES", "/etc/hosts", "files"),
        ("ERRORS", "ENOSPC", "errors"),
    ]:
        rows = symbol_rows(
            "example", "1", {"blocks": [heading(title, "section"), definitions(term)]}
        )
        assert rows == [
            {"term": term, "anchorId": "term", "excerpt": "Definition excerpt", "kind": kind}
        ]
    assert (
        symbol_rows("ssh_config", "5", {"blocks": [definitions("ForwardAgent yes")]})[0]["term"]
        == "ForwardAgent"
    )
    assert (
        symbol_rows("systemd.service", "5", {"blocks": [definitions("ExecStart=")]})[0]["term"]
        == "ExecStart="
    )
    assert (
        symbol_rows(
            "example", "1", {"blocks": [heading("DESCRIPTION", "desc"), definitions("UNRELATED")]}
        )
        == []
    )


def test_actual_anchors_nested_definitions_and_no_model_mutation():
    doc = {"blocks": [heading("ENVIRONMENT", "environment"), definitions("HOME", None)]}
    before = repr(doc)
    assert symbol_rows("example", "1", doc)[0]["anchorId"] == "environment"
    assert repr(doc) == before
    assert symbol_rows("example", "1", {"blocks": [definitions("HOME", None)]}) == []


def test_subcommands_and_shell_sections():
    assert symbol_rows("git-rebase", "1", {"blocks": []}, "Reapply commits") == [
        {"term": "git rebase", "anchorId": "", "excerpt": "Reapply commits", "kind": "subcommand"}
    ]
    assert symbol_rows("ip-address", "8", {"blocks": []})[0]["term"] == "ip address"
    assert symbol_rows("other-name", "1", {"blocks": []}) == []
    assert (
        symbol_rows("bash", "1", {"blocks": [heading("Pipelines", "real-pipeline-anchor")]})[0][
            "anchorId"
        ]
        == "real-pipeline-anchor"
    )


def test_bounds_and_deduplication():
    doc = {
        "blocks": [
            heading("ERRORS", "errors"),
            *[definitions(f"E{i}", f"e{i}", "x" * 1000) for i in range(100)],
        ]
    }
    rows = symbol_rows("example", "3", doc)
    assert len(rows) == MAX_SYMBOLS
    assert all(len(row["excerpt"]) == 160 for row in rows)
    assert (
        len(symbol_rows("example", "5", {"blocks": [definitions("Foo"), definitions("Foo")]})) == 1
    )


def test_golden_ssh_config_and_nested_sections():
    import json
    from pathlib import Path

    golden = json.loads((Path(__file__).parent / "fixtures/golden/ssh_config.5.json").read_text())
    rows = symbol_rows("ssh_config", "5", golden["doc"])
    assert any(row["term"] == "ForwardAgent" and row["anchorId"] == "ForwardAgent" for row in rows)
    subheading = {**heading("Selected variables", "selected"), "level": 3}
    doc = {"blocks": [heading("ENVIRONMENT", "environment"), subheading, definitions("LD_PRELOAD")]}
    assert symbol_rows("ld.so", "8", doc)[0]["kind"] == "environment"
    assert symbol_rows("example", "5", {"blocks": [definitions("Foo", "x" * 161)]}) == []
