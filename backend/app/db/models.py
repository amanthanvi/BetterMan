from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DatasetRelease(Base):
    __tablename__ = "dataset_releases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_release_id: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    locale: Mapped[str] = mapped_column(String, nullable=False, default="en")
    distro: Mapped[str] = mapped_column(String, nullable=False, default="debian")

    image_ref: Mapped[str] = mapped_column(String, nullable=False)
    image_digest: Mapped[str] = mapped_column(String, nullable=False)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    package_manifest: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ManPage(Base):
    __tablename__ = "man_pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_release_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dataset_releases.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    section: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False, default="")

    source_path: Mapped[str] = mapped_column(String, nullable=False)
    source_package: Mapped[str | None] = mapped_column(String, nullable=True)
    source_package_version: Mapped[str | None] = mapped_column(String, nullable=True)

    content_sha256: Mapped[str] = mapped_column(String, nullable=False)
    has_parse_warnings: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint(
            "dataset_release_id",
            "name",
            "section",
            name="uq_man_pages_release_name_section",
        ),
        Index("ix_man_pages_release_section_name", "dataset_release_id", "section", "name"),
    )


class ManPageContent(Base):
    __tablename__ = "man_page_content"

    man_page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("man_pages.id", ondelete="CASCADE"),
        primary_key=True,
    )

    doc: Mapped[dict] = mapped_column(JSONB, nullable=False)
    plain_text: Mapped[str] = mapped_column(Text, nullable=False, default="")

    synopsis: Mapped[object | None] = mapped_column(JSONB, nullable=True)
    options: Mapped[object | None] = mapped_column(JSONB, nullable=True)
    see_also: Mapped[object | None] = mapped_column(JSONB, nullable=True)


class ManPageSearch(Base):
    __tablename__ = "man_page_search"

    man_page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("man_pages.id", ondelete="CASCADE"),
        primary_key=True,
    )

    tsv: Mapped[object] = mapped_column(TSVECTOR, nullable=False)
    name_norm: Mapped[str] = mapped_column(Text, nullable=False)
    desc_norm: Mapped[str] = mapped_column(Text, nullable=False, default="")

    __table_args__ = (
        Index("ix_man_page_search_tsv", "tsv", postgresql_using="gin"),
        Index(
            "ix_man_page_search_name_trgm",
            "name_norm",
            postgresql_using="gin",
            postgresql_ops={"name_norm": "gin_trgm_ops"},
        ),
        Index(
            "ix_man_page_search_desc_trgm",
            "desc_norm",
            postgresql_using="gin",
            postgresql_ops={"desc_norm": "gin_trgm_ops"},
        ),
    )


class ManPageLink(Base):
    __tablename__ = "man_page_links"

    from_page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("man_pages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    to_page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("man_pages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    link_type: Mapped[str] = mapped_column(String, primary_key=True)

    __table_args__ = (
        Index("ix_man_page_links_from_link_type", "from_page_id", "link_type"),
        Index("ix_man_page_links_to", "to_page_id"),
    )


class License(Base):
    __tablename__ = "licenses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    license_id: Mapped[str] = mapped_column(String, nullable=False)
    license_name: Mapped[str] = mapped_column(String, nullable=False)
    license_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String, nullable=True)


class ManPageLicenseMap(Base):
    __tablename__ = "man_page_license_map"

    man_page_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("man_pages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    license_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("licenses.id", ondelete="CASCADE"),
        primary_key=True,
    )
    attribution_text: Mapped[str | None] = mapped_column(Text, nullable=True)
