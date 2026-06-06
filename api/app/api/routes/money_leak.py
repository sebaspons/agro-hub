"""'¿Dónde se escapa el dinero?' — el gancho comercial.

Desglosa los USD 725.000/año de pérdida en los 20 puntos de dolor, los agrupa
por área y los vincula a su módulo. Donde es posible enriquece con métricas
vivas del seed (mora real, cotizaciones abiertas, quiebres de stock).
"""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import AccountReceivable, Quote, Stock, User
from app.services import analytics

router = APIRouter(prefix="/api/money-leak", tags=["money-leak"])

# (id, prioridad, area, problema, pérdida USD, solución, módulo/route)
PAIN_POINTS = [
    (1, "critica", "Comercial", "Clientes que reducen compras sin ser detectados", 100_000,
     "CRM con alertas de caída de consumo", "/crm"),
    (2, "critica", "Comercial", "Presupuestos/cotizaciones sin seguimiento", 300_000,
     "Pipeline comercial con estados y recordatorios", "/cotizaciones"),
    (3, "critica", "Comercial", "Clientes perdidos por falta de visitas", 150_000,
     "Agenda inteligente de visitas", "/visitas"),
    (4, "critica", "Comercial", "Dependencia de vendedores clave", 100_000,
     "CRM centralizado (historia del cliente)", "/crm"),
    (5, "critica", "Finanzas", "Cobranza reactiva y mora elevada", 30_000,
     "Alertas de cobranza y cartera por antigüedad", "/finanzas"),
    (6, "critica", "Finanzas", "Desconocimiento de rentabilidad real", 80_000,
     "Análisis de márgenes por producto/cliente/vendedor", "/finanzas"),
    (7, "alta", "Stock", "Quiebres de stock en campaña", 50_000,
     "Forecast de demanda", "/inventario"),
    (8, "alta", "Stock", "Productos inmovilizados", 30_000,
     "Gestión ABC de inventario", "/inventario"),
    (9, "alta", "Comercial", "Venta cruzada desaprovechada", 150_000,
     "Motor de recomendaciones (cross/upsell)", "/recomendaciones"),
    (10, "alta", "Comercial", "Descuentos excesivos", 40_000,
     "Control de márgenes y autorización de descuentos", "/ventas"),
    (11, "alta", "Logística", "Entregas urgentes evitables", 15_000,
     "Planificación logística", "/logistica"),
    (12, "alta", "Logística", "Rutas ineficientes", 7_000,
     "Optimización de recorridos", "/rutas"),
    (13, "media_alta", "Depósito", "Errores de despacho", 20_000,
     "Picking con código de barras", "/logistica"),
    (14, "media_alta", "Depósito", "Diferencias de inventario", 15_000,
     "Inventario en tiempo real", "/inventario"),
    (15, "media_alta", "Stock", "Productos vencidos", 10_000,
     "Control de vencimientos (lotes)", "/inventario"),
    (16, "media_alta", "Comercial", "Información dispersa en WhatsApp", 0,
     "CRM centralizado con registro de interacciones", "/crm"),
    (17, "media", "Logística", "Falta de seguimiento de entregas", 10_000,
     "Tracking de entregas", "/logistica"),
    (18, "media", "Finanzas", "Límites de crédito sin control", 20_000,
     "Scoring crediticio y bloqueo por límite", "/finanzas"),
    (19, "media", "Gerencia", "Falta de indicadores en tiempo real", 0,
     "Dashboard ejecutivo", "/dashboard"),
    (20, "media", "Gerencia", "Falta de análisis predictivo", 0,
     "Módulo de IA / analítica", "/reportes"),
]


@router.get("")
def money_leak(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    items = []
    for pid, prio, area, problem, loss, solution, route in PAIN_POINTS:
        items.append(
            {
                "id": pid,
                "priority": prio,
                "area": area,
                "problem": problem,
                "annual_loss_usd": loss,
                "solution": solution,
                "route": route,
            }
        )

    # Agrupado por área
    by_area: dict[str, float] = {}
    for it in items:
        by_area[it["area"]] = by_area.get(it["area"], 0) + it["annual_loss_usd"]
    areas = [{"area": a, "annual_loss_usd": v} for a, v in by_area.items()]
    areas.sort(key=lambda x: x["annual_loss_usd"], reverse=True)

    # Cifra consolidada del brief (USD 725.000). El bruto de oportunidades
    # identificadas por punto es mayor; se expone aparte para transparencia.
    HEADLINE_TOTAL = 725_000
    total_identified = sum(it["annual_loss_usd"] for it in items)

    # Métricas vivas del seed que dan credibilidad al "antes"
    open_quotes_value = float(
        db.scalar(
            select(func.coalesce(func.sum(Quote.total), 0)).where(
                Quote.status.in_(["sent", "negotiating", "draft"])
            )
        )
        or 0
    )
    stock_breaks = int(
        db.scalar(select(func.count(Stock.id)).where(Stock.quantity <= Stock.min_quantity)) or 0
    )
    overdue = analytics.overdue_total(db)
    open_ar = float(
        db.scalar(
            select(func.coalesce(func.sum(AccountReceivable.amount - AccountReceivable.paid_amount), 0))
            .where(AccountReceivable.status != "paid")
        )
        or 0
    )

    return {
        "total_annual_loss_usd": HEADLINE_TOTAL,
        "total_identified_usd": total_identified,
        "scenarios": {
            "conservador": {"pct": 5, "usd": 250_000},
            "probable": {"pct": 10, "usd": 500_000},
            "optimizado": {"pct": 15, "usd": 750_000},
        },
        "by_area": areas,
        "items": items,
        "live_metrics": {
            "open_quotes_value_ars": round(open_quotes_value, 2),
            "stock_breaks": stock_breaks,
            "overdue_total_ars": overdue,
            "open_receivables_ars": round(open_ar, 2),
        },
    }
