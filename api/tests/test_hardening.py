"""Tests de robustez y seguridad: ABM de cotizaciones, throttle de login,
anti-enumeración, política de contraseñas, guardas de usuarios y headers."""

from app.core.ratelimit import login_throttle
from tests.test_api import _customer, _product


def _quote(client, headers, pid: int, cid: int, qty: float = 2) -> dict:
    return client.post(
        "/api/quotes",
        json={"customer_id": cid, "items": [{"product_id": pid, "quantity": qty}]},
        headers=headers,
    ).json()


# ── Cotizaciones: detalle y edición ──────────────────────────────────


def test_quote_detail_returns_items(client, auth):
    pid = _product(client, auth["owner"], price=200)["id"]
    cid = _customer(client, auth["owner"])
    q = _quote(client, auth["owner"], pid, cid, qty=3)

    r = client.get(f"/api/quotes/{q['id']}", headers=auth["owner"])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["editable"] is True
    assert len(d["items"]) == 1
    assert d["items"][0]["quantity"] == 3.0
    assert d["items"][0]["subtotal"] == 600.0
    assert d["total"] == 600.0


def test_quote_update_recalculates_total(client, auth):
    pid = _product(client, auth["owner"], price=200)["id"]
    cid = _customer(client, auth["owner"])
    q = _quote(client, auth["owner"], pid, cid, qty=1)

    r = client.put(
        f"/api/quotes/{q['id']}",
        json={"notes": "ajustada", "items": [{"product_id": pid, "quantity": 5, "discount_pct": 10}]},
        headers=auth["owner"],
    )
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 900.0  # 200 * 5 * 0.9

    d = client.get(f"/api/quotes/{q['id']}", headers=auth["owner"]).json()
    assert d["notes"] == "ajustada"
    assert d["items"][0]["discount_pct"] == 10.0


def test_quote_update_closed_is_rejected(client, auth):
    pid = _product(client, auth["owner"])["id"]
    cid = _customer(client, auth["owner"])
    q = _quote(client, auth["owner"], pid, cid)
    client.patch(f"/api/quotes/{q['id']}/status", json={"status": "won"}, headers=auth["owner"])

    assert client.get(f"/api/quotes/{q['id']}", headers=auth["owner"]).json()["editable"] is False
    r = client.put(f"/api/quotes/{q['id']}", json={"notes": "x"}, headers=auth["owner"])
    assert r.status_code == 409


def test_quote_detail_sales_scope(client, auth):
    """Un vendedor no puede ver cotizaciones de otro vendedor."""
    pid = _product(client, auth["owner"])["id"]
    cid = _customer(client, auth["owner"])
    q = _quote(client, auth["owner"], pid, cid)  # sin vendedor asignado

    r = client.get(f"/api/quotes/{q['id']}", headers=auth["sales"])
    assert r.status_code == 403


def test_quote_update_requires_items(client, auth):
    pid = _product(client, auth["owner"])["id"]
    cid = _customer(client, auth["owner"])
    q = _quote(client, auth["owner"], pid, cid)
    r = client.put(f"/api/quotes/{q['id']}", json={"items": []}, headers=auth["owner"])
    assert r.status_code == 400


# ── Login: throttle y anti-enumeración ───────────────────────────────


def test_login_throttle_locks_after_max_attempts(client, auth):
    for _ in range(5):
        r = client.post("/api/auth/login", data={"username": "owner@test.com", "password": "mala"})
        assert r.status_code == 400
    r = client.post("/api/auth/login", data={"username": "owner@test.com", "password": "mala"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    # Incluso con la contraseña correcta sigue bloqueado
    r = client.post("/api/auth/login", data={"username": "owner@test.com", "password": "secret123"})
    assert r.status_code == 429
    login_throttle.clear()


def test_login_throttle_resets_on_success(client, auth):
    for _ in range(3):
        client.post("/api/auth/login", data={"username": "owner@test.com", "password": "mala"})
    r = client.post("/api/auth/login", data={"username": "owner@test.com", "password": "secret123"})
    assert r.status_code == 200
    # El contador se reseteó: tres fallos más no bloquean
    for _ in range(3):
        r = client.post("/api/auth/login", data={"username": "owner@test.com", "password": "mala"})
        assert r.status_code == 400


def test_login_no_user_enumeration(client, auth, db):
    """Mismo mensaje para email inexistente, contraseña errónea y cuenta inactiva."""
    from app.models import User

    r1 = client.post("/api/auth/login", data={"username": "noexiste@test.com", "password": "x"})
    r2 = client.post("/api/auth/login", data={"username": "owner@test.com", "password": "x"})

    u = db.query(User).filter_by(email="sales@test.com").one()
    u.is_active = False
    db.commit()
    r3 = client.post("/api/auth/login", data={"username": "sales@test.com", "password": "secret123"})

    assert r1.status_code == r2.status_code == r3.status_code == 400
    assert r1.json()["detail"] == r2.json()["detail"] == r3.json()["detail"]


def test_inactive_user_token_is_rejected(client, auth, db):
    """Desactivar un usuario invalida sus tokens vigentes."""
    from app.models import User

    headers = auth["warehouse"]
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    u = db.query(User).filter_by(email="warehouse@test.com").one()
    u.is_active = False
    db.commit()
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_garbage_token_rejected(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer no-es-un-jwt"})
    assert r.status_code == 401


# ── Gestión de usuarios: política y guardas ──────────────────────────


def _list_users(client, headers):
    return client.get("/api/users", headers=headers).json()


def test_create_user_short_password_rejected(client, auth):
    roles = client.get("/api/users/roles", headers=auth["owner"]).json()
    rid = roles[0]["id"]
    r = client.post(
        "/api/users",
        json={"name": "Nuevo", "email": "nuevo@test.com", "password": "corta", "role_id": rid},
        headers=auth["owner"],
    )
    assert r.status_code == 400


def test_reset_password_policy(client, auth):
    uid = next(u["id"] for u in _list_users(client, auth["owner"]) if u["email"] == "sales@test.com")
    r = client.post(f"/api/users/{uid}/reset-password", json={"password": "1234"}, headers=auth["owner"])
    assert r.status_code == 400
    r = client.post(f"/api/users/{uid}/reset-password", json={"password": "clave-segura-9"}, headers=auth["owner"])
    assert r.status_code == 200


def test_update_user_duplicate_email_rejected(client, auth):
    users = _list_users(client, auth["owner"])
    sales_id = next(u["id"] for u in users if u["email"] == "sales@test.com")
    r = client.patch(
        f"/api/users/{sales_id}", json={"email": "finance@test.com"}, headers=auth["owner"]
    )
    assert r.status_code == 409


def test_cannot_deactivate_self(client, auth):
    me = client.get("/api/auth/me", headers=auth["owner"]).json()
    r = client.patch(f"/api/users/{me['id']}", json={"is_active": False}, headers=auth["owner"])
    assert r.status_code == 409


def test_cannot_demote_last_active_owner(client, auth):
    users = _list_users(client, auth["owner"])
    owner_id = next(u["id"] for u in users if u["email"] == "owner@test.com")
    roles = client.get("/api/users/roles", headers=auth["owner"]).json()
    finance_rid = next(r["id"] for r in roles if r["code"] == "finance")
    r = client.patch(f"/api/users/{owner_id}", json={"role_id": finance_rid}, headers=auth["owner"])
    assert r.status_code == 409


# ── Headers de seguridad ─────────────────────────────────────────────


def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"
    assert r.headers.get("Referrer-Policy") == "no-referrer"
    assert r.headers.get("Cache-Control") == "no-store"
