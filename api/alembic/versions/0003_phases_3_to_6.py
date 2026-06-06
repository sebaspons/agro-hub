"""campos y tablas para fases 3-6 (clientes, proveedores, logística, RBAC)

Revision ID: 0003_phases_3_to_6
Revises: 0002_sale_doc_type
Create Date: 2026-06-06
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.models import CustomerContact, SupplierContact  # noqa: F401

revision: str = "0003_phases_3_to_6"
down_revision: str | None = "0002_sale_doc_type"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    # Nuevas tablas de contactos (create_all sólo crea las que faltan)
    CustomerContact.__table__.create(bind=bind, checkfirst=True)
    SupplierContact.__table__.create(bind=bind, checkfirst=True)

    # Clientes
    op.add_column("customers", sa.Column("address", sa.String(200), nullable=True))
    op.add_column("customers", sa.Column("phone", sa.String(40), nullable=True))
    op.add_column("customers", sa.Column("email", sa.String(160), nullable=True))
    op.add_column("customers", sa.Column("notes", sa.Text(), nullable=False, server_default=""))

    # Proveedores
    op.add_column("suppliers", sa.Column("trade_name", sa.String(120), nullable=True))
    op.add_column("suppliers", sa.Column("cuit", sa.String(20), nullable=True))
    op.add_column("suppliers", sa.Column("address", sa.String(200), nullable=True))
    op.add_column("suppliers", sa.Column("phone", sa.String(40), nullable=True))
    op.add_column("suppliers", sa.Column("email", sa.String(160), nullable=True))
    op.add_column("suppliers", sa.Column("tax_condition", sa.String(60), nullable=True))
    op.add_column("suppliers", sa.Column("notes", sa.Text(), nullable=False, server_default=""))
    op.add_column(
        "suppliers", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true())
    )

    # Logística
    op.add_column(
        "deliveries", sa.Column("stop_order", sa.Integer(), nullable=False, server_default="0")
    )

    # RBAC
    op.add_column("roles", sa.Column("permissions", sa.JSON(), nullable=True))
    op.add_column(
        "roles", sa.Column("system", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade() -> None:
    for col in ("address", "phone", "email", "notes"):
        op.drop_column("customers", col)
    for col in ("trade_name", "cuit", "address", "phone", "email", "tax_condition", "notes", "active"):
        op.drop_column("suppliers", col)
    op.drop_column("deliveries", "stop_order")
    op.drop_column("roles", "permissions")
    op.drop_column("roles", "system")
    op.drop_table("supplier_contacts")
    op.drop_table("customer_contacts")
