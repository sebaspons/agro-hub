"""Fixtures de test: base de datos Postgres dedicada (`agro_test`), TestClient con
override de get_db, y usuarios/roles para autenticación por rol.

Cada test corre sobre tablas truncadas (aislamiento) usando el mismo motor Postgres
del entorno (necesario porque la analítica usa `func.extract`, no soportado en SQLite).
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401  (registra los modelos en el metadata)
from app.core.config import settings
from app.core.db import Base, get_db
from app.core.security import hash_password
from app.main import app

_BASE = settings.database_url.rsplit("/", 1)[0]
TEST_URL = f"{_BASE}/agro_test"

ROLE_NAMES = {
    "owner": "Dueño / Gerente",
    "finance": "Administración / Finanzas",
    "sales": "Vendedor",
    "warehouse": "Depósito / Logística",
}
PASSWORD = "secret123"


@pytest.fixture(scope="session")
def engine():
    # Crea la base de test si no existe
    admin = create_engine(f"{_BASE}/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        exists = c.execute(
            text("SELECT 1 FROM pg_database WHERE datname = 'agro_test'")
        ).scalar()
        if not exists:
            c.execute(text("CREATE DATABASE agro_test"))
    admin.dispose()

    eng = create_engine(TEST_URL, future=True)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture(scope="session")
def Session(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture()
def clean(engine):
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as c:
        c.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    return None


@pytest.fixture()
def db(Session, clean):
    s = Session()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def client(Session, clean):
    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()


def _login(client: TestClient, email: str) -> dict:
    r = client.post("/api/auth/login", data={"username": email, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def auth(client, db) -> dict[str, dict]:
    """Crea un usuario por rol y devuelve {rol: headers de auth}."""
    from app.models import Role, Salesperson, User

    roles = {code: Role(code=code, name=name) for code, name in ROLE_NAMES.items()}
    db.add_all(roles.values())
    db.flush()

    sp = Salesperson(name="Vendedor Test", zone="Pampeana", monthly_target=1_000_000)
    db.add(sp)
    db.flush()

    emails = {
        "owner": ("owner@test.com", None),
        "finance": ("finance@test.com", None),
        "sales": ("sales@test.com", sp.id),
        "warehouse": ("warehouse@test.com", None),
    }
    for code, (email, sp_id) in emails.items():
        db.add(
            User(
                name=code,
                email=email,
                hashed_password=hash_password(PASSWORD),
                role_id=roles[code].id,
                salesperson_id=sp_id,
            )
        )
    db.commit()
    return {code: _login(client, email) for code, (email, _) in emails.items()}
