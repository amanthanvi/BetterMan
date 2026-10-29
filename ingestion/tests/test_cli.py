from __future__ import annotations

from types import SimpleNamespace

import pytest

import ingestion.cli as cli


@pytest.mark.parametrize("extra", [[], ["--sample"], ["--no-activate"], ["--in-container"]])
@pytest.mark.parametrize("stage", ["prod", " PROD ", "Prod", "\tprod\n"])
def test_full_debian_cannot_target_prod_before_any_work(monkeypatch, extra, stage):
    monkeypatch.setenv("BETTERMAN_DATASET_STAGE", stage)

    def forbidden(**_kwargs):
        pytest.fail("full prod ingest must fail before acquisition or writes")

    monkeypatch.setattr(cli, "_run_ingest", forbidden)
    monkeypatch.setattr(cli, "run_ingest_container", forbidden)
    events = []
    monkeypatch.setattr(cli, "_log", lambda event, **fields: events.append((event, fields)))
    assert cli.main(["ingest", "--debian-full", *extra]) == 2
    assert "cannot use stage prod" in events[-1][1]["error"]


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
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")
    monkeypatch.delenv("BETTERMAN_IMAGE_REF", raising=False)
    monkeypatch.delenv("BETTERMAN_IMAGE_DIGEST", raising=False)

    events: list[tuple[str, dict[str, object]]] = []

    def fake_log(event: str, **fields: object) -> None:
        events.append((event, dict(fields)))

    monkeypatch.setattr(cli, "_log", fake_log)

    assert cli._run_ingest_in_container(sample=False, activate=True, distro="debian") == 2
    assert events and events[0][0] == "ingest_error"


def test_run_ingest_in_container_runtime_error(monkeypatch) -> None:
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")
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
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")
    monkeypatch.setenv("BETTERMAN_DATASET_STAGE", "staging")

    events: list[tuple[str, dict[str, object]]] = []

    def fake_log(event: str, **fields: object) -> None:
        events.append((event, dict(fields)))

    monkeypatch.setattr(cli, "_log", fake_log)

    called: dict[str, object] = {}

    def fake_ingest_dataset(
        *,
        sample: bool,
        activate: bool,
        convex_url: str,
        ingest_secret: str,
        dataset_stage: str,
        image_ref: str,
        image_digest: str,
        git_sha: str,
        distro: str,
    ):
        called["convex_url"] = convex_url
        called["ingest_secret"] = ingest_secret
        called["dataset_stage"] = dataset_stage
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
    assert called["convex_url"] == "https://example.convex.site"
    assert called["ingest_secret"] == "secret"
    assert called["dataset_stage"] == "staging"

    assert events and events[-1][0] == "ingest_done"


def test_run_ingest_in_container_defaults_git_sha_from_repo(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_IMAGE_REF", "example:latest")
    monkeypatch.setenv("BETTERMAN_IMAGE_DIGEST", "sha256:deadbeef")
    monkeypatch.delenv("BETTERMAN_INGEST_GIT_SHA", raising=False)
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")

    monkeypatch.setattr(cli, "_git_sha", lambda _repo_root: "deadbeef")

    called: dict[str, object] = {}

    def fake_ingest_dataset(
        *,
        sample: bool,
        activate: bool,
        convex_url: str,
        ingest_secret: str,
        dataset_stage: str,
        image_ref: str,
        image_digest: str,
        git_sha: str,
        distro: str,
    ):
        called["git_sha"] = git_sha
        return SimpleNamespace(
            dataset_release_id="release",
            total=1,
            succeeded=1,
            hard_failed=0,
            published=True,
        )

    monkeypatch.setattr(cli, "ingest_dataset", fake_ingest_dataset)

    assert cli._run_ingest_in_container(sample=False, activate=True, distro="debian") == 0
    assert called["git_sha"] == "deadbeef"


def test_run_ingest_on_host_defaults_image_fields(monkeypatch) -> None:
    monkeypatch.delenv("BETTERMAN_IMAGE_REF", raising=False)
    monkeypatch.delenv("BETTERMAN_IMAGE_DIGEST", raising=False)
    monkeypatch.setenv("BETTERMAN_INGEST_GIT_SHA", "abc123")
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")

    called: dict[str, object] = {}

    def fake_ingest_dataset(
        *,
        sample: bool,
        activate: bool,
        convex_url: str,
        ingest_secret: str,
        dataset_stage: str,
        image_ref: str,
        image_digest: str,
        git_sha: str,
        distro: str,
    ):
        called["convex_url"] = convex_url
        called["ingest_secret"] = ingest_secret
        called["dataset_stage"] = dataset_stage
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
    assert called["convex_url"] == "https://example.convex.site"
    assert called["ingest_secret"] == "secret"
    assert called["dataset_stage"] == "staging"
    assert called["image_ref"] == "host:macos"
    assert called["image_digest"] == "unknown"
    assert called["git_sha"] == "abc123"


def test_activation_resume_does_not_reingest(monkeypatch):
    from ingestion import cli

    calls = []
    monkeypatch.setenv("CONVEX_HTTP_URL", "http://127.0.0.1:33311")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "local")
    monkeypatch.setattr(cli.ConvexIngestClient, "require_deployed_contract", lambda _self: {})

    def activate(_self, payload):
        calls.append(payload)
        return {"pending": False, "datasetReleaseId": payload["datasetReleaseId"]}

    monkeypatch.setattr(cli.ConvexIngestClient, "activate_release", activate)

    def no_ingest(**_kwargs):
        raise AssertionError("must not re-ingest")

    monkeypatch.setattr(cli, "ingest_dataset", no_ingest)
    assert cli.main(["activate", "--release-id", "large", "--stage", "staging"]) == 0
    assert calls[0]["datasetReleaseId"] == "large"
    assert calls[0]["stage"] == "staging"


