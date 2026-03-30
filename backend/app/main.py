"""
KINDpos FastAPI Application — Vz1.0

The main entry point for the backend API.
Serves both the REST API and the terminal frontend.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import sys

from app.config import settings
from app.api.dependencies import (
    init_ledger, close_ledger,
    init_diagnostic_collector, close_diagnostic_collector,
    init_snapshot_service,
)
from app.api.routes import orders
from app.api.routes import system
from app.api.routes import menu
from app.api.routes import hardware
from app.api.routes import printing
from app.api.routes import payment_routes
from app.api.routes import config
from app.api.routes import staff
from app.api.routes import printers
from app.api.routes import setup_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown."""
    print("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")
    print("  KINDpos \u2014 Nice. Dependable. Yours.")
    print("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")
    print(f"  Terminal: {settings.terminal_id}")
    print(f"  Version:  {settings.app_version}")
    print(f"  Database: {settings.database_path}")

    ledger = await init_ledger()
    print("  Event Ledger: initialized")

    init_snapshot_service(ledger)
    print("  Snapshot Service: initialized (app-scoped)")

    diag_collector = await init_diagnostic_collector()
    diag_collector.start_heartbeat_loop()
    print("  Diagnostic Collector: initialized (heartbeat started)")

    print(f"  Frontend:  {FRONTEND_PATH}")
    print("\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501")

    yield

    print("Shutting down...")
    await close_diagnostic_collector()
    print("Diagnostic Collector closed")
    await close_ledger()
    print("Event Ledger closed")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Nice. Dependable. Yours.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routers — all real endpoints live in their route files
app.include_router(orders.router, prefix="/api/v1")
app.include_router(system.router, prefix="/api/v1")
app.include_router(menu.router, prefix="/api/v1")
app.include_router(hardware.router, prefix="/api/v1")
app.include_router(printing.router, prefix="/api/v1")
app.include_router(payment_routes.router, prefix="/api/v1")
app.include_router(config.router, prefix="/api/v1")
app.include_router(staff.router, prefix="/api/v1")
app.include_router(printers.router, prefix="/api/v1")
app.include_router(setup_routes.router, prefix="/api/v1")
app.include_router(setup_routes.modifiers_router, prefix="/api/v1")


# ── Health Check ──
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "terminal_id": settings.terminal_id,
    }


# ── Frontend Serving ──
if getattr(sys, 'frozen', False):
    BASE_PATH = sys._MEIPASS
else:
    BASE_PATH = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

FRONTEND_PATH = os.path.join(BASE_PATH, 'frontend')


@app.get("/")
async def serve_index():
    index_path = os.path.join(FRONTEND_PATH, 'index.html')
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Frontend not found", "expected": FRONTEND_PATH}


# Mount frontend static files — MUST be last
if os.path.exists(FRONTEND_PATH):
    app.mount("/", StaticFiles(directory=FRONTEND_PATH, html=True), name="frontend")