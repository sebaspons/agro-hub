from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import Customer, Product, Quote, QuoteItem, Sale, SaleItem, User

router = APIRouter(prefix="/api/quotes", tags=["quotes"])

STATUSES = ["draft", "sent", "negotiating", "won", "lost"]
STATUS_LABELS = {
    "draft": "Borrador",
    "sent": "Enviada",
    "negotiating": "En negociación",
    "won": "Ganada",
    "lost": "Perdida",
}


@router.get("")
def list_quotes(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    stmt = select(Quote, Customer.name).join(Customer, Customer.id == Quote.customer_id)
    if user.role.code == "sales" and user.salesperson_id:
        stmt = stmt.where(Quote.salesperson_id == user.salesperson_id)
    if status:
        stmt = stmt.where(Quote.status == status)
    stmt = stmt.order_by(Quote.created_at.desc())
    rows = db.execute(stmt).all()
    return [_quote_dict(q, name) for q, name in rows]


def _quote_dict(q: Quote, customer_name: str) -> dict:
    return {
        "id": q.id,
        "code": q.code,
        "customer": customer_name,
        "customer_id": q.customer_id,
        "status": q.status,
        "status_label": STATUS_LABELS.get(q.status, q.status),
        "total": float(q.total),
        "created_at": q.created_at.isoformat(),
        "valid_until": q.valid_until.isoformat() if q.valid_until else None,
        "expired": bool(q.valid_until and q.valid_until < date.today() and q.status in ("sent", "negotiating", "draft")),
        "salesperson_id": q.salesperson_id,
    }


@router.get("/pipeline")
def pipeline(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Tablero por estado + tasa de conversión."""
    base_filter = []
    if user.role.code == "sales" and user.salesperson_id:
        base_filter = [Quote.salesperson_id == user.salesperson_id]

    columns = []
    for st in STATUSES:
        rows = db.execute(
            select(Quote, Customer.name)
            .join(Customer, Customer.id == Quote.customer_id)
            .where(Quote.status == st, *base_filter)
            .order_by(Quote.created_at.desc())
        ).all()
        value = sum(float(q.total) for q, _ in rows)
        columns.append(
            {
                "status": st,
                "label": STATUS_LABELS[st],
                "count": len(rows),
                "value": round(value, 2),
                "quotes": [_quote_dict(q, name) for q, name in rows],
            }
        )

    won = db.scalar(select(func.count(Quote.id)).where(Quote.status == "won", *base_filter)) or 0
    lost = db.scalar(select(func.count(Quote.id)).where(Quote.status == "lost", *base_filter)) or 0
    open_count = (
        db.scalar(
            select(func.count(Quote.id)).where(
                Quote.status.in_(["draft", "sent", "negotiating"]), *base_filter
            )
        )
        or 0
    )
    closed = won + lost
    conversion = round(won / closed * 100, 1) if closed else 0.0
    return {
        "columns": columns,
        "conversion_rate": conversion,
        "open_count": open_count,
        "won": won,
        "lost": lost,
    }


class QuoteLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float | None = None
    discount_pct: float = Field(default=0, ge=0, le=100)


class QuoteCreate(BaseModel):
    customer_id: int
    salesperson_id: int | None = None
    valid_days: int = 30
    notes: str = ""
    items: list[QuoteLineIn]


@router.post("", status_code=201)
def create_quote(
    body: QuoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> dict:
    cust = db.get(Customer, body.customer_id)
    if not cust:
        raise HTTPException(404, "Cliente no encontrado")
    if not body.items:
        raise HTTPException(400, "La cotización debe tener al menos un ítem")

    sp_id = body.salesperson_id or cust.salesperson_id
    if user.role.code == "sales" and user.salesperson_id:
        sp_id = user.salesperson_id

    q = Quote(
        code="",
        customer_id=cust.id,
        salesperson_id=sp_id,
        status="draft",
        valid_until=date.today() + timedelta(days=body.valid_days),
        notes=body.notes,
    )
    db.add(q)
    db.flush()
    q.code = f"COT-{date.today().year}-{q.id:04d}"

    total = 0.0
    for line in body.items:
        prod = db.get(Product, line.product_id)
        if not prod:
            raise HTTPException(404, f"Producto {line.product_id} no encontrado")
        unit_price = line.unit_price if line.unit_price is not None else float(prod.price)
        disc = line.discount_pct / 100
        db.add(
            QuoteItem(
                quote_id=q.id,
                product_id=prod.id,
                quantity=line.quantity,
                unit_price=unit_price,
                discount=disc,
            )
        )
        total += unit_price * line.quantity * (1 - disc)
    q.total = round(total, 2)
    db.commit()
    db.refresh(q)
    return _quote_dict(q, cust.name)


@router.delete("/{quote_id}", status_code=204)
def delete_quote(
    quote_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> None:
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Cotización no encontrada")
    db.delete(q)
    db.commit()


class StatusIn(BaseModel):
    status: str


@router.patch("/{quote_id}/status")
def change_status(
    quote_id: int,
    body: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if body.status not in STATUSES:
        raise HTTPException(400, f"Estado inválido. Use uno de {STATUSES}")
    q = db.get(Quote, quote_id)
    if not q:
        raise HTTPException(404, "Cotización no encontrada")
    q.status = body.status

    # Al ganar, convertir a venta si todavía no se hizo
    if body.status == "won" and not q.sale_id:
        sale = _convert_to_sale(db, q)
        q.sale_id = sale.id
    db.commit()
    cust = db.get(Customer, q.customer_id)
    return _quote_dict(q, cust.name if cust else "")


def _convert_to_sale(db: Session, q: Quote) -> Sale:
    code = f"VTA-{date.today().year}-{q.id:05d}"
    sale = Sale(
        code=code,
        customer_id=q.customer_id,
        salesperson_id=q.salesperson_id,
        date=date.today(),
        status="confirmed",
    )
    subtotal = total = total_cost = 0.0
    db.add(sale)
    db.flush()
    for item in q.items:
        prod = item.product
        line_total = float(item.unit_price) * float(item.quantity) * (1 - float(item.discount))
        line_cost = float(prod.cost) * float(item.quantity)
        db.add(
            SaleItem(
                sale_id=sale.id,
                product_id=item.product_id,
                quantity=item.quantity,
                unit_price=item.unit_price,
                unit_cost=prod.cost,
                discount=item.discount,
                line_total=line_total,
                line_margin=line_total - line_cost,
            )
        )
        subtotal += float(item.unit_price) * float(item.quantity)
        total += line_total
        total_cost += line_cost
    sale.subtotal = subtotal
    sale.discount_amount = subtotal - total
    sale.total = total
    sale.total_cost = total_cost
    sale.margin_amount = total - total_cost
    db.flush()
    return sale
