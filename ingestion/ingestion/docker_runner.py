from __future__ import annotations

import os
import shlex
import subprocess
from pathlib import Path


def run_ingest_container(*, sample: bool, activate: bool) -> int:
    repo_root = Path(__file__).resolve().parents[2]
    ingestion_dir = repo_root / "ingestion"

    image_ref = os.environ.get("BETTERMAN_DEBIAN_IMAGE_REF", "debian:trixie")
    subprocess.run(["docker", "pull", image_ref], check=True)
    repodigest = subprocess.check_output(
        ["docker", "image", "inspect", "--format", "{{index .RepoDigests 0}}", image_ref],
        text=True,
    ).strip()
    image_digest = repodigest.split("@", 1)[1] if "@" in repodigest else repodigest

    git_sha = subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=repo_root,
        text=True,
    ).strip()

    database_url = os.environ.get("INGEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url:
        database_url = "postgresql://betterman:betterman@postgres:5432/betterman"

    network = os.environ.get("INGEST_DOCKER_NETWORK")
    if not network and _docker_network_exists("betterman_default"):
        network = "betterman_default"

    cmd = [
        "docker",
        "run",
        "--rm",
        "-e",
        f"INGEST_DATABASE_URL={database_url}",
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
    if network:
        cmd.extend(["--network", network])

    args = ["ingest", "--in-container"]
    if sample:
        args.append("--sample")
    args.append("--activate" if activate else "--no-activate")

    runner_cmd = shlex.join(["/opt/venv/bin/python", "-m", "ingestion.cli", *args])
    inner = (
        "set -euo pipefail; "
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

    cmd.extend([image_ref, "sh", "-lc", inner])
    proc = subprocess.run(cmd, check=False)
    return proc.returncode


def _docker_network_exists(name: str) -> bool:
    out = subprocess.check_output(["docker", "network", "ls", "--format", "{{.Name}}"], text=True)
    return name in {line.strip() for line in out.splitlines() if line.strip()}
