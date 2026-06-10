from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.ratelimit import login_throttle
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User
from app.schemas.auth import Token, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Mensaje único: no revela si el email existe ni si la cuenta está inactiva.
_BAD_CREDENTIALS = "Email o contraseña incorrectos"

# Hash dummy para igualar el tiempo de respuesta cuando el email no existe
# (evita inferir cuentas válidas midiendo latencia).
_DUMMY_HASH = hash_password("timing-equalizer")


@router.post("/login", response_model=Token)
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> Token:
    client_ip = request.client.host if request.client else "unknown"
    throttle_key = f"{client_ip}:{form.username.strip().lower()}"

    wait = login_throttle.retry_after(throttle_key)
    if wait:
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos. Probá de nuevo en unos minutos.",
            headers={"Retry-After": str(wait)},
        )

    user = db.scalar(select(User).where(User.email == form.username))
    password_ok = verify_password(form.password, user.hashed_password if user else _DUMMY_HASH)
    if not user or not password_ok or not user.is_active:
        login_throttle.register_failure(throttle_key)
        raise HTTPException(status_code=400, detail=_BAD_CREDENTIALS)

    login_throttle.reset(throttle_key)
    token = create_access_token(subject=user.email, role=user.role.code)
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return user
