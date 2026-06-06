"""Logística y depósito: entregas, tracking, optimización de rutas (heurística
por zona/cercanía) y picking con código de barras (simulado)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import Customer, Delivery, Route, User

router = APIRouter(prefix="/api/logistics", tags=["logistics"])

_W = require_roles("owner", "warehouse")
ROUTE_STATUSES = ["planned", "in_progress", "done"]
DELIVERY_STATUSES = ["pending", "picking", "dispatched", "in_transit", "delivered"]
STATUS_LABELS = {
    "pending": "Pendiente",
    "picking": "En picking",
    "dispatched": "Despachado",
    "in_transit": "En tránsito",
    "delivered": "Entregado",
}


def _delivery_dict(d: Delivery, name: str) -> dict:
    return {
        "id": d.id,
        "customer": name,
        "zone": d.zone,
        "address": d.address,
        "scheduled_date": d.scheduled_date.isoformat(),
        "status": d.status,
        "status_label": STATUS_LABELS.get(d.status, d.status),
        "is_urgent": d.is_urgent,
        "route_id": d.route_id,
        "stop_order": d.stop_order,
    }


@router.get("/deliveries")
def deliveries(
    status: str | None = Query(None),
    zone: str | None = Query(None),
    route_id: int | None = Query(None),
    unassigned: bool | None = Query(None),
    urgent: bool | None = Query(None),
    q: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    stmt = select(Delivery, Customer.name).join(Customer, Customer.id == Delivery.customer_id)
    if status:
        stmt = stmt.where(Delivery.status == status)
    if zone:
        stmt = stmt.where(Delivery.zone == zone)
    if route_id:
        stmt = stmt.where(Delivery.route_id == route_id)
    if unassigned:
        stmt = stmt.where(Delivery.route_id.is_(None))
    if urgent is not None:
        stmt = stmt.where(Delivery.is_urgent.is_(urgent))
    if q:
        stmt = stmt.where(or_(Customer.name.ilike(f"%{q}%"), Delivery.address.ilike(f"%{q}%")))
    stmt = stmt.order_by(Delivery.scheduled_date)
    rows = db.execute(stmt).all()
    return [_delivery_dict(d, name) for d, name in rows]


@router.get("/deliveries/summary")
def deliveries_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    rows = db.execute(
        select(Delivery.status, func.count(Delivery.id)).group_by(Delivery.status)
    ).all()
    by_status = {s: int(c) for s, c in rows}
    urgent = int(db.scalar(select(func.count(Delivery.id)).where(Delivery.is_urgent.is_(True))) or 0)
    return {
        "by_status": [
            {"status": s, "label": STATUS_LABELS.get(s, s), "count": by_status.get(s, 0)}
            for s in DELIVERY_STATUSES
        ],
        "urgent": urgent,
    }


class StatusIn(BaseModel):
    status: str


@router.patch("/deliveries/{delivery_id}/status")
def update_delivery(
    delivery_id: int,
    body: StatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if body.status not in DELIVERY_STATUSES:
        raise HTTPException(400, f"Estado inválido. Use uno de {DELIVERY_STATUSES}")
    d = db.get(Delivery, delivery_id)
    if not d:
        raise HTTPException(404, "Entrega no encontrada")
    d.status = body.status
    db.commit()
    return {"id": d.id, "status": d.status}


class AssignIn(BaseModel):
    route_id: int | None = None


@router.patch("/deliveries/{delivery_id}/route")
def assign_delivery(
    delivery_id: int, body: AssignIn, db: Session = Depends(get_db), user: User = Depends(_W)
) -> dict:
    d = db.get(Delivery, delivery_id)
    if not d:
        raise HTTPException(404, "Entrega no encontrada")
    if body.route_id is not None and not db.get(Route, body.route_id):
        raise HTTPException(404, "Ruta no encontrada")
    d.route_id = body.route_id
    if body.route_id is not None:
        last = db.scalar(
            select(func.coalesce(func.max(Delivery.stop_order), 0)).where(
                Delivery.route_id == body.route_id
            )
        )
        d.stop_order = int(last or 0) + 1
    db.commit()
    return {"id": d.id, "route_id": d.route_id, "stop_order": d.stop_order}


# ── Rutas (ABM) ──────────────────────────────────────────────────────


def _route_dict(db: Session, r: Route) -> dict:
    n = int(db.scalar(select(func.count(Delivery.id)).where(Delivery.route_id == r.id)) or 0)
    return {
        "id": r.id,
        "name": r.name,
        "zone": r.zone,
        "date": r.date.isoformat(),
        "driver": r.driver,
        "status": r.status,
        "stops": n,
    }


@router.get("/routes")
def routes(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    rows = db.scalars(select(Route).order_by(Route.date.desc())).all()
    return [_route_dict(db, r) for r in rows]


class RouteIn(BaseModel):
    name: str
    zone: str
    route_date: date | None = None
    driver: str | None = None
    status: str = "planned"


@router.post("/routes", status_code=201)
def create_route(body: RouteIn, db: Session = Depends(get_db), user: User = Depends(_W)) -> dict:
    r = Route(
        name=body.name,
        zone=body.zone,
        date=body.route_date or date.today(),
        driver=body.driver,
        status=body.status if body.status in ROUTE_STATUSES else "planned",
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _route_dict(db, r)


@router.patch("/routes/{route_id}")
def update_route(
    route_id: int, body: RouteIn, db: Session = Depends(get_db), user: User = Depends(_W)
) -> dict:
    r = db.get(Route, route_id)
    if not r:
        raise HTTPException(404, "Ruta no encontrada")
    r.name = body.name
    r.zone = body.zone
    if body.route_date:
        r.date = body.route_date
    r.driver = body.driver
    if body.status in ROUTE_STATUSES:
        r.status = body.status
    db.commit()
    db.refresh(r)
    return _route_dict(db, r)


@router.delete("/routes/{route_id}", status_code=204)
def delete_route(route_id: int, db: Session = Depends(get_db), user: User = Depends(_W)) -> None:
    r = db.get(Route, route_id)
    if not r:
        raise HTTPException(404, "Ruta no encontrada")
    # desasigna las entregas antes de borrar
    for d in db.scalars(select(Delivery).where(Delivery.route_id == route_id)).all():
        d.route_id = None
    db.delete(r)
    db.commit()


@router.get("/routes/{route_id}")
def route_detail(route_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.get(Route, route_id)
    if not r:
        raise HTTPException(404, "Ruta no encontrada")
    rows = db.execute(
        select(Delivery, Customer.name)
        .join(Customer, Customer.id == Delivery.customer_id)
        .where(Delivery.route_id == route_id)
        .order_by(Delivery.stop_order)
    ).all()
    return {**_route_dict(db, r), "deliveries": [_delivery_dict(d, name) for d, name in rows]}


class ReorderIn(BaseModel):
    delivery_ids: list[int]


@router.patch("/routes/{route_id}/reorder")
def reorder_route(
    route_id: int, body: ReorderIn, db: Session = Depends(get_db), user: User = Depends(_W)
) -> dict:
    if not db.get(Route, route_id):
        raise HTTPException(404, "Ruta no encontrada")
    for i, did in enumerate(body.delivery_ids, 1):
        d = db.get(Delivery, did)
        if d and d.route_id == route_id:
            d.stop_order = i
    db.commit()
    return {"ok": True}


@router.get("/optimize")
def optimize_route(
    zone: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    """Optimización heurística (vecino más cercano) de entregas pendientes por zona.

    Ordena las paradas por cercanía geográfica partiendo del depósito. Es un
    nearest-neighbour simple; la interfaz queda lista para un solver de VRP real.
    """
    pending = db.execute(
        select(Delivery, Customer.lat, Customer.lng, Customer.name)
        .join(Customer, Customer.id == Delivery.customer_id)
        .where(Delivery.zone == zone, Delivery.status.in_(["pending", "picking"]))
    ).all()
    stops = [
        {
            "delivery_id": d.id,
            "customer": name,
            "lat": float(lat) if lat is not None else -34.6,
            "lng": float(lng) if lng is not None else -58.4,
            "address": d.address,
        }
        for d, lat, lng, name in pending
    ]
    if not stops:
        return {"zone": zone, "ordered_stops": [], "estimated_km": 0}

    # Nearest-neighbour desde un depósito ficticio (centro de la zona)
    depot_lat = sum(s["lat"] for s in stops) / len(stops)
    depot_lng = sum(s["lng"] for s in stops) / len(stops)
    remaining = stops[:]
    ordered = []
    cur_lat, cur_lng = depot_lat, depot_lng
    total_km = 0.0

    def dist(a_lat, a_lng, b_lat, b_lng):
        # aproximación euclídea en grados * 111km (suficiente para demo)
        return (((a_lat - b_lat) ** 2 + (a_lng - b_lng) ** 2) ** 0.5) * 111

    while remaining:
        nxt = min(remaining, key=lambda s: dist(cur_lat, cur_lng, s["lat"], s["lng"]))
        total_km += dist(cur_lat, cur_lng, nxt["lat"], nxt["lng"])
        cur_lat, cur_lng = nxt["lat"], nxt["lng"]
        ordered.append(nxt)
        remaining.remove(nxt)

    return {
        "zone": zone,
        "ordered_stops": [{**s, "order": i + 1} for i, s in enumerate(ordered)],
        "estimated_km": round(total_km, 1),
    }
