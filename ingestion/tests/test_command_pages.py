from __future__ import annotations

import json
import logging
from types import SimpleNamespace

import pytest

from ingestion import ingest_runner as runner


@pytest.fixture(autouse=True)
def clear_escape_hatch(monkeypatch) -> None:
    monkeypatch.delenv("BETTERMAN_ALLOW_MISSING_COMMAND_PAGES", raising=False)


@pytest.mark.parametrize(
    ("distro", "packages", "reason"),
    [
        ("debian", ["gcc", "gdb"], "non-free"),
    ],
)
def test_verified_distro_exclusions_are_logged(caplog, distro, packages, reason) -> None:
    caplog.set_level(logging.INFO, logger="betterman.ingestion")
    runner._require_command_pages(
        distro=distro, requested=packages, pages=[], aliases=[], sample=False
    )
    events = [json.loads(record.message) for record in caplog.records]
    assert {event["package"] for event in events} == set(packages)
    assert all(event["event"] == "command_page_excluded" for event in events)
    assert all(event["distro"] == distro and reason in event["reason"] for event in events)


@pytest.mark.parametrize(
    ("distro", "package"),
    [
        ("ubuntu", "gcc"),
        ("ubuntu", "gdb"),
        ("debian", "perl"),
        ("debian", "python3"),
        ("ubuntu", "perl"),
        ("ubuntu", "python3"),
    ],
)
def test_exclusions_do_not_disable_other_distros(distro, package) -> None:
    with pytest.raises(RuntimeError, match="missing package-set command pages"):
        runner._require_command_pages(
            distro=distro, requested=[package], pages=[], aliases=[], sample=False
        )


@pytest.mark.parametrize(
    ("distro", "package", "page", "owner"),
    [
        ("ubuntu", "util-linux", "mount(8)", "mount"),
        ("ubuntu", "perl", "perl(1)", "perl-base"),
        ("ubuntu", "python3", "python3(1)", "python3-minimal"),
        ("debian", "perl", "perl(1)", "perl-base"),
        ("debian", "python3", "python3(1)", "python3-minimal"),
        ("debian", "postgresql-client", "psql(1)", "postgresql-client-17"),
        ("debian", "default-mysql-client", "mysql(1)", "mariadb-client-core"),
        ("debian", "groff", "groff(1)", "groff-base"),
        ("debian", "vim", "vim(1)", "vim-common"),
        ("debian", "apache2", "apache2(8)", "apache2-bin"),
        ("fedora", "coreutils", "ls(1)", "coreutils-common"),
        ("fedora", "util-linux", "mount(8)", "util-linux-core"),
        ("arch", "tar", "tar(1)", "tar"),
        ("alpine", "tar", "tar(1)", "tar-doc"),
    ],
)
def test_missing_page_error_names_owner(distro, package, page, owner) -> None:
    with pytest.raises(RuntimeError) as exc:
        runner._require_command_pages(
            distro=distro, requested=[package], pages=[], aliases=[], sample=False
        )
    assert page in str(exc.value)
    assert f"package {package}; expected owner {owner})" in str(exc.value)


def test_explicit_escape_hatch_logs_missing_pages_and_owners(monkeypatch, caplog) -> None:
    monkeypatch.setenv("BETTERMAN_ALLOW_MISSING_COMMAND_PAGES", "1")
    caplog.set_level(logging.INFO, logger="betterman.ingestion")
    missing = runner._require_command_pages(
        distro="fedora", requested=["coreutils"], pages=[], aliases=[], sample=False
    )
    assert caplog.records[0].levelno == logging.WARNING
    event = json.loads(caplog.records[0].message)
    assert event["event"] == "command_pages_missing_allowed"
    assert event["distro"] == "fedora"
    assert (
        missing
        == event["missing"]
        == [
            {
                "name": "ls",
                "section": "1",
                "package": "coreutils",
                "ownerPackage": "coreutils-common",
            }
        ]
    )


@pytest.mark.parametrize("value", ["", "0", "true"])
def test_escape_hatch_requires_exact_opt_in(monkeypatch, value) -> None:
    monkeypatch.setenv("BETTERMAN_ALLOW_MISSING_COMMAND_PAGES", value)
    with pytest.raises(RuntimeError, match=r"tar\(1\)"):
        runner._require_command_pages(
            distro="arch", requested=["tar"], pages=[], aliases=[], sample=False
        )


def test_escape_hatch_never_allows_unclassified_packages(monkeypatch, caplog) -> None:
    monkeypatch.setenv("BETTERMAN_ALLOW_MISSING_COMMAND_PAGES", "1")
    caplog.set_level(logging.INFO, logger="betterman.ingestion")
    with pytest.raises(RuntimeError, match="no command-page expectation.*new-package"):
        runner._require_command_pages(
            distro="ubuntu", requested=["new-package"], pages=[], aliases=[], sample=False
        )
    assert not caplog.records


@pytest.mark.parametrize(
    ("distro", "package", "name", "section"),
    [
        ("debian", "apache2", "apache2", "8"),
        ("ubuntu", "apache2", "apache2", "8"),
        ("alpine", "apache2", "httpd", "8"),
        ("fedora", "httpd", "httpd", "8"),
        ("arch", "apache", "httpd", "8"),
        ("arch", "openssl", "openssl", "1ssl"),
        ("fedora", "openssl", "openssl", "1ossl"),
    ],
)
def test_distro_names_and_section_suffixes_accept_resolved_aliases(distro, package, name, section):
    runner._require_command_pages(
        distro=distro,
        requested=[package],
        pages=[],
        aliases=[SimpleNamespace(name=name, section=section)],
        sample=False,
    )


def test_sample_still_requires_tar_and_ignores_unsampled_commands() -> None:
    runner._require_command_pages(
        distro="arch",
        requested=["tar", "gcc"],
        pages=[SimpleNamespace(name="tar", section="1")],
        aliases=[],
        sample=True,
    )
    with pytest.raises(RuntimeError, match=r"tar\(1\)"):
        runner._require_command_pages(
            distro="arch", requested=["tar", "gcc"], pages=[], aliases=[], sample=True
        )


@pytest.mark.parametrize(
    "package,name,owner",
    [
        ("postgresql-client", "psql", "postgresql-client-17"),
        ("default-mysql-client", "mysql", "mariadb-client-core"),
    ],
)
def test_metapackage_commands_accept_real_or_virtual_provider(package, name, owner):
    runner._require_command_pages(
        distro="debian",
        requested=[package],
        pages=[SimpleNamespace(name=name, section="1", source_package=owner)],
        aliases=[],
        sample=False,
    )
