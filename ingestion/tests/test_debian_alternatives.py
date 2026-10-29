from pathlib import Path

import pytest

from ingestion.debian_alternatives import parse_alternatives

ROOT = Path(__file__).parent / "fixtures" / "alternatives"


@pytest.mark.parametrize(
    "file,name,priority", [("java", "java", 2111), ("xz", "lzma", 20), ("mailx", "mailx", 50)]
)
def test_real_static_templates_are_read_without_executing(file, name, priority):
    offers, skipped = parse_alternatives((ROOT / f"{file}.postinst").read_text())
    assert any(o.name == name and o.priority == priority for o in offers)
    assert not [r for r in skipped if "group" not in r]


def test_unknown_dynamic_and_ambiguous_registrations_fail_closed():
    for script in [
        "update-alternatives --install /bin/foo foo $(evil) 5 "
        "--slave /usr/share/man/man1/foo.1 foo.1 /usr/share/man/man1/bar.1",
        "p=10\np=50\nupdate-alternatives --install /bin/foo foo /bin/bar $p "
        "--slave /usr/share/man/man1/foo.1 foo.1 /usr/share/man/man1/bar.1",
        'echo "update-alternatives --install /bin/foo foo /bin/bar 5"',
    ]:
        offers, skipped = parse_alternatives(script)
        assert not offers and skipped


def test_master_manual_and_slave_manuals_preserve_priorities_and_translations_are_excluded():
    offers, skipped = parse_alternatives(
        "update-alternatives --install /usr/share/man/man1/foo.1 foo.1 "
        "/usr/share/man/man1/bar.1 -10 "
        "--slave /usr/share/man/fr/man1/foo.1 foo.fr /usr/share/man/fr/man1/bar.1"
    )
    assert [(o.name, o.priority) for o in offers] == [("foo", -10)]
    assert not skipped


@pytest.mark.parametrize("prefix", ["cat <<'EOF'", "cat <<-EOF"])
def test_heredoc_registrations_are_data(prefix):
    offers, _ = parse_alternatives(
        prefix + "\nupdate-alternatives --install /bin/ls ls /bin/evil 999\nEOF\n"
    )
    assert not offers


def test_only_simple_command_word_is_accepted():
    for script in [
        'printf "%s" "update-alternatives --install /bin/ls ls /bin/evil 999"',
        "echo update-alternatives --install /bin/ls ls /bin/evil 999",
    ]:
        assert not parse_alternatives(script)[0]


def test_branch_only_assignment_is_unresolved_after_join():
    offers, skipped = parse_alternatives(
        "if test -e /maybe; then\np=999\nfi\nupdate-alternatives --install /bin/ls ls /bin/evil $p"
    )
    assert not offers and any("unresolved variable p" in row["reason"] for row in skipped)


def test_case_branch_assignment_is_unresolved_after_join():
    offers, skipped = parse_alternatives(
        'case "$1" in\nconfigure)\np=999\n;;\nesac\n'
        "update-alternatives --install /bin/ls ls /bin/evil $p"
    )
    assert not offers and any("unresolved variable p" in row["reason"] for row in skipped)


@pytest.mark.parametrize(
    "body",
    [
        "unused() {\np=999\n}",
        "unused(){p=999;}",
        "function unused {\np=999\n}",
        "unused()\n{\np=999\n}",
        "unused() {\nif true; then\np=999\nfi\n}",
        "unused() (\np=999\n)",
        "unused-helper() {\np=999\n}",
        "unused() {\necho '}'\np=999\n}",
        "unused() # a helper\n{\np=999\n}",
    ],
)
@pytest.mark.parametrize("initial", ["", "p=50\n"])
def test_unmodeled_function_assignments_cannot_resolve_registrations(body, initial):
    offers, skipped = parse_alternatives(
        initial + body + "\nupdate-alternatives --install /bin/ls ls /bin/evil $p"
    )
    assert not offers
    assert any("unresolved variable p" in row["reason"] for row in skipped)


def test_uncalled_inline_function_does_not_register_alternatives():
    offers, _ = parse_alternatives(
        "unused() { update-alternatives --install /bin/ls ls /bin/evil 999; }\n"
        "update-alternatives --install /bin/safe safe /bin/target 1"
    )
    assert [o.name for o in offers] == ["safe"]


def test_tabs_heredoc_ends_before_following_real_registration():
    offers, _ = parse_alternatives(
        "cat <<-EOF\n\tupdate-alternatives --install /bin/ls ls /bin/evil 999\n\tEOF\n"
        "update-alternatives --install /bin/safe safe /bin/target 1"
    )
    assert [offer.name for offer in offers] == ["safe"]


def test_multiline_echo_argument_is_not_a_command():
    offers, _ = parse_alternatives(
        'echo "text\nupdate-alternatives --install /bin/ls ls /bin/evil 999\n"\n'
        "update-alternatives --install /bin/safe safe /bin/target 1"
    )
    assert [offer.name for offer in offers] == ["safe"]


def test_alternative_registration_keeps_case_for_real_page_precedence():
    offers, _ = parse_alternatives(
        "update-alternatives --install /usr/share/man/man1/Mail.1 Mail.1 "
        "/usr/share/man/man1/target.1 10"
    )
    assert offers[0].name == "Mail"


def test_full_contents_collision_audit_deduplicates_architectures_and_keeps_case(tmp_path):
    import gzip

    from scripts.check_debian_archives import audit_case_collisions

    payload = (
        "usr/share/man/man1/FTP.1.gz net/ftp.app\n"
        "usr/share/man/man2/_Exit.2.gz doc/manpages-dev\n"
        "usr/share/man/man2/_exit.2.gz doc/manpages-dev\n"
    )
    for name in ["main-Contents-all.gz", "main-Contents-amd64.gz"]:
        with gzip.open(tmp_path / name, "wt") as stream:
            stream.write(payload)
    result = audit_case_collisions(tmp_path, [{"name": "ftp", "section": "1"}])
    assert result["normalizedRoutes"] == 2
    assert result["realPageCollisionCount"] == 1
    assert result["realPageCollisions"][0]["spellings"] == ["_Exit", "_exit"]
    assert len(result["realPageCollisions"][0]["sources"]) == 2
    assert result["auditedAlternativeCollisionCount"] == 1
