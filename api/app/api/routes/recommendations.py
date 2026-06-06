"""Motor de venta cruzada por co-ocurrencia ('compraron juntos').

Heurística de reglas de asociación simple: cuenta en cuántas ventas aparecen
juntos dos productos y sugiere los complementos más frecuentes que el cliente
aún no compra. Deja la interfaz lista para enchufar un modelo de market-basket
(Apriori/FP-Growth) más adelante.
"""
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Customer, Product, Sale, SaleItem, User

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


def _cooccurrence(db: Session) -> dict[int, Counter]:
    # Productos por venta
    rows = db.execute(select(SaleItem.sale_id, SaleItem.product_id)).all()
    by_sale: dict[int, set[int]] = defaultdict(set)
    for sale_id, pid in rows:
        by_sale[sale_id].add(pid)
    co: dict[int, Counter] = defaultdict(Counter)
    for products in by_sale.values():
        plist = list(products)
        for i in range(len(plist)):
            for j in range(len(plist)):
                if i != j:
                    co[plist[i]][plist[j]] += 1
    return co


@router.get("/customer/{customer_id}")
def recommend_for_customer(
    customer_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    cust = db.get(Customer, customer_id)
    if not cust:
        raise HTTPException(404, "Cliente no encontrado")

    bought = set(
        db.execute(
            select(SaleItem.product_id)
            .join(Sale, Sale.id == SaleItem.sale_id)
            .where(Sale.customer_id == customer_id)
        )
        .scalars()
        .all()
    )
    if not bought:
        return {"customer": cust.name, "recommendations": []}

    co = _cooccurrence(db)
    scores: Counter = Counter()
    for pid in bought:
        for other, count in co.get(pid, {}).items():
            if other not in bought:
                scores[other] += count

    recs = []
    for pid, score in scores.most_common(8):
        p = db.get(Product, pid)
        if p:
            recs.append(
                {
                    "product_id": pid,
                    "name": p.name,
                    "category": p.category,
                    "price": float(p.price),
                    "score": score,
                    "reason": "Frecuentemente comprado junto con productos de este cliente",
                }
            )
    return {"customer": cust.name, "recommendations": recs}
