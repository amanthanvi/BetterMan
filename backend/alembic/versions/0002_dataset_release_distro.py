"""dataset release distro

Revision ID: 0002_dataset_release_distro
Revises: 0001_init
Create Date: 2026-01-09

"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0002_dataset_release_distro"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dataset_releases",
        sa.Column("distro", sa.String(), nullable=False, server_default="debian"),
    )

    op.drop_index("uq_dataset_releases_active_locale", table_name="dataset_releases")

    op.create_index(
        "uq_dataset_releases_active_locale_distro",
        "dataset_releases",
        ["locale", "distro"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.create_index(
        "ix_dataset_releases_distro",
        "dataset_releases",
        ["distro"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_dataset_releases_distro", table_name="dataset_releases")
    op.drop_index("uq_dataset_releases_active_locale_distro", table_name="dataset_releases")

    op.create_index(
        "uq_dataset_releases_active_locale",
        "dataset_releases",
        ["locale"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.drop_column("dataset_releases", "distro")
