"""initial schema

Crea todo el esquema a partir del metadata de SQLAlchemy. Es la fuente única de
verdad del modelo; las migraciones siguientes pueden generarse con autogenerate.

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-05
"""
from collections.abc import Sequence

from alembic import op

from app.core.db import Base
from app import models  # noqa: F401  (registra los modelos en el metadata)

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
