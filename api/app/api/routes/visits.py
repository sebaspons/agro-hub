from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Customer, Sale, User, Visit

router = APIRouter(prefix="/api/visits", tags=["visits"])


@router.get("")
def list_visits(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    stmt = select(Visit, Customer.name, Customer.zone).join(
        Customer, Customer.id == Visit.customer_id
    )
    if user.role.code == "sales" and user.salesperson_id:
        stmt = stmt.where(Visit.salesperson_id == user.salesperson_id)
    if status:
        stmt = stmt.where(Visit.status == status)
    stmt = stmt.order_by(Visit.scheduled_date)
    rows = db.execute(stmt).all()
    return [
        {
            "id": v.id,
            "customer": name,
            "customer_id": v.customer_id,
            "zone": zone,
            "scheduled_date": v.scheduled_date.isoformat(),
            "done_date": v.done_date.isoformat() if v.done_date else None,
            "status": v.status,
            "notes": v.notes,
        }
        for v, name, zone in rows
    ]


@router.get("/alerts/no-visit")
def no_visit_alerts(
    days: int = 60,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Clientes sin visita en los últimos N días (riesgo de abandono comercial)."""
    cutoff = date.today() - timedelta(days=days)
    last_visit = (
        select(Visit.customer_id, func.max(Visit.done_date).label("last"))
        .where(Visit.status == "done")
        .group_by(Visit.customer_id)
        .subquery()
    )
    stmt = (
        select(Customer, last_visit.c.last)
        .outerjoin(last_visit, last_visit.c.customer_id == Customer.id)
        .where((last_visit.c.last.is_(None)) | (last_visit.c.last < cutoff))
    )
    if user.role.code == "sales" and user.salesperson_id:
        stmt = stmt.where(Customer.salesperson_id == user.salesperson_id)
    stmt = stmt.limit(100)
    rows = db.execute(stmt).all()
    out = []
    for c, last in rows:
        out.append(
            {
                "customer_id": c.id,
                "customer": c.name,
                "zone": c.zone,
                "last_visit": last.isoformat() if last else None,
                "days_since": (date.today() - last).days if last else None,
            }
        )
    out.sort(key=lambda x: (x["days_since"] is not None, x["days_since"] or 0), reverse=True)
    return out


class VisitIn(BaseModel):
    customer_id: int
    scheduled_date: date
    notes: str = ""


@router.post("")
def create_visit(
    body: VisitIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    if not db.get(Customer, body.customer_id):
        raise HTTPException(404, "Cliente no encontrado")
    v = Visit(
        customer_id=body.customer_id,
        salesperson_id=user.salesperson_id,
        scheduled_date=body.scheduled_date,
        notes=body.notes,
        status="pending",
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return {"id": v.id, "status": v.status}


@router.patch("/{visit_id}/complete")
def complete_visit(
    visit_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    v = db.get(Visit, visit_id)
    if not v:
        raise HTTPException(404, "Visita no encontrada")
    v.status = "done"
    v.done_date = date.today()
    db.commit()
    return {"id": v.id, "status": v.status, "done_date": v.done_date.isoformat()}


@router.delete("/{visit_id}", status_code=204)
def delete_visit(
    visit_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    v = db.get(Visit, visit_id)
    if not v:
        raise HTTPException(404, "Visita no encontrada")
    db.delete(v)
    db.commit()
