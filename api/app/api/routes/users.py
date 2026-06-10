from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_perm
from app.core.db import get_db
from app.core.permissions import (
    ACTIONS,
    DEFAULT_PERMISSIONS,
    MODULE_LABELS,
    MODULES,
    normalize,
    visible_modules,
)
from app.core.security import hash_password
from app.models import Role, User

router = APIRouter(prefix="/api/users", tags=["users"])

# bcrypt ignora los bytes después del 72: lo hacemos límite duro explícito
PASSWORD_MIN, PASSWORD_MAX = 8, 72


def _check_password(password: str) -> None:
    if len(password) < PASSWORD_MIN:
        raise HTTPException(400, f"La contraseña debe tener al menos {PASSWORD_MIN} caracteres")
    if len(password.encode()) > PASSWORD_MAX:
        raise HTTPException(400, f"La contraseña no puede superar {PASSWORD_MAX} caracteres")


def _is_last_active_owner(db: Session, u: User) -> bool:
    """¿`u` es el último usuario activo con rol owner?"""
    if u.role.code != "owner" or not u.is_active:
        return False
    others = db.scalar(
        select(func.count(User.id))
        .join(Role, Role.id == User.role_id)
        .where(Role.code == "owner", User.is_active.is_(True), User.id != u.id)
    )
    return not others


# ── Usuarios ─────────────────────────────────────────────────────────


def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "role": u.role.code,
        "role_id": u.role.id,
        "role_name": u.role.name,
        "active": u.is_active,
    }


@router.get("")
def list_users(
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("settings", "view")),
) -> list[dict]:
    users = db.scalars(select(User).order_by(User.name)).all()
    return [_user_dict(u) for u in users]


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role_id: int
    salesperson_id: int | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    role_id: int | None = None
    is_active: bool | None = None
    salesperson_id: int | None = None


@router.post("", status_code=201)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("settings", "create")),
) -> dict:
    _check_password(body.password)
    if not body.name.strip():
        raise HTTPException(400, "El nombre no puede estar vacío")
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(409, "Ya existe un usuario con ese email")
    if not db.get(Role, body.role_id):
        raise HTTPException(404, "Rol no encontrado")
    u = User(
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role_id=body.role_id,
        salesperson_id=body.salesperson_id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return _user_dict(u)


@router.patch("/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("settings", "edit")),
) -> dict:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(400, "El nombre no puede estar vacío")
        u.name = body.name
    if body.email is not None and body.email != u.email:
        if db.scalar(select(User).where(User.email == body.email, User.id != u.id)):
            raise HTTPException(409, "Ya existe un usuario con ese email")
        u.email = body.email
    if body.role_id is not None and body.role_id != u.role_id:
        role = db.get(Role, body.role_id)
        if not role:
            raise HTTPException(404, "Rol no encontrado")
        if role.code != "owner" and _is_last_active_owner(db, u):
            raise HTTPException(409, "No se puede quitar el rol al último owner activo")
        u.role_id = body.role_id
    if body.is_active is not None and body.is_active != u.is_active:
        if not body.is_active:
            if u.id == user.id:
                raise HTTPException(409, "No podés desactivar tu propio usuario")
            if _is_last_active_owner(db, u):
                raise HTTPException(409, "No se puede desactivar al último owner activo")
        u.is_active = body.is_active
    if body.salesperson_id is not None:
        u.salesperson_id = body.salesperson_id
    db.commit()
    db.refresh(u)
    return _user_dict(u)


class PasswordReset(BaseModel):
    password: str


@router.post("/{user_id}/reset-password")
def reset_password(
    user_id: int,
    body: PasswordReset,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("settings", "edit")),
) -> dict:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuario no encontrado")
    _check_password(body.password)
    u.hashed_password = hash_password(body.password)
    db.commit()
    return {"ok": True}


# ── Roles / permisos (RBAC) ──────────────────────────────────────────


def _role_dict(db: Session, r: Role) -> dict:
    n_users = int(db.scalar(select(func.count(User.id)).where(User.role_id == r.id)) or 0)
    return {
        "id": r.id,
        "code": r.code,
        "name": r.name,
        "system": r.system,
        "permissions": normalize(r.permissions),
        "modules": visible_modules(r.permissions),
        "user_count": n_users,
    }


@router.get("/roles")
def list_roles(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict]:
    roles = db.scalars(select(Role).order_by(Role.id)).all()
    return [_role_dict(db, r) for r in roles]


@router.get("/roles/meta")
def roles_meta(user: User = Depends(get_current_user)) -> dict:
    """Catálogo de módulos y acciones para construir la matriz de permisos."""
    return {
        "modules": [{"key": m, "label": MODULE_LABELS[m]} for m in MODULES],
        "actions": ACTIONS,
    }


class RoleIn(BaseModel):
    name: str
    code: str | None = None
    permissions: dict | None = None


@router.post("/roles", status_code=201)
def create_role(
    body: RoleIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("settings", "admin")),
) -> dict:
    code = body.code or body.name.lower().replace(" ", "_")[:40]
    if db.scalar(select(Role).where(Role.code == code)):
        raise HTTPException(409, f"Ya existe un rol con código {code}")
    r = Role(code=code, name=body.name, permissions=normalize(body.permissions), system=False)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _role_dict(db, r)


@router.patch("/roles/{role_id}")
def update_role(
    role_id: int,
    body: RoleIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("settings", "admin")),
) -> dict:
    r = db.get(Role, role_id)
    if not r:
        raise HTTPException(404, "Rol no encontrado")
    r.name = body.name
    if body.permissions is not None:
        r.permissions = normalize(body.permissions)
    db.commit()
    db.refresh(r)
    return _role_dict(db, r)


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm("settings", "admin")),
) -> None:
    r = db.get(Role, role_id)
    if not r:
        raise HTTPException(404, "Rol no encontrado")
    if r.system:
        raise HTTPException(409, "No se puede eliminar un rol del sistema")
    if db.scalar(select(func.count(User.id)).where(User.role_id == role_id)):
        raise HTTPException(409, "El rol tiene usuarios asignados")
    db.delete(r)
    db.commit()


# ── Sesión actual ────────────────────────────────────────────────────


@router.get("/me/modules")
def my_modules(user: User = Depends(get_current_user)) -> dict:
    perms = user.role.permissions
    # Compatibilidad: si el rol no tiene permisos cargados, usa el default por código
    if not perms:
        perms = DEFAULT_PERMISSIONS.get(user.role.code, {})
    return {
        "role": user.role.code,
        "modules": visible_modules(perms),
        "permissions": normalize(perms),
    }
