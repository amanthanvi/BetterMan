from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

import ingestion.docker_runner as docker_runner


def test_run_ingest_container_rejects_unknown_distro() -> None:
    with pytest.raises(RuntimeError, match="unsupported distro"):
        docker_runner.run_ingest_container(sample=False, activate=True, distro="freebsd")


def test_image_ref_override_skips_distro_images_file(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_DEBIAN_IMAGE_REF", "debian:override")

    def fail_load(*_args: object, **_kwargs: object) -> dict[str, str]:
        raise AssertionError("distro-images.env must not be read when an override is set")

    monkeypatch.setattr(docker_runner, "load_distro_images", fail_load)

    assert docker_runner._image_ref("debian") == "debian:override"


def test_run_ingest_container_builds_debian_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_DEBIAN_IMAGE_REF", "debian:custom")
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")
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
    assert any(part.startswith("CONVEX_HTTP_URL=") for part in docker_run)
    assert any(part.startswith("CONVEX_INGEST_SECRET=") for part in docker_run)
    assert any(part.startswith("BETTERMAN_IMAGE_DIGEST=") for part in docker_run)

    inner = docker_run[-1]
    assert "apt-get install" in inner
    assert "--sample" in inner
    assert "--no-activate" in inner


def test_run_ingest_container_uses_image_id_when_repo_digest_missing(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_UBUNTU_IMAGE_REF", "ubuntu:custom")
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["docker", "pull"]:
            return SimpleNamespace(returncode=0)
        if cmd[:2] == ["docker", "run"]:
            return SimpleNamespace(returncode=0)
        raise AssertionError(f"unexpected run: {cmd}")

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"] and cmd[4] == "{{index .RepoDigests 0}}":
            raise docker_runner.subprocess.CalledProcessError(1, cmd)
        if cmd[:3] == ["docker", "image", "inspect"] and cmd[4] == "{{.Id}}":
            return "sha256:local-image-id\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "abc123\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=False, activate=True, distro="ubuntu") == 0

    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    assert "BETTERMAN_IMAGE_DIGEST=sha256:local-image-id" in docker_run


def test_run_ingest_container_passes_requested_platform(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_ARCH_DOCKER_PLATFORM", "linux/amd64")
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] == ["docker", "pull"]:
            return SimpleNamespace(returncode=0)
        if cmd[:2] == ["docker", "run"]:
            return SimpleNamespace(returncode=0)
        raise AssertionError(f"unexpected run: {cmd}")

    image = docker_runner.load_distro_images()["arch"]

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return f"{image}@sha256:deadbeef\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "abc123\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=False, activate=True, distro="arch") == 0

    assert calls[0] == ["docker", "pull", "--platform", "linux/amd64", image]
    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    assert "--platform" in docker_run
    assert "linux/amd64" in docker_run


def test_run_ingest_container_builds_fedora_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_FEDORA_IMAGE_REF", "fedora:custom")
    monkeypatch.delenv("CONVEX_HTTP_URL", raising=False)
    monkeypatch.delenv("CONVEX_INGEST_SECRET", raising=False)
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
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")
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
    assert "DisableSandboxSyscalls" in inner
    assert "pacman -Syu" in inner
    assert "--distro arch" in inner


def test_run_ingest_container_builds_alpine_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_ALPINE_IMAGE_REF", "alpine:custom")
    monkeypatch.delenv("CONVEX_HTTP_URL", raising=False)
    monkeypatch.delenv("CONVEX_INGEST_SECRET", raising=False)
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


def _numeric_tag(image: str) -> tuple[int, ...]:
    tag = image.partition(":")[2]
    parts = tag.split(".")
    if not all(part.isdigit() for part in parts):
        raise AssertionError(
            f"version floor check needs a numeric tag, got {image!r}; update the floor test",
        )
    return tuple(int(part) for part in parts)


def test_distro_images_are_loaded_from_the_shared_file() -> None:
    images = docker_runner.load_distro_images()
    assert list(images) == ["debian", "ubuntu", "fedora", "arch", "alpine"]

    assert _numeric_tag(images["fedora"]) >= (44,), images["fedora"]
    assert images["alpine"].startswith("alpine:3."), images["alpine"]
    assert _numeric_tag(images["alpine"]) >= (3, 22), images["alpine"]

    env = docker_runner.distro_image_env()
    expected_env = {
        f"BETTERMAN_{distro.upper()}_IMAGE_REF": image for distro, image in images.items()
    }
    assert env == expected_env

    repo_root = Path(__file__).resolve().parents[2]
    runner_src = (repo_root / "ingestion/ingestion/docker_runner.py").read_text(encoding="utf-8")
    workflow = (repo_root / ".github/workflows/update-docs.yml").read_text(encoding="utf-8")
    assert "distro_image_env" in workflow
    for image in images.values():
        assert image not in runner_src
        assert image not in workflow


def test_load_distro_images_rejects_invalid_entries(tmp_path: Path) -> None:
    broken = tmp_path / "images.env"
    broken.write_text("# comment\n\nnot-a-pair\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="invalid distro image entry"):
        docker_runner.load_distro_images(broken)

    duplicate = tmp_path / "dup.env"
    duplicate.write_text("debian=debian:example\ndebian=debian:other\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="duplicate distro"):
        docker_runner.load_distro_images(duplicate)

    empty = tmp_path / "empty.env"
    empty.write_text("# nothing\n\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="no distro images"):
        docker_runner.load_distro_images(empty)

    missing = tmp_path / "missing.env"
    with pytest.raises(RuntimeError, match="cannot read distro images"):
        docker_runner.load_distro_images(missing)
