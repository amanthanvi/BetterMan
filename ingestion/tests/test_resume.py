from __future__ import annotations

import sqlite3
from contextlib import closing
from hashlib import sha256
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from test_quickwin_hardening import _install_gate_harness

from ingestion import cli, docker_runner, ingest_runner
from ingestion.convex_client import ConvexIngestClient
from ingestion.man_scan import ManSource
from ingestion.resume import ReleaseCheckpoint


def _checkpoint(tmp_path, *, url="https://test.convex.site", release="test-release"):
    return ReleaseCheckpoint(directory=tmp_path, http_url=url, release_id=release)


def test_checkpoint_reopens_exact_plan_and_only_unacknowledged_payloads(tmp_path) -> None:
    signature = {"distro": "debian", "gitSha": "abc"}
    metadata = {
        "declaration": {"ingestedAt": "frozen", "packageManifest": {"generatedAt": "frozen"}}
    }
    pages = [{"externalId": "a", "doc": {"text": "é"}}, {"externalId": "b"}]
    with _checkpoint(tmp_path) as checkpoint:
        assert checkpoint.load(signature) is None
        checkpoint.prepare(signature=signature, metadata=metadata, items={"pages": pages})
        checkpoint.acknowledge("pages", [0])

    with _checkpoint(tmp_path, url="https://test.convex.cloud/") as checkpoint:
        assert checkpoint.load(signature) == metadata
        assert list(checkpoint.pending("pages")) == [(1, pages[1])]
        assert checkpoint.uploaded_count("pages") == 1
        checkpoint.acknowledge("pages", [0, 1])
        assert checkpoint.uploaded_count() == 2
        assert list(checkpoint.pending("pages")) == []


def test_checkpoint_cannot_overwrite_plan_or_cross_command_provenance(tmp_path) -> None:
    with _checkpoint(tmp_path) as checkpoint:
        checkpoint.prepare(signature={"distro": "debian"}, metadata={}, items={})
        with pytest.raises(RuntimeError, match="does not match"):
            checkpoint.load({"distro": "ubuntu"})
        with pytest.raises(sqlite3.IntegrityError):
            checkpoint.prepare(signature={"distro": "debian"}, metadata={}, items={})


def test_checkpoints_are_scoped_to_destination_and_release(tmp_path) -> None:
    with _checkpoint(tmp_path) as checkpoint:
        checkpoint.prepare(signature={}, metadata={}, items={"pages": [{"externalId": "a"}]})
        checkpoint.acknowledge("pages", [0])
    with _checkpoint(tmp_path, url="https://other.convex.site") as checkpoint:
        assert checkpoint.load({}) is None
    with _checkpoint(tmp_path, release="other-release") as checkpoint:
        assert checkpoint.load({}) is None


def test_prepare_is_atomic_when_payload_encoding_fails(tmp_path) -> None:
    with _checkpoint(tmp_path) as checkpoint:
        with pytest.raises(TypeError):
            checkpoint.prepare(signature={}, metadata={}, items={"pages": [{}, {"bad": object()}]})
        assert checkpoint.load({}) is None
        assert list(checkpoint.pending("pages")) == []


def test_external_id_is_exact_distro_route_hash() -> None:
    identity = ingest_runner._page_external_id(distro="debian", name="curl", section="1")
    assert identity == sha256(b"debian/curl/1").hexdigest()[:32]
    assert len(identity) == 32
    assert identity != ingest_runner._page_external_id(distro="ubuntu", name="curl", section="1")
    assert identity != ingest_runner._page_external_id(distro="debian", name="curl", section="3")


def _run_resume_ingest(**overrides):
    arguments = dict(
        sample=False,
        activate=True,
        convex_url="https://test.convex.site",
        ingest_secret="s",
        dataset_stage="staging",
        image_ref="test@sha256:pinned",
        image_digest="sha256:pinned",
        git_sha="abc",
        release_id="monthly-test-debian",
    )
    return ingest_runner.ingest(**(arguments | overrides))


def _resume_harness(monkeypatch, tmp_path, total=45):
    monkeypatch.setenv("BETTERMAN_INGEST_WORKERS", "1")
    monkeypatch.setenv("BETTERMAN_INGEST_STATE_DIR", str(tmp_path))
    sources = [ManSource(f"/usr/share/man/man1/p{i:03}.1", f"p{i:03}", "1") for i in range(total)]
    _install_gate_harness(monkeypatch, sources, {}, [])
    calls = []
    committed = set()
    declarations = []

    def post(_self, route, payload):
        calls.append((route, payload))
        if route == "/ingest/release":
            if declarations:
                assert payload == declarations[0]
            declarations.append(payload)
            return {"releaseId": "server-release", "existed": len(declarations) > 1}
        pages = payload["pages"]
        ids = {page["externalId"] for page in pages}
        skipped = len(ids & committed)
        committed.update(ids)
        return {"inserted": len(pages) - skipped, "skipped": skipped}

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", post)
    return calls, post


