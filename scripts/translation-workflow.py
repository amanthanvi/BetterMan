"""Translated-manual workflow bookkeeping (#395); gates mirror full Debian.

Ingestion needs BETTERMAN_DEBIAN_TRANSLATIONS=1 (schedule) or the dispatch
input. Promotion needs BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE=1 or its input,
and Convex still holds every translated release out of prod unless the request
carries allowTranslations; archive-extracted releases also carry the
full-Debian hold. Results reuse dataset-workflow.py's records, keyed debian-<locale>.
"""

import datetime
import http.client
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "dataset_workflow", Path(__file__).with_name("dataset-workflow.py")
)
dataset = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dataset)

# Keep aligned with TRANSLATION_ROOTS in ingestion/ingestion/debian_indexes.py
# and the workflow_dispatch choices in .github/workflows/update-translations.yml.
LOCALES = ["de", "fr", "es", "pt-BR", "ja", "ru"]
HELD = {"TRANSLATED_PROMOTION_HELD", "FULL_DEBIAN_PROMOTION_HELD"}


def key(locale):
    return f"debian-{locale}"


def dispatch():
    return os.environ["BETTERMAN_WORKFLOW_EVENT"] == "workflow_dispatch"


def ingestion_enabled():
    if dispatch():
        return os.environ.get("BETTERMAN_DEBIAN_TRANSLATIONS_INPUT") == "true"
    return dataset.gate("BETTERMAN_DEBIAN_TRANSLATIONS")


def promotion_enabled():
    return dataset.gate("BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE") or (
        dispatch() and os.environ.get("BETTERMAN_DEBIAN_TRANSLATIONS_PROMOTE_INPUT") == "true"
    )


def selection():
    target = os.environ.get("BETTERMAN_TRANSLATION_LOCALE", "all") or "all"
    if target != "all" and target not in LOCALES:
        raise ValueError("Unsupported translation locale target")
    ingest, promote = ingestion_enabled(), promotion_enabled()
    locales = LOCALES if target == "all" else [target]
    return {
        "include": [
            {
                # dataset-workflow's run/finish/summary key results by "distro".
                "distro": key(locale),
                "locale": locale,
                "ingest": ingest,
                "promote": promote,
                "timeout": 120 if ingest else 10,
            }
            for locale in (locales if ingest or promote else [])
        ]
    }


def plan():
    matrix = selection()
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"matrix={json.dumps(matrix)}\n")
        output.write(f"enabled={str(bool(matrix['include'])).lower()}\n")


def promote(locale):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ingestion"))
    from ingestion.convex_client import CONTRACT_HEADER, REQUIRED_SCHEMA_VERSION, ConvexIngestClient

    if locale not in LOCALES:
        raise ValueError("Unsupported translation locale")
    name = key(locale)
    record = dataset.load(name)
    if not promotion_enabled():
        raise ValueError("Refusing to promote translations without explicit authorization")
    ingested = ingestion_enabled()
    if ingested and (record["result"] != "success" or record.get("stagingVerified") is not True):
        raise ValueError("Refusing to promote without this run's completed staging activation")
    record.update(stage="promotion contract", result="pending", error="")
    dataset.save(name, record)

    def ingest_request(path, body):
        return urllib.request.Request(
            f"{os.environ['CONVEX_HTTP_URL'].rstrip('/')}/ingest/{path}",
            data=json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {os.environ['CONVEX_INGEST_SECRET']}",
                "Content-Type": "application/json",
                # Every release-contract request names the exact version it was written for.
                CONTRACT_HEADER: str(REQUIRED_SCHEMA_VERSION),
            },
            method="POST",
        )

    try:
        client = ConvexIngestClient(
            http_url=os.environ["CONVEX_HTTP_URL"], ingest_secret=os.environ["CONVEX_INGEST_SECRET"]
        )
        dataset.retry_request(client.require_deployed_contract)  # Exact version, before any request.
        record["stage"] = "verify staging source"
        dataset.save(name, record)
        if not ingested:
            source = dataset.request_json(
                ingest_request("promotion-source", {"distro": "debian", "locale": locale})
            )
            if source["distro"] != "debian":
                raise ValueError("Unexpected staging source distro")
            record["releaseId"] = source["datasetReleaseId"]
            record["stagingVerified"] = True
        expected = record.get("releaseId")
        if not isinstance(expected, str) or not expected.strip():
            raise ValueError("Missing verified staging release ID; refusing unconditional promotion")
        request = ingest_request(
            "promote",
            {
                "fromStage": "staging",
                "toStage": "prod",
                "distros": ["debian"],
                "locale": locale,
                "activatedAt": datetime.datetime.now(datetime.UTC).isoformat(),
                "allowTranslations": True,
                # Archive-extracted translations also carry the full-Debian hold.
                "allowFullDebian": dataset.full_promotion_enabled(),
                "expectedDatasetReleaseId": {"debian": expected},
            },
        )
        record["stage"] = "promote"
        dataset.save(name, record)
        result = dataset.request_json(request)
        promoted, skipped = result["promoted"], result.get("skipped", [])
        if (
            not promoted
            and len(skipped) == 1
            and skipped[0].get("datasetReleaseId") == expected
            and skipped[0].get("reason") in HELD
        ):
            print(f"[dataset] Promotion held by Convex: {skipped[0]['reason']}", flush=True)
            record.update(stage=f"held: {skipped[0]['reason']}", result="success")
            dataset.save(name, record)
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write("skipped=true\n")
            return 0
        if (
            len(promoted) != 1
            or promoted[0]["distro"] != "debian"
            or promoted[0]["datasetReleaseId"] != expected
        ):
            raise ValueError("Unexpected promotion response")
        record.update(stage="promoted", result="success", releaseId=expected)
    except (OSError, http.client.HTTPException, RuntimeError, ValueError, KeyError, TypeError) as error:
        detail = str(error)
        if isinstance(error, urllib.error.HTTPError):
            try:
                detail += ": " + error.read(4096).decode("utf-8", errors="replace")
            except (OSError, http.client.HTTPException):
                pass  # Preserve the HTTP status when its error body is unreadable.
        record.update(result="failure", error=dataset.clean(detail)[:1200])
    dataset.save(name, record)
    return 0 if record["result"] == "success" else 1


def summary():
    os.environ.setdefault("BETTERMAN_MATRIX", json.dumps(selection()))
    return dataset.summary()


if __name__ == "__main__":
    action, *args = sys.argv[1:]
    if action == "plan":
        plan()
    elif action == "run":
        if args[0] not in {key(locale) for locale in LOCALES}:
            raise SystemExit("Unknown translation result key")
        sys.exit(dataset.run(args[0], args[1], args[2:]))
    elif action == "promote":
        sys.exit(promote(args[0]))
    elif action == "finish":
        sys.exit(dataset.finish(key(args[0])))
    elif action == "summary":
        sys.exit(summary())
    else:
        raise SystemExit("Unknown translation workflow action")
