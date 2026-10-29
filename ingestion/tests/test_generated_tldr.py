from __future__ import annotations

import subprocess
from pathlib import Path

import pytest
from generated_fixtures import TAR_TLDR, golden_page, tldr_tree

from ingestion.generated.flags import option_table
from ingestion.generated.tldr import (
    TLDR_ATTRIBUTION,
    TldrIndex,
    clean_description,
    convert_command,
    fetch_pinned,
    pages_digest,
    parse_page,
    tldr_examples,
)

TAR = golden_page("tar.1", name="tar")


def test_parse_page_reads_title_description_and_examples():
    page = parse_page(TAR_TLDR, "common/tar.md")
    assert page.title == "tar"
    assert page.description == "Archiving utility."
    assert len(page.examples) == 4
    assert page.examples[0].command.startswith("tar cf {{")
    assert page.alias_of is None


def test_alias_pages_are_recognised_and_yield_nothing():
    text = (
        "# xzcat\n\n> This command is an alias of `xz --decompress --stdout`.\n\n"
        "- View docs:\n\n`tldr xz`\n"
    )
    page = parse_page(text, "common/xzcat.md")
    assert page.alias_of == "xz --decompress --stdout"
    assert tldr_examples(page, name="xzcat", table={}).examples == []


def test_placeholders_become_plain_text_with_spans():
    display, verify, spans = convert_command(
        'git commit {{[-m|--message]}} "{{message}}"',
        option_table([{"flags": "-m, --message", "anchorId": "m"}]),
    )
    assert display == 'git commit -m "message"'
    assert [display[a:b] for a, b in spans] == ["message"]
    assert "message" not in verify.split('"')[1]


def test_option_placeholder_uses_the_spelling_this_page_documents():
    long_only = option_table([{"flags": "--directory", "anchorId": "d"}])
    assert convert_command("tar {{[-C|--directory]}} d", long_only)[0] == "tar --directory d"
    neither = option_table([])
    assert convert_command("tar {{[-C|--directory]}} d", neither)[0] == "tar -C d"
    assert convert_command("ip {{[a|address]}} {{[s|show]}}", neither)[0] == "ip address show"


def test_mnemonic_brackets_are_removed_from_descriptions():
    assert (
        clean_description("E[x]tract a g[z]ipped archive [f]ile:")
        == "Extract a gzipped archive file"
    )


def test_examples_are_verified_and_failures_recorded():
    result = tldr_examples(parse_page(TAR_TLDR, "common/tar.md"), name="tar", table=TAR.table)
    assert [e.command for e in result.examples] == [
        "tar cf path/to/target.tar path/to/file1 path/to/file2 ...",
        "tar xf path/to/source.tar.ext -C path/to/directory",
        'tar xf path/to/source.tar --wildcards "*.html"',
    ]
    assert result.examples[0].description == "create an archive and write it to a file"
    assert [cmd for cmd, _ in result.rejected] == ["tar --teleport {{path/to/source.tar}}"]
    assert result.rejected[0][1] == ("unknown flag --teleport",)
    assert result.flags == {"-c": 1, "-f": 3, "-x": 2, "-C": 1, "--wildcards": 1}


def test_gnu_only_flags_fail_against_a_bsd_style_table():
    bsd = option_table(
        [
            {"flags": "-c", "anchorId": "c"},
            {"flags": "-x", "anchorId": "x"},
            {"flags": "-f", "argument": "file", "anchorId": "f"},
            {"flags": "-C", "argument": "dir", "anchorId": "C"},
        ]
    )
    result = tldr_examples(parse_page(TAR_TLDR, "common/tar.md"), name="tar", table=bsd)
    assert len(result.examples) == 2
    assert any("--wildcards" in problem for _, problems in result.rejected for problem in problems)


