from __future__ import annotations

from types import SimpleNamespace

import ingestion.alpine as alpine


def _fake_run(calls: list[list[str]], *, docs_returncode: int = 0):
    def fake_run(cmd: list[str], **_kwargs: object):
        calls.append(cmd)
        return SimpleNamespace(returncode=docs_returncode if "docs" in cmd else 0)

    return fake_run


def test_apk_install_adds_docs_after_packages(monkeypatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(alpine.subprocess, "run", _fake_run(calls))

    alpine.apk_install(["mandoc", "bash", "openssh-client"])

    assert calls == [
        ["apk", "add", "--no-cache", "mandoc", "bash", "openssh-client"],
        ["apk", "add", "--no-cache", "docs", "openssh-doc"],
    ]


def test_apk_install_skips_openssh_doc_without_openssh_client(monkeypatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(alpine.subprocess, "run", _fake_run(calls))

    alpine.apk_install(["mandoc", "bash"])

    assert calls[1] == ["apk", "add", "--no-cache", "docs"]


def test_apk_install_survives_docs_failure(monkeypatch) -> None:
    calls: list[list[str]] = []
    monkeypatch.setattr(alpine.subprocess, "run", _fake_run(calls, docs_returncode=1))

    alpine.apk_install(["mandoc", "bash"])

    assert len(calls) == 2
