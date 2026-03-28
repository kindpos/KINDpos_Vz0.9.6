"""
KINDpos Printer Discovery API Tests
====================================
Tests for the /api/v1/printers/* endpoints:
    - GET  /scan   — network scan for port 9100
    - POST /test   — send test print
    - POST /save   — persist printer config
    - GET  /saved  — list saved printers
"""

import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from pathlib import Path

from app.core.event_ledger import EventLedger
from app.api import dependencies as deps

TEST_DB = Path("./data/test_printer_api.db")


@pytest_asyncio.fixture
async def ledger():
    """Fresh EventLedger per test."""
    if TEST_DB.exists():
        os.remove(TEST_DB)
    async with EventLedger(str(TEST_DB)) as _ledger:
        yield _ledger
    if TEST_DB.exists():
        os.remove(TEST_DB)


@pytest_asyncio.fixture
async def client(ledger):
    """AsyncClient wired to the real FastAPI app with a test ledger."""
    from app.main import app

    async def _override_ledger():
        return ledger

    app.dependency_overrides[deps.get_ledger] = _override_ledger

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ── GET /api/v1/printers/scan ──────────────────────────


class TestPrinterScan:
    """Tests for GET /api/v1/printers/scan"""

    async def test_scan_returns_valid_structure(self, client):
        """Response has subnet, printers list, scan_time_ms, timestamp."""
        resp = await client.get("/api/v1/printers/scan")
        assert resp.status_code == 200
        data = resp.json()
        assert "subnet" in data
        assert "printers" in data
        assert isinstance(data["printers"], list)
        assert "scan_time_ms" in data
        assert "timestamp" in data

    async def test_scan_handles_no_printers_found(self, client):
        """Returns empty printers list, not an error."""
        resp = await client.get("/api/v1/printers/scan")
        assert resp.status_code == 200
        data = resp.json()
        # In test environment, unlikely to find real printers
        assert isinstance(data["printers"], list)

    async def test_scan_completes_in_reasonable_time(self, client):
        """Scan completes and returns a scan_time_ms value."""
        resp = await client.get("/api/v1/printers/scan", timeout=60.0)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["scan_time_ms"], int)


# ── POST /api/v1/printers/test ─────────────────────────


class TestPrinterTest:
    """Tests for POST /api/v1/printers/test"""

    async def test_test_requires_ip(self, client):
        """Returns 422 without ip field."""
        resp = await client.post("/api/v1/printers/test", json={})
        assert resp.status_code == 422

    async def test_test_returns_success_structure(self, client):
        """Response has success, ip, and response_ms fields."""
        # Use a known-unreachable IP (RFC 5737 TEST-NET)
        resp = await client.post("/api/v1/printers/test", json={
            "ip": "192.0.2.1", "port": 9100
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "success" in data
        assert "ip" in data
        assert data["ip"] == "192.0.2.1"

    async def test_test_handles_unreachable_printer(self, client):
        """Returns success=false for unreachable IP."""
        resp = await client.post("/api/v1/printers/test", json={
            "ip": "192.0.2.1", "port": 9100
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "error" in data


# ── POST /api/v1/printers/save ─────────────────────────


class TestPrinterSave:
    """Tests for POST /api/v1/printers/save"""

    async def test_save_requires_name_and_ip(self, client):
        """Returns 422 without required fields."""
        resp = await client.post("/api/v1/printers/save", json={})
        assert resp.status_code == 422

    async def test_save_returns_printer_id(self, client):
        """Response has success=true and printer_id."""
        resp = await client.post("/api/v1/printers/save", json={
            "name": "Kitchen",
            "ip": "192.168.1.100",
            "port": 9100,
            "role": "kitchen",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "printer_id" in data
        assert data["printer_id"].startswith("printer_")

    async def test_save_validates_role(self, client):
        """Only accepts valid roles: kitchen, bar, receipt, backup."""
        resp = await client.post("/api/v1/printers/save", json={
            "name": "Test",
            "ip": "192.168.1.100",
            "role": "invalid_role",
        })
        assert resp.status_code == 422

    async def test_save_validates_ip(self, client):
        """Rejects malformed IP addresses."""
        resp = await client.post("/api/v1/printers/save", json={
            "name": "Test",
            "ip": "not-an-ip",
            "role": "kitchen",
        })
        assert resp.status_code == 422

    async def test_save_persists_to_ledger(self, client):
        """After save, GET /saved returns the printer."""
        # Save a printer
        save_resp = await client.post("/api/v1/printers/save", json={
            "name": "Bar Printer",
            "ip": "192.168.1.101",
            "port": 9100,
            "role": "bar",
        })
        assert save_resp.status_code == 200
        printer_id = save_resp.json()["printer_id"]

        # Verify it appears in saved list
        saved_resp = await client.get("/api/v1/printers/saved")
        assert saved_resp.status_code == 200
        printers = saved_resp.json()["printers"]
        assert any(p["id"] == printer_id for p in printers)


# ── GET /api/v1/printers/saved ─────────────────────────


class TestPrinterSaved:
    """Tests for GET /api/v1/printers/saved"""

    async def test_saved_returns_list(self, client):
        """Response has printers array."""
        resp = await client.get("/api/v1/printers/saved")
        assert resp.status_code == 200
        data = resp.json()
        assert "printers" in data
        assert isinstance(data["printers"], list)

    async def test_saved_empty_when_none_configured(self, client):
        """Returns empty list when no printers saved."""
        resp = await client.get("/api/v1/printers/saved")
        assert resp.status_code == 200
        data = resp.json()
        assert data["printers"] == []

    async def test_saved_printers_have_required_fields(self, client):
        """Each saved printer has id, name, ip, port, role, online."""
        # Save a printer first
        await client.post("/api/v1/printers/save", json={
            "name": "Receipt",
            "ip": "192.168.1.50",
            "role": "receipt",
        })

        resp = await client.get("/api/v1/printers/saved")
        data = resp.json()
        assert len(data["printers"]) == 1

        p = data["printers"][0]
        assert "id" in p
        assert p["name"] == "Receipt"
        assert p["ip"] == "192.168.1.50"
        assert p["port"] == 9100
        assert p["role"] == "receipt"
        assert "online" in p
