from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path

_DISTRO_IMAGES_PATH = Path(__file__).resolve().parents[1] / "distro-images.env"


def load_distro_images(path: Path | None = None) -> dict[str, str]:
    """Return distro to image ref from the shared ingest image file."""
    source = _DISTRO_IMAGES_PATH if path is None else path
    images: dict[str, str] = {}
    try:
        lines = source.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise RuntimeError(f"cannot read distro images from {source}") from exc

    for lineno, raw in enumerate(lines, start=1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        distro, sep, image = line.partition("=")
        distro = distro.strip()
        image = image.strip()
        if (
            not sep
            or not distro
            or not image
            or any(char.isspace() for char in distro)
            or any(char.isspace() for char in image)
        ):
            raise RuntimeError(f"invalid distro image entry at {source}:{lineno}")
        if distro in images:
            raise RuntimeError(f"duplicate distro image entry for {distro} at {source}:{lineno}")
        images[distro] = image

    if not images:
        raise RuntimeError(f"no distro images in {source}")
    return images


def distro_image_env(path: Path | None = None) -> dict[str, str]:
    """Environment assignments the ingest workflow exports from the shared file."""
    return {
        f"BETTERMAN_{distro.upper()}_IMAGE_REF": image
        for distro, image in load_distro_images(path).items()
    }


def _image_ref(distro: str) -> str:
    images = load_distro_images()
    if distro not in images:
        raise RuntimeError(f"unsupported distro: {distro}")
    return os.environ.get(f"BETTERMAN_{distro.upper()}_IMAGE_REF", images[distro])


def run_ingest_container(*, sample: bool, activate: bool, distro: str) -> int:
    repo_root = Path(__file__).resolve().parents[2]
    ingestion_dir = repo_root / "ingestion"
    image_ref = _image_ref(distro)
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