@pytest.mark.parametrize(
    "args",
    [
        ["ingest"],
        ["ingest", "--distro", "macos"],
        ["ingest", "--in-container"],
        ["activate", "--release-id", "large"],
    ],
)
def test_invalid_timeout_stops_at_startup_without_any_work(monkeypatch, caplog, args):
    monkeypatch.setenv("BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS", "invalid")

    def forbidden(*_args, **_kwargs):
        raise AssertionError("startup validation must precede Docker, parsing and network writes")

    monkeypatch.setattr(cli, "run_ingest_container", forbidden)
    monkeypatch.setattr(cli, "ingest_dataset", forbidden)
    monkeypatch.setattr(cli, "ConvexIngestClient", forbidden)
    with caplog.at_level("INFO"):
        assert cli.main(args) == 2
    assert "ingest_error" in caplog.text
    assert "BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS must be a number" in caplog.text
    assert "Traceback" not in caplog.text


def test_activate_client_value_error_is_clean(monkeypatch, caplog):
    monkeypatch.setenv("CONVEX_HTTP_URL", "http://127.0.0.1:33411")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "local")

    def invalid(*_args):
        raise ValueError("invalid client settings")

    monkeypatch.setattr(cli, "ConvexIngestClient", invalid)
    with caplog.at_level("INFO"):
        assert cli.main(["activate", "--release-id", "large"]) == 2
    assert "invalid client settings" in caplog.text


def test_invalid_job_deadline_exits_before_ingestion(monkeypatch, caplog):
    monkeypatch.setenv("BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS", "not-a-timestamp")

    def forbidden(**_kwargs):
        raise AssertionError("must validate before Docker or writes")

    monkeypatch.setattr(cli, "run_ingest_container", forbidden)
    with caplog.at_level("INFO"):
        assert cli.main(["ingest"]) == 2
    assert "BETTERMAN_INGEST_DEADLINE_UNIX_SECONDS must be a Unix timestamp" in caplog.text


def test_full_debian_uses_archive_path_before_docker(monkeypatch):
    calls = []

    def run(**kwargs):
        calls.append(kwargs)
        return 0

    monkeypatch.setattr(cli, "_run_ingest", run)
    monkeypatch.setattr(
        cli, "run_ingest_container", lambda **_: pytest.fail("must not install Debian packages")
    )
    assert cli.main(["ingest", "--distro", "debian", "--debian-full", "--no-activate"]) == 0
    assert calls[0]["archive_mode"] is True
    assert calls[0]["activate"] is False


def test_debian_sample_keeps_curated_docker_path(monkeypatch):
    calls = []
    monkeypatch.setattr(cli, "run_ingest_container", lambda **kwargs: calls.append(kwargs) or 0)
    assert cli.main(["ingest", "--distro", "debian", "--sample"]) == 0
    assert calls == [{"sample": True, "activate": False, "distro": "debian"}]


def test_default_debian_keeps_curated_docker_path(monkeypatch):
    calls = []
    monkeypatch.setattr(cli, "run_ingest_container", lambda **kw: calls.append(kw) or 0)
    assert cli.main(["ingest", "--distro", "debian"]) == 0
    assert calls == [{"sample": False, "activate": True, "distro": "debian"}]