def test_resume_skips_parse_and_acked_pages_and_replays_uncertain_batch(monkeypatch, tmp_path):
    calls, post = _resume_harness(monkeypatch, tmp_path)
    page_posts = 0

    def lose_second_response(self, route, payload):
        nonlocal page_posts
        result = post(self, route, payload)
        if route == "/ingest/pages/storage":
            page_posts += 1
            if page_posts == 2:
                raise KeyboardInterrupt("committed, response lost")
        return result

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", lose_second_response)
    with pytest.raises(KeyboardInterrupt):
        _run_resume_ingest()
    first_batch = calls[1][1]["pages"]
    uncertain_batch = calls[2][1]["pages"]
    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", post)
    monkeypatch.setattr(
        ingest_runner, "_prepare_release", Mock(side_effect=AssertionError("retry reparsed"))
    )
    calls.clear()
    result = _run_resume_ingest()
    uploaded = [
        page for route, body in calls if route.endswith("storage") for page in body["pages"]
    ]
    assert uploaded[:20] == uncertain_batch
    assert not ({p["externalId"] for p in first_batch} & {p["externalId"] for p in uploaded})
    assert len(uploaded) == 25
    assert result.succeeded == 45
    assert result.published
    calls.clear()
    _run_resume_ingest()
    assert [route for route, _ in calls] == ["/ingest/release"]


def test_resume_rejects_changed_provenance_before_parse(monkeypatch, tmp_path):
    _resume_harness(monkeypatch, tmp_path)
    _run_resume_ingest()
    monkeypatch.setattr(
        ingest_runner, "_prepare_release", Mock(side_effect=AssertionError("parse"))
    )
    with pytest.raises(RuntimeError, match="does not match"):
        _run_resume_ingest(image_digest="sha256:different")


def test_missing_checkpoint_cannot_resume_existing_server_release(monkeypatch, tmp_path):
    calls, post = _resume_harness(monkeypatch, tmp_path)

    def existed(self, route, payload):
        result = post(self, route, payload)
        if route == "/ingest/release":
            result["existed"] = True
        return result

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", existed)
    with pytest.raises(RuntimeError, match="without its original checkpoint"):
        _run_resume_ingest()
    assert [route for route, _ in calls] == ["/ingest/release"]


def test_resume_does_not_trust_receipts_for_pruned_recreated_release(monkeypatch, tmp_path):
    _, post = _resume_harness(monkeypatch, tmp_path)
    _run_resume_ingest()

    def recreated(self, route, payload):
        result = post(self, route, payload)
        if route == "/ingest/release":
            result.update(releaseId="new-server-release", existed=False)
        return result

    monkeypatch.setattr(ingest_runner.ConvexIngestClient, "post", recreated)
    with pytest.raises(RuntimeError, match="removed/recreated"):
        _run_resume_ingest()


def test_checkpoint_rejects_corrupt_declaration_and_payload(tmp_path):
    with _checkpoint(tmp_path) as checkpoint:
        checkpoint.prepare(signature={}, metadata={}, items={"pages": [{"externalId": "a"}]})
        checkpoint.connection.execute("UPDATE uploads SET json = ?", (b"{}",))
        with pytest.raises(RuntimeError, match="payload 0 is corrupt"):
            list(checkpoint.pending("pages"))
        checkpoint.connection.execute("UPDATE plan SET json = ?", (b"{}",))
        with pytest.raises(RuntimeError, match="declaration is corrupt"):
            checkpoint.load({})


@pytest.mark.parametrize(
    "extra, target",
    [
        ([], "run_ingest_container"),
        (["--distro", "macos"], "_run_ingest_on_host"),
        (["--in-container"], "_run_ingest_in_container"),
    ],
)
def test_cli_forwards_release_id(monkeypatch, extra, target):
    runner = Mock(return_value=0)
    monkeypatch.setattr(cli, target, runner)
    assert cli.main(["ingest", "--release-id", "fixed", *extra]) == 0
    assert runner.call_args.kwargs["release_id"] == "fixed"


