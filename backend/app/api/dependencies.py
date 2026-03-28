"""
FastAPI Dependencies

Shared dependencies for API routes.
The Event Ledger is managed here as a singleton.
"""

from typing import AsyncGenerator
from app.core.event_ledger import EventLedger
from app.core.adapters.printer_manager import PrinterManager
from app.config import settings

# Global ledger instance (initialized on startup)
_ledger: EventLedger | None = None
_printer_manager: PrinterManager | None = None


async def get_ledger() -> EventLedger:
    """Dependency that provides the Event Ledger."""
    if _ledger is None:
        raise RuntimeError("Event Ledger not initialized")
    return _ledger


async def init_ledger() -> EventLedger:
    """Initialize the Event Ledger on startup."""
    global _ledger
    _ledger = EventLedger(settings.database_path)
    await _ledger.connect()
    return _ledger


async def close_ledger() -> None:
    """Close the Event Ledger on shutdown."""
    global _ledger
    if _ledger:
        await _ledger.close()
        _ledger = None


def get_printer_manager() -> PrinterManager | None:
    """Optional dependency — returns None if PrinterManager not initialized."""
    return _printer_manager


def set_printer_manager(manager: PrinterManager) -> None:
    """Register a PrinterManager instance (called during startup)."""
    global _printer_manager
    _printer_manager = manager
