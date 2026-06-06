from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import (
    Product,
    Purchase,
    PurchaseItem,
    Stock,
    Supplier,
    SupplierContact,
    User,
    Warehouse,
)

router = APIRouter(prefix="/api/purchases", tags=["purchases"])

_W = require_roles("owner", "finance", "warehouse")


class PurchaseLineIn(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    unit_cost: float = Field(ge=0)


class PurchaseCreate(BaseModel):
    supplier_id: int
    purchase_date: date | None = None
    received: bool = True  # si se recibe, impacta stock
    items: list[PurchaseLineIn]


class SupplierIn(BaseModel):
    name: str
    trade_name: str | None = None
    cuit: str | None = None
    zone: str | None = None
    address: str | None = None
    phone: str | None = None
    email: str | None = None
    tax_condition: str | None = None
    notes: str = ""


class ContactIn(BaseModel):
    name: str
    role: str | None = None
    phone: str | None = None
    mobile: str | None = None
    email: str | None = None
    notes: str = ""


# ── Compras ──────────────────────────────────────────────────────────


@router.get("")
def list_purchases(
    q: str | None = Query(None),
    status: str | None = Query(None),
    supplier_id: int | None = Query(None),
    start: date | None = Query(None),
    end: date | None = Query(None),
    min_total: float | None = Query(None),
    max_total: float | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Purchase, Supplier.name).join(Supplier, Supplier.id == Purchase.supplier_id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Purchase.code.ilike(like), Supplier.name.ilike(like)))
    if status:
        stmt = stmt.where(Purchase.status == status)
    if supplier_id:
        stmt = stmt.where(Purchase.supplier_id == supplier_id)
    if start:
        stmt = stmt.where(Purchase.date >= start)
    if end:
        stmt = stmt.where(Purchase.date <= end)
    if min_total is not None:
        stmt = stmt.where(Purchase.total >= min_total)
    if max_total is not None:
        stmt = stmt.where(Purchase.total <= max_total)
    rows = db.execute(stmt.order_by(Purchase.date.desc())).all()
    return [
        {
            "id": p.id,
            "code": p.code,
            "supplier": name,
            "date": p.date.isoformat(),
            "status": p.status,
            "total": float(p.total),
        }
        for p, name in rows
    ]


# ── Proveedores (ABM) ────────────────────────────────────────────────


def _supplier_dict(db: Session, s: Supplier, with_contacts: bool = False) -> dict:
    n_purch = int(db.scalar(select(func.count(Purchase.id)).where(Purchase.supplier_id == s.id)) or 0)
    d = {
        "id": s.id,
        "name": s.name,
        "trade_name": s.trade_name,
        "cuit": s.cuit,
        "zone": s.zone,
        "address": s.address,
        "phone": s.phone,
        "email": s.email,
        "tax_condition": s.tax_condition,
        "notes": s.notes,
        "active": s.active,
        "purchase_count": n_purch,
        "contact_count": len(s.contacts),
    }
    if with_contacts:
        d["contacts"] = [
            {"id": c.id, "name": c.name, "role": c.role, "phone": c.phone,
             "mobile": c.mobile, "email": c.email, "notes": c.notes}
            for c in s.contacts
        ]
    return d


@router.get("/suppliers")
def suppliers(
    q: str | None = Query(None),
    active: bool | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Supplier)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Supplier.name.ilike(like), Supplier.trade_name.ilike(like),
                              Supplier.cuit.ilike(like)))
    if active is not None:
        stmt = stmt.where(Supplier.active.is_(active))
    rows = db.scalars(stmt.order_by(Supplier.name)).all()
    return [_supplier_dict(db, s) for s in rows]