def test_docker_persists_checkpoints_outside_ephemeral_work_directory(monkeypatch, tmp_path):
    monkeypatch.setenv("BETTERMAN_INGEST_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://test.convex.site")
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _: False)
    monkeypatch.setattr(docker_runner, "_image_digest", lambda _: "sha256:pinned")
    monkeypatch.setattr(docker_runner.subprocess, "check_output", lambda *_a, **_k: "abc")
    calls = []
    monkeypatch.setattr(
        docker_runner.subprocess,
        "run",
        lambda cmd, **_kwargs: calls.append(cmd) or SimpleNamespace(returncode=0),
    )
    assert (
        docker_runner.run_ingest_container(
            sample=False, activate=True, distro="debian", release_id="fixed"
        )
        == 0
    )
    command = next(cmd for cmd in calls if cmd[:2] == ["docker", "run"])
    assert f"{tmp_path}:/ingest-state" in command
    assert "BETTERMAN_INGEST_STATE_DIR=/ingest-state" in command
    assert "--release-id fixed" in command[-1]


def test_docker_retry_pulls_original_digest_when_tag_has_moved(monkeypatch, tmp_path):
    monkeypatch.setenv("BETTERMAN_INGEST_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://test.convex.site")
    monkeypatch.setenv("BETTERMAN_DATASET_STAGE", "staging")
    monkeypatch.setenv("BETTERMAN_DEBIAN_IMAGE_REF", "debian:trixie")
    saved_digest = "sha256:" + "a" * 64
    signature = {
        "sample": False,
        "distro": "debian",
        "locale": "en",
        "stage": "staging",
        "imageRef": "debian:trixie",
        "gitSha": "abc",
        "imageDigest": saved_digest,
    }
    with _checkpoint(tmp_path, release="fixed") as checkpoint:
        checkpoint.prepare(signature=signature, metadata={}, items={})
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _: False)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", lambda *_a, **_k: "abc")
    inspected = []
    monkeypatch.setattr(
        docker_runner, "_image_digest", lambda ref: inspected.append(ref) or saved_digest
    )
    calls = []
    monkeypatch.setattr(
        docker_runner.subprocess,
        "run",
        lambda cmd, **_kwargs: calls.append(cmd) or SimpleNamespace(returncode=0),
    )
    assert (
        docker_runner.run_ingest_container(
            sample=False, activate=True, distro="debian", release_id="fixed"
        )
        == 0
    )
    pinned = f"debian:trixie@{saved_digest}"
    assert calls[0] == ["docker", "pull", pinned]
    assert inspected == [pinned]
    command = next(cmd for cmd in calls if cmd[:2] == ["docker", "run"])
    assert command[-4] == pinned
    assert "BETTERMAN_IMAGE_REF=debian:trixie" in command
    assert f"BETTERMAN_IMAGE_DIGEST={saved_digest}" in command
    # Caller changes still fail before Docker pull; a snapshot cannot adopt
    # a different distro image reference just because its payloads are frozen.
    monkeypatch.setenv("BETTERMAN_DEBIAN_IMAGE_REF", "debian:changed")
    calls.clear()
    with pytest.raises(RuntimeError, match="does not match"):
        docker_runner.run_ingest_container(
            sample=False, activate=True, distro="debian", release_id="fixed"
        )
    assert calls == []


@pytest.mark.parametrize(
    "response",
    [{}, {"releaseId": "x"}, {"releaseId": "", "existed": False}, {"releaseId": "x", "existed": 1}],
)
def test_create_release_requires_identity_and_existence_status(monkeypatch, response):
    monkeypatch.setattr(ConvexIngestClient, "post", lambda *_args: response)
    with pytest.raises(RuntimeError, match="identity/status"):
        ConvexIngestClient("https://test.convex.site", "s").create_release({})


def test_create_release_does_not_swallow_manifest_conflict(monkeypatch):
    monkeypatch.setattr(
        ConvexIngestClient, "post", Mock(side_effect=RuntimeError("RELEASE_MANIFEST_CONFLICT"))
    )
    with pytest.raises(RuntimeError, match="RELEASE_MANIFEST_CONFLICT"):
        ConvexIngestClient("https://test.convex.site", "s").create_release({})


def test_bad_upload_response_does_not_create_checkpoint_receipt(monkeypatch, tmp_path):
    _, post = _resume_harness(monkeypatch, tmp_path, total=1)

    def invalid(self, route, payload):
        result = post(self, route, payload)
        return {"inserted": True, "skipped": 0} if route.endswith("storage") else result

    monkeypatch.setattr(ConvexIngestClient, "post", invalid)
    with pytest.raises(RuntimeError, match="confirm every batch item"):
        _run_resume_ingest()
    database = next(tmp_path.glob("*.sqlite3"))
    with closing(sqlite3.connect(database)) as connection:
        assert connection.execute("SELECT SUM(uploaded) FROM uploads").fetchone()[0] == 0
