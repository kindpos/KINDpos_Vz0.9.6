"""
Payment Sale Endpoint & Close-Batch Tests
==========================================
Covers two critical gaps:
  1. POST /payments/sale — card sale through route layer with validator
  2. POST /orders/close-batch — batch settlement flow
"""

import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from pathlib import Path
from decimal import Decimal

from app.config import settings
from app.core.event_ledger import EventLedger
from app.core.events import EventType
from app.api import dependencies as deps

TEST_DB = Path("./data/test_payment_sale_batch.db")


@pytest_asyncio.fixture
async def ledger():
    if TEST_DB.exists():
        os.remove(TEST_DB)
    async with EventLedger(str(TEST_DB)) as _ledger:
        yield _ledger
    if TEST_DB.exists():
        os.remove(TEST_DB)


@pytest_asyncio.fixture
async def client(ledger):
    from app.main import app
    from app.api.routes import payment_routes

    # Reset module-level singletons so each test gets a fresh manager
    payment_routes._manager = None
    payment_routes._validator = None
    payment_routes._mock_initialized = False

    async def _override_ledger():
        return ledger

    app.dependency_overrides[deps.get_ledger] = _override_ledger
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

    # Clean up singletons after test
    payment_routes._manager = None
    payment_routes._validator = None
    payment_routes._mock_initialized = False


API = "/api/v1"


async def _create_order_with_item(client, price=10.00):
    """Helper: create an order with one item and return order_id."""
    resp = await client.post(f"{API}/orders", json={
        "table": "T1", "server_id": "s1", "server_name": "Bob",
    })
    assert resp.status_code == 201
    order_id = resp.json()["order_id"]

    await client.post(f"{API}/orders/{order_id}/items", json={
        "menu_item_id": "m1", "name": "Burger", "price": price, "quantity": 1,
    })
    return order_id


async def _pay_cash_and_close(client, order_id, amount):
    """Helper: pay with cash and auto-close."""
    resp = await client.post(f"{API}/payments/cash", json={
        "order_id": order_id, "amount": amount,
    })
    assert resp.status_code == 200
    return resp.json()


# ═════════════════════════════════════════════════════════════════════
# PAYMENT SALE ENDPOINT
# ═════════════════════════════════════════════════════════════════════


