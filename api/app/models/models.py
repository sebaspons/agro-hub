from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Seguridad / organización ─────────────────────────────────────────


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True)  # owner, finance, sales, warehouse
    name: Mapped[str] = mapped_column(String(80))
    # Permisos granulares por módulo: {modulo: {view, create, edit, delete, admin}}
    permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    system: Mapped[bool] = mapped_column(Boolean, default=False)  # roles base no se borran

    users: Mapped[list[User]] = relationship(back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    salesperson_id: Mapped[int | None] = mapped_column(ForeignKey("salespeople.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    role: Mapped[Role] = relationship(back_populates="users")
    salesperson: Mapped[Salesperson | None] = relationship(back_populates="user")


class Salesperson(Base):
    __tablename__ = "salespeople"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    zone: Mapped[str] = mapped_column(String(40))  # Pampeana, NOA, NEA, Cuyo, Patagonia
    monthly_target: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    user: Mapped[User | None] = relationship(back_populates="salesperson")
    customers: Mapped[list[Customer]] = relationship(back_populates="salesperson")
    sales: Mapped[list[Sale]] = relationship(back_populates="salesperson")


# ── Comercial / CRM ──────────────────────────────────────────────────


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    cuit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    zone: Mapped[str] = mapped_column(String(40), index=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    lat: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    lng: Mapped[float | None] = mapped_column(Numeric(9, 6), nullable=True)
    salesperson_id: Mapped[int | None] = mapped_column(ForeignKey("salespeople.id"), nullable=True)

    credit_limit: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    credit_score: Mapped[int] = mapped_column(Integer, default=600)  # 300-850
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, at_risk, lost

    # RFM (calculado por endpoint/job)
    rfm_recency: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-3
    rfm_frequency: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-3
    rfm_monetary: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-3
    rfm_segment: Mapped[str | None] = mapped_column(String(40), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    salesperson: Mapped[Salesperson | None] = relationship(back_populates="customers")
    interactions: Mapped[list[CustomerInteraction]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )
    visits: Mapped[list[Visit]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )
    sales: Mapped[list[Sale]] = relationship(back_populates="customer")
    quotes: Mapped[list[Quote]] = relationship(back_populates="customer")
    receivables: Mapped[list[AccountReceivable]] = relationship(back_populates="customer")
    contacts: Mapped[list[CustomerContact]] = relationship(
        back_populates="customer", cascade="all, delete-orphan"
    )


class CustomerContact(Base):
    __tablename__ = "customer_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str | None] = mapped_column(String(80), nullable=True)  # cargo / área
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    customer: Mapped[Customer] = relationship(back_populates="contacts")


class CustomerInteraction(Base):
    __tablename__ = "customer_interactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    salesperson_id: Mapped[int | None] = mapped_column(ForeignKey("salespeople.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(30))  # llamada, visita, email, whatsapp, reclamo
    channel: Mapped[str | None] = mapped_column(String(30), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    customer: Mapped[Customer] = relationship(back_populates="interactions")


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    salesperson_id: Mapped[int | None] = mapped_column(ForeignKey("salespeople.id"), nullable=True)
    scheduled_date: Mapped[date] = mapped_column(Date)
    done_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending, done, missed
    notes: Mapped[str] = mapped_column(Text, default="")

    customer: Mapped[Customer] = relationship(back_populates="visits")


# ── Catálogo / Stock ─────────────────────────────────────────────────


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(40), index=True)  # Fertilizantes, etc.
    brand: Mapped[str] = mapped_column(String(60))  # Nidera, ...
    cost: Mapped[float] = mapped_column(Numeric(14, 2))
    price: Mapped[float] = mapped_column(Numeric(14, 2))
    target_margin: Mapped[float] = mapped_column(Numeric(5, 4), default=0.25)
    abc_class: Mapped[str | None] = mapped_column(String(1), nullable=True)  # A, B, C
    unit: Mapped[str] = mapped_column(String(20), default="kg")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    stocks: Mapped[list[Stock]] = relationship(back_populates="product")
    lots: Mapped[list[StockLot]] = relationship(back_populates="product")


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    zone: Mapped[str] = mapped_column(String(40))

    stocks: Mapped[list[Stock]] = relationship(back_populates="warehouse")


class Stock(Base):
    __tablename__ = "stock"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    quantity: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    min_quantity: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    product: Mapped[Product] = relationship(back_populates="stocks")
    warehouse: Mapped[Warehouse] = relationship(back_populates="stocks")


class StockLot(Base):
    __tablename__ = "stock_lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    lot_code: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    product: Mapped[Product] = relationship(back_populates="lots")


# ── Pipeline / Cotizaciones ──────────────────────────────────────────


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    salesperson_id: Mapped[int | None] = mapped_column(ForeignKey("salespeople.id"), nullable=True)
    # draft, sent, negotiating, won, lost
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    valid_until: Mapped[date | None] = mapped_column(Date, nullable=True)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)

    customer: Mapped[Customer] = relationship(back_populates="quotes")
    items: Mapped[list[QuoteItem]] = relationship(
        back_populates="quote", cascade="all, delete-orphan"
    )


class QuoteItem(Base):
    __tablename__ = "quote_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[int] = mapped_column(ForeignKey("quotes.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Numeric(14, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(5, 4), default=0)

    quote: Mapped[Quote] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()


# ── Ventas / Facturación ─────────────────────────────────────────────


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    salesperson_id: Mapped[int | None] = mapped_column(ForeignKey("salespeople.id"), nullable=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed")  # confirmed, cancelled
    # Factura A/B/C, Remito, Presupuesto
    doc_type: Mapped[str] = mapped_column(String(20), default="Factura B")
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    discount_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    margin_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    customer: Mapped[Customer] = relationship(back_populates="sales")
    salesperson: Mapped[Salesperson | None] = relationship(back_populates="sales")
    items: Mapped[list[SaleItem]] = relationship(
        back_populates="sale", cascade="all, delete-orphan"
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Numeric(14, 2), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    unit_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(5, 4), default=0)
    line_total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    line_margin: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    sale: Mapped[Sale] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()


# ── Compras ──────────────────────────────────────────────────────────


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))  # razón social
    trade_name: Mapped[str | None] = mapped_column(String(120), nullable=True)  # nombre comercial
    cuit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    zone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    tax_condition: Mapped[str | None] = mapped_column(String(60), nullable=True)  # condición fiscal
    notes: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    purchases: Mapped[list[Purchase]] = relationship(back_populates="supplier")
    contacts: Mapped[list[SupplierContact]] = relationship(
        back_populates="supplier", cascade="all, delete-orphan"
    )


class SupplierContact(Base):
    __tablename__ = "supplier_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str | None] = mapped_column(String(80), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    supplier: Mapped[Supplier] = relationship(back_populates="contacts")


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="received")  # pending, received
    total: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    supplier: Mapped[Supplier] = relationship(back_populates="purchases")
    items: Mapped[list[PurchaseItem]] = relationship(
        back_populates="purchase", cascade="all, delete-orphan"
    )


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Numeric(14, 2), default=1)
    unit_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)

    purchase: Mapped[Purchase] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()


