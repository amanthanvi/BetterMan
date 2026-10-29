from __future__ import annotations

import pytest
from generated_fixtures import golden_page

from ingestion.generated.flags import (
    invocations_for,
    option_keys,
    option_table,
    simple_invocation_problems,
    verify_command,
)

TAR = golden_page("tar.1", name="tar")
GNU_LS = golden_page("ls.1", name="ls")
BSD_LS = golden_page("ls.1.mdoc", name="ls", distro="macos")
GIT_COMMIT = golden_page("git-commit.1", name="git-commit")


def check(page, command: str, invocations=None):
    return verify_command(
        command, invocations=invocations or invocations_for(page.name), table=page.table
    )


def test_option_keys_match_the_search_index_rules():
    # convex/optionFlags.test.ts asserts the same 215 tar flags.
    assert len(TAR.table) == 215
    assert TAR.table["-x"].anchor_id == TAR.table["--extract"].anchor_id == "x"
    assert TAR.table["--sort"].anchor_id == "sort="
    assert "listed-incremental" not in TAR.table
    assert option_keys("--[no-]color") == ["--color", "--no-color"]
    assert option_keys("-ANUM, --after-context=NUM") == ["-A", "--after-context"]
    assert option_keys("-fPIC") == ["-fPIC"]


def test_option_arity():
    table = option_table(
        [
            {"flags": "-f, --file", "argument": "ARCHIVE", "anchorId": "f"},
            {"flags": "--color[=WHEN]", "anchorId": "color"},
            {"flags": "-v, --verbose", "anchorId": "v"},
        ]
    )
    assert table["-f"].arity == "required"
    assert table["--color"].arity == "optional"
    assert table["-v"].arity == "none"


@pytest.mark.parametrize(
    "command",
    [
        "tar -xzf archive.tar.gz",
        "tar -x -z -f archive.tar.gz -C /tmp",
        "tar --extract --file=archive.tar",
        "tar -farchive.tar -x",
        "tar czf out.tar.gz dir",  # traditional bundled first argument
        "sudo tar -xf a.tar -C /opt",
        "LC_ALL=C tar -tf a.tar | grep -v x -c",  # grep's flags are not tar's to check
        "tar -cf - dir | ssh host 'tar -xf -'",
        "tar -tf a.tar > list.txt 2>&1",
        "tar -cf a.tar -- -weird-file-name",
        "if tar -tf a.tar; then echo ok; fi",
    ],
)
def test_accepts_documented_flags_and_clusters(command):
    result = check(TAR, command)
    assert result.ok, result.problems


def test_cluster_flags_are_split_and_recorded():
    result = check(TAR, "tar -xzvf a.tar.gz")
    assert result.flags == ("-x", "-z", "-v", "-f")


def test_value_of_a_flag_is_not_checked_as_a_flag():
    # -f takes ARCHIVE; "-" is its value, then -C takes a directory.
    assert check(TAR, "tar -f - -C -odd-dir -x").ok


@pytest.mark.parametrize(
    ("command", "problem"),
    [
        ("tar --teleport a.tar", "unknown flag --teleport"),
        ("tar -xqzf a.tar", "unknown flag -q in -xqzf"),
        ("tar -Y a.tar", "unknown flag -Y in -Y"),
        ("tar xqf a.tar", "unknown flag -q in -xqf"),
        ("gzip -d a.gz", "does not run tar"),
        ("tar -xf 'unterminated", "unsupported shell syntax: unterminated quote"),
    ],
)
def test_rejects_made_up_flags_bad_clusters_and_other_commands(command, problem):
    result = check(TAR, command)
    assert not result.ok
    assert problem in result.problems


def test_flags_valid_only_on_another_distro_are_rejected():
    assert check(GNU_LS, "ls --almost-all").ok
    assert not check(BSD_LS, "ls --almost-all").ok
    assert check(BSD_LS, "ls -@ -l").ok
    assert "unknown flag -@ in -@" in check(GNU_LS, "ls -@ -l").problems


def test_subcommand_pages_are_invoked_as_family_and_subcommand():
    assert invocations_for("git-commit") == [("git", "commit"), ("git-commit",)]
    assert invocations_for("systemd-analyze") == [("systemd-analyze",)]
    assert invocations_for("foo-bar", ["foo", "bar"]) == [("foo", "bar"), ("foo-bar",)]
    assert check(GIT_COMMIT, "git commit -a -m 'message'").ok
    assert not check(GIT_COMMIT, "git push -a").ok
    assert not check(GIT_COMMIT, "git commit --teleport").ok


def test_wrapper_names_are_commands_on_their_own_pages():
    env = option_table([{"flags": "-i, --ignore-environment", "anchorId": "i"}])
    assert verify_command("env -i program", invocations=[("env",)], table=env).ok
    assert not verify_command("env -q program", invocations=[("env",)], table=env).ok


