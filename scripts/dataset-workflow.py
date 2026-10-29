"""Monthly workflow bookkeeping; all commands and HTTP writes are explicit CLI actions."""

import datetime
import html
import http.client
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

LINUX = ["debian", "ubuntu", "fedora", "arch", "alpine"]
BSD = ["freebsd", "macos"]
RESULTS = Path("dataset-results")


def clean(text):
    for name in ("CONVEX_INGEST_SECRET", "CONVEX_HTTP_URL", "CONVEX_URL"):
        value = os.environ.get(name)
        if value:
            text = text.replace(value, "[redacted]")
    text = re.sub(r"https?://[^\s\"'<>]+", "[url]", text)
    text = re.sub(r"(?i)Bearer\s+\S+", "Bearer [redacted]", text)
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)


def save(distro, record):
    RESULTS.mkdir(exist_ok=True)
    path = RESULTS / f"{distro}.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(record), encoding="utf-8")
    temporary.replace(path)


def load(distro):
    path = RESULTS / f"{distro}.json"
    return (
        json.loads(path.read_text())
        if path.exists()
        else {
            "distro": distro,
            "stage": "setup",
            "result": "pending",
            "error": "",
        }
    )


def gate(name):
    value = os.environ.get(name, "")
    if value and value != "1":
        print(f"::warning::{name} is not exactly 1; treating it as off", flush=True)
    return value == "1"


def full_promotion_enabled():
    return gate("BETTERMAN_DEBIAN_FULL_PROMOTE") or (
        os.environ["BETTERMAN_WORKFLOW_EVENT"] == "workflow_dispatch"
        and os.environ.get("BETTERMAN_DEBIAN_FULL_PROMOTE_INPUT") == "true"
    )


def selection():
    dispatch = os.environ["BETTERMAN_WORKFLOW_EVENT"] == "workflow_dispatch"
    ingest = not dispatch or os.environ["BETTERMAN_INGEST_ENABLED"] == "true"
    promote = not dispatch or os.environ["BETTERMAN_PROMOTE_ENABLED"] == "true"
    sample = dispatch and os.environ["BETTERMAN_INGEST_SAMPLE"] == "true"
    cron_full = gate("BETTERMAN_DEBIAN_FULL")
    auto_full = full_promotion_enabled()
    if dispatch and os.environ.get("BETTERMAN_DEBIAN_DOWNLOAD_ONLY") == "true":
        return {"include": []}, False, False
    full_debian = not sample and (
        os.environ.get("BETTERMAN_DEBIAN_FULL_INPUT") == "true" if dispatch
        else cron_full
    )
    distros = []
    if ingest:
        for group, key in ((BSD, "BSD"), (LINUX, "LINUX")):
            if not dispatch or os.environ[f"BETTERMAN_{key}_ENABLED"] == "true":
                target = os.environ.get(f"BETTERMAN_{key}_DISTRO", "all")
                if target != "all" and target not in group:
                    raise ValueError(f"Unsupported {key} distro target")
                distros.extend(group if not dispatch or target == "all" else [target])
    elif promote and not sample:
        distros = BSD + LINUX
    matrix = {
        "include": [
            {
                "distro": distro,
                "full_debian": distro == "debian" and full_debian,
                "promote": promote and not sample and (
                    distro != "debian" or not full_debian or auto_full or (dispatch and not ingest)
                ),
                "runner": "macos-latest" if distro == "macos" and ingest else "ubuntu-latest",
                "timeout": (60 if distro == "macos" else 90 if distro == "freebsd" else 300)
                if ingest
                else 10,
            }
            for distro in distros
        ]
    }
    return matrix, ingest, promote and not sample


def plan():
    matrix, ingest, promote = selection()
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"matrix={json.dumps(matrix)}\n")
        output.write(f"enabled={str(bool(matrix['include'])).lower()}\n")
        output.write(f"ingest={str(ingest).lower()}\n")
        output.write(f"promote={str(promote).lower()}\n")


def run(distro, stage, command):
    record = load(distro)
    record.update(stage=stage, result="pending", error="")
    if stage == "ingest":
        record.pop("releaseId", None)
        record["stagingVerified"] = False
    save(distro, record)
    tail = []
    done = None
    with subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    ) as process:
        for line in process.stdout:
            safe = clean(line.rstrip())
            # Prefix output so package/mirror text cannot inject Actions commands.
            print(f"[dataset] {safe}", flush=True)
            if safe:
                tail = (tail + [safe])[-6:]
            try:
                event = json.loads(line)
                if isinstance(event, dict) and event.get("event") == "ingest_done":
                    done = event
                if isinstance(event, dict) and event.get("event") == "ingest_error":
                    record["error"] = clean(str(event.get("error", "Ingest failed")))[:1200]
            except json.JSONDecodeError:
                # Package-manager output is plain text; it remains in the diagnostic tail.
                continue
        code = process.wait()
    if stage == "ingest" and code == 0:
        sample = os.environ.get("BETTERMAN_INGEST_SAMPLE") == "true"
        if (
            not done
            or not isinstance(done.get("datasetReleaseId"), str)
            or not done["datasetReleaseId"]
            or done.get("published") is not (not sample)
        ):
            code = 1
            record["error"] = "Missing valid ingest_done completion / activation evidence"
        else:
            record["releaseId"] = done["datasetReleaseId"]
            record["stagingVerified"] = not sample
            record["stage"] = "sample uploaded" if sample else "staging verified"
    record["result"] = "failure" if code else "success"
    if code and not record["error"]:
        record["error"] = " | ".join(tail)[-1200:] or f"Command exited {code}"
    save(distro, record)
    return code


