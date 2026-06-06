"""Cálculos analíticos reutilizados por dashboard, CRM, finanzas y seed.

Todo se computa a partir de los datos reales en la base (nada hardcodeado).
Las funciones heurísticas (RFM, ABC, caída de consumo, scoring) están explicadas
inline y dejan la puerta abierta a reemplazarlas por modelos más sofisticados.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AccountReceivable,
    Customer,
    Product,
    Purchase,
    Sale,
    SaleItem,
    Salesperson,
)

# ── Helpers de fechas ────────────────────────────────────────────────


def previous_range(start: date, end: date) -> tuple[date, date]:
    """Ventana anterior del mismo largo, inmediatamente antes de `start`."""
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)
    return prev_start, prev_end


def _pct_change(curr: float, prev: float) -> float:
    if prev == 0:
        return 0.0 if curr == 0 else 100.0
    return round((curr - prev) / prev * 100, 1)


# ── KPIs del dashboard ───────────────────────────────────────────────


def _sales_query(db: Session, start: date, end: date, salesperson_id: int | None):
    q = select(Sale).where(
        Sale.date >= start, Sale.date <= end, Sale.status == "confirmed"
    )
    if salesperson_id:
        q = q.where(Sale.salesperson_id == salesperson_id)
    return q


def _agg(db: Session, start: date, end: date, salesperson_id: int | None) -> dict:
    base = (
        select(
            func.coalesce(func.sum(Sale.total), 0),
            func.coalesce(func.sum(Sale.margin_amount), 0),
            func.count(Sale.id),
            func.count(func.distinct(Sale.customer_id)),
        )
        .where(Sale.date >= start, Sale.date <= end, Sale.status == "confirmed")
    )
    if salesperson_id:
        base = base.where(Sale.salesperson_id == salesperson_id)
    total, margin, n_sales, active = db.execute(base).one()
    total = float(total or 0)
    margin = float(margin or 0)
    return {
        "ventas": total,
        "margen_amount": margin,
        "n_sales": int(n_sales or 0),
        "active_customers": int(active or 0),
        "ticket": round(total / n_sales, 2) if n_sales else 0.0,
        "margen_pct": round(margin / total * 100, 1) if total else 0.0,
    }


def overdue_total(db: Session, ref: date | None = None) -> float:
    """Mora total: saldo impago de cuotas vencidas."""
    ref = ref or date.today()
    rows = db.execute(
        select(AccountReceivable.amount, AccountReceivable.paid_amount).where(
            AccountReceivable.status != "paid",
            AccountReceivable.due_date < ref,
        )
    ).all()
    return round(sum(float(a) - float(p) for a, p in rows), 2)


def new_customers(db: Session, start: date, end: date) -> int:
    return int(
        db.scalar(
            select(func.count(Customer.id)).where(
                func.date(Customer.created_at) >= start,
                func.date(Customer.created_at) <= end,
            )
        )
        or 0
    )


def kpis(db: Session, start: date, end: date, salesperson_id: int | None = None) -> dict:
    cur = _agg(db, start, end, salesperson_id)
    p_start, p_end = previous_range(start, end)
    prev = _agg(db, p_start, p_end, salesperson_id)
    new_cur = new_customers(db, start, end)
    new_prev = new_customers(db, p_start, p_end)
    mora = overdue_total(db)

    def card(label, value, prev_value, fmt="money", invert=False):
        change = _pct_change(value, prev_value)
        return {
            "label": label,
            "value": value,
            "change": change,
            "format": fmt,
            # invert=True => subir es malo (ej. mora)
            "positive": (change <= 0) if invert else (change >= 0),
        }

    return [
        card("Ventas del período", cur["ventas"], prev["ventas"]),
        card("Clientes activos", cur["active_customers"], prev["active_customers"], "int"),
        card("Nuevos clientes", new_cur, new_prev, "int"),
        card("Ticket promedio", cur["ticket"], prev["ticket"]),
        card("Mora total", mora, mora, "money", invert=True),
        card("Margen bruto", cur["margen_pct"], prev["margen_pct"], "pct"),
    ]


# ── Gráficos ─────────────────────────────────────────────────────────

MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def sales_by_period(db: Session, end: date, salesperson_id: int | None = None) -> list[dict]:
    """Barras: año actual vs anterior por mes (relativo al `end` recibido)."""
    cur_year = end.year
    prev_year = cur_year - 1
    rows = db.execute(
        select(
            func.extract("year", Sale.date),
            func.extract("month", Sale.date),
            func.sum(Sale.total),
        )
        .where(
            Sale.status == "confirmed",
            func.extract("year", Sale.date).in_([cur_year, prev_year]),
            *([Sale.salesperson_id == salesperson_id] if salesperson_id else []),
        )
        .group_by(func.extract("year", Sale.date), func.extract("month", Sale.date))
    ).all()
    data = {(int(y), int(m)): float(t or 0) for y, m, t in rows}
    out = []
    for m in range(1, 13):
        out.append(
            {
                "month": MONTHS_ES[m - 1],
                "actual": round(data.get((cur_year, m), 0), 2),
                "anterior": round(data.get((prev_year, m), 0), 2),
            }
        )
    return out


def sales_trend_12m(db: Session, end: date, salesperson_id: int | None = None) -> list[dict]:
    """Tendencia mensual (13 meses) de ventas, compras y deuda generada.

    - ventas: facturación confirmada por mes.
    - compras: órdenes de compra a proveedores por mes (nivel empresa).
    - deuda: cuentas por cobrar generadas por mes (crédito otorgado).
    Las ventas y la deuda se filtran por vendedor si se indica; las compras son
    de la empresa (no tienen vendedor).
    """
    start = (end.replace(day=1) - timedelta(days=365)).replace(day=1)

    sales_rows = db.execute(
        select(
            func.extract("year", Sale.date),
            func.extract("month", Sale.date),
            func.sum(Sale.total),
        )
        .where(
            Sale.status == "confirmed",
            Sale.date >= start,
            Sale.date <= end,
            *([Sale.salesperson_id == salesperson_id] if salesperson_id else []),
        )
        .group_by(func.extract("year", Sale.date), func.extract("month", Sale.date))
    ).all()
    ventas = {(int(y), int(m)): float(t or 0) for y, m, t in sales_rows}

    purch_rows = db.execute(
        select(
            func.extract("year", Purchase.date),
            func.extract("month", Purchase.date),
            func.sum(Purchase.total),
        )
        .where(Purchase.date >= start, Purchase.date <= end)
        .group_by(func.extract("year", Purchase.date), func.extract("month", Purchase.date))
    ).all()
    compras = {(int(y), int(m)): float(t or 0) for y, m, t in purch_rows}

    debt_q = (
        select(
            func.extract("year", AccountReceivable.issue_date),
            func.extract("month", AccountReceivable.issue_date),
            func.sum(AccountReceivable.amount),
        )
        .where(AccountReceivable.issue_date >= start, AccountReceivable.issue_date <= end)
        .group_by(
            func.extract("year", AccountReceivable.issue_date),
            func.extract("month", AccountReceivable.issue_date),
        )
    )
    if salesperson_id:
        debt_q = debt_q.join(Customer, Customer.id == AccountReceivable.customer_id).where(
            Customer.salesperson_id == salesperson_id
        )
    debt_rows = db.execute(debt_q).all()
    deuda = {(int(y), int(m)): float(t or 0) for y, m, t in debt_rows}

    out = []
    y, m = start.year, start.month
    for _ in range(13):
        key = (y, m)
        out.append(
            {
                "label": f"{MONTHS_ES[m - 1]} {str(y)[2:]}",
                "ventas": round(ventas.get(key, 0), 2),
                "compras": round(compras.get(key, 0), 2),
                "deuda": round(deuda.get(key, 0), 2),
            }
        )
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def sales_by_category(db: Session, start: date, end: date, salesperson_id: int | None = None):
    rows = db.execute(
        select(Product.category, func.sum(SaleItem.line_total))
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(
            Sale.status == "confirmed",
            Sale.date >= start,
            Sale.date <= end,
            *([Sale.salesperson_id == salesperson_id] if salesperson_id else []),
        )
        .group_by(Product.category)
    ).all()
    return [{"category": c, "value": round(float(v or 0), 2)} for c, v in rows]


def salesperson_performance(db: Session, start: date, end: date) -> list[dict]:
    """Ventas vs objetivo (objetivo mensual prorrateado por la cantidad de meses)."""
    months = max(1, round(((end - start).days + 1) / 30))
    rows = db.execute(
        select(
            Salesperson.id,
            Salesperson.name,
            Salesperson.zone,
            Salesperson.monthly_target,
            func.coalesce(func.sum(Sale.total), 0),
        )
        .outerjoin(
            Sale,
            (Sale.salesperson_id == Salesperson.id)
            & (Sale.date >= start)
            & (Sale.date <= end)
            & (Sale.status == "confirmed"),
        )
        .where(Salesperson.active.is_(True))
        .group_by(Salesperson.id, Salesperson.name, Salesperson.zone, Salesperson.monthly_target)
    ).all()
    out = []
    for sid, name, zone, target, sales in rows:
        target_period = float(target or 0) * months
        sales = float(sales or 0)
        pct = round(sales / target_period * 100, 1) if target_period else 0.0
        status = "optimo" if pct >= 90 else "riesgo" if pct >= 70 else "critico"
        out.append(
            {
                "id": sid,
                "name": name,
                "zone": zone,
                "sales": round(sales, 2),
                "target": round(target_period, 2),
                "achievement": pct,
                "status": status,
            }
        )
    out.sort(key=lambda r: r["sales"], reverse=True)
    return out


def top_customers(db: Session, start: date, end: date, limit: int = 5, salesperson_id=None):
    rows = db.execute(
        select(Customer.name, func.sum(Sale.total))
        .join(Sale, Sale.customer_id == Customer.id)
        .where(
            Sale.status == "confirmed",
            Sale.date >= start,
            Sale.date <= end,
            *([Sale.salesperson_id == salesperson_id] if salesperson_id else []),
        )
        .group_by(Customer.id, Customer.name)
        .order_by(func.sum(Sale.total).desc())
        .limit(limit)
    ).all()
    return [{"name": n, "value": round(float(v or 0), 2)} for n, v in rows]


# ── Cartera por antigüedad (aging) ───────────────────────────────────

AGING_BUCKETS = ["0-30", "31-60", "61-90", "+90"]


def ar_aging(db: Session, ref: date | None = None) -> list[dict]:
    ref = ref or date.today()
    rows = db.execute(
        select(
            AccountReceivable.amount,
            AccountReceivable.paid_amount,
            AccountReceivable.due_date,
        ).where(AccountReceivable.status != "paid")
    ).all()
    buckets = defaultdict(float)
    for amount, paid, due in rows:
        balance = float(amount) - float(paid)
        if balance <= 0:
            continue
        overdue_days = (ref - due).days
        if overdue_days <= 0:
            continue  # la dona es de MORA: sólo cuotas ya vencidas
        if overdue_days <= 30:
            buckets["0-30"] += balance
        elif overdue_days <= 60:
            buckets["31-60"] += balance
        elif overdue_days <= 90:
            buckets["61-90"] += balance
        else:
            buckets["+90"] += balance
    return [{"bucket": b, "value": round(buckets[b], 2)} for b in AGING_BUCKETS]


# ── RFM ──────────────────────────────────────────────────────────────


def _score_tertiles(values: list[float], reverse: bool = False) -> dict:
    """Asigna 1/2/3 por terciles. reverse=True => valor más alto = score más bajo."""
    if not values:
        return {}
    ordered = sorted(values)
    n = len(ordered)
    t1 = ordered[n // 3]
    t2 = ordered[2 * n // 3]

    def score(v):
        if v <= t1:
            s = 1
        elif v <= t2:
            s = 2
        else:
            s = 3
        return (4 - s) if reverse else s

    return {"score": score}


def compute_rfm(db: Session, ref: date | None = None) -> int:
    """Calcula RFM por terciles y actualiza cada cliente. Devuelve # actualizados."""
    ref = ref or date.today()
    rows = db.execute(
        select(
            Customer.id,
            func.max(Sale.date),
            func.count(Sale.id),
            func.coalesce(func.sum(Sale.total), 0),
        )
        .outerjoin(Sale, (Sale.customer_id == Customer.id) & (Sale.status == "confirmed"))
        .group_by(Customer.id)
    ).all()

    recency_vals, freq_vals, mon_vals = [], [], []
    stats = {}
    for cid, last, freq, mon in rows:
        rec = (ref - last).days if last else 9999
        stats[cid] = (rec, int(freq or 0), float(mon or 0))
        if last:
            recency_vals.append(rec)
            freq_vals.append(int(freq or 0))
            mon_vals.append(float(mon or 0))

    # Recencia: menos días = mejor (reverse)
    r_fn = _score_tertiles(recency_vals, reverse=True).get("score", lambda v: 1)
    f_fn = _score_tertiles(freq_vals).get("score", lambda v: 1)
    m_fn = _score_tertiles(mon_vals).get("score", lambda v: 1)

    updated = 0
    for cust in db.scalars(select(Customer)).all():
        rec, freq, mon = stats.get(cust.id, (9999, 0, 0))
        if freq == 0:
            cust.rfm_recency, cust.rfm_frequency, cust.rfm_monetary = 1, 1, 1
            cust.rfm_segment = "Inactivo"
        else:
            cust.rfm_recency = r_fn(rec)
            cust.rfm_frequency = f_fn(freq)
            cust.rfm_monetary = m_fn(mon)
            cust.rfm_segment = rfm_segment_label(
                cust.rfm_recency, cust.rfm_frequency, cust.rfm_monetary
            )
        updated += 1
    db.flush()
    return updated


