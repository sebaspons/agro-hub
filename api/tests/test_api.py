"""Tests de integración de la API con TestClient sobre Postgres de test."""


def _product(client, headers, **over) -> dict:
    body = {
        "name": "Urea Granulada",
        "category": "Fertilizantes",
        "brand": "Nidera",
        "cost": 100,
        "price": 250,
        "target_margin_pct": 30,
        "unit": "tn",
    }
    body.update(over)
    return client.post("/api/products", json=body, headers=headers).json()


def _customer(client, headers, **over) -> int:
    body = {"name": "Agropecuaria Test SA", "zone": "Pampeana", "credit_limit": 1_000_000_000}
    body.update(over)
    return client.post("/api/customers", json=body, headers=headers).json()["id"]


# ── Auth ─────────────────────────────────────────────────────────────


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_wrong_password(client, auth):
    r = client.post("/api/auth/login", data={"username": "owner@test.com", "password": "nope"})
    assert r.status_code == 400


def test_me(client, auth):
    r = client.get("/api/auth/me", headers=auth["owner"])
    assert r.status_code == 200
    assert r.json()["role"]["code"] == "owner"


def test_protected_requires_token(client):
    assert client.get("/api/dashboard").status_code == 401


# ── Productos ────────────────────────────────────────────────────────


def test_product_crud(client, auth):
    r = client.post(
        "/api/products",
        json={"name": "Urea", "category": "Fertilizantes", "brand": "Nidera",
              "cost": 100, "price": 250, "target_margin_pct": 30, "unit": "tn"},
        headers=auth["owner"],
    )
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["margin_pct"] == 60.0  # (250-100)/250
    pid = p["id"]

    assert any(x["id"] == pid for x in client.get("/api/products", headers=auth["owner"]).json())

    r = client.patch(
        f"/api/products/{pid}",
        json={"name": "Urea Plus", "category": "Fertilizantes", "brand": "Nidera",
              "cost": 100, "price": 200, "target_margin_pct": 25, "unit": "tn"},
        headers=auth["owner"],
    )
    assert r.status_code == 200 and r.json()["name"] == "Urea Plus"

    assert client.delete(f"/api/products/{pid}", headers=auth["owner"]).status_code == 204


def test_product_cost_gt_price_rejected(client, auth):
    r = client.post(
        "/api/products",
        json={"name": "Producto Caro", "category": "Otros", "brand": "N", "cost": 300,
              "price": 200, "target_margin_pct": 10, "unit": "un"},
        headers=auth["owner"],
    )
    assert r.status_code == 400


def test_product_create_denied_for_sales(client, auth):
    r = client.post(
        "/api/products",
        json={"name": "Producto Y", "category": "Otros", "brand": "N", "cost": 1, "price": 2,
              "target_margin_pct": 10, "unit": "un"},
        headers=auth["sales"],
    )
    assert r.status_code == 403


def test_product_with_sales_is_deactivated_not_deleted(client, auth, db):
    pid = _product(client, auth["owner"])["id"]
    cid = _customer(client, auth["owner"])
    client.post(
        "/api/sales",
        json={"customer_id": cid, "items": [{"product_id": pid, "quantity": 1}]},
        headers=auth["owner"],
    )
    r = client.delete(f"/api/products/{pid}", headers=auth["owner"])
    assert r.status_code == 409  # se desactiva en lugar de borrar
    from app.models import Product

    db.expire_all()
    assert db.get(Product, pid).active is False


# ── Clientes ─────────────────────────────────────────────────────────


def test_customer_crud(client, auth):
    cid = _customer(client, auth["sales"], name="Don Alberto SA")
    r = client.patch(
        f"/api/customers/{cid}",
        json={"name": "Don Alberto SRL", "zone": "NOA", "credit_limit": 2_000_000},
        headers=auth["owner"],
    )
    assert r.status_code == 200 and r.json()["zone"] == "NOA"


# ── Ventas ───────────────────────────────────────────────────────────


def test_sale_computes_margin_decrements_stock_and_creates_ar(client, auth, db):
    from app.models import AccountReceivable, Stock, Warehouse

    pid = _product(client, auth["owner"], cost=100, price=200)["id"]
    wh = Warehouse(name="Central", zone="Pampeana")
    db.add(wh)
    db.flush()
    db.add(Stock(product_id=pid, warehouse_id=wh.id, quantity=50, min_quantity=5))
    db.commit()

    cid = _customer(client, auth["owner"])
    r = client.post(
        "/api/sales",
        json={"customer_id": cid, "on_credit": True, "credit_days": 30,
              "items": [{"product_id": pid, "quantity": 10, "discount_pct": 0}]},
        headers=auth["owner"],
    )
    assert r.status_code == 201, r.text
    assert r.json()["total"] == 2000.0
    assert r.json()["margin"] == 1000.0

    db.expire_all()
    stock = db.query(Stock).filter_by(product_id=pid).first()
    assert float(stock.quantity) == 40.0
    assert db.query(AccountReceivable).count() == 1


