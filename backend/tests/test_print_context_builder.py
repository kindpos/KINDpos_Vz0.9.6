"""
Print Context Builder Tests
============================
Tests PrintContextBuilder — the service that assembles context dicts
from ledger projections for receipt and ticket rendering.

The current implementation returns skeleton dicts (TODO stubs).
These tests lock down the contract so that when the real logic lands,
it doesn't silently break callers.
"""

import os
import pytest
import pytest_asyncio
from pathlib import Path

from app.core.event_ledger import EventLedger
from app.core.events import (
    order_created, item_added, item_sent, payment_initiated,
    payment_confirmed, tip_adjusted,
)
from app.services.print_context_builder import PrintContextBuilder
from app.config import settings

TEST_DB = Path("./data/test_print_context_builder.db")


@pytest_asyncio.fixture
async def ledger():
    if TEST_DB.exists():
        os.remove(TEST_DB)
    async with EventLedger(str(TEST_DB)) as _ledger:
        yield _ledger
    if TEST_DB.exists():
        os.remove(TEST_DB)


@pytest_asyncio.fixture
async def builder(ledger):
    return PrintContextBuilder(ledger)


@pytest_asyncio.fixture
async def seeded_order(ledger):
    """Create a complete order in the ledger and return its id."""
    oid = "order_ctx_001"
    pid = "pay_ctx_001"

    await ledger.append(order_created(
        terminal_id=settings.terminal_id,
        order_id=oid, table="T5", server_id="s1", server_name="Alice",
        order_type="dine_in", guest_count=2,
        correlation_id=oid,
    ))
    await ledger.append(item_added(
        terminal_id=settings.terminal_id,
        order_id=oid, item_id="it1", menu_item_id="m1",
        name="Burger", price=12.99, quantity=1, category="Entrees",
    ))
    await ledger.append(item_added(
        terminal_id=settings.terminal_id,
        order_id=oid, item_id="it2", menu_item_id="m2",
        name="Fries", price=5.99, quantity=2, category="Sides",
    ))
    await ledger.append(item_sent(
        terminal_id=settings.terminal_id,
        order_id=oid, item_id="it1", name="Burger",
    ))
    await ledger.append(payment_initiated(
        terminal_id=settings.terminal_id,
        order_id=oid, payment_id=pid, amount=25.96, method="card",
    ))
    await ledger.append(payment_confirmed(
        terminal_id=settings.terminal_id,
        order_id=oid, payment_id=pid,
        transaction_id="txn_001", amount=25.96,
    ))
    await ledger.append(tip_adjusted(
        terminal_id=settings.terminal_id,
        order_id=oid, payment_id=pid, tip_amount=5.00,
    ))
    return oid


# ── Receipt context ──────────────────────────────────────────────────


class TestBuildReceiptContext:

    async def test_returns_dict_with_required_keys(self, builder, seeded_order):
        ctx = await builder.build_receipt_context(seeded_order)
        assert isinstance(ctx, dict)
        assert ctx["order_id"] == seeded_order
        assert "is_reprint" in ctx
        assert "copy_type" in ctx

    async def test_customer_copy_default(self, builder, seeded_order):
        ctx = await builder.build_receipt_context(seeded_order)
        assert ctx["copy_type"] == "customer"

    async def test_merchant_copy(self, builder, seeded_order):
        ctx = await builder.build_receipt_context(seeded_order, copy_type="merchant")
        assert ctx["copy_type"] == "merchant"

    async def test_reprint_flag(self, builder, seeded_order):
        ctx = await builder.build_receipt_context(seeded_order, is_reprint=True)
        assert ctx["is_reprint"] is True

    async def test_nonexistent_order_returns_empty_items(self, builder):
        ctx = await builder.build_receipt_context("order_nonexistent")
        assert ctx["items"] == []


# ── Kitchen context ──────────────────────────────────────────────────


class TestBuildKitchenContext:

    async def test_returns_dict_with_required_keys(self, builder, seeded_order):
        ctx = await builder.build_kitchen_context(seeded_order, station_name="Grill")
        assert isinstance(ctx, dict)
        assert ctx["order_id"] == seeded_order
        assert ctx["station_name"] == "Grill"
        assert "is_reprint" in ctx

    async def test_reprint_flag(self, builder, seeded_order):
        ctx = await builder.build_kitchen_context(
            seeded_order, station_name="Grill", is_reprint=True,
        )
        assert ctx["is_reprint"] is True


# ── Delivery kitchen context ─────────────────────────────────────────


class TestBuildDeliveryKitchenContext:

    async def test_returns_dict_with_required_keys(self, builder, seeded_order):
        ctx = await builder.build_delivery_kitchen_context(seeded_order)
        assert isinstance(ctx, dict)
        assert ctx["order_id"] == seeded_order
        assert "is_reprint" in ctx
        assert "items" in ctx

    async def test_reprint_flag(self, builder, seeded_order):
        ctx = await builder.build_delivery_kitchen_context(
            seeded_order, is_reprint=True,
        )
        assert ctx["is_reprint"] is True


# ── Driver receipt context ───────────────────────────────────────────


class TestBuildDriverReceiptContext:

    async def test_returns_dict_with_required_keys(self, builder, seeded_order):
        ctx = await builder.build_driver_receipt_context(seeded_order)
        assert isinstance(ctx, dict)
        assert ctx["order_id"] == seeded_order
        assert "is_reprint" in ctx
        assert "items" in ctx

    async def test_reprint_flag(self, builder, seeded_order):
        ctx = await builder.build_driver_receipt_context(
            seeded_order, is_reprint=True,
        )
        assert ctx["is_reprint"] is True
