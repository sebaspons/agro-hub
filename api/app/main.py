import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.routes import (
    auth,
    customers,
    dashboard,
    finance,
    health,
    inventory,
    logistics,
    money_leak,
    products,
    purchases,
    quotes,
    recommendations,
    reports,
    sales,
    users,
    visits,
)
from app.core.config import settings

logger = logging.getLogger("agro.api")

# En producción no exponemos /docs ni /openapi.json
_dev = settings.environment == "development"
app = FastAPI(
    title=settings.project_name,
    version="0.1.0",
    docs_url="/docs" if _dev else None,
    redoc_url=None,
    openapi_url="/openapi.json" if _dev else None,
)

# El frontend proxea /api por Vite (mismo origen), así que CORS solo hace
# falta si el navegador pega directo contra el puerto de la API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    # Respuestas de API con datos de negocio: que el navegador no las cachee
    if request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response

# ── Manejo global de errores ─────────────────────────────────────────
# Las respuestas nunca exponen detalles internos (SQL, stack traces).


@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    logger.warning("IntegrityError en %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse(
        status_code=409,
        content={"detail": "La operación entra en conflicto con datos existentes."},
    )


@app.exception_handler(OperationalError)
async def operational_error_handler(request: Request, exc: OperationalError) -> JSONResponse:
    logger.error("OperationalError en %s %s: %s", request.method, request.url.path, exc.orig)
    return JSONResponse(
        status_code=503,
        content={"detail": "Base de datos no disponible. Reintentá en unos segundos."},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Error no manejado en %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor."})


for module in (
    health,
    auth,
    dashboard,
    money_leak,
    customers,
    quotes,
    visits,
    sales,
    products,
    recommendations,
    inventory,
    finance,
    purchases,
    logistics,
    reports,
    users,
):
    app.include_router(module.router)


@app.get("/")
def root() -> dict:
    return {"service": settings.project_name, "docs": "/docs", "health": "/api/health"}
