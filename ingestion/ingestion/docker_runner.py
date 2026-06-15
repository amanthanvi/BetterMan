from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path


def run_ingest_container(*, sample: bool, activate: bool, distro: str) -> int:
    repo_root = Path(__file__).resolve().parents[2]
    ingestion_dir = repo_root / "ingestion"

    default_images = {
        "debian": "debian:trixie",
        "ubuntu": "ubuntu:24.04",
        "fedora": "fedora:41",
        "arch": "archlinux:latest",
        "alpine": "alpine:3.20",
    }
    image_env = {
        "debian": "BETTERMAN_DEBIAN_IMAGE_REF",
        "ubuntu": "BETTERMAN_UBUNTU_IMAGE_REF",
        "fedora": "BETTERMAN_FEDORA_IMAGE_REF",
        "arch": "BETTERMAN_ARCH_IMAGE_REF",
        "alpine": "BETTERMAN_ALPINE_IMAGE_REF",
    }

    if distro not in default_images or distro not in image_env:
        raise RuntimeError(f"unsupported distro: {distro}")

    image_ref = os.environ.get(image_env[distro], default_images[distro])
    platform = os.environ.get(f"BETTERMAN_{distro.upper()}_DOCKER_PLATFORM") or os.environ.get(
        "BETTERMAN_DOCKER_PLATFORM",
    )
    pull_cmd = ["docker", "pull"]
    if platform:
        pull_cmd.extend(["--platform", platform])
    pull_cmd.append(image_ref)
    subprocess.run(pull_cmd, check=True)
    image_digest = _image_digest(image_ref)

    git_sha = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=repo_root,
        text=True,
    ).strip()

    convex_url = os.environ.get("CONVEX_HTTP_URL") or os.environ.get("CONVEX_URL", "")
    ingest_secret = os.environ.get("CONVEX_INGEST_SECRET", "")
    dataset_stage = os.environ.get("BETTERMAN_DATASET_STAGE", "staging")

    network = os.environ.get("INGEST_DOCKER_NETWORK")
    if not network and _docker_network_exists("betterman_default"):
        network = "betterman_default"

    cmd = [
        "docker",
        "run",
        "--rm",
        "-e",
        f"CONVEX_HTTP_URL={convex_url}",
        "-e",
        f"CONVEX_INGEST_SECRET={ingest_secret}",
        "-e",
        f"BETTERMAN_DATASET_STAGE={dataset_stage}",
        "-e",
        f"BETTERMAN_IMAGE_REF={image_ref}",
        "-e",
        f"BETTERMAN_IMAGE_DIGEST={image_digest}",
        "-e",
        f"BETTERMAN_INGEST_GIT_SHA={git_sha}",
        "-v",
        f"{ingestion_dir}:/src:ro",
        "-w",
        "/work",
    ]
    if platform:
        cmd.extend(["--platform", platform])
    if network:
        cmd.extend(["--network", network])

    args = ["ingest", "--in-container", "--distro", distro]
    if sample:
        args.append("--sample")
    args.append("--activate" if activate else "--no-activate")

    runner_cmd = shlex.join(["/opt/venv/bin/python", "-m", "ingestion.cli", *args])
    if distro in {"debian", "ubuntu"}:
        inner = (
            "set -eu; "
            "export DEBIAN_FRONTEND=noninteractive; "
            "mkdir -p /work; "
            "cp -R /src/. /work; "
            "apt-get update -qq; "
            "apt-get install -y -qq --no-install-recommends "
            "python3 python3-venv ca-certificates >/dev/null; "
            "python3 -m venv /opt/venv; "
            "/opt/venv/bin/pip install -q /work; "
            f"{runner_cmd}"
        )
    elif distro == "fedora":
        inner = (
            "set -euo pipefail; "
            "mkdir -p /work; "
            "cp -R /src/. /work; "
            "dnf -y -q install python3 python3-pip ca-certificates >/dev/null; "
            "python3 -m venv /opt/venv; "
            "/opt/venv/bin/pip install -q /work; "
            f"{runner_cmd}"
        )
    elif distro == "arch":
        inner = (
            "set -euo pipefail; "
            "mkdir -p /work; "
            "cp -R /src/. /work; "
            "sed -i 's/^#DisableSandboxSyscalls/DisableSandboxSyscalls/' /etc/pacman.conf; "
            "pacman -Syu --noconfirm --needed python python-pip ca-certificates >/dev/null; "
            "python -m venv /opt/venv; "
            "/opt/venv/bin/pip install -q /work; "
            f"{runner_cmd}"
        )
    else:
        inner = (
            "set -eu; "
            "mkdir -p /work; "
            "cp -R /src/. /work; "
            "apk add --no-cache python3 py3-pip ca-certificates >/dev/null; "
            "python3 -m venv /opt/venv; "
            "/opt/venv/bin/pip install -q /work; "
            f"{runner_cmd}"
        )

    cmd.extend([image_ref, "sh", "-lc", inner])
    proc = subprocess.run(cmd, check=False)
    return proc.returncode


def _docker_network_exists(name: str) -> bool:
    out = subprocess.check_output(["docker", "network", "ls", "--format", "{{.Name}}"], text=True)
    return name in {line.strip() for line in out.splitlines() if line.strip()}


def _image_digest(image_ref: str) -> str:
    try:
        repodigest = subprocess.check_output(
            ["docker", "image", "inspect", "--format", "{{index .RepoDigests 0}}", image_ref],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except subprocess.CalledProcessError:
        repodigest = ""

    if repodigest:
        return repodigest.split("@", 1)[1] if "@" in repodigest else repodigest

    return subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{.Id}}", image_ref],
        text=True,
    ).strip()
