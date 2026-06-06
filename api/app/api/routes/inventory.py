"""Inventario y stock: ABC, quiebres, sin rotación, vencimientos y forecast.

El forecast usa un promedio móvil estacional simple sobre las ventas históricas
del producto (mismo mes del año anterior + tendencia reciente). Es una heurística
explicable, lista para reemplazar por un modelo de series temporales.
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import Product, Sale, SaleItem, Stock, StockLot, User, Warehouse
from app.services import analytics

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("")
def stock_list(
    only_breaks: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    stmt = (
        select(Stock, Product, Warehouse.name)
        .join(Product, Product.id == Stock.product_id)
        .join(Warehouse, Warehouse.id == Stock.warehouse_id)
    )
    if only_breaks:
        stmt = stmt.where(Stock.quantity <= Stock.min_quantity)
    rows = db.execute(stmt.order_by(Product.name)).all()
    return [
        {
            "product_id": p.id,
            "sku": p.sku,
            "product": p.name,
            "category": p.category,
            "warehouse": wh,
            "quantity": float(s.quantity),
            "min_quantity": float(s.min_quantity),
            "abc_class": p.abc_class,
            "is_break": float(s.quantity) <= float(s.min_quantity),
        }
        for s, p, wh in rows
    ]


@router.get("/abc")
def abc_classification(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    rows = db.execute(
        select(
            Product.abc_class,
            func.count(Product.id),
            func.coalesce(func.sum(SaleItem.line_total), 0),
        )
        .outerjoin(SaleItem, SaleItem.product_id == Product.id)
        .group_by(Product.abc_class)
    ).all()
    summary = {
        (cls or "C"): {"count": int(c or 0), "revenue": round(float(rev or 0), 2)}
        for cls, c, rev in rows
    }
    return {"summary": [{"class": k, **v} for k, v in sorted(summary.items())]}


@router.get("/no-rotation")
def no_rotation(
    days: int = 120, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    """Productos con stock pero sin ventas en los últimos N días (inmovilizados)."""
    cutoff = date.today() - timedelta(days=days)
    recent_sold = (
        select(SaleItem.product_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(Sale.date >= cutoff)
        .distinct()
        .subquery()
    )
    rows = db.execute(
        select(Product, func.coalesce(func.sum(Stock.quantity), 0))
        .join(Stock, Stock.product_id == Product.id)
        .where(Product.id.not_in(select(recent_sold)))
        .group_by(Product.id)
        .having(func.coalesce(func.sum(Stock.quantity), 0) > 0)
    ).all()
    out = []
    for p, qty in rows:
        out.append(
            {
                "product_id": p.id,
                "sku": p.sku,
                "product": p.name,
                "category": p.category,
                "abc_class": p.abc_class,
                "stock": float(qty),
                "tied_capital": round(float(qty) * float(p.cost), 2),
            }
        )
    out.sort(key=lambda x: x["tied_capital"], reverse=True)
    return out


@router.get("/expiring")
def expiring_lots(
    days: int = 90, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    limit_date = date.today() + timedelta(days=days)
    rows = db.execute(
        select(StockLot, Product.name, Product.cost)
        .join(Product, Product.id == StockLot.product_id)
        .where(StockLot.expiry_date.is_not(None), StockLot.expiry_date <= limit_date,
               StockLot.quantity > 0)
        .order_by(StockLot.expiry_date)
    ).all()
    out = []
    for lot, name, cost in rows:
        days_left = (lot.expiry_date - date.today()).days
        out.append(
            {
                "lot_id": lot.id,
                "lot_code": lot.lot_code,
                "product": name,
                "quantity": float(lot.quantity),
                "expiry_date": lot.expiry_date.isoformat(),
                "days_left": days_left,
                "expired": days_left < 0,
                "value_at_risk": round(float(lot.quantity) * float(cost), 2),
            }
        )
    return out


@router.get("/forecast/{product_id}")
def forecast(
    product_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    """Forecast de demanda a 3 meses: promedio móvil + factor estacional simple."""
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Producto no encontrado")

    rows = db.execute(
        select(func.extract("year", Sale.date), func.extract("month", Sale.date),
               func.sum(SaleItem.quantity))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(SaleItem.product_id == product_id, Sale.status == "confirmed")
        .group_by(func.extract("year", Sale.date), func.extract("month", Sale.date))
    ).all()
    monthly = {(int(y), int(m)): float(q or 0) for y, m, q in rows}
    if not monthly:
        return {"product": p.name, "history": [], "forecast": []}

    # Promedio de los últimos 6 meses con datos
    last_keys = sorted(monthly.keys())[-6:]
    base = sum(monthly[k] for k in last_keys) / max(1, len(last_keys))

    today = date.today()
    history = [
        {"label": f"{m}/{y}", "qty": round(monthly[(y, m)], 1)}
        for (y, m) in sorted(monthly.keys())[-12:]
    ]
    forecast_out = []
    y, m = today.year, today.month
    for _ in range(3):
        m += 1
        if m > 12:
            m = 1
            y += 1
        # factor estacional: mismo mes del año anterior vs promedio
        season = 1.0
        prev_same = monthly.get((y - 1, m))
        if prev_same and base > 0:
            season = max(0.4, min(2.0, prev_same / base))
        forecast_out.append({"label": f"{m}/{y}", "qty": round(base * season, 1)})
    return {"product": p.name, "history": history, "forecast": forecast_out}


@router.post("/recompute-abc")
def recompute_abc(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    n = analytics.compute_abc(db)
    db.commit()
    return {"updated": n}


class StockAdjustIn(BaseModel):
    quantity: float | None = None
    min_quantity: float | None = None


@router.patch("/{product_id}/stock")
def adjust_stock(
    product_id: int,
    body: StockAdjustIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "warehouse")),
) -> dict:
    """Ajuste manual de stock (inventario en tiempo real)."""
    stock = db.scalar(select(Stock).where(Stock.product_id == product_id).order_by(Stock.id))
    if not stock:
        wh = db.scalar(select(Warehouse).order_by(Warehouse.id))
        if not db.get(Product, product_id) or not wh:
            raise HTTPException(404, "Producto o depósito no encontrado")
        stock = Stock(product_id=product_id, warehouse_id=wh.id, quantity=0, min_quantity=10)
        db.add(stock)
    if body.quantity is not None:
        stock.quantity = max(0, body.quantity)
    if body.min_quantity is not None:
        stock.min_quantity = max(0, body.min_quantity)
    db.commit()
    return {"product_id": product_id, "quantity": float(stock.quantity),
            "min_quantity": float(stock.min_quantity)}


@router.get("/summary")
def inventory_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    breaks = int(
        db.scalar(select(func.count(Stock.id)).where(Stock.quantity <= Stock.min_quantity)) or 0
    )
    total_value = float(
        db.scalar(
            select(func.coalesce(func.sum(Stock.quantity * Product.cost), 0)).join(
                Product, Product.id == Stock.product_id
            )
        )
        or 0
    )
    expiring = int(
        db.scalar(
            select(func.count(StockLot.id)).where(
                StockLot.expiry_date.is_not(None),
                StockLot.expiry_date <= date.today() + timedelta(days=90),
                StockLot.quantity > 0,
            )
        )
        or 0
    )
    return {
        "stock_breaks": breaks,
        "total_value": round(total_value, 2),
        "expiring_soon": expiring,
    }