def request_json(request):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if not 500 <= error.code < 600 or attempt == 2:
                raise
            error.close()
        except (OSError, http.client.HTTPException):
            if attempt == 2:
                raise
        delay = 2 ** (attempt + 1)
        print(f"[dataset] Transient request failure; retry {attempt + 2}/3 in {delay}s", flush=True)
        time.sleep(delay)
    raise RuntimeError("Request retry loop exhausted without a response")


def promote(distro):
    # The promotion-only runner has Python but no installed ingestion package.
    # This client uses only the standard library; share its exact-version gate.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ingestion"))
    from ingestion.convex_client import ConvexIngestClient

    record = load(distro)
    matrix, ingest, enabled = selection()
    selected = next((item for item in matrix["include"] if item["distro"] == distro), None)
    enabled = enabled and selected is not None and selected["promote"]
    if not enabled:
        raise ValueError("Refusing to promote when promotion is disabled or this is a sample")
    if ingest and (record["result"] != "success" or record.get("stagingVerified") is not True):
        raise ValueError("Refusing to promote without this run's completed staging activation")
    record.update(stage="promotion contract", result="pending", error="")
    save(distro, record)
    payload = {
        "fromStage": "staging",
        "toStage": "prod",
        "distros": [distro],
        "activatedAt": datetime.datetime.now(datetime.UTC).isoformat(),
        "allowFullDebian": full_promotion_enabled(),
    }

    def ingest_request(path, body):
        return urllib.request.Request(
            f"{os.environ['CONVEX_HTTP_URL'].rstrip('/')}/ingest/{path}",
            data=json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {os.environ['CONVEX_INGEST_SECRET']}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

    try:
        contract = ConvexIngestClient(
            http_url=os.environ["CONVEX_HTTP_URL"],
            ingest_secret=os.environ["CONVEX_INGEST_SECRET"],
        ).require_deployed_contract()
        record["stage"] = "verify staging source"
        save(distro, record)
        if not ingest:
            source = request_json(ingest_request("promotion-source", {"distro": distro}))
            if source["distro"] != distro:
                raise ValueError("Unexpected staging source distro")
            record["releaseId"] = source["datasetReleaseId"]
            record["stagingVerified"] = True
        expected = record.get("releaseId")
        if not isinstance(expected, str) or not expected.strip():
            raise ValueError("Missing verified staging release ID; refusing unconditional promotion")
        payload["expectedDatasetReleaseId"] = {distro: expected}
        request = ingest_request("promote", payload)
        request.add_header("X-BetterMan-Ingest-Contract", str(contract["schemaVersion"]))
        record["stage"] = "read previous prod"
        save(distro, record)
        info = request_json(
            urllib.request.Request(
                f"{os.environ['CONVEX_URL'].rstrip('/')}/api/query",
                data=json.dumps(
                    {
                        "path": "queries:getInfo",
                        "args": [{"distro": distro}],
                        "format": "convex_encoded_json",
                    }
                ).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
        )
        previous_id = info["value"]["datasetReleaseId"]
        if info["status"] != "success" or not isinstance(previous_id, str) or not previous_id:
            raise ValueError("Missing valid previous production release ID")
        record.update(previousProdReleaseId=previous_id, stage="promote")
        save(distro, record)
        result = request_json(request)
        promoted = result["promoted"]
        skipped = result.get("skipped", [])
        if (not promoted and distro == "debian" and len(skipped) == 1
            and skipped[0].get("distro") == "debian"
            and skipped[0].get("datasetReleaseId") == expected
            and skipped[0].get("reason") == "FULL_DEBIAN_PROMOTION_HELD"):
            print("[dataset] Skipping held full-Debian staging release: authorize debian_full_promote or BETTERMAN_DEBIAN_FULL_PROMOTE=1", flush=True)
            record.update(stage="full Debian promotion held", result="success")
            save(distro, record)
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write("skipped=true\n")
            return 0
        if (
            len(promoted) != 1
            or promoted[0]["distro"] != distro
            or not promoted[0]["datasetReleaseId"]
        ):
            raise ValueError("Unexpected promotion response")
        release_id = promoted[0]["datasetReleaseId"]
        if record.get("releaseId") and release_id != record["releaseId"]:
            raise ValueError(
                "Promoted release differs from this run's staging activation; investigate concurrent manual activation"
            )
        record.update(stage="promoted", result="success", releaseId=release_id)
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            output.write(f"release_ids={json.dumps({distro: release_id})}\n")
    except (OSError, http.client.HTTPException, RuntimeError, ValueError, KeyError, TypeError) as error:
        detail = str(error)
        if isinstance(error, urllib.error.HTTPError):
            try:
                detail += ": " + error.read(4096).decode("utf-8", errors="replace")
            except (OSError, http.client.HTTPException):
                pass  # Preserve the HTTP status when its error body is unreadable.
        record.update(result="failure", error=clean(detail)[:1200])
    save(distro, record)
    return 0 if record["result"] == "success" else 1


def finish(distro):
    record = load(distro)
    if os.environ["BETTERMAN_JOB_STATUS"] != "success" or record["result"] != "success":
        record["result"] = "failure"
        if not record["error"]:
            steps = json.loads(os.environ["BETTERMAN_STEPS"])
            failed = [
                key
                for key, value in steps.items()
                if value.get("outcome") in ("failure", "cancelled")
            ]
            record["error"] = (
                "Failed/cancelled step: " + ", ".join(failed)
                if failed
                else "Runner interrupted or result missing; see job log"
            )
    save(distro, record)
    return int(record["result"] != "success")


def summary():
    raw_matrix = os.environ.get("BETTERMAN_MATRIX", "")
    matrix = json.loads(raw_matrix) if raw_matrix else selection()[0]
    rows = []
    for item in matrix["include"]:
        try:
            record = load(item["distro"])
            if record["distro"] != item["distro"] or not all(
                isinstance(record[key], str) for key in ("stage", "result", "error")
            ):
                raise ValueError("Invalid distro result")
        except (OSError, ValueError, KeyError, TypeError):
            record = {
                "distro": item["distro"],
                "stage": "reporting",
                "result": "failure",
                "error": "Unreadable or invalid distro result artifact; see job log",
            }
        if os.environ.get("BETTERMAN_PREFLIGHT_RESULT", "success") != "success":
            record.update(
                stage="preflight",
                result="failure",
                error="Blocked by configuration preflight; see preflight job",
            )
        elif os.environ.get("BETTERMAN_PLAN_RESULT", "success") != "success":
            record.update(
                stage="selection",
                result="failure",
                error="Distro plan unavailable; see selection job",
            )
        if record["result"] != "success":
            record["result"] = "failure"
            record["error"] = (
                record["error"]
                or "No completed result (setup failure, timeout, cancellation or artifact loss); see job log"
            )
        rows.append(record)

    def cell(value):
        return html.escape(str(value)).replace("|", "&#124;").replace("\n", " ").replace("\r", " ")

    table = [
        "## Dataset results",
        "",
        "| Distro | Stage reached | Result | Previous prod release | Error excerpt |",
        "| --- | --- | --- | --- | --- |",
    ]
    table.extend(
        "| "
        + " | ".join(
            cell(row.get(key, "not recorded"))
            for key in ("distro", "stage", "result", "previousProdReleaseId", "error")
        )
        + " |"
        for row in rows
    )
    if os.environ["BETTERMAN_MATRIX_RESULT"] != "success":
        table.extend(
            [
                "",
                "At least one distro job failed or was cancelled, including any result-upload failure. Check the failed job even if its artifact records a successful earlier stage.",
            ]
        )
    table.extend(
        [
            "",
            "Failed ingests retain their previous production pointer. Production smoke checks run after promotion. See each distro job for full logs.",
            "Promote-stage failures may already have changed prod (for example, a lost response after commit). Recover with a promote-only dispatch, or use the previous prod release ID above and the [one-command manual rollback](https://github.com/amanthanvi/BetterMan/blob/main/docs/runbooks/bad-ingestion-release.md#manual-rollback-command). Rollback is never automatic.",
        ]
    )
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
        output.write("\n".join(table) + "\n")
    return int(
        any(row["result"] != "success" for row in rows)
        or os.environ["BETTERMAN_MATRIX_RESULT"] != "success"
    )


if __name__ == "__main__":
    action, *args = sys.argv[1:]
    if action == "plan":
        plan()
    elif action == "run":
        sys.exit(run(args[0], args[1], args[2:]))
    elif action == "promote":
        sys.exit(promote(args[0]))
    elif action == "finish":
        sys.exit(finish(args[0]))
    elif action == "check":
        sys.exit(load(args[0])["result"] != "success")
    elif action == "summary":
        sys.exit(summary())
    else:
        raise SystemExit("Unknown dataset workflow action")
