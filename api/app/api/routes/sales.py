from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import (
    AccountReceivable,
    Customer,
    Product,
    Sale,
    SaleItem,
    Salesperson,
    Stock,
    User,
)

router = APIRouter(prefix="/api/sales", tags=["sales"])


class LineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_price: float | None = None  # si no se manda, usa el precio del producto
    discount_pct: float = Field(default=0, ge=0, le=100)


DOC_TYPES = ["Factura A", "Factura B", "Factura C", "Remito", "Presupuesto"]


class SaleCreate(BaseModel):
    customer_id: int
    salesperson_id: int | None = None
    sale_date: date | None = None
    doc_type: str = "Factura B"
    on_credit: bool = False
    credit_days: int = 30
    items: list[LineIn]


@router.get("")
def list_sales(
    start: date | None = Query(None),
    end: date | None = Query(None),
    q: str | None = Query(None),
    customer_id: int | None = Query(None),
    salesperson_id: int | None = Query(None),
    status: str | None = Query(None),
    doc_type: str | None = Query(None),
    min_total: float | None = Query(None),
    max_total: float | None = Query(None),
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    if not end:
        end = date.today()
    if not start:
        start = end - timedelta(days=90)
    stmt = (
        select(Sale, Customer.name, Salesperson.name)
        .join(Customer, Customer.id == Sale.customer_id)
        .outerjoin(Salesperson, Salesperson.id == Sale.salesperson_id)
        .where(Sale.date >= start, Sale.date <= end)
    )
    if status:
        stmt = stmt.where(Sale.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Sale.code.ilike(like), Customer.name.ilike(like)))
    if customer_id:
        stmt = stmt.where(Sale.customer_id == customer_id)
    if doc_type:
        stmt = stmt.where(Sale.doc_type == doc_type)
    if min_total is not None:
        stmt = stmt.where(Sale.total >= min_total)
    if max_total is not None:
        stmt = stmt.where(Sale.total <= max_total)
    if salesperson_id:
        stmt = stmt.where(Sale.salesperson_id == salesperson_id)
    if user.role.code == "sales" and user.salesperson_id:
        stmt = stmt.where(Sale.salesperson_id == user.salesperson_id)
    stmt = stmt.order_by(Sale.date.desc()).limit(limit)
    rows = db.execute(stmt).all()
    out = []
    for s, cust, sp in rows:
        margin_pct = round(float(s.margin_amount) / float(s.total) * 100, 1) if s.total else 0
        out.append(
            {
                "id": s.id,
                "code": s.code,
                "date": s.date.isoformat(),
                "customer": cust,
                "salesperson": sp,
                "doc_type": s.doc_type,
                "status": s.status,
                "total": float(s.total),
                "discount": float(s.discount_amount),
                "margin": float(s.margin_amount),
                "margin_pct": margin_pct,
                "low_margin": margin_pct < 12,  # alerta de margen muy bajo
            }
        )
    return out


@router.get("/doc-types")
def doc_types(user: User = Depends(get_current_user)) -> list[str]:
    return DOC_TYPES


@router.get("/summary")
def sales_summary(
    start: date | None = Query(None),
    end: date | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if not end:
        end = date.today()
    if not start:
        start = end - timedelta(days=90)
    flt = [Sale.date >= start, Sale.date <= end, Sale.status == "confirmed"]
    if user.role.code == "sales" and user.salesperson_id:
        flt.append(Sale.salesperson_id == user.salesperson_id)
    total, margin, n, disc = db.execute(
        select(
            func.coalesce(func.sum(Sale.total), 0),
            func.coalesce(func.sum(Sale.margin_amount), 0),
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.discount_amount), 0),
        ).where(*flt)
    ).one()
    total = float(total or 0)
    return {
        "total": round(total, 2),
        "margin": round(float(margin or 0), 2),
        "margin_pct": round(float(margin or 0) / total * 100, 1) if total else 0,
        "count": int(n or 0),
        "avg_ticket": round(total / n, 2) if n else 0,
        "discount_total": round(float(disc or 0), 2),
    }


