"""Reportes y BI + módulo de analítica/IA.

La sección de IA usa reglas estadísticas (forecast agregado, detección de
oportunidades por co-ocurrencia y caída de consumo) y deja la arquitectura
preparada para enchufar modelos de ML."""
import csv
import io
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Customer, Product, Sale, SaleItem, User
from app.services import analytics

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/sales.csv")
def export_sales_csv(
    start: date | None = Query(None),
    end: date | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not end:
        end = date.today()
    if not start:
        start = end - timedelta(days=365)
    rows = db.execute(
        select(Sale, Customer.name)
        .join(Customer, Customer.id == Sale.customer_id)
        .where(Sale.date >= start, Sale.date <= end, Sale.status == "confirmed")
        .order_by(Sale.date)
    ).all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["codigo", "fecha", "cliente", "total", "descuento", "margen", "margen_pct"])
    for s, name in rows:
        mp = round(float(s.margin_amount) / float(s.total) * 100, 1) if s.total else 0
        w.writerow([s.code, s.date.isoformat(), name, float(s.total),
                    float(s.discount_amount), float(s.margin_amount), mp])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ventas.csv"},
    )


@router.get("/ai/insights")
def ai_insights(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    """Oportunidades ocultas y predicciones (heurística estadística)."""
    drops = analytics.consumption_drop_alerts(db)
    recovery_potential = round(
        sum(a["historic_quarterly_avg"] - a["recent_90d"] for a in drops), 2
    )

    # Top categorías en crecimiento (último trimestre vs anterior)
    today = date.today()
    q1_start = today - timedelta(days=90)
    q2_start = today - timedelta(days=180)
    cur = dict(
        db.execute(
            select(Product.category, func.sum(SaleItem.line_total))
            .join(SaleItem, SaleItem.product_id == Product.id)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(Sale.date >= q1_start, Sale.status == "confirmed")
            .group_by(Product.category)
        ).all()
    )
    prev = dict(
        db.execute(
            select(Product.category, func.sum(SaleItem.line_total))
            .join(SaleItem, SaleItem.product_id == Product.id)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(Sale.date >= q2_start, Sale.date < q1_start, Sale.status == "confirmed")
            .group_by(Product.category)
        ).all()
    )
    trends = []
    for cat in set(list(cur.keys()) + list(prev.keys())):
        c = float(cur.get(cat, 0) or 0)
        p = float(prev.get(cat, 0) or 0)
        change = round((c - p) / p * 100, 1) if p else 100.0
        trends.append({"category": cat, "current": round(c, 2), "change_pct": change})
    trends.sort(key=lambda x: x["change_pct"], reverse=True)

    return {
        "insights": [
            {
                "type": "churn_risk",
                "title": f"{len(drops)} clientes con caída de consumo significativa",
                "detail": f"Potencial de recuperación estimado: ${recovery_potential:,.0f} ARS si se reactivan.",
                "severity": "high" if len(drops) > 10 else "medium",
            },
            {
                "type": "category_trend",
                "title": "Tendencia de categorías (último trimestre)",
                "detail": "; ".join(
                    f"{t['category']}: {'+' if t['change_pct'] >= 0 else ''}{t['change_pct']}%"
                    for t in trends[:5]
                ),
                "severity": "info",
            },
        ],
        "category_trends": trends,
        "churn_recovery_potential": recovery_potential,
    }
