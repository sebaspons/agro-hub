"""Tests de humo: verifican que la app levanta y los cálculos clave funcionan.

Usan una base SQLite en memoria con datos mínimos (no requieren Postgres ni el
seed completo)."""
from datetime import date, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base
from app.models import (
    AccountReceivable,
    Customer,
    Product,
    Sale,
    SaleItem,
    Salesperson,
)
from app.services import analytics


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


def _seed_min(db):
    sp = Salesperson(name="Test", zone="Pampeana", monthly_target=1000)
    db.add(sp)
    db.flush()
    cust = Customer(name="Cliente Test", zone="Pampeana", credit_limit=1000, credit_score=600)
    db.add(cust)
    prod = Product(sku="P-1", name="Urea", category="Fertilizantes", brand="Nidera",
                   cost=100, price=200, target_margin=0.5)
    db.add(prod)
    db.flush()
    today = date.today()
    sale = Sale(code="V1", customer_id=cust.id, salesperson_id=sp.id, date=today,
                status="confirmed", subtotal=200, total=200, total_cost=100, margin_amount=100)
    db.add(sale)
    db.flush()
    db.add(SaleItem(sale_id=sale.id, product_id=prod.id, quantity=1, unit_price=200,
                    unit_cost=100, line_total=200, line_margin=100))
    db.add(AccountReceivable(customer_id=cust.id, sale_id=sale.id, amount=200, paid_amount=0,
                             issue_date=today - timedelta(days=60),
                             due_date=today - timedelta(days=40), status="open"))
    db.commit()
    return cust, prod


def test_kpis(db):
    _seed_min(db)
    today = date.today()
    kpis = analytics.kpis(db, today - timedelta(days=1), today)
    labels = {k["label"] for k in kpis}
    assert "Ventas del período" in labels
    ventas = next(k for k in kpis if k["label"] == "Ventas del período")
    assert ventas["value"] == 200


def test_overdue_total(db):
    _seed_min(db)
    assert analytics.overdue_total(db) == 200


def test_aging_buckets(db):
    _seed_min(db)
    aging = analytics.ar_aging(db)
    assert len(aging) == 4
    bucket_3160 = next(b for b in aging if b["bucket"] == "31-60")
    assert bucket_3160["value"] == 200


def test_rfm_and_abc(db):
    _seed_min(db)
    assert analytics.compute_rfm(db) >= 1
    assert analytics.compute_abc(db) >= 1
    db.commit()
    cust = db.query(Customer).first()
    assert cust.rfm_segment is not None
    prod = db.query(Product).first()
    assert prod.abc_class in ("A", "B", "C")
