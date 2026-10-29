from __future__ import annotations

from types import SimpleNamespace

import pytest

import ingestion.docker_runner as docker_runner


def _named_env(cmd: list[str], name: str) -> bool:
    return any(cmd[index] == "-e" and cmd[index + 1] == name for index in range(len(cmd) - 1))


def test_run_ingest_container_rejects_unknown_distro() -> None:
    with pytest.raises(RuntimeError, match="unsupported distro"):
        docker_runner.run_ingest_container(sample=False, activate=True, distro="freebsd")


def test_run_ingest_container_builds_debian_command(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_DEBIAN_IMAGE_REF", "debian:custom")
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "s3cr3t-value")
    monkeypatch.setenv("BETTERMAN_ALLOW_MISSING_COMMAND_PAGES", "1")
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
    assert "CONVEX_INGEST_SECRET" in docker_run
    assert not any("s3cr3t-value" in part for part in docker_run)
    assert "BETTERMAN_INGEST_WORKERS" in docker_run
    assert _named_env(docker_run, "BETTERMAN_ALLOW_MISSING_COMMAND_PAGES")
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


def test_run_ingest_container_forwards_page_batch_limits_by_name(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_DEBIAN_IMAGE_REF", "debian:custom")
    monkeypatch.setenv("CONVEX_HTTP_URL", "https://example.convex.site")
    monkeypatch.setenv("CONVEX_INGEST_SECRET", "secret")
    monkeypatch.setenv("BETTERMAN_INGEST_UPLOAD_WORKERS", "3")
    monkeypatch.setenv("BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS", "900")
    monkeypatch.setenv("BETTERMAN_INGEST_PAGE_BATCH_ITEMS", "7")
    monkeypatch.setenv("BETTERMAN_INGEST_PAGE_BATCH_BYTES", "1024")
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
        if cmd[:3] == ["docker", "image", "inspect"]:
            return "debian:custom@sha256:deadbeef\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "abc123\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=False, activate=True, distro="debian") == 0

    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    for name in (
        "BETTERMAN_INGEST_PAGE_BATCH_ITEMS",
        "BETTERMAN_INGEST_PAGE_BATCH_BYTES",
    ):
        assert _named_env(docker_run, name)
        assert not any(part.startswith(f"{name}=") for part in docker_run)


def test_run_ingest_container_omits_unset_page_batch_limits(monkeypatch) -> None:
    monkeypatch.setenv("BETTERMAN_UBUNTU_IMAGE_REF", "ubuntu:custom")
    monkeypatch.delenv("BETTERMAN_INGEST_PAGE_BATCH_ITEMS", raising=False)
    monkeypatch.delenv("BETTERMAN_INGEST_PAGE_BATCH_BYTES", raising=False)
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        if cmd[:2] in (["docker", "pull"], ["docker", "run"]):
            return SimpleNamespace(returncode=0)
        raise AssertionError(f"unexpected run: {cmd}")

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return "ubuntu:custom@sha256:deadbeef\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "abc123\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=False, activate=True, distro="ubuntu") == 0

    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    assert "BETTERMAN_INGEST_PAGE_BATCH_ITEMS" not in docker_run
    assert "BETTERMAN_INGEST_PAGE_BATCH_BYTES" not in docker_run


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

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return "archlinux:latest@sha256:deadbeef\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "abc123\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=False, activate=True, distro="arch") == 0

    assert calls[0] == ["docker", "pull", "--platform", "linux/amd64", "archlinux:latest"]
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


@pytest.mark.parametrize(
    ("distro", "image"),
    [
        ("debian", "debian:trixie"),
        ("ubuntu", "ubuntu:24.04"),
        ("fedora", "fedora:44"),
        ("arch", "archlinux:latest"),
        ("alpine", "alpine:3.24"),
    ],
)
@pytest.mark.parametrize("optional_set", [False, True])
def test_run_ingest_container_defaults_to_supported_image(
    monkeypatch, distro, image, optional_set
) -> None:
    optional = ("BETTERMAN_INGEST_UPLOAD_WORKERS", "BETTERMAN_INGEST_ACTIVATION_TIMEOUT_SECONDS")
    for name in optional:
        if optional_set:
            monkeypatch.setenv(name, "3" if name.endswith("WORKERS") else "900")
        else:
            monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("BETTERMAN_DOCKER_PLATFORM", "linux/amd64")
    monkeypatch.setenv("INGEST_DOCKER_NETWORK", "test-network")
    monkeypatch.delenv(f"BETTERMAN_{distro.upper()}_IMAGE_REF", raising=False)
    monkeypatch.setattr(docker_runner, "_docker_network_exists", lambda _name: False)

    calls: list[list[str]] = []

    def fake_run(cmd: list[str], check: bool = False, **_kwargs: object):
        calls.append(cmd)
        return SimpleNamespace(returncode=0)

    def fake_check_output(cmd: list[str], **_kwargs: object) -> str:
        if cmd[:3] == ["docker", "image", "inspect"]:
            return f"{image}@sha256:cafebabe\n"
        if cmd[:2] == ["git", "rev-parse"]:
            return "def456\n"
        raise AssertionError(f"unexpected check_output: {cmd}")

    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)
    monkeypatch.setattr(docker_runner.subprocess, "check_output", fake_check_output)

    assert docker_runner.run_ingest_container(sample=True, activate=False, distro=distro) == 0

    assert calls[0] == ["docker", "pull", "--platform", "linux/amd64", image]
    docker_run = [cmd for cmd in calls if cmd[:2] == ["docker", "run"]][0]
    assert docker_run[-4] == image
    assert f"BETTERMAN_IMAGE_REF={image}" in docker_run

    # Parse the complete Docker grammar, rather than checking isolated tokens.
    # A bare env name would otherwise become the image, breaking every distro.
    index = 2
    env_names = []
    while index < len(docker_run):
        flag = docker_run[index]
        if flag == "--rm":
            index += 1
        elif flag in {"-e", "-v", "-w", "--platform", "--network"}:
            value = docker_run[index + 1]
            assert value and not value.startswith("-")
            if flag == "-e":
                env_names.append(value.split("=", 1)[0])
            index += 2
        else:
            break
    assert docker_run[index] == image
    assert docker_run[index + 1 : index + 3] == ["sh", "-lc"]
    assert len(docker_run) == index + 4
    for name in optional:
        assert (name in env_names) is optional_set
