"""init

Revision ID: 0001_init
Revises:
Create Date: 2026-01-05

"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "dataset_releases",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_release_id", sa.String(), nullable=False),
        sa.Column("locale", sa.String(), nullable=False),
        sa.Column("image_ref", sa.String(), nullable=False),
        sa.Column("image_digest", sa.String(), nullable=False),
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("package_manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dataset_release_id"),
    )

    op.create_index(
        "ix_dataset_releases_is_active",
        "dataset_releases",
        ["is_active"],
        unique=False,
    )

    op.create_index(
        "uq_dataset_releases_active_locale",
        "dataset_releases",
        ["locale"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.create_table(
        "man_pages",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_release_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("section", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("source_path", sa.String(), nullable=False),
        sa.Column("source_package", sa.String(), nullable=True),
        sa.Column("source_package_version", sa.String(), nullable=True),
        sa.Column("content_sha256", sa.String(), nullable=False),
        sa.Column("has_parse_warnings", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(
            ["dataset_release_id"],
            ["dataset_releases.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dataset_release_id",
            "name",
            "section",
            name="uq_man_pages_release_name_section",
        ),
    )

    op.create_index(
        "ix_man_pages_dataset_release_id",
        "man_pages",
        ["dataset_release_id"],
        unique=False,
    )
    op.create_index(
        "ix_man_pages_release_section_name",
        "man_pages",
        ["dataset_release_id", "section", "name"],
        unique=False,
    )

    op.create_table(
        "licenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("license_id", sa.String(), nullable=False),
        sa.Column("license_name", sa.String(), nullable=False),
        sa.Column("license_text", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "man_page_content",
        sa.Column("man_page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("doc", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("plain_text", sa.Text(), nullable=False),
        sa.Column("synopsis", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("see_also", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(["man_page_id"], ["man_pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("man_page_id"),
    )

    op.create_table(
        "man_page_search",
        sa.Column("man_page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tsv", postgresql.TSVECTOR(), nullable=False),
        sa.Column("name_norm", sa.Text(), nullable=False),
        sa.Column("desc_norm", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["man_page_id"], ["man_pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("man_page_id"),
    )

    op.create_index(
        "ix_man_page_search_tsv",
        "man_page_search",
        ["tsv"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_man_page_search_name_trgm",
        "man_page_search",
        ["name_norm"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"name_norm": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_man_page_search_desc_trgm",
        "man_page_search",
        ["desc_norm"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"desc_norm": "gin_trgm_ops"},
    )

    op.create_table(
        "man_page_links",
        sa.Column("from_page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("link_type", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["from_page_id"], ["man_pages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["to_page_id"], ["man_pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("from_page_id", "to_page_id", "link_type"),
    )

    op.create_index(
        "ix_man_page_links_from_link_type",
        "man_page_links",
        ["from_page_id", "link_type"],
        unique=False,
    )
    op.create_index("ix_man_page_links_to", "man_page_links", ["to_page_id"], unique=False)

    op.create_table(
        "man_page_license_map",
        sa.Column("man_page_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("license_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attribution_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["license_id"], ["licenses.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["man_page_id"], ["man_pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("man_page_id", "license_id"),
    )


def downgrade() -> None:
    op.drop_table("man_page_license_map")
    op.drop_index("ix_man_page_links_to", table_name="man_page_links")
    op.drop_index("ix_man_page_links_from_link_type", table_name="man_page_links")
    op.drop_table("man_page_links")
    op.drop_index("ix_man_page_search_desc_trgm", table_name="man_page_search")
    op.drop_index("ix_man_page_search_name_trgm", table_name="man_page_search")
    op.drop_index("ix_man_page_search_tsv", table_name="man_page_search")
    op.drop_table("man_page_search")
    op.drop_table("man_page_content")
    op.drop_table("licenses")
    op.drop_index("ix_man_pages_release_section_name", table_name="man_pages")
    op.drop_index("ix_man_pages_dataset_release_id", table_name="man_pages")
    op.drop_table("man_pages")
    op.drop_index("uq_dataset_releases_active_locale", table_name="dataset_releases")
    op.drop_index("ix_dataset_releases_is_active", table_name="dataset_releases")
    op.drop_table("dataset_releases")
