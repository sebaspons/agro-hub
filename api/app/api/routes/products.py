from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models import Product, Stock, User, Warehouse

router = APIRouter(prefix="/api/products", tags=["products"])


def _product_dict(p: Product, stock: float = 0) -> dict:
    price = float(p.price)
    cost = float(p.cost)
    margin = round((price - cost) / price * 100, 1) if price else 0
    return {
        "id": p.id,
        "sku": p.sku,
        "name": p.name,
        "category": p.category,
        "brand": p.brand,
        "cost": cost,
        "price": price,
        "margin_pct": margin,
        "target_margin_pct": round(float(p.target_margin) * 100, 1),
        "abc_class": p.abc_class,
        "unit": p.unit,
        "active": p.active,
        "stock": round(float(stock or 0), 2),
        "below_target": margin < float(p.target_margin) * 100,
    }


class ProductIn(BaseModel):
    sku: str | None = None
    name: str = Field(min_length=2)
    category: str
    brand: str = "Nidera"
    cost: float = Field(ge=0)
    price: float = Field(gt=0)
    target_margin_pct: float = Field(default=25, ge=0, le=100)
    unit: str = "un"


@router.get("")
def list_products(
    q: str | None = Query(None),
    category: str | None = Query(None),
    brand: str | None = Query(None),
    abc: str | None = Query(None),
    active: bool | None = Query(None),
    in_stock: bool | None = Query(None),
    min_price: float | None = Query(None),
    max_price: float | None = Query(None),
    limit: int = Query(300, le=1000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    stock_sub = (
        select(Stock.product_id, func.sum(Stock.quantity).label("qty"))
        .group_by(Stock.product_id)
        .subquery()
    )
    qty = func.coalesce(stock_sub.c.qty, 0)
    stmt = select(Product, qty).outerjoin(stock_sub, stock_sub.c.product_id == Product.id)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    if category:
        stmt = stmt.where(Product.category == category)
    if brand:
        stmt = stmt.where(Product.brand == brand)
    if abc:
        stmt = stmt.where(Product.abc_class == abc)
    if active is not None:
        stmt = stmt.where(Product.active.is_(active))
    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)
    if in_stock is not None:
        stmt = stmt.where(qty > 0) if in_stock else stmt.where(qty <= 0)
    stmt = stmt.order_by(Product.name).limit(limit)
    return [_product_dict(p, st) for p, st in db.execute(stmt).all()]


@router.get("/categories")
def categories(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[str]:
    rows = db.execute(select(Product.category).distinct().order_by(Product.category)).all()
    return [r[0] for r in rows]


@router.get("/brands")
def brands(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[str]:
    rows = db.execute(select(Product.brand).distinct().order_by(Product.brand)).all()
    return [r[0] for r in rows]


def _next_sku(db: Session) -> str:
    n = db.scalar(select(Product.id).order_by(Product.id.desc())) or 0
    return f"P-{1000 + n + 1}"


@router.post("", status_code=201)
def create_product(
    body: ProductIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "warehouse")),
) -> dict:
    sku = body.sku or _next_sku(db)
    if db.scalar(select(Product).where(Product.sku == sku)):
        raise HTTPException(409, f"Ya existe un producto con SKU {sku}")
    if body.cost > body.price:
        raise HTTPException(400, "El costo no puede ser mayor al precio")
    p = Product(
        sku=sku,
        name=body.name,
        category=body.category,
        brand=body.brand,
        cost=body.cost,
        price=body.price,
        target_margin=round(body.target_margin_pct / 100, 4),
        unit=body.unit,
        active=True,
    )
    db.add(p)
    db.flush()
    # Stock inicial en 0 en el depósito principal para que aparezca en inventario
    wh = db.scalar(select(Warehouse).order_by(Warehouse.id))
    if wh:
        db.add(Stock(product_id=p.id, warehouse_id=wh.id, quantity=0, min_quantity=10))
    db.commit()
    db.refresh(p)
    return _product_dict(p)


@router.patch("/{product_id}")
def update_product(
    product_id: int,
    body: ProductIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "warehouse")),
) -> dict:
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    if body.cost > body.price:
        raise HTTPException(400, "El costo no puede ser mayor al precio")
    p.name = body.name
    p.category = body.category
    p.brand = body.brand
    p.cost = body.cost
    p.price = body.price
    p.target_margin = round(body.target_margin_pct / 100, 4)
    p.unit = body.unit
    if body.sku:
        p.sku = body.sku
    db.commit()
    db.refresh(p)
    return _product_dict(p)


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("owner", "finance", "warehouse")),
) -> None:
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    # Si tiene ventas asociadas, lo desactivamos en lugar de borrarlo (integridad)
    from app.models import SaleItem

    has_sales = db.scalar(select(SaleItem.id).where(SaleItem.product_id == product_id).limit(1))
    if has_sales:
        p.active = False
        db.commit()
        raise HTTPException(
            409, "El producto tiene ventas asociadas: se desactivó en lugar de eliminarlo."
        )
    db.execute(Stock.__table__.delete().where(Stock.product_id == product_id))
    db.delete(p)
    db.commit()