@router.post("", status_code=201)
def create_sale(
    body: SaleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> dict:
    cust = db.get(Customer, body.customer_id)
    if not cust:
        raise HTTPException(404, "Cliente no encontrado")
    if not body.items:
        raise HTTPException(400, "La venta debe tener al menos un ítem")

    sp_id = body.salesperson_id or cust.salesperson_id
    if user.role.code == "sales" and user.salesperson_id:
        sp_id = user.salesperson_id

    sale_date = body.sale_date or date.today()
    sale = Sale(
        code="",
        customer_id=cust.id,
        salesperson_id=sp_id,
        date=sale_date,
        status="confirmed",
        doc_type=body.doc_type if body.doc_type in DOC_TYPES else "Factura B",
    )
    db.add(sale)
    db.flush()
    # Código único basado en el id (PK), evita colisiones con el seed
    sale.code = f"VTA-{sale_date.year}-{sale.id:05d}"

    subtotal = total = total_cost = 0.0
    for line in body.items:
        prod = db.get(Product, line.product_id)
        if not prod:
            raise HTTPException(404, f"Producto {line.product_id} no encontrado")
        unit_price = line.unit_price if line.unit_price is not None else float(prod.price)
        disc = line.discount_pct / 100
        line_total = unit_price * line.quantity * (1 - disc)
        line_cost = float(prod.cost) * line.quantity
        db.add(
            SaleItem(
                sale_id=sale.id,
                product_id=prod.id,
                quantity=line.quantity,
                unit_price=unit_price,
                unit_cost=prod.cost,
                discount=disc,
                line_total=round(line_total, 2),
                line_margin=round(line_total - line_cost, 2),
            )
        )
        subtotal += unit_price * line.quantity
        total += line_total
        total_cost += line_cost
        # Descuenta stock (primer depósito con existencia), sin bajar de 0
        stock = db.scalar(select(Stock).where(Stock.product_id == prod.id).order_by(Stock.id))
        if stock:
            stock.quantity = max(0, float(stock.quantity) - line.quantity)

    sale.subtotal = round(subtotal, 2)
    sale.discount_amount = round(subtotal - total, 2)
    sale.total = round(total, 2)
    sale.total_cost = round(total_cost, 2)
    sale.margin_amount = round(total - total_cost, 2)

    if body.on_credit:
        db.add(
            AccountReceivable(
                customer_id=cust.id,
                sale_id=sale.id,
                amount=sale.total,
                paid_amount=0,
                issue_date=sale_date,
                due_date=sale_date + timedelta(days=body.credit_days),
                status="open",
            )
        )

    db.commit()
    db.refresh(sale)
    return {"id": sale.id, "code": sale.code, "total": float(sale.total),
            "margin": float(sale.margin_amount)}


@router.delete("/{sale_id}", status_code=204)
def delete_sale(
    sale_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance")),
) -> None:
    s = db.get(Sale, sale_id)
    if not s:
        raise HTTPException(404, "Venta no encontrada")
    # quitar AR asociada
    db.execute(AccountReceivable.__table__.delete().where(AccountReceivable.sale_id == sale_id))
    db.delete(s)
    db.commit()


@router.get("/{sale_id}")
def sale_detail(
    sale_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    s = db.get(Sale, sale_id)
    if not s:
        raise HTTPException(404, "Venta no encontrada")
    items = db.execute(
        select(SaleItem, Product.name, Product.sku)
        .join(Product, Product.id == SaleItem.product_id)
        .where(SaleItem.sale_id == sale_id)
    ).all()
    cust = db.get(Customer, s.customer_id)
    return {
        "id": s.id,
        "code": s.code,
        "date": s.date.isoformat(),
        "customer": cust.name if cust else None,
        "total": float(s.total),
        "margin": float(s.margin_amount),
        "items": [
            {
                "product": name,
                "sku": sku,
                "quantity": float(it.quantity),
                "unit_price": float(it.unit_price),
                "discount": float(it.discount),
                "line_total": float(it.line_total),
                "line_margin": float(it.line_margin),
            }
            for it, name, sku in items
        ],
    }