# ── Finanzas ─────────────────────────────────────────────────────────


class AccountReceivable(Base):
    __tablename__ = "accounts_receivable"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    paid_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    issue_date: Mapped[date] = mapped_column(Date)
    due_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open, paid, partial

    customer: Mapped[Customer] = relationship(back_populates="receivables")
    payments: Mapped[list[Payment]] = relationship(
        back_populates="receivable", cascade="all, delete-orphan"
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    receivable_id: Mapped[int] = mapped_column(ForeignKey("accounts_receivable.id"))
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    date: Mapped[date] = mapped_column(Date)
    method: Mapped[str] = mapped_column(String(30), default="transferencia")

    receivable: Mapped[AccountReceivable] = relationship(back_populates="payments")


# ── Logística ────────────────────────────────────────────────────────


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    zone: Mapped[str] = mapped_column(String(40))
    date: Mapped[date] = mapped_column(Date)
    driver: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned, in_progress, done

    deliveries: Mapped[list[Delivery]] = relationship(back_populates="route")


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    route_id: Mapped[int | None] = mapped_column(ForeignKey("routes.id"), nullable=True)
    address: Mapped[str] = mapped_column(String(200), default="")
    zone: Mapped[str] = mapped_column(String(40))
    scheduled_date: Mapped[date] = mapped_column(Date)
    # pending, picking, dispatched, in_transit, delivered
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    stop_order: Mapped[int] = mapped_column(Integer, default=0)  # orden de parada en la ruta

    route: Mapped[Route | None] = relationship(back_populates="deliveries")
    customer: Mapped[Customer] = relationship()
