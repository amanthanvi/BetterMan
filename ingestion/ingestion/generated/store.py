"""Convex endpoints for the generated layer.

These routes are separate from the release ingest contract: generated records
are keyed by content hash, not owned by a release, and have their own
contract version.
"""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from urllib.error import HTTPError, URLError

from ingestion.convex_client import ConvexContractError, ConvexIngestClient
from ingestion.generated.page import PageInput
from ingestion.generated.selector import Candidate

# Keep aligned with convex/_generatedLayer.ts.
GENERATED_CONTRACT_VERSION = 1
CANDIDATE_PAGE_SIZE = 200
INPUT_BATCH = 10
RECORD_BATCH = 25


@dataclass(frozen=True)
class RemoteCandidate:
    candidate: Candidate
    prompt_version: str | None
    tldr_commit: str | None
    has_record: bool
    suppressed: frozenset[str] = frozenset()


class GeneratedStore:
    def __init__(self, client: ConvexIngestClient) -> None:
        self.client = client
        # Pages Convex would not send because one alone exceeds a response.
        self.skipped: list[dict] = []

    def require_contract(self) -> dict:
        try:
            payload = self.client._get_json("/ingest/generated/contract")
        except HTTPError as exc:
            raise ConvexContractError(
                f"GET /ingest/generated/contract returned HTTP {exc.code}. "
                "Deploy Convex before writing generated records."
            ) from exc
        except URLError as exc:
            raise ConvexContractError(f"Could not reach Convex: {exc.reason}") from exc
        version = payload.get("schemaVersion") if isinstance(payload, dict) else None
        if version != GENERATED_CONTRACT_VERSION:
            raise ConvexContractError(
                f"generated-layer contract {version!r} != {GENERATED_CONTRACT_VERSION}. "
                "Deploy Convex before writing generated records."
            )
        return payload

    def candidates(self, *, stage: str, distro: str, section: str) -> Iterator[RemoteCandidate]:
        cursor: str | None = None
        while True:
            result = self.client.post(
                "/ingest/generated/candidates",
                {
                    "stage": stage,
                    "distro": distro,
                    "section": section,
                    "cursor": cursor,
                    "limit": CANDIDATE_PAGE_SIZE,
                },
            )
            for item in result.get("items", []):
                yield RemoteCandidate(
                    candidate=Candidate(
                        name=item["name"],
                        section=item["section"],
                        content_sha256=item["contentSha256"],
                        source_package=item.get("sourcePackage"),
                    ),
                    prompt_version=item.get("promptVersion"),
                    tldr_commit=item.get("tldrCommit"),
                    has_record=bool(item.get("hasRecord")),
                    suppressed=frozenset(item.get("suppressed") or ()),
                )
            if result.get("isDone", True):
                return
            cursor = result.get("continueCursor")

    def inputs(self, *, stage: str, distro: str, pages: list[Candidate]) -> list[PageInput]:
        loaded: list[PageInput] = []
        queue = [{"name": page.name, "section": page.section} for page in pages]
        while queue:
            batch, queue = queue[:INPUT_BATCH], queue[INPUT_BATCH:]
            result = self.client.post(
                "/ingest/generated/inputs",
                {"stage": stage, "distro": distro, "pages": batch},
            )
            self.skipped.extend(result.get("skipped") or [])
            deferred = result.get("deferred") or []
            if len(deferred) >= len(batch):
                raise RuntimeError("Convex deferred every page in an inputs request")
            # Large manuals fill a response; the rest go round again.
            queue = deferred + queue
            for item in result.get("pages", []):
                loaded.append(
                    PageInput(
                        distro=distro,
                        name=item["name"],
                        section=item["section"],
                        content_sha256=item["contentSha256"],
                        description=item.get("description") or "",
                        synopsis=item.get("synopsis") or [],
                        options=item.get("options") or [],
                        doc=item.get("doc") or {"toc": [], "blocks": []},
                        source_package=item.get("sourcePackage"),
                    )
                )
        return loaded

    def upsert(self, records: list[dict]) -> dict:
        totals = {"inserted": 0, "updated": 0}
        for start in range(0, len(records), RECORD_BATCH):
            result = self.client.post(
                "/ingest/generated", {"records": records[start : start + RECORD_BATCH]}
            )
            for key in totals:
                totals[key] += int(result.get(key, 0))
        return totals
