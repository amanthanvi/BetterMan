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
