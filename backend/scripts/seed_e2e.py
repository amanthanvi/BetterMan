from __future__ import annotations

import asyncio
import hashlib
import json
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings


def _stable_sha256(value: object) -> str:
    raw = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


@dataclass(frozen=True)
class _SeedPage:
    page_id: uuid.UUID
    name: str
    section: str
    title: str
    description: str
    content_sha256: str
    doc: dict
    plain_text: str
    synopsis: list[str] | None
    options: list[dict] | None
    see_also: list[dict] | None


def _make_page(
    *,
    name: str,
    section: str,
    title: str,
    description: str,
    toc: list[dict],
    blocks: list[dict],
    synopsis: list[str] | None = None,
    options: list[dict] | None = None,
    see_also: list[dict] | None = None,
) -> _SeedPage:
    doc = {"toc": toc, "blocks": blocks}
    content_sha256 = _stable_sha256(doc)
    plain_text = " ".join([name, description, json.dumps(doc, ensure_ascii=False)])
    return _SeedPage(
        page_id=uuid.uuid4(),
        name=name,
        section=section,
        title=title,
        description=description,
        content_sha256=content_sha256,
        doc=doc,
        plain_text=plain_text,
        synopsis=synopsis,
        options=options,
        see_also=see_also,
    )


async def _seed() -> None:
    if os.getenv("BETTERMAN_E2E_SEED") != "1":
        raise SystemExit("Refusing to seed DB without BETTERMAN_E2E_SEED=1")

    settings = Settings()
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)

    release_base = f"e2e-{datetime.now(tz=UTC).strftime('%Y%m%d')}"

    def make_pages(distro: str) -> tuple[list[_SeedPage], tuple[uuid.UUID, uuid.UUID]]:
        gzip = _make_page(
            name="gzip",
            section="1",
            title="gzip(1)",
            description="compress or expand files",
            toc=[{"id": "description", "title": "DESCRIPTION", "level": 2}],
            blocks=[
                {"type": "heading", "id": "description", "level": 2, "text": "DESCRIPTION"},
                {
                    "type": "paragraph",
                    "inlines": [
                        {"type": "text", "text": "gzip reduces file size using LZ77 compression."},
                    ],
                },
            ],
            synopsis=["gzip [OPTION]... [FILE]..."],
        )

        tar_opt_anchor = "opt-create"
        tar_blocks: list[dict] = [
            {"type": "heading", "id": "synopsis", "level": 2, "text": "SYNOPSIS"},
            {
                "type": "code_block",
                "id": "synopsis-code",
                "text": "tar [OPTION]... [FILE]...\n\ntar -cf archive.tar dir/",
                "languageHint": "bash",
            },
            {"type": "heading", "id": "description", "level": 2, "text": "DESCRIPTION"},
            {
                "type": "paragraph",
                "inlines": [
                    {"type": "text", "text": "tar creates and extracts archives."},
                    {"type": "text", "text": " Use it to bundle directories into a single file."},
                ],
            },
        ]

        if distro == "ubuntu":
            tar_blocks.append(
                {
                    "type": "paragraph",
                    "inlines": [
                        {
                            "type": "text",
                            "text": (
                                "Ubuntu variant: this page is intentionally different "
                                "for E2E testing."
                            ),
                        }
                    ],
                }
            )

        tar_blocks.extend(
            [
                {"type": "heading", "id": "options", "level": 2, "text": "OPTIONS"},
                {
                    "type": "definition_list",
                    "items": [
                        {
                            "id": tar_opt_anchor,
                            "termInlines": [{"type": "code", "text": "-c, --create"}],
                            "definitionBlocks": [
                                {
                                    "type": "paragraph",
                                    "inlines": [{"type": "text", "text": "Create a new archive."}],
                                }
                            ],
                        }
                    ],
                },
                {"type": "heading", "id": "examples", "level": 2, "text": "EXAMPLES"},
                {
                    "type": "code_block",
                    "id": "example-1",
                    "text": "tar -cf archive.tar ./my-folder\n\ntar -xf archive.tar",
                    "languageHint": "bash",
                },
                {"type": "heading", "id": "see-also", "level": 2, "text": "SEE ALSO"},
                {
                    "type": "paragraph",
                    "inlines": [
                        {
                            "type": "link",
                            "href": "/man/gzip/1",
                            "linkType": "internal",
                            "inlines": [{"type": "text", "text": "gzip(1)"}],
                        },
                        {"type": "text", "text": " and "},
                        {"type": "text", "text": "cpio(1)"},
                        {"type": "text", "text": "."},
                    ],
                },
            ]
        )

        tar = _make_page(
            name="tar",
            section="1",
            title="tar(1)",
            description="an archiving utility",
            toc=[
                {"id": "synopsis", "title": "SYNOPSIS", "level": 2},
                {"id": "description", "title": "DESCRIPTION", "level": 2},
                {"id": "options", "title": "OPTIONS", "level": 2},
                {"id": "examples", "title": "EXAMPLES", "level": 2},
                {"id": "see-also", "title": "SEE ALSO", "level": 2},
            ],
            blocks=tar_blocks,
            synopsis=["tar [OPTION]... [FILE]..."],
            options=[
                {
                    "flags": "-c, --create",
                    "argument": None,
                    "description": "Create a new archive.",
                    "anchorId": tar_opt_anchor,
                }
            ],
            see_also=[
                {"name": "gzip", "section": "1", "resolvedPageId": str(gzip.page_id)},
                {"name": "cpio", "section": "1", "resolvedPageId": None},
            ],
        )

        printf1 = _make_page(
            name="printf",
            section="1",
            title="printf(1)",
            description="format and print data",
            toc=[{"id": "description", "title": "DESCRIPTION", "level": 2}],
            blocks=[
                {"type": "heading", "id": "description", "level": 2, "text": "DESCRIPTION"},
                {
                    "type": "paragraph",
                    "inlines": [{"type": "text", "text": "printf formats and prints data."}],
                },
            ],
        )

        printf3 = _make_page(
            name="printf",
            section="3",
            title="printf(3)",
            description="formatted output conversion",
            toc=[{"id": "description", "title": "DESCRIPTION", "level": 2}],
            blocks=[
                {"type": "heading", "id": "description", "level": 2, "text": "DESCRIPTION"},
                {
                    "type": "paragraph",
                    "inlines": [
                        {
                            "type": "text",
                            "text": "printf() writes formatted output to stdout.",
                        },
                    ],
                },
            ],
        )

        openssl = _make_page(
            name="openssl",
            section="1ssl",
            title="openssl(1ssl)",
            description="OpenSSL command line tool",
            toc=[{"id": "description", "title": "DESCRIPTION", "level": 2}],
            blocks=[
                {"type": "heading", "id": "description", "level": 2, "text": "DESCRIPTION"},
                {
                    "type": "paragraph",
                    "inlines": [{"type": "text", "text": "OpenSSL is a cryptography toolkit."}],
                },
            ],
        )

        evp = _make_page(
            name="EVP_DigestInit",
            section="3ssl",
            title="EVP_DigestInit(3ssl)",
            description="initialize a digest context",
            toc=[{"id": "description", "title": "DESCRIPTION", "level": 2}],
            blocks=[
                {"type": "heading", "id": "description", "level": 2, "text": "DESCRIPTION"},
                {
                    "type": "paragraph",
                    "inlines": [
                        {
                            "type": "text",
                            "text": "EVP_DigestInit() initializes a digest context.",
                        },
                    ],
                },
            ],
        )

        bash_blocks: list[dict] = [
            {"type": "heading", "id": "description", "level": 2, "text": "DESCRIPTION"}
        ]
        for i in range(120):
            bash_blocks.append(
                {
                    "type": "paragraph",
                    "inlines": [
                        {
                            "type": "text",
                            "text": f"Filler block {i + 1} for bash(1) virtualization tests.",
                        }
                    ],
                }
            )

        bash = _make_page(
            name="bash",
            section="1",
            title="bash(1)",
            description="GNU Bourne-Again SHell",
            toc=[{"id": "description", "title": "DESCRIPTION", "level": 2}],
            blocks=bash_blocks,
            synopsis=["bash [options] [command_string | file]"],
        )

        pages = [gzip, tar, printf1, printf3, openssl, evp, bash]
        return pages, (tar.page_id, gzip.page_id)

    try:
        async with engine.begin() as conn:
            await conn.execute(
                text(
                    "TRUNCATE TABLE "
                    "man_page_license_map, man_page_links, man_page_search, man_page_content, "
                    "man_pages, licenses, dataset_releases"
                )
            )

            for distro in ("debian", "ubuntu", "fedora"):
                release_uuid = uuid.uuid4()
                release_id = f"{release_base}-{distro}"
                pages, (tar_id, gzip_id) = make_pages(distro)

                await conn.execute(
                    text(
                        """
                        INSERT INTO dataset_releases (
                          id,
                          dataset_release_id,
                          locale,
                          distro,
                          image_ref,
                          image_digest,
                          package_manifest,
                          is_active
                        )
                        VALUES (
                          :id,
                          :dataset_release_id,
                          'en',
                          :distro,
                          :image_ref,
                          :image_digest,
                          :package_manifest,
                          TRUE
                        )
                        """
                    ),
                    {
                        "id": release_uuid,
                        "dataset_release_id": release_id,
                        "distro": distro,
                        "image_ref": "e2e",
                        "image_digest": "e2e",
                        "package_manifest": json.dumps({"packages": []}),
                    },
                )

                for page in pages:
                    await conn.execute(
                        text(
                            """
                            INSERT INTO man_pages (
                              id, dataset_release_id, name, section, title, description,
                              source_path, source_package, source_package_version,
                              content_sha256, has_parse_warnings
                            )
                            VALUES (
                              :id, :release_id, :name, :section, :title, :description,
                              :source_path, :source_package, :source_package_version,
                              :content_sha256, FALSE
                            )
                            """
                        ),
                        {
                            "id": page.page_id,
                            "release_id": release_uuid,
                            "name": page.name,
                            "section": page.section,
                            "title": page.title,
                            "description": page.description,
                            "source_path": f"/e2e/{page.name}.{page.section}",
                            "source_package": None,
                            "source_package_version": None,
                            "content_sha256": page.content_sha256,
                        },
                    )

                    await conn.execute(
                        text(
                            """
                            INSERT INTO man_page_content (
                              man_page_id, doc, plain_text, synopsis, options, see_also
                            )
                            VALUES (:id, :doc, :plain_text, :synopsis, :options, :see_also)
                            """
                        ),
                        {
                            "id": page.page_id,
                            "doc": json.dumps(page.doc, ensure_ascii=False),
                            "plain_text": page.plain_text,
                            "synopsis": json.dumps(page.synopsis, ensure_ascii=False)
                            if page.synopsis is not None
                            else None,
                            "options": json.dumps(page.options, ensure_ascii=False)
                            if page.options is not None
                            else None,
                            "see_also": json.dumps(page.see_also, ensure_ascii=False)
                            if page.see_also is not None
                            else None,
                        },
                    )

                    await conn.execute(
                        text(
                            """
                            INSERT INTO man_page_search (man_page_id, tsv, name_norm, desc_norm)
                            VALUES (:id, to_tsvector('simple', :tsv_text), :name_norm, :desc_norm)
                            """
                        ),
                        {
                            "id": page.page_id,
                            "tsv_text": page.plain_text,
                            "name_norm": page.name.lower(),
                            "desc_norm": page.description.lower(),
                        },
                    )

                await conn.execute(
                    text(
                        """
                        INSERT INTO man_page_links (from_page_id, to_page_id, link_type)
                        VALUES (:from_id, :to_id, 'see_also')
                        """
                    ),
                    {"from_id": tar_id, "to_id": gzip_id},
                )

    finally:
        await engine.dispose()


def main() -> None:
    asyncio.run(_seed())


if __name__ == "__main__":
    main()
