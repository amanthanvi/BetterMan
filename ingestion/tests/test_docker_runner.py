from __future__ import annotations

from types import SimpleNamespace

import pytest

import ingestion.docker_runner as docker_runner


def test_run_ingest_container_rejects_unknown_distro() -> None:
    with pytest.raises(RuntimeError, match="unsupported distro"):
        docker_runner.run_ingest_container(sample=False, activate=True, distro="freebsd")


def test_run_ingest_container_builds_debian_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_DEBIAN_IMAGE_REF", "debian:custom")
    monkeypatch.setenv("INGEST_DATABASE_URL", "postgresql://u:p@h:5432/db")
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: True)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["docker", "pull"]:
            assert cmd[2] == "debian:custom"
            return SimpleNamespace(returncode=0)
        if cmd[:2] == ["docker", "run"]:
            return SimpleNamespace(returncode=0)
        raise AssertionError(f"unexpected run: {cmd}")

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return "debian:custom@sha256:deadbeef\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "abc123\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=True, activate=False, distro="debian") == 0

    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    assert "--network" in docker_run
    assert "betterman_default" in docker_run
    assert any(part.startswith("INGEST_DATABASE_URL=") for part in docker_run)
    assert any(part.startswith("BETTERMAN_IMAGE_DIGEST=") for part in docker_run)

    inner = docker_run[-1]
    assert "apt-get install" in inner
    assert "--sample" in inner
    assert "--no-activate" in inner


def test_run_ingest_container_builds_fedora_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_FEDORA_IMAGE_REF", "fedora:custom")
    monkeypatch.delenv("INGEST_DATABASE_URL", raising=False)
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["docker", "pull"]:
            assert cmd[2] == "fedora:custom"
            return SimpleNamespace(returncode=0)
        if cmd[:2] == ["docker", "run"]:
            return SimpleNamespace(returncode=3)
        raise AssertionError(f"unexpected run: {cmd}")

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return "fedora:custom@sha256:cafebabe\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "def456\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=False, activate=True, distro="fedora") == 3

    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    assert "--network" not in docker_run

    inner = docker_run[-1]
    assert "dnf -y -q install" in inner
    assert "--activate" in inner


def test_run_ingest_container_builds_arch_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_ARCH_IMAGE_REF", "archlinux:custom")
    monkeypatch.setenv("INGEST_DATABASE_URL", "postgresql://u:p@h:5432/db")
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["docker", "pull"]:
            assert cmd[2] == "archlinux:custom"
            return SimpleNamespace(returncode=0)
        if cmd[:2] == ["docker", "run"]:
            return SimpleNamespace(returncode=0)
        raise AssertionError(f"unexpected run: {cmd}")

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return "archlinux:custom@sha256:deadbeef\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "abc123\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=False, activate=True, distro="arch") == 0

    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    inner = docker_run[-1]
    assert "pacman -Syu" in inner
    assert "--distro arch" in inner


def test_run_ingest_container_builds_alpine_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_ALPINE_IMAGE_REF", "alpine:custom")
    monkeypatch.delenv("INGEST_DATABASE_URL", raising=False)
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["docker", "pull"]:
            assert cmd[2] == "alpine:custom"
            return SimpleNamespace(returncode=0)
        if cmd[:2] == ["docker", "run"]:
            return SimpleNamespace(returncode=0)
        raise AssertionError(f"unexpected run: {cmd}")

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return "alpine:custom@sha256:cafebabe\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "def456\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=True, activate=False, distro="alpine") == 0

    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    inner = docker_run[-1]
    assert "apk add --no-cache" in inner
    assert "--distro alpine" in inner