class TestPaymentSaleEndpoint:

    async def test_sale_approved(self, client):
        """POST /payments/sale succeeds with mock device and valid request."""
        order_id = await _create_order_with_item(client, price=25.00)

        resp = await client.post(f"{API}/payments/sale", json={
            "order_id": order_id,
            "amount": "26.75",
            "terminal_id": settings.terminal_id,
            "server_id": "s1",
        })
        assert resp.status_code == 200
        body = resp.json()
        # MockPaymentDevice always approves
        assert body["status"] == "APPROVED"
        assert "transaction_id" in body

    async def test_sale_zero_amount_rejected(self, client):
        """Validator rejects amount <= 0."""
        order_id = await _create_order_with_item(client)

        resp = await client.post(f"{API}/payments/sale", json={
            "order_id": order_id,
            "amount": "0.00",
            "terminal_id": settings.terminal_id,
            "server_id": "s1",
        })
        assert resp.status_code == 400
        assert "Amount must be greater than zero" in resp.json()["detail"]

    async def test_sale_negative_tip_rejected(self, client):
        """Validator rejects negative tip."""
        order_id = await _create_order_with_item(client)

        resp = await client.post(f"{API}/payments/sale", json={
            "order_id": order_id,
            "amount": "10.00",
            "tip_amount": "-5.00",
            "terminal_id": settings.terminal_id,
            "server_id": "s1",
        })
        assert resp.status_code == 400
        assert "negative" in resp.json()["detail"].lower()

    async def test_sale_excessive_tip_needs_approval(self, client):
        """Validator returns NEEDS_APPROVAL for tip exceeding ceiling."""
        order_id = await _create_order_with_item(client, price=20.00)

        resp = await client.post(f"{API}/payments/sale", json={
            "order_id": order_id,
            "amount": "20.00",
            "tip_amount": "200.00",
            "terminal_id": settings.terminal_id,
            "server_id": "s1",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "NEEDS_APPROVAL"

    async def test_sale_over_max_total_rejected(self, client):
        """Validator rejects total > $10,000."""
        order_id = await _create_order_with_item(client, price=100.00)

        resp = await client.post(f"{API}/payments/sale", json={
            "order_id": order_id,
            "amount": "10001.00",
            "terminal_id": settings.terminal_id,
            "server_id": "s1",
        })
        assert resp.status_code == 400
        assert "maximum" in resp.json()["detail"].lower()

    async def test_sale_emits_ledger_events(self, client, ledger):
        """Approved sale writes PAYMENT_INITIATED event to ledger."""
        order_id = await _create_order_with_item(client, price=15.00)

        await client.post(f"{API}/payments/sale", json={
            "order_id": order_id,
            "amount": "16.05",
            "terminal_id": settings.terminal_id,
            "server_id": "s1",
        })

        events = await ledger.get_events_by_type(EventType.PAYMENT_INITIATED)
        sale_events = [e for e in events if e.payload.get("order_id") == order_id]
        assert len(sale_events) >= 1


# ═════════════════════════════════════════════════════════════════════
# CLOSE-BATCH ENDPOINT
# ═════════════════════════════════════════════════════════════════════


class TestCloseBatchEndpoint:

    async def test_close_batch_empty(self, client):
        """Close-batch with no orders succeeds with zero totals."""
        resp = await client.post(f"{API}/orders/close-batch")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["orders_closed_now"] == 0
        assert body["batch_total"] == 0.0

    async def test_close_batch_closes_open_orders(self, client, ledger):
        """Close-batch auto-closes open orders and emits settlement events."""
        oid1 = await _create_order_with_item(client, price=10.00)
        oid2 = await _create_order_with_item(client, price=20.00)

        resp = await client.post(f"{API}/orders/close-batch")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["orders_closed_now"] == 2

        # Verify BATCH_SUBMITTED and BATCH_CLOSED events were emitted
        batch_sub = await ledger.get_events_by_type(EventType.BATCH_SUBMITTED)
        batch_close = await ledger.get_events_by_type(EventType.BATCH_CLOSED)
        assert len(batch_sub) >= 1
        assert len(batch_close) >= 1

    async def test_close_batch_with_paid_orders(self, client, ledger):
        """Close-batch computes correct totals from paid orders."""
        oid = await _create_order_with_item(client, price=10.00)

        # Pay the order with cash (total = 10.00 + 7% tax = 10.70)
        order_resp = await client.get(f"{API}/orders/{oid}")
        total = order_resp.json()["total"]
        await _pay_cash_and_close(client, oid, total)

        resp = await client.post(f"{API}/orders/close-batch")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["batch_total"] > 0
        assert body["cash_total"] > 0
        assert body["order_count"] >= 1

    async def test_close_batch_settlement_record_payload(self, client, ledger):
        """BATCH_SUBMITTED event payload contains expected fields."""
        oid = await _create_order_with_item(client, price=15.00)
        order_resp = await client.get(f"{API}/orders/{oid}")
        total = order_resp.json()["total"]
        await _pay_cash_and_close(client, oid, total)

        await client.post(f"{API}/orders/close-batch")

        batch_events = await ledger.get_events_by_type(EventType.BATCH_SUBMITTED)
        assert len(batch_events) >= 1
        payload = batch_events[-1].payload
        assert "order_count" in payload
        assert "total_amount" in payload
        assert "cash_total" in payload
        assert "card_total" in payload
        assert "order_ids" in payload
        assert "submitted_at" in payload

    async def test_close_batch_idempotent(self, client):
        """Second close-batch with no new orders produces zero closures."""
        oid = await _create_order_with_item(client, price=10.00)

        # First close-batch closes the open order
        resp1 = await client.post(f"{API}/orders/close-batch")
        assert resp1.json()["orders_closed_now"] == 1

        # Second close-batch — nothing new to close
        resp2 = await client.post(f"{API}/orders/close-batch")
        assert resp2.json()["orders_closed_now"] == 0
