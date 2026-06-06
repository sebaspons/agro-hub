"""Finanzas: cartera por antigüedad, mora, cobranzas, flujo de caja,
rentabilidad y scoring crediticio con bloqueo por límite."""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import (
    AccountReceivable,
    Customer,
    Payment,
    Product,
    Sale,
    SaleItem,
    Salesperson,
    User,
)
from app.services import analytics

router = APIRouter(prefix="/api/finance", tags=["finance"])


@router.get("/aging")
def aging(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    buckets = analytics.ar_aging(db)
    total = sum(b["value"] for b in buckets)
    return {"buckets": buckets, "total": round(total, 2)}


@router.get("/collections")
def collections_alerts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Cobranzas a accionar: cuotas vencidas ordenadas por días de mora."""
    today = date.today()
    rows = db.execute(
        select(AccountReceivable, Customer.name, Customer.credit_score)
        .join(Customer, Customer.id == AccountReceivable.customer_id)
        .where(AccountReceivable.status != "paid", AccountReceivable.due_date < today)
        .order_by(AccountReceivable.due_date)
    ).all()
    out = []
    for ar, name, score in rows:
        balance = float(ar.amount) - float(ar.paid_amount)
        if balance <= 0:
            continue
        overdue = (today - ar.due_date).days
        out.append(
            {
                "id": ar.id,
                "customer": name,
                "customer_id": ar.customer_id,
                "credit_score": score,
                "balance": round(balance, 2),
                "due_date": ar.due_date.isoformat(),
                "overdue_days": overdue,
                "severity": "high" if overdue > 90 else "medium" if overdue > 30 else "low",
            }
        )
    return out


@router.get("/cashflow")
def cashflow(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    """Flujo de caja simple: cobros (pagos) vs vencimientos esperados por mes."""
    start = (date.today().replace(day=1) - timedelta(days=180)).replace(day=1)
    pay_rows = db.execute(
        select(func.extract("year", Payment.date), func.extract("month", Payment.date),
               func.sum(Payment.amount))
        .where(Payment.date >= start)
        .group_by(func.extract("year", Payment.date), func.extract("month", Payment.date))
    ).all()
    due_rows = db.execute(
        select(func.extract("year", AccountReceivable.due_date),
               func.extract("month", AccountReceivable.due_date),
               func.sum(AccountReceivable.amount - AccountReceivable.paid_amount))
        .where(AccountReceivable.due_date >= start, AccountReceivable.status != "paid")
        .group_by(func.extract("year", AccountReceivable.due_date),
                  func.extract("month", AccountReceivable.due_date))
    ).all()
    pays = {(int(y), int(m)): float(v or 0) for y, m, v in pay_rows}
    dues = {(int(y), int(m)): float(v or 0) for y, m, v in due_rows}
    months = analytics.MONTHS_ES
    out = []
    y, m = start.year, start.month
    for _ in range(12):
        out.append(
            {
                "label": f"{months[m - 1]} {str(y)[2:]}",
                "cobros": round(pays.get((y, m), 0), 2),
                "por_cobrar": round(dues.get((y, m), 0), 2),
            }
        )
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


@router.get("/profitability")
def profitability(
    by: str = Query("product", pattern="^(product|customer|salesperson|category)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Rentabilidad por producto / cliente / vendedor / categoría."""
    if by == "product":
        rows = db.execute(
            select(Product.name, func.sum(SaleItem.line_total), func.sum(SaleItem.line_margin))
            .join(SaleItem, SaleItem.product_id == Product.id)
            .group_by(Product.id, Product.name)
            .order_by(func.sum(SaleItem.line_margin).desc())
            .limit(30)
        ).all()
    elif by == "category":
        rows = db.execute(
            select(Product.category, func.sum(SaleItem.line_total), func.sum(SaleItem.line_margin))
            .join(SaleItem, SaleItem.product_id == Product.id)
            .group_by(Product.category)
            .order_by(func.sum(SaleItem.line_margin).desc())
        ).all()
    elif by == "customer":
        rows = db.execute(
            select(Customer.name, func.sum(Sale.total), func.sum(Sale.margin_amount))
            .join(Sale, Sale.customer_id == Customer.id)
            .group_by(Customer.id, Customer.name)
            .order_by(func.sum(Sale.margin_amount).desc())
            .limit(30)
        ).all()
    else:  # salesperson
        rows = db.execute(
            select(Salesperson.name, func.sum(Sale.total), func.sum(Sale.margin_amount))
            .join(Sale, Sale.salesperson_id == Salesperson.id)
            .group_by(Salesperson.id, Salesperson.name)
            .order_by(func.sum(Sale.margin_amount).desc())
        ).all()
    out = []
    for name, revenue, margin in rows:
        revenue = float(revenue or 0)
        margin = float(margin or 0)
        out.append(
            {
                "name": name,
                "revenue": round(revenue, 2),
                "margin": round(margin, 2),
                "margin_pct": round(margin / revenue * 100, 1) if revenue else 0,
            }
        )
    return out


@router.get("/credit")
def credit_control(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Control de límite de crédito: clientes que superan o están cerca del límite."""
    rows = db.execute(
        select(
            Customer,
            func.coalesce(func.sum(AccountReceivable.amount - AccountReceivable.paid_amount), 0),
        )
        .outerjoin(
            AccountReceivable,
            (AccountReceivable.customer_id == Customer.id)
            & (AccountReceivable.status != "paid"),
        )
        .group_by(Customer.id)
    ).all()
    out = []
    for c, balance in rows:
        balance = float(balance or 0)
        limit = float(c.credit_limit)
        usage = round(balance / limit * 100, 1) if limit else 0
        if usage < 70:
            continue
        out.append(
            {
                "customer_id": c.id,
                "customer": c.name,
                "credit_limit": limit,
                "balance": round(balance, 2),
                "usage_pct": usage,
                "credit_score": c.credit_score,
                "blocked": balance > limit,
            }
        )
    out.sort(key=lambda x: x["usage_pct"], reverse=True)
    return out


@router.get("/summary")
def finance_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    overdue = analytics.overdue_total(db)
    open_ar = float(
        db.scalar(
            select(func.coalesce(func.sum(AccountReceivable.amount - AccountReceivable.paid_amount), 0))
            .where(AccountReceivable.status != "paid")
        )
        or 0
    )
    blocked = int(
        db.scalar(
            select(func.count(func.distinct(AccountReceivable.customer_id))).where(
                AccountReceivable.status != "paid"
            )
        )
        or 0
    )
    return {
        "overdue_total": overdue,
        "open_receivables": round(open_ar, 2),
        "customers_with_debt": blocked,
    }