@router.get("/suppliers/{supplier_id}")
def supplier_detail(
    supplier_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    return _supplier_dict(db, s, with_contacts=True)


@router.post("/suppliers", status_code=201)
def create_supplier(body: SupplierIn, db: Session = Depends(get_db), user: User = Depends(_W)) -> dict:
    s = Supplier(active=True, **body.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _supplier_dict(db, s, with_contacts=True)


@router.patch("/suppliers/{supplier_id}")
def update_supplier(
    supplier_id: int, body: SupplierIn, db: Session = Depends(get_db), user: User = Depends(_W)
) -> dict:
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return _supplier_dict(db, s, with_contacts=True)


@router.delete("/suppliers/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), user: User = Depends(_W)) -> None:
    s = db.get(Supplier, supplier_id)
    if not s:
        raise HTTPException(404, "Proveedor no encontrado")
    if db.scalar(select(func.count(Purchase.id)).where(Purchase.supplier_id == supplier_id)):
        s.active = False  # tiene compras: se desactiva
        db.commit()
        raise HTTPException(409, "El proveedor tiene compras: se desactivó en lugar de eliminarlo.")
    db.delete(s)
    db.commit()


@router.post("/suppliers/{supplier_id}/contacts", status_code=201)
def add_supplier_contact(
    supplier_id: int, body: ContactIn, db: Session = Depends(get_db), user: User = Depends(_W)
) -> dict:
    if not db.get(Supplier, supplier_id):
        raise HTTPException(404, "Proveedor no encontrado")
    c = SupplierContact(supplier_id=supplier_id, **body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": c.id, "name": c.name, "role": c.role, "phone": c.phone,
            "mobile": c.mobile, "email": c.email, "notes": c.notes}


@router.delete("/suppliers/contacts/{contact_id}", status_code=204)
def delete_supplier_contact(
    contact_id: int, db: Session = Depends(get_db), user: User = Depends(_W)
) -> None:
    c = db.get(SupplierContact, contact_id)
    if not c:
        raise HTTPException(404, "Contacto no encontrado")
    db.delete(c)
    db.commit()


# ── Crear compra / detalle ───────────────────────────────────────────


@router.post("", status_code=201)
def create_purchase(body: PurchaseCreate, db: Session = Depends(get_db), user: User = Depends(_W)) -> dict:
    sup = db.get(Supplier, body.supplier_id)
    if not sup:
        raise HTTPException(404, "Proveedor no encontrado")
    if not body.items:
        raise HTTPException(400, "La compra debe tener al menos un ítem")

    pdate = body.purchase_date or date.today()
    p = Purchase(
        code="",
        supplier_id=sup.id,
        date=pdate,
        status="received" if body.received else "pending",
    )
    db.add(p)
    db.flush()
    p.code = f"OC-{pdate.year}-{p.id:04d}"

    wh = db.scalar(select(Warehouse).order_by(Warehouse.id))
    total = 0.0
    for line in body.items:
        prod = db.get(Product, line.product_id)
        if not prod:
            raise HTTPException(404, f"Producto {line.product_id} no encontrado")
        db.add(
            PurchaseItem(
                purchase_id=p.id,
                product_id=prod.id,
                quantity=line.quantity,
                unit_cost=line.unit_cost,
            )
        )
        total += line.quantity * line.unit_cost
        if body.received:
            stock = db.scalar(select(Stock).where(Stock.product_id == prod.id).order_by(Stock.id))
            if stock:
                stock.quantity = float(stock.quantity) + line.quantity
            elif wh:
                db.add(
                    Stock(product_id=prod.id, warehouse_id=wh.id,
                          quantity=line.quantity, min_quantity=10)
                )
    p.total = round(total, 2)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "code": p.code, "total": float(p.total), "status": p.status}


@router.get("/{purchase_id}")
def purchase_detail(
    purchase_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    p = db.get(Purchase, purchase_id)
    if not p:
        raise HTTPException(404, "Compra no encontrada")
    items = db.execute(
        select(PurchaseItem, Product.name)
        .join(Product, Product.id == PurchaseItem.product_id)
        .where(PurchaseItem.purchase_id == purchase_id)
    ).all()
    return {
        "id": p.id,
        "code": p.code,
        "date": p.date.isoformat(),
        "status": p.status,
        "total": float(p.total),
        "items": [
            {
                "product": name,
                "quantity": float(it.quantity),
                "unit_cost": float(it.unit_cost),
                "subtotal": round(float(it.quantity) * float(it.unit_cost), 2),
            }
            for it, name in items
        ],
    }
