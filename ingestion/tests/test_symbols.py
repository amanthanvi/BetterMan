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
        symbol_rows("ssh_config", "5", {"blocks": [definitions("ForwardAgent")]})[0]["term"]
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
            *[definitions(f"E{i}", f"e{i}", "x" * 1000) for i in range(300)],
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


def test_directive_coverage_and_exact_categories():
    names = [f"Directive{i}" for i in range(129)] + [
        "ProxyJump",
        "Port",
        "User",
        "StrictHostKeyChecking",
        "LocalForward",
        "ServerAliveInterval",
        "UserKnownHostsFile",
    ]
    nested = definitions("ChannelTimeout")
    nested["items"][0]["definitionBlocks"].append(definitions("agent"))
    doc = {
        "blocks": [
            heading("DESCRIPTION", "description"),
            *[definitions(name, name) for name in names],
            nested,
            definitions("The following options"),
            definitions("-f"),
            definitions("pre commit"),
            heading("TOKENS", "tokens"),
            definitions("%C"),
            heading("FILES", "files"),
            definitions("$HOME/.ssh/config", "file"),
        ]
    }
    rows = symbol_rows("ssh_config", "5", doc)
    terms = {row["term"] for row in rows}
    assert set(names) <= terms
    assert "$HOME/.ssh/config" in terms
    assert not {"agent", "session", "tun", "x11", "C", "The", "f", "pre", "commit"} & terms
    for title in ("PROFILES", "SOME ENVIRONMENT NOTES", "ERRORS AND DIAGNOSTICS"):
        assert (
            symbol_rows(
                "example",
                "1",
                {"blocks": [heading(title, "section"), definitions("HOME /etc/config ENOSPC")]},
            )
            == []
        )


def test_suffixed_subcommands_and_utf16_limits():
    from ingestion.symbols import utf16_length

    assert symbol_rows("openssl-x509", "1ossl", {"blocks": []})[0]["term"] == "openssl x509"
    assert symbol_rows("ip-address", "8foo", {"blocks": []})[0]["term"] == "ip address"
    rows = symbol_rows(
        "example",
        "1",
        {"blocks": [heading("ENVIRONMENT", "env"), definitions("HOME", text="a" * 159 + "😀")]},
    )
    assert rows[0]["excerpt"] == "a" * 159
    assert utf16_length(rows[0]["excerpt"]) <= 160


def test_real_cached_layouts_and_anchors():
    import json
    from pathlib import Path

    cases = json.loads((Path(__file__).parent / "fixtures/symbol-layouts.json").read_text())
    expected = {
        "systemctl": "systemctl restart",
        "systemd.service": "ExecStart=",
        "errno": "ENOSPC",
        "environ": "HOME",
        "resolv.conf": "nameserver",
        "rsyncd.conf": "motd file",
        "tmpfs": "size",
        "less": "LESS",
        "python3": "PYTHONPATH",
        "rsync": "RSYNC_RSH",
        "ps": "POSIXLY_CORRECT",
        "find": "POSIXLY_CORRECT",
    }
    for case in cases:
        rows = symbol_rows(case["name"], case["section"], case["doc"])
        assert rows == case["symbols"]
        assert expected[case["name"]] in {row["term"] for row in rows}, case["name"]
        ids = {b["id"] for b in case["doc"]["blocks"] if b["type"] == "heading"}
        ids.update(
            item["id"]
            for b in case["doc"]["blocks"]
            if b["type"] == "definition_list"
            for item in b["items"]
            if item.get("id")
        )
        assert all(row["anchorId"] in ids for row in rows)
        assert not {"The", "pre", "commit", "agent", "session", "tun", "x11"} & {
            row["term"] for row in rows
        }
    resolv = next(case for case in cases if case["name"] == "resolv.conf")
    assert "search" in {row["term"] for row in resolv["symbols"]}


def test_explicit_heading_synonyms_and_prose_exclusions():
    for title in ("ENVIRONMENT VARIABLES", "ENVIRONMENT VARIABLE"):
        assert (
            symbol_rows("example", "1", {"blocks": [heading(title, "env"), definitions("HOME")]})[
                0
            ]["kind"]
            == "environment"
        )
    for title in ("CONFIG DIRECTIVES", "CONFIGURATION DIRECTIVES", "OPTIONS"):
        assert (
            symbol_rows(
                "example", "5", {"blocks": [heading(title, "config"), definitions("Directive")]}
            )[0]["kind"]
            == "config"
        )
    assert (
        symbol_rows(
            "example",
            "1",
            {"blocks": [heading("PROFILES", "profiles"), definitions("/etc/profile")]},
        )
        == []
    )