def rfm_segment_label(r: int, f: int, m: int) -> str:
    if r >= 3 and f >= 3 and m >= 3:
        return "Campeón"
    if r >= 3 and f >= 2:
        return "Leal"
    if r >= 3 and f == 1:
        return "Nuevo / Prometedor"
    if r == 2 and f >= 2:
        return "Necesita atención"
    if r == 2 and m >= 2:
        return "En observación"
    if r == 1 and f >= 3:
        return "En riesgo (era valioso)"
    if r == 1 and m >= 2:
        return "No puede perderse"
    return "Hibernando"


def rfm_matrix(db: Session) -> dict:
    """Matriz 3x3 Recencia × Frecuencia con conteos y monto, para el heatmap."""
    rows = db.execute(
        select(Customer.rfm_recency, Customer.rfm_frequency, func.count(Customer.id))
        .where(Customer.rfm_recency.is_not(None))
        .group_by(Customer.rfm_recency, Customer.rfm_frequency)
    ).all()
    grid = {(r, f): 0 for r in (1, 2, 3) for f in (1, 2, 3)}
    for r, f, c in rows:
        grid[(int(r), int(f))] = int(c)
    cells = []
    for r in (3, 2, 1):  # de mayor a menor recencia (eje Y)
        for f in (1, 2, 3):
            count = grid[(r, f)]
            risk = "high" if r == 1 else "medium" if r == 2 else "low"
            cells.append({"recency": r, "frequency": f, "count": count, "risk": risk})
    return {"cells": cells}


