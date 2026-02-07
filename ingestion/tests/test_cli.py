from __future__ import annotations

from types import SimpleNamespace

import ingestion.cli as cli


def test_main_invokes_run_ingest_container_for_host(monkeypatch) -> None:
    called: dict[str, object] = {}

    def fake_run_ingest_container(*, sample: bool, activate: bool, distro: str) -> int:
        called["sample"] = sample
        called["activate"] = activate
        called["distro"] = distro
        return 7

    monkeypatch.setattr(cli, "run_ingest_container", fake_run_ingest_container)

    assert cli.main(["ingest", "--distro", "fedora", "--sample"]) == 7
    assert called == {"sample": True, "activate": False, "distro": "fedora"}


def test_main_invokes_run_ingest_on_host_for_macos(monkeypatch) -> None:
    called: dict[str, object] = {}

    def fake_run_ingest_on_host(*, sample: bool, activate: bool, distro: str) -> int:
        called["sample"] = sample
        called["activate"] = activate
        called["distro"] = distro
        return 9

    def fake_run_ingest_container(**_kwargs: object) -> int:
        raise AssertionError("docker runner should not be called for macos")

    monkeypatch.setattr(cli, "_run_ingest_on_host", fake_run_ingest_on_host)
    monkeypatch.setattr(cli, "run_ingest_container", fake_run_ingest_container)

    assert cli.main(["ingest", "--distro", "macos", "--sample"]) == 9
    assert called == {"sample": True, "activate": False, "distro": "macos"}


def test_run_ingest_in_container_requires_image_env(monkeypatch) -> None:
    monkeypatch.delenv("BETTERMAN_IMAGE_REF", raising=False)
    monkeypatch.delenv("BETTERMAN_IMAGE_DIGEST", raising=False)

    events: list[tuple[str, dict[str, object]]] = []

    def fake_log(event: str, **fields: object) -> None:
        events.append((event, dict(fields)))

    monkeypatch.setattr(cli, "_log", fake_log)

    assert cli._run_ingest_in_container(sample=False, activate=True, distro="debian") == 2
    assert events and events[0][0] == "ingest_error"


def test_run_ingest_in_container_runtime_error(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_IMAGE_REF", "example:latest")
    monkeypatch.setenv("BETTERMAN_IMAGE_DIGEST", "sha256:deadbeef")

    events: list[str] = []
    monkeypatch.setattr(cli, "_log", lambda event, **_: events.append(event))

    def fake_ingest_dataset(**_kwargs: object):
        raise RuntimeError("boom")

    monkeypatch.setattr(cli, "ingest_dataset", fake_ingest_dataset)

    assert cli._run_ingest_in_container(sample=False, activate=True, distro="debian") == 2
    assert events == ["ingest_error"]


def test_run_ingest_in_container_success_logs_done(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_IMAGE_REF", "example:latest")
    monkeypatch.setenv("BETTERMAN_IMAGE_DIGEST", "sha256:deadbeef")
    monkeypatch.setenv("BETTERMAN_INGEST_GIT_SHA", "abc123")
    monkeypatch.setenv("INGEST_DATABASE_URL", "postgresql://u:p@h:5432/db")

    events: list[tuple[str, dict[str, object]]] = []

    def fake_log(event: str, **fields: object) -> None:
        events.append((event, dict(fields)))

    monkeypatch.setattr(cli, "_log", fake_log)

    called: dict[str, object] = {}

    def fake_ingest_dataset(
        *,
        sample: bool,
        activate: bool,
        database_url: str,
        image_ref: str,
        image_digest: str,
        git_sha: str,
        distro: str,
    ):
        called["database_url"] = database_url
        called["image_ref"] = image_ref
        called["image_digest"] = image_digest
        called["git_sha"] = git_sha
        called["distro"] = distro
        called["sample"] = sample
        called["activate"] = activate
        return SimpleNamespace(
            dataset_release_id="release",
            total=10,
            succeeded=9,
            hard_failed=1,
            published=True,
        )

    monkeypatch.setattr(cli, "ingest_dataset", fake_ingest_dataset)

    assert cli._run_ingest_in_container(sample=True, activate=False, distro="ubuntu") == 0
    assert called["database_url"] == "postgresql://u:p@h:5432/db"

    assert events and events[-1][0] == "ingest_done"


def test_run_ingest_on_host_defaults_image_fields(monkeypatch) -> None:
    monkeypatch.delenv("BETTERMAN_IMAGE_REF", raising=False)
    monkeypatch.delenv("BETTERMAN_IMAGE_DIGEST", raising=False)
    monkeypatch.setenv("BETTERMAN_INGEST_GIT_SHA", "abc123")
    monkeypatch.setenv("INGEST_DATABASE_URL", "postgresql://u:p@h:5432/db")

    called: dict[str, object] = {}

    def fake_ingest_dataset(
        *,
        sample: bool,
        activate: bool,
        database_url: str,
        image_ref: str,
        image_digest: str,
        git_sha: str,
        distro: str,
    ):
        called["database_url"] = database_url
        called["image_ref"] = image_ref
        called["image_digest"] = image_digest
        called["git_sha"] = git_sha
        called["distro"] = distro
        called["sample"] = sample
        called["activate"] = activate
        return SimpleNamespace(
            dataset_release_id="release",
            total=10,
            succeeded=9,
            hard_failed=1,
            published=True,
        )

    monkeypatch.setattr(cli, "ingest_dataset", fake_ingest_dataset)

    assert cli._run_ingest_on_host(sample=True, activate=False, distro="macos") == 0
    assert called["database_url"] == "postgresql://u:p@h:5432/db"
    assert called["image_ref"] == "host:macos"
    assert called["image_digest"] == "unknown"
    assert called["git_sha"] == "abc123"