def test_index_prefers_the_platform_page_and_only_maps_command_sections(tmp_path: Path):
    root = tldr_tree(
        tmp_path,
        {
            "common/tar.md": TAR_TLDR,
            "linux/tar.md": TAR_TLDR.replace("Archiving utility.", "Linux tar."),
            "osx/tar.md": TAR_TLDR.replace("Archiving utility.", "BSD tar."),
            "common/git-commit.md": "# git commit\n\n> Commit.\n",
        },
    )
    index = TldrIndex.load(root, commit="0" * 40)
    assert index.page_count() == 4
    assert index.lookup(distro="debian", name="tar", section="1").description == "Linux tar."
    assert index.lookup(distro="macos", name="tar", section="1").description == "BSD tar."
    assert (
        index.lookup(distro="freebsd", name="tar", section="1").description == "Archiving utility."
    )
    assert index.lookup(distro="debian", name="git-commit", section="1").title == "git commit"
    assert index.lookup(distro="debian", name="tar", section="5") is None
    assert index.lookup(distro="debian", name="Tar", section="8") is not None


def test_pages_digest_covers_paths_and_contents(tmp_path: Path):
    root = tldr_tree(tmp_path / "a", {"common/tar.md": TAR_TLDR})
    first = pages_digest(root)
    (root / "pages" / "common" / "tar.md").write_text(TAR_TLDR + "\n", encoding="utf-8")
    assert pages_digest(root) != first


def _git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(cwd), *args], check=True, capture_output=True, text=True
    ).stdout.strip()


@pytest.fixture
def upstream(tmp_path: Path) -> tuple[Path, str, str]:
    repo = tldr_tree(tmp_path / "upstream", {"common/tar.md": TAR_TLDR})
    (repo / "LICENSE.md").write_text("CC BY 4.0\n", encoding="utf-8")
    (repo / "scripts").mkdir()
    (repo / "scripts" / "build.sh").write_text("echo\n", encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "config", "uploadpack.allowReachableSHA1InWant", "true")
    _git(repo, "add", ".")
    _git(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "pages")
    return repo, _git(repo, "rev-parse", "HEAD"), pages_digest(repo)


def test_fetch_pinned_checks_commit_and_digest(tmp_path: Path, upstream):
    repo, commit, digest = upstream
    dest = fetch_pinned(tmp_path / "dest", commit=commit, expected=digest, repo=f"file://{repo}")
    assert (dest / "pages" / "common" / "tar.md").exists()
    assert (dest / "LICENSE.md").exists()
    assert not (dest / "scripts").exists()
    with pytest.raises(RuntimeError, match="does not match pinned"):
        fetch_pinned(tmp_path / "other", commit=commit, expected="0" * 64, repo=f"file://{repo}")


def test_attribution_names_the_project_and_license():
    assert "tldr-pages" in TLDR_ATTRIBUTION
    assert "CC BY 4.0" in TLDR_ATTRIBUTION


def test_flag_shaped_placeholders_are_verified_not_hidden():
    # Review probe for #434: `{{--teleport}}` must not pass as a value.
    page = parse_page("# tar\n- Inspect an archive:\n`tar {{--teleport}}`", "common/tar.md")
    result = tldr_examples(page, name="tar", table=TAR.table)
    assert result.examples == []
    assert result.rejected[0][1] == ("unknown flag --teleport",)
    table = TAR.table
    assert convert_command("tar {{-v|--verbose}} -xf a", table)[0] == "tar -v -xf a"
    assert convert_command("tar {{--verbose|-v}} -xf a", table)[1] == "tar --verbose -xf a"
    display, verify, spans = convert_command("tar {{-x}} -f {{path/to/a.tar}}", table)
    assert display == "tar -x -f path/to/a.tar"
    assert [display[a:b] for a, b in spans] == ["path/to/a.tar"]
    unknown = tldr_examples(
        parse_page("# tar\n- x:\n`tar {{-Q|--quack}} a`", "common/tar.md"), name="tar", table=table
    )
    assert unknown.rejected and not unknown.examples