def test_plus_flags_verify_when_documented_and_are_values_otherwise():
    less = option_table([{"flags": "+F", "anchorId": "F"}])
    assert verify_command("less +F log", invocations=[("less",)], table=less).flags == ("+F",)
    date = option_table([{"flags": "-u", "anchorId": "u"}])
    assert verify_command("date -u +%Y", invocations=[("date",)], table=date).ok


# Review probes for #434: quoting must survive until operators are read.
def test_quoted_operators_are_words_not_separators():
    result = check(TAR, "printf '%s\\n' ';' tar --create")
    assert not result.ok
    assert "does not run tar" in result.problems
    assert check(TAR, 'echo "a | tar --teleport"').problems == ("does not run tar",)


@pytest.mark.parametrize(
    ("command", "reason"),
    [
        ('tar -tf "$(tar --invented)"', "command substitution"),
        ("tar -tf $(ls)", "command substitution"),
        ("tar -tf `ls`", "command substitution"),
        ('tar -tf "${ARCHIVE}"', "parameter expansion"),
        ("diff <(tar -tf a.tar) list", "process substitution"),
        ("(cd dir && tar -cf a.tar .)", "subshell"),
        ("tar -xf a.tar <<EOF", "heredoc"),
        ("tar -xf a.tar <<< x", "here-string"),
    ],
)
def test_unsupported_syntax_is_rejected_not_guessed(command, reason):
    assert check(TAR, command).problems == (f"unsupported shell syntax: {reason}",)


def test_single_quotes_keep_substitutions_literal():
    assert check(TAR, "tar -cf a.tar '$(not run)' --exclude='`x`'").ok
    assert check(TAR, 'tar -cf "$ARCHIVE" dir').ok


@pytest.mark.parametrize(
    ("command", "problem"),
    [
        ("tar -tf archive.tar; rm -rf /home/user/Documents", "more than one command"),
        ("tar -tf a.tar && rm a.tar", "more than one command"),
        ("tar -cf - dir | ssh host x", "more than one command"),
        ("tar -xf a.tar &", "more than one command"),
        ("tar -tf a.tar > list", "redirection"),
        ("TAR_OPTIONS=-v tar -xf a.tar", "variable assignment"),
        ("sudo tar -xf a.tar", "wrapper prefix sudo"),
        ("env tar -xf a.tar", "wrapper prefix env"),
        ("xargs tar -xf", "wrapper prefix xargs"),
        ("gzip -d a.gz", "does not start with tar"),
        ('tar -tf "$(ls)"', "unsupported shell syntax: command substitution"),
        ("tar -tf a.tar #; rm -rf ~", "unsupported shell syntax: comment"),
        ("tar -tf a.tar # list it", "unsupported shell syntax: comment"),
    ],
)
def test_generated_examples_must_be_one_simple_invocation(command, problem):
    assert problem in simple_invocation_problems(command, invocations_for("tar"))


def test_simple_invocations_pass():
    assert simple_invocation_problems("tar -xzf 'my archive.tgz' -C dir", [("tar",)]) == []
    # `#` inside a word or quotes is ordinary text.
    assert simple_invocation_problems("tar -cf a#1.tar '#notes'", [("tar",)]) == []
    assert simple_invocation_problems("git commit -m 'a; b'", invocations_for("git-commit")) == []


# Re-check of #434: a wrapper must not hide a second invocation of the target.
@pytest.mark.parametrize(
    "command",
    [
        "tar --create | env -- tar --invented",
        "tar -cf a.tar d | env -i tar -tf -",
        "tar -cf a.tar d | env FOO=1 tar -tf -",
        "sudo -u backup tar -xf a.tar",
        "sudo -- tar -xf a.tar",
        "nice -n 10 tar -czf a.tgz d",
        "timeout 60 tar -xf a.tar",
        "time tar -xf a.tar",
        "nohup tar -xf a.tar",
        "command tar -xf a.tar",
        "exec tar -xf a.tar",
        "find . -name '*.log' | xargs tar -czf logs.tgz",
        "find . -exec tar --invented {} +",
        "tar -cf - . | ssh host tar -xf -",
    ],
)
def test_wrapped_or_indirect_target_invocations_fail_closed(command):
    result = check(TAR, command)
    assert not result.ok
    assert any(p.startswith(("wrapped invocation", "indirect invocation")) for p in result.problems)


@pytest.mark.parametrize(
    ("command", "flags"),
    [
        ("sudo tar -xf a.tar -C /opt", ("-x", "-f", "-C")),
        ("env tar -tf a.tar", ("-t", "-f")),
        ("LC_ALL=C tar -tf a.tar", ("-t", "-f")),
    ],
)
def test_bare_sudo_and_env_are_followed_and_verified(command, flags):
    result = check(TAR, command)
    assert result.ok and result.flags == flags
    assert not check(TAR, command.replace("tar -", "tar --invented -")).ok
