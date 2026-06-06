"""add doc_type to sales

Revision ID: 0002_sale_doc_type
Revises: 0001_initial
Create Date: 2026-06-06
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_sale_doc_type"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sales",
        sa.Column("doc_type", sa.String(length=20), nullable=False, server_default="Factura B"),
    )


def downgrade() -> None:
    op.drop_column("sales", "doc_type")
