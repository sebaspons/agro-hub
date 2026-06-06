from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import (
    AccountReceivable,
    Customer,
    CustomerContact,
    CustomerInteraction,
    Payment,
    Quote,
    Sale,
    User,
    Visit,
)
from app.services import analytics

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("")
def list_customers(
    q: str | None = Query(None),
    zone: str | None = Query(None),
    segment: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    stmt = select(Customer)
    if user.role.code == "sales" and user.salesperson_id:
        stmt = stmt.where(Customer.salesperson_id == user.salesperson_id)
    if q:
        stmt = stmt.where(Customer.name.ilike(f"%{q}%"))
    if zone:
        stmt = stmt.where(Customer.zone == zone)
    if segment:
        stmt = stmt.where(Customer.rfm_segment == segment)
    if status:
        stmt = stmt.where(Customer.status == status)
    stmt = stmt.order_by(Customer.name).limit(limit)
    customers = db.scalars(stmt).all()
    return [_customer_brief(db, c) for c in customers]


def _customer_brief(db: Session, c: Customer) -> dict:
    total_sales = float(
        db.scalar(
            select(func.coalesce(func.sum(Sale.total), 0)).where(
                Sale.customer_id == c.id, Sale.status == "confirmed"
            )
        )
        or 0
    )
    balance = float(
        db.scalar(
            select(func.coalesce(func.sum(AccountReceivable.amount - AccountReceivable.paid_amount), 0))
            .where(AccountReceivable.customer_id == c.id, AccountReceivable.status != "paid")
        )
        or 0
    )
    return {
        "id": c.id,
        "name": c.name,
        "zone": c.zone,
        "city": c.city,
        "status": c.status,
        "segment": c.rfm_segment,
        "credit_limit": float(c.credit_limit),
        "credit_score": c.credit_score,
        "total_sales": round(total_sales, 2),
        "balance": round(balance, 2),
        "salesperson_id": c.salesperson_id,
    }


@router.get("/alerts/consumption-drop")
def consumption_drop(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    alerts = analytics.consumption_drop_alerts(db)
    if user.role.code == "sales" and user.salesperson_id:
        alerts = [a for a in alerts if a["salesperson_id"] == user.salesperson_id]
    return alerts


@router.get("/alerts/at-risk")
def at_risk(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    """Clientes en riesgo de fuga: recencia baja (RFM R=1) o status at_risk."""
    stmt = select(Customer).where(
        (Customer.rfm_recency == 1) | (Customer.status == "at_risk")
    )
    if user.role.code == "sales" and user.salesperson_id:
        stmt = stmt.where(Customer.salesperson_id == user.salesperson_id)
    customers = db.scalars(stmt).all()
    return [_customer_brief(db, c) for c in customers]


@router.post("/recompute-rfm")
def recompute_rfm(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    n = analytics.compute_rfm(db)
    db.commit()
    return {"updated": n}


@router.get("/{customer_id}")
def customer_360(
    customer_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")

    sales = db.scalars(
        select(Sale)
        .where(Sale.customer_id == customer_id, Sale.status == "confirmed")
        .order_by(Sale.date.desc())
        .limit(20)
    ).all()
    interactions = db.scalars(
        select(CustomerInteraction)
        .where(CustomerInteraction.customer_id == customer_id)
        .order_by(CustomerInteraction.date.desc())
        .limit(20)
    ).all()
    visits = db.scalars(
        select(Visit).where(Visit.customer_id == customer_id).order_by(Visit.scheduled_date.desc())
    ).all()
    quotes = db.scalars(
        select(Quote).where(Quote.customer_id == customer_id).order_by(Quote.created_at.desc())
    ).all()
    receivables = db.scalars(
        select(AccountReceivable)
        .where(AccountReceivable.customer_id == customer_id, AccountReceivable.status != "paid")
        .order_by(AccountReceivable.due_date)
    ).all()

    contacts = db.scalars(
        select(CustomerContact).where(CustomerContact.customer_id == customer_id)
    ).all()

    # Tendencia mensual: compras (ventas) + deuda acumulada
    trend = _customer_trend(db, customer_id)

    return {
        "id": c.id,
        "name": c.name,
        "cuit": c.cuit,
        "zone": c.zone,
        "city": c.city,
        "address": c.address,
        "phone": c.phone,
        "email": c.email,
        "notes": c.notes,
        "status": c.status,
        "segment": c.rfm_segment,
        "rfm": {"r": c.rfm_recency, "f": c.rfm_frequency, "m": c.rfm_monetary},
        "credit_limit": float(c.credit_limit),
        "credit_score": c.credit_score,
        "salesperson_id": c.salesperson_id,
        "contacts": [
            {"id": ct.id, "name": ct.name, "role": ct.role, "phone": ct.phone,
             "mobile": ct.mobile, "email": ct.email, "notes": ct.notes}
            for ct in contacts
        ],
        "sales": [
            {"id": s.id, "code": s.code, "date": s.date.isoformat(), "total": float(s.total),
             "margin": float(s.margin_amount)}
            for s in sales
        ],
        "interactions": [
            {"id": i.id, "type": i.type, "channel": i.channel, "notes": i.notes,
             "date": i.date.isoformat()}
            for i in interactions
        ],
        "visits": [
            {"id": v.id, "scheduled_date": v.scheduled_date.isoformat(),
             "done_date": v.done_date.isoformat() if v.done_date else None, "status": v.status}
            for v in visits
        ],
        "quotes": [
            {"id": qq.id, "code": qq.code, "status": qq.status, "total": float(qq.total),
             "valid_until": qq.valid_until.isoformat() if qq.valid_until else None}
            for qq in quotes
        ],
        "receivables": [
            {"id": r.id, "amount": float(r.amount), "paid": float(r.paid_amount),
             "due_date": r.due_date.isoformat(), "status": r.status}
            for r in receivables
        ],
        "purchase_trend": trend,
    }


def _customer_trend(db: Session, customer_id: int) -> list[dict]:
    """Por mes (12 meses): compras y deuda acumulada (saldo de cuenta corriente)."""
    purch_rows = db.execute(
        select(func.extract("year", Sale.date), func.extract("month", Sale.date), func.sum(Sale.total))
        .where(Sale.customer_id == customer_id, Sale.status == "confirmed")
        .group_by(func.extract("year", Sale.date), func.extract("month", Sale.date))
    ).all()
    compras = {(int(y), int(m)): float(t or 0) for y, m, t in purch_rows}

    ar_rows = db.execute(
        select(func.extract("year", AccountReceivable.issue_date),
               func.extract("month", AccountReceivable.issue_date),
               func.sum(AccountReceivable.amount))
        .where(AccountReceivable.customer_id == customer_id)
        .group_by(func.extract("year", AccountReceivable.issue_date),
                  func.extract("month", AccountReceivable.issue_date))
    ).all()
    issued = {(int(y), int(m)): float(t or 0) for y, m, t in ar_rows}
    pay_rows = db.execute(
        select(func.extract("year", Payment.date), func.extract("month", Payment.date),
               func.sum(Payment.amount))
        .where(Payment.customer_id == customer_id)
        .group_by(func.extract("year", Payment.date), func.extract("month", Payment.date))
    ).all()
    paid = {(int(y), int(m)): float(t or 0) for y, m, t in pay_rows}

    today = date.today()
    start = (today.replace(day=1) - timedelta(days=365)).replace(day=1)
    out = []
    y, m = start.year, start.month
    balance = 0.0
    for _ in range(13):
        balance += issued.get((y, m), 0) - paid.get((y, m), 0)
        out.append({
            "label": f"{m}/{str(y)[2:]}",
            "compras": round(compras.get((y, m), 0), 2),
            "deuda": round(max(0.0, balance), 2),
        })
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


class InteractionIn(BaseModel):
    type: str
    channel: str | None = None
    notes: str = ""


@router.post("/{customer_id}/interactions")
def add_interaction(
    customer_id: int,
    body: InteractionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    inter = CustomerInteraction(
        customer_id=customer_id,
        salesperson_id=user.salesperson_id,
        type=body.type,
        channel=body.channel,
        notes=body.notes,
        date=datetime.now(timezone.utc),
    )
    db.add(inter)
    db.commit()
    db.refresh(inter)
    return {"id": inter.id, "type": inter.type, "notes": inter.notes,
            "date": inter.date.isoformat()}


@router.get("/meta/zones")
def zones(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[str]:
    rows = db.execute(select(Customer.zone).distinct().order_by(Customer.zone)).all()
    return [r[0] for r in rows]


class CustomerIn(BaseModel):
    name: str
    cuit: str | None = None
    zone: str
    city: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str = ""
    salesperson_id: int | None = None
    credit_limit: float = 0


@router.post("", status_code=201)
def create_customer(
    body: CustomerIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> dict:
    # Un vendedor crea clientes asignados a sí mismo
    sp_id = body.salesperson_id
    if user.role.code == "sales" and user.salesperson_id:
        sp_id = user.salesperson_id
    c = Customer(
        name=body.name,
        cuit=body.cuit,
        zone=body.zone,
        city=body.city,
        address=body.address,
        phone=body.phone,
        email=body.email,
        notes=body.notes or "",
        salesperson_id=sp_id,
        credit_limit=body.credit_limit,
        credit_score=600,
        status="active",
        rfm_segment="Nuevo / Prometedor",
        rfm_recency=3,
        rfm_frequency=1,
        rfm_monetary=1,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _customer_brief(db, c)


@router.patch("/{customer_id}")
def update_customer(
    customer_id: int,
    body: CustomerIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> dict:
    c = db.get(Customer, customer_id)
    if not c:
        raise HTTPException(404, "Cliente no encontrado")
    c.name = body.name
    c.cuit = body.cuit
    c.zone = body.zone
    c.city = body.city
    c.address = body.address
    c.phone = body.phone
    c.email = body.email
    c.notes = body.notes or ""
    if body.salesperson_id is not None:
        c.salesperson_id = body.salesperson_id
    c.credit_limit = body.credit_limit
    db.commit()
    db.refresh(c)
    return _customer_brief(db, c)


# ── Contactos del cliente ────────────────────────────────────────────


class ContactIn(BaseModel):
    name: str
    role: str | None = None
    phone: str | None = None
    mobile: str | None = None
    email: str | None = None
    notes: str = ""


def _contact_dict(ct: CustomerContact) -> dict:
    return {"id": ct.id, "name": ct.name, "role": ct.role, "phone": ct.phone,
            "mobile": ct.mobile, "email": ct.email, "notes": ct.notes}


@router.post("/{customer_id}/contacts", status_code=201)
def add_contact(
    customer_id: int,
    body: ContactIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> dict:
    if not db.get(Customer, customer_id):
        raise HTTPException(404, "Cliente no encontrado")
    ct = CustomerContact(customer_id=customer_id, **body.model_dump())
    db.add(ct)
    db.commit()
    db.refresh(ct)
    return _contact_dict(ct)


@router.patch("/contacts/{contact_id}")
def update_contact(
    contact_id: int,
    body: ContactIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> dict:
    ct = db.get(CustomerContact, contact_id)
    if not ct:
        raise HTTPException(404, "Contacto no encontrado")
    for k, v in body.model_dump().items():
        setattr(ct, k, v)
    db.commit()
    db.refresh(ct)
    return _contact_dict(ct)


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "sales")),
) -> None:
    ct = db.get(CustomerContact, contact_id)
    if not ct:
        raise HTTPException(404, "Contacto no encontrado")
    db.delete(ct)
    db.commit()
