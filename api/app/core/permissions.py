"""Definición de permisos RBAC: módulos, acciones y plantillas por rol base."""

MODULES = [
    "dashboard",
    "money_leak",
    "crm",
    "quotes",
    "visits",
    "sales",
    "products",
    "recommendations",
    "inventory",
    "finance",
    "purchases",
    "logistics",
    "reports",
    "settings",
]

ACTIONS = ["view", "create", "edit", "delete", "admin"]

MODULE_LABELS = {
    "dashboard": "Dashboard",
    "money_leak": "¿Dónde se escapa el dinero?",
    "crm": "Clientes (CRM)",
    "quotes": "Cotizaciones",
    "visits": "Agenda de visitas",
    "sales": "Ventas",
    "products": "Productos",
    "recommendations": "Recomendaciones",
    "inventory": "Inventario",
    "finance": "Cuentas por Cobrar",
    "purchases": "Compras",
    "logistics": "Logística y Rutas",
    "reports": "Reportes / IA",
    "settings": "Configuración",
}


def _p(view=False, create=False, edit=False, delete=False, admin=False) -> dict:
    return {"view": view, "create": create, "edit": edit, "delete": delete, "admin": admin}


def full() -> dict:
    return _p(True, True, True, True, True)


def viewonly() -> dict:
    return _p(view=True)


def crud(admin: bool = False) -> dict:
    return _p(True, True, True, True, admin)


def _perms(spec: dict[str, dict]) -> dict:
    """Completa todos los módulos: los no especificados quedan sin acceso."""
    return {m: spec.get(m, _p()) for m in MODULES}


DEFAULT_PERMISSIONS: dict[str, dict] = {
    "owner": {m: full() for m in MODULES},
    "finance": _perms({
        "dashboard": viewonly(),
        "money_leak": viewonly(),
        "crm": crud(),
        "sales": crud(),
        "finance": crud(admin=True),
        "purchases": crud(),
        "reports": viewonly(),
    }),
    "sales": _perms({
        "dashboard": viewonly(),
        "crm": crud(),
        "quotes": crud(),
        "visits": crud(),
        "sales": crud(),
        "products": viewonly(),
        "recommendations": viewonly(),
    }),
    "warehouse": _perms({
        "dashboard": viewonly(),
        "inventory": crud(admin=True),
        "products": crud(),
        "purchases": crud(),
        "logistics": crud(admin=True),
    }),
}


def normalize(perms: dict | None) -> dict:
    """Asegura que el dict tenga todos los módulos/acciones."""
    perms = perms or {}
    out = {}
    for m in MODULES:
        mp = perms.get(m, {}) or {}
        out[m] = {a: bool(mp.get(a, False)) for a in ACTIONS}
    return out


def visible_modules(perms: dict | None) -> list[str]:
    perms = perms or {}
    return [m for m in MODULES if (perms.get(m) or {}).get("view") or (perms.get(m) or {}).get("admin")]


def can(perms: dict | None, module: str, action: str) -> bool:
    mp = (perms or {}).get(module) or {}
    return bool(mp.get(action) or mp.get("admin"))