# ── ABC de inventario ────────────────────────────────────────────────


def compute_abc(db: Session) -> int:
    """Clasificación ABC por facturación acumulada (80/15/5)."""
    rows = db.execute(
        select(Product.id, func.coalesce(func.sum(SaleItem.line_total), 0))
        .outerjoin(SaleItem, SaleItem.product_id == Product.id)
        .group_by(Product.id)
    ).all()
    ranked = sorted(rows, key=lambda r: float(r[1] or 0), reverse=True)
    total = sum(float(r[1] or 0) for r in ranked) or 1
    cumulative = 0.0
    classes = {}
    for pid, rev in ranked:
        cumulative += float(rev or 0)
        share = cumulative / total
        classes[pid] = "A" if share <= 0.80 else "B" if share <= 0.95 else "C"
    updated = 0
    for prod in db.scalars(select(Product)).all():
        prod.abc_class = classes.get(prod.id, "C")
        updated += 1
    db.flush()
    return updated


# ── Caída de consumo / riesgo de fuga ────────────────────────────────


def consumption_drop_alerts(
    db: Session, ref: date | None = None, threshold: float = 0.50
) -> list[dict]:
    """Detecta caída de consumo comparando año contra año (mismo período estacional).

    Compara las compras de los últimos 90 días contra las del mismo período del año
    anterior. Hacerlo YoY controla la estacionalidad agrícola (no castiga la baja de
    temporada). Si la caída supera `threshold`, el cliente entra en alerta.
    Heurística explicable; reemplazable por un modelo de churn.
    """
    ref = ref or date.today()
    recent_start = ref - timedelta(days=90)
    prior_start = recent_start - timedelta(days=365)
    prior_end = ref - timedelta(days=365)

    recent_rows = db.execute(
        select(Sale.customer_id, func.sum(Sale.total))
        .where(Sale.status == "confirmed", Sale.date >= recent_start, Sale.date <= ref)
        .group_by(Sale.customer_id)
    ).all()
    recent = {cid: float(t or 0) for cid, t in recent_rows}

    prior_rows = db.execute(
        select(Sale.customer_id, func.sum(Sale.total))
        .where(Sale.status == "confirmed", Sale.date >= prior_start, Sale.date <= prior_end)
        .group_by(Sale.customer_id)
    ).all()
    # base = mismo trimestre del año anterior (control estacional)
    prior = {cid: float(t or 0) for cid, t in prior_rows}

    # Sólo clientes con volumen relevante el año pasado (>= mediana), para no
    # generar ruido con compradores esporádicos.
    positives = sorted(v for v in prior.values() if v > 0)
    floor = positives[len(positives) // 2] if positives else 0

    alerts = []
    for cid, base in prior.items():
        if base < floor or base <= 0:
            continue
        rec = recent.get(cid, 0.0)
        drop = (base - rec) / base
        if drop >= threshold:
            cust = db.get(Customer, cid)
            if not cust:
                continue
            alerts.append(
                {
                    "customer_id": cid,
                    "customer": cust.name,
                    "zone": cust.zone,
                    "recent_90d": round(rec, 2),
                    "historic_quarterly_avg": round(base, 2),  # mismo período año anterior
                    "drop_pct": round(drop * 100, 1),
                    "salesperson_id": cust.salesperson_id,
                }
            )
    alerts.sort(key=lambda a: a["drop_pct"], reverse=True)
    return alerts


def credit_score(db: Session, customer: Customer, ref: date | None = None) -> int:
    """Scoring crediticio heurístico 300-850 según comportamiento de pago y mora."""
    ref = ref or date.today()
    overdue = db.execute(
        select(func.coalesce(func.sum(AccountReceivable.amount - AccountReceivable.paid_amount), 0))
        .where(
            AccountReceivable.customer_id == customer.id,
            AccountReceivable.status != "paid",
            AccountReceivable.due_date < ref,
        )
    ).scalar_one()
    total_sales = db.execute(
        select(func.coalesce(func.sum(Sale.total), 0)).where(Sale.customer_id == customer.id)
    ).scalar_one()
    score = 700
    overdue = float(overdue or 0)
    total_sales = float(total_sales or 0)
    if total_sales > 0:
        ratio = overdue / total_sales
        score -= int(min(ratio, 1.0) * 350)
    if total_sales > 500_000:
        score += 50
    return max(300, min(850, score))
