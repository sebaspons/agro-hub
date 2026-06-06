from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app = FastAPI(title=settings.project_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo local
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
