from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autorizado",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if not payload or "sub" not in payload:
        raise cred_exc
    user = db.scalar(select(User).where(User.email == payload["sub"]))
    if not user or not user.is_active:
        raise cred_exc
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if roles and user.role.code not in roles:
            raise HTTPException(status_code=403, detail="Permiso insuficiente para este módulo")
        return user

    return checker


def require_perm(module: str, action: str):
    """Exige un permiso granular (RBAC) sobre un módulo. `owner` siempre pasa."""
    from app.core.permissions import can

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role.code == "owner":
            return user
        if not can(user.role.permissions, module, action):
            raise HTTPException(status_code=403, detail="Permiso insuficiente")
        return user

    return checker
