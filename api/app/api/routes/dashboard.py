from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import User
from app.services import analytics

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _default_range() -> tuple[date, date]:
    end = date.today()
    start = end - timedelta(days=29)
    return start, end


@router.get("")
def dashboard(
    start: date | None = Query(None),
    end: date | None = Query(None),
    salesperson_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if not start or not end:
        d_start, d_end = _default_range()
        start = start or d_start
        end = end or d_end

    # Un vendedor sólo ve sus propios datos
    if user.role.code == "sales" and user.salesperson_id:
        salesperson_id = user.salesperson_id

    return {
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "kpis": analytics.kpis(db, start, end, salesperson_id),
        "sales_by_period": analytics.sales_by_period(db, end, salesperson_id),
        "sales_by_category": analytics.sales_by_category(db, start, end, salesperson_id),
        "salesperson_performance": analytics.salesperson_performance(db, start, end),
        "rfm_matrix": analytics.rfm_matrix(db),
        "top_customers": analytics.top_customers(db, start, end, 5, salesperson_id),
        "sales_trend": analytics.sales_trend_12m(db, end, salesperson_id),
        "ar_aging": analytics.ar_aging(db),
    }


@router.get("/salespeople")
def list_salespeople_filter(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    from sqlalchemy import select

    from app.models import Salesperson

    rows = db.scalars(select(Salesperson).where(Salesperson.active.is_(True))).all()
    return [{"id": s.id, "name": s.name, "zone": s.zone} for s in rows]