# Re-check of #434: a placeholder can only be a flag list or plain value words.
@pytest.mark.parametrize(
    "command",
    [
        "tar {{file --teleport}}",
        "tar {{file; tar --teleport}}",
        "tar -xf {{$HOME/a.tar}}",
        'tar -xf {{"a.tar"}}',
        "tar -xf {{`ls`}}",
        "tar -xf {{a.tar & b}}",
        "tar -xf {{a.tar > out}}",
        "tar -xf {{a\\b}}",
        "tar {{-x --teleport}}",
        "tar {{-x;rm}}",
        "tar {{[x;rm|extract]}}",
        "tar -xf {{}}",
        # Alternations: mixed flags and values, unsafe or empty choices.
        "tar -xf {{tagged|-v}}",
        "tar {{-v|tagged}}",
        "tar -xf {{a|b;c}}",
        "tar -xf {{a|$b}}",
        "tar -xf {{a|}}",
        "tar -xf {{a b|c}}",
        "tar -xf {{...|...}}",
        "tar -xf {{a|'b'}}",
    ],
)
def test_placeholders_that_could_hide_flags_or_commands_are_rejected(command):
    page = parse_page(f"# tar\n- Do it:\n`{command}`", "common/tar.md")
    result = tldr_examples(page, name="tar", table=TAR.table)
    assert result.examples == []
    assert result.rejected[0][1][0].startswith("unsafe placeholder")


@pytest.mark.parametrize(
    ("command", "shown"),
    [
        (
            "tar cf {{path/to/target.tar}} {{path/to/file1 path/to/file2 ...}}",
            ["path/to/target.tar", "path/to/file1 path/to/file2 ..."],
        ),
        (
            'tar xf {{path/to/source.tar}} --wildcards "{{*.html}}"',
            ["path/to/source.tar", "*.html"],
        ),
        (
            "tar -cf {{~/backup.tar}} {{user@host:dir}} {{key=value}} {{8080}}",
            ["~/backup.tar", "user@host:dir", "key=value", "8080"],
        ),
    ],
)
def test_common_value_placeholders_still_work(command, shown):
    page = parse_page(f"# tar\n- Do it:\n`{command}`", "common/tar.md")
    result = tldr_examples(page, name="tar", table=TAR.table)
    assert not result.rejected
    example = result.examples[0]
    assert [example.command[a:b] for a, b in example.placeholders] == shown


@pytest.mark.parametrize(
    ("placeholder", "shown"),
    [
        ("{{tagged|untagged}}", "tagged"),
        ("{{0|76|...}}", "0"),
        ("{{...|archive.tar}}", "archive.tar"),
        ("{{GET|PUT|POST|DELETE|PATCH|...}}", "GET"),
        # Only the first choice is shown, so `| sh` can never appear or run.
        ("{{a.tar | sh}}", "a.tar"),
    ],
)
def test_value_alternations_show_their_first_real_choice(placeholder, shown):
    page = parse_page(f"# tar\n- Do it:\n`tar -xf {placeholder} -C dir`", "common/tar.md")
    result = tldr_examples(page, name="tar", table=TAR.table)
    assert not result.rejected
    example = result.examples[0]
    assert example.command == f"tar -xf {shown} -C dir"
    assert [example.command[a:b] for a, b in example.placeholders] == [shown]


def test_value_alternations_are_verified_like_any_value():
    page = parse_page("# tar\n- Do it:\n`tar --invented {{a|b}}`", "common/tar.md")
    result = tldr_examples(page, name="tar", table=TAR.table)
    assert result.rejected[0][1] == ("unknown flag --invented",)


# Round-2 re-check of #434: placeholders only stand for arguments.
@pytest.mark.parametrize(
    "command",
    [
        "tar --create | env -- {{tar}} --invented",
        "tar --create | xargs {{tar}} --invented",
        "tar --create | {{tar}} --invented",
        "tar --create | {{sudo}} -u root tar --invented",
        "tar --create | sudo {{tar}} --invented",
        "tar --create | env {{tar}} --invented",
        "tar --create | nice -n 5 {{tar}}",
        "{{tar}} --create",
        "tar --create && {{command}}",
    ],
)
def test_placeholders_in_command_position_are_rejected(command):
    page = parse_page(f"# tar\n- Do it:\n`{command}`", "common/tar.md")
    result = tldr_examples(page, name="tar", table=TAR.table)
    assert result.examples == []
    assert any("placeholder in command position" in p for p in result.rejected[0][1])


def test_placeholders_as_arguments_still_work():
    page = parse_page(
        "# tar\n- Do it:\n`sudo tar -xf {{a.tar}} -C {{dir}} | grep {{name}}`", "common/tar.md"
    )
    result = tldr_examples(page, name="tar", table=TAR.table)
    assert (
        not result.rejected
        and result.examples[0].command == "sudo tar -xf a.tar -C dir | grep name"
    )