def test_sale_requires_items(client, auth):
    cid = _customer(client, auth["owner"])
    r = client.post("/api/sales", json={"customer_id": cid, "items": []}, headers=auth["owner"])
    assert r.status_code == 400


# ── Cotizaciones ─────────────────────────────────────────────────────


def test_quote_create_and_convert_to_sale(client, auth, db):
    from app.models import Sale

    pid = _product(client, auth["owner"])["id"]
    cid = _customer(client, auth["owner"])
    qid = client.post(
        "/api/quotes",
        json={"customer_id": cid, "items": [{"product_id": pid, "quantity": 2}]},
        headers=auth["owner"],
    ).json()["id"]

    r = client.patch(f"/api/quotes/{qid}/status", json={"status": "won"}, headers=auth["owner"])
    assert r.status_code == 200 and r.json()["status"] == "won"

    db.expire_all()
    assert db.query(Sale).count() == 1  # ganar la cotización generó la venta


def test_pipeline_conversion_rate(client, auth):
    r = client.get("/api/quotes/pipeline", headers=auth["owner"])
    assert r.status_code == 200
    assert "conversion_rate" in r.json()
    assert len(r.json()["columns"]) == 5


# ── Compras ──────────────────────────────────────────────────────────


def test_purchase_increments_stock(client, auth, db):
    from app.models import Stock, Warehouse

    pid = _product(client, auth["owner"])["id"]
    wh = Warehouse(name="Central", zone="Pampeana")
    db.add(wh)
    db.flush()
    db.add(Stock(product_id=pid, warehouse_id=wh.id, quantity=10, min_quantity=5))
    db.commit()

    sup = client.post("/api/purchases/suppliers", json={"name": "Profertil"}, headers=auth["owner"]).json()["id"]
    r = client.post(
        "/api/purchases",
        json={"supplier_id": sup, "received": True,
              "items": [{"product_id": pid, "quantity": 20, "unit_cost": 90}]},
        headers=auth["owner"],
    )
    assert r.status_code == 201 and r.json()["total"] == 1800.0
    db.expire_all()
    assert float(db.query(Stock).filter_by(product_id=pid).first().quantity) == 30.0


# ── Visitas ──────────────────────────────────────────────────────────


def test_visit_lifecycle(client, auth):
    cid = _customer(client, auth["owner"])
    vid = client.post(
        "/api/visits",
        json={"customer_id": cid, "scheduled_date": "2026-06-20", "notes": "Demo"},
        headers=auth["sales"],
    ).json()["id"]
    assert client.patch(f"/api/visits/{vid}/complete", headers=auth["sales"]).json()["status"] == "done"
    assert client.delete(f"/api/visits/{vid}", headers=auth["sales"]).status_code == 204


# ── Inventario ───────────────────────────────────────────────────────


def test_stock_adjust(client, auth, db):
    from app.models import Warehouse

    pid = _product(client, auth["owner"])["id"]
    db.add(Warehouse(name="Central", zone="Pampeana"))
    db.commit()
    r = client.patch(
        f"/api/inventory/{pid}/stock",
        json={"quantity": 99, "min_quantity": 7},
        headers=auth["owner"],
    )
    assert r.status_code == 200 and r.json()["quantity"] == 99.0


# ── Dashboard / BI ───────────────────────────────────────────────────


def test_dashboard_shape(client, auth):
    r = client.get("/api/dashboard", headers=auth["owner"])
    assert r.status_code == 200
    d = r.json()
    assert len(d["kpis"]) == 6
    for key in ("sales_by_period", "sales_trend", "rfm_matrix", "ar_aging", "salesperson_performance"):
        assert key in d


def test_money_leak_headline(client, auth):
    r = client.get("/api/money-leak", headers=auth["owner"])
    assert r.status_code == 200
    assert r.json()["total_annual_loss_usd"] == 725_000
    assert len(r.json()["items"]) == 20


def test_finance_aging_buckets(client, auth):
    r = client.get("/api/finance/aging", headers=auth["owner"])
    assert r.status_code == 200
    assert [b["bucket"] for b in r.json()["buckets"]] == ["0-30", "31-60", "61-90", "+90"]


# ── Permisos por rol ─────────────────────────────────────────────────


def test_users_list_role_enforcement(client, auth):
    assert client.get("/api/users", headers=auth["sales"]).status_code == 403
    assert client.get("/api/users", headers=auth["owner"]).status_code == 200


def test_sales_user_only_sees_own_customers(client, auth, db):
    # cliente creado por el vendedor queda asignado a su salesperson
    _customer(client, auth["sales"], name="Cliente del Vendedor")
    _customer(client, auth["owner"], name="Cliente del Dueño", salesperson_id=None)
    visible = client.get("/api/customers", headers=auth["sales"]).json()
    names = {c["name"] for c in visible}
    assert "Cliente del Vendedor" in names
    assert "Cliente del Dueño" not in names
