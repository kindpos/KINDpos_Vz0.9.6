"""
Server Snapshot Service Tests
==============================
Covers all 11 methods of ServerSnapshotService:
  - _get_all_orders / invalidate_cache
  - get_server_orders
  - get_server_sales
  - get_server_checks
  - get_server_tips
  - calculate_tip_out
  - get_checkout_blockers
  - adjust_tip
  - get_server_hourly_guest_pace
  - get_server_category_mix
"""

import os
import pytest
import pytest_asyncio
from pathlib import Path

from app.config import settings
from app.core.event_ledger import EventLedger
from app.core.events import (
    order_created, item_added, payment_initiated, payment_confirmed,
    tip_adjusted, order_closed, order_voided, EventType,
)
from app.services.server_snapshot_service import ServerSnapshotService
from types import SimpleNamespace

T = settings.terminal_id
TEST_DB = Path("./data/test_server_snapshot.db")


@pytest_asyncio.fixture
async def ledger():
    if TEST_DB.exists():
        os.remove(TEST_DB)
    async with EventLedger(str(TEST_DB)) as _ledger:
        yield _ledger
    if TEST_DB.exists():
        os.remove(TEST_DB)


@pytest_asyncio.fixture
async def svc(ledger):
    return ServerSnapshotService(ledger)


# ── Helpers ──────────────────────────────────────────────────────────


async def _make_order(ledger, order_id, server_id="s1", table="T1",
                      items=None, guest_count=2):
    """Seed an order with items into the ledger."""
    await ledger.append(order_created(
        terminal_id=T, order_id=order_id, table=table,
        server_id=server_id, server_name="Alice",
        order_type="dine_in", guest_count=guest_count,
        correlation_id=order_id,
    ))
    for it in (items or [{"id": "it1", "name": "Burger", "price": 10.00, "cat": "Food"}]):
        await ledger.append(item_added(
            terminal_id=T, order_id=order_id,
            item_id=it["id"], menu_item_id=f"m_{it['id']}",
            name=it["name"], price=it["price"], quantity=1,
            category=it.get("cat", "Food"),
        ))


async def _pay_order(ledger, order_id, amount, method="card", tip=0.0):
    """Pay and optionally tip an order."""
    pid = f"pay_{order_id}"
    await ledger.append(payment_initiated(
        terminal_id=T, order_id=order_id,
        payment_id=pid, amount=amount, method=method,
    ))
    await ledger.append(payment_confirmed(
        terminal_id=T, order_id=order_id,
        payment_id=pid, transaction_id=f"txn_{order_id}", amount=amount,
    ))
    if tip > 0:
        await ledger.append(tip_adjusted(
            terminal_id=T, order_id=order_id,
            payment_id=pid, tip_amount=tip,
        ))
    return pid


async def _close_order(ledger, order_id, total):
    await ledger.append(order_closed(
        terminal_id=T, order_id=order_id, total=total,
    ))


# ═══���═════════════════════════════════════════════════════════════════
# CACHE
# ══════════════════════════���══════════════════════════════════════════


class TestCache:

    async def test_cache_populated_on_first_call(self, svc, ledger):
        await _make_order(ledger, "o1")
        orders = await svc._get_all_orders()
        assert "o1" in orders
        assert svc._orders_cache is not None

    async def test_cache_reused(self, svc, ledger):
        await _make_order(ledger, "o1")
        first = await svc._get_all_orders()
        second = await svc._get_all_orders()
        assert first is second  # same dict object

    async def test_invalidate_cache(self, svc, ledger):
        await _make_order(ledger, "o1")
        await svc._get_all_orders()
        svc.invalidate_cache()
        assert svc._orders_cache is None


# ════════════════════════════��════════════════════════════════════════
# SERVER ORDERS
# ═════════════════════════════════════════════════��═══════════════════


class TestGetServerOrders:

    async def test_returns_only_matching_server(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        await _make_order(ledger, "o2", server_id="s2")
        orders = await svc.get_server_orders("s1")
        assert len(orders) == 1
        assert orders[0].order_id == "o1"

    async def test_empty_for_unknown_server(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        orders = await svc.get_server_orders("nobody")
        assert orders == []


# ══════════════════════════��══════════════════════════════════════════
# SERVER SALES
# ═══════════════════���════════════════════════════════��════════════════


class TestGetServerSales:

    async def test_sales_with_one_order(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1",
                          items=[{"id": "i1", "name": "Steak", "price": 30.00}])
        sales = await svc.get_server_sales("s1")
        assert sales["net_sales"] == 30.00
        assert sales["covers"] == 2
        assert sales["per_cover_avg"] == 15.00

    async def test_voided_orders_excluded_from_sales(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1",
                          items=[{"id": "i1", "name": "Steak", "price": 30.00}])
        await ledger.append(order_voided(
            terminal_id=T, order_id="o1", reason="customer left",
        ))
        svc.invalidate_cache()
        sales = await svc.get_server_sales("s1")
        assert sales["net_sales"] == 0.0
        assert sales["void_total"] > 0

    async def test_zero_covers_no_divide_by_zero(self, svc, ledger):
        sales = await svc.get_server_sales("nobody")
        assert sales["per_cover_avg"] == 0


# ���═══════════════════════════════���════════════════════════���═══════════
# SERVER CHECKS
# ══════════════���═══════════════════════════════════════��══════════════


class TestGetServerChecks:

    async def test_open_and_closed_counts(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1", table="T1")
        await _make_order(ledger, "o2", server_id="s1", table="T2")
        # Close o1
        await _pay_order(ledger, "o1", 10.70)
        await _close_order(ledger, "o1", 10.70)
        svc.invalidate_cache()

        checks = await svc.get_server_checks("s1")
        assert checks["closed_count"] == 1
        assert checks["open_count"] == 1
        assert checks["tables_turned"] == 1

    async def test_voided_excluded_from_open(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        await ledger.append(order_voided(
            terminal_id=T, order_id="o1", reason="mistake",
        ))
        svc.invalidate_cache()
        checks = await svc.get_server_checks("s1")
        assert checks["open_count"] == 0
        assert checks["closed_count"] == 0


# ════════════════════════════════════════════��════════════════════════
# SERVER TIPS
# ════════��═════════════════════════════��══════════════════════════════


class TestGetServerTips:

    async def test_tips_from_closed_order(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        await _pay_order(ledger, "o1", 10.70, tip=5.00)
        await _close_order(ledger, "o1", 10.70)
        svc.invalidate_cache()

        tips = await svc.get_server_tips("s1")
        assert tips["tips_earned"] == 5.00
        assert tips["pending_tips"] == 0.0
        assert len(tips["tip_list"]) == 1

    async def test_pending_tips_from_open_order(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        await _pay_order(ledger, "o1", 10.70, tip=3.00)
        # NOT closed — tip is pending
        tips = await svc.get_server_tips("s1")
        assert tips["pending_tips"] == 3.00
        assert tips["tips_earned"] == 0.0

    async def test_voided_orders_excluded(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        await _pay_order(ledger, "o1", 10.70, tip=5.00)
        await ledger.append(order_voided(
            terminal_id=T, order_id="o1", reason="fraud",
        ))
        svc.invalidate_cache()
        tips = await svc.get_server_tips("s1")
        assert tips["tips_earned"] == 0.0
        assert tips["pending_tips"] == 0.0


# ═════���═══════════════════════════════════════════════════════════════
# TIP-OUT CALCULATION
# ═════════��═══════��═════════════════════════════════���═════════════════


class TestCalculateTipOut:

    async def test_tip_out_with_rules(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1",
                          items=[{"id": "i1", "name": "Steak", "price": 100.00}])
        await _pay_order(ledger, "o1", 107.00, tip=20.00)
        await _close_order(ledger, "o1", 107.00)
        svc.invalidate_cache()

        # NOTE: ServerSnapshotService.calculate_tip_out accesses rule.basis
        # and rule.role_name, which are NOT on the TipoutRule Pydantic model.
        # Using SimpleNamespace to match what the code actually expects.
        rules = [
            SimpleNamespace(
                basis="totalSales", role_name="Bartender", percentage=0.02,
            ),
        ]
        result = await svc.calculate_tip_out("s1", rules=rules)
        assert result["total_owed"] == 100.00 * 0.02  # 2% of net sales
        assert len(result["breakdown"]) == 1
        assert result["walk_with"] == 20.00 - 2.00

    async def test_tip_out_no_rules(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1",
                          items=[{"id": "i1", "name": "Fries", "price": 5.00}])
        await _pay_order(ledger, "o1", 5.35, tip=2.00)
        await _close_order(ledger, "o1", 5.35)
        svc.invalidate_cache()

        result = await svc.calculate_tip_out("s1")
        assert result["total_owed"] == 0.0
        assert result["walk_with"] == 2.00


# ═════════════════════════════════════════════════════════════════════
# CHECKOUT BLOCKERS
# ══��═════════════════════════════��════════════════════════════════════


class TestGetCheckoutBlockers:

    async def test_open_check_blocks_checkout(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        blockers = await svc.get_checkout_blockers("s1")
        assert blockers["is_ready"] is False
        assert blockers["has_open_tables"] is True
        assert len(blockers["open_checks"]) == 1

    async def test_all_closed_is_ready(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        await _pay_order(ledger, "o1", 10.70, tip=3.00)
        await _close_order(ledger, "o1", 10.70)
        svc.invalidate_cache()

        blockers = await svc.get_checkout_blockers("s1")
        # Tip was adjusted so is_adjusted=True — no unadjusted blockers
        assert blockers["has_open_tables"] is False
        assert blockers["is_ready"] is True

    async def test_no_orders_is_ready(self, svc, ledger):
        blockers = await svc.get_checkout_blockers("s1")
        assert blockers["is_ready"] is True
        assert blockers["blocker_count"] == 0


# ══════���══════════════════════════════════════════════════════════════
# ADJUST TIP (write operation)
# ═══════════════���═════════════════════════════════════════════════════


class TestAdjustTip:

    async def test_adjust_tip_writes_event(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        pid = await _pay_order(ledger, "o1", 10.70)
        svc.invalidate_cache()

        event = await svc.adjust_tip("T-01", "o1", pid, 5.00)
        assert event.event_type == EventType.TIP_ADJUSTED
        assert event.payload["tip_amount"] == 5.00

    async def test_adjust_tip_auto_finds_payment(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        await _pay_order(ledger, "o1", 10.70, method="card")
        svc.invalidate_cache()

        event = await svc.adjust_tip("T-01", "o1", "auto", 7.50)
        assert event.payload["tip_amount"] == 7.50

    async def test_adjust_tip_invalidates_cache(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        pid = await _pay_order(ledger, "o1", 10.70)
        svc.invalidate_cache()

        await svc._get_all_orders()  # populate cache
        assert svc._orders_cache is not None
        await svc.adjust_tip("T-01", "o1", pid, 4.00)
        assert svc._orders_cache is None  # cache was invalidated

    async def test_adjust_tip_nonexistent_order_raises(self, svc, ledger):
        with pytest.raises(ValueError, match="not found"):
            await svc.adjust_tip("T-01", "ghost_order", "pay1", 5.00)

    async def test_adjust_tip_no_payment_raises(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1")
        # No payment on this order
        with pytest.raises(ValueError, match="No payment found"):
            await svc.adjust_tip("T-01", "o1", "auto", 5.00)


# ═══════���═════════════════════════════════════════════════════════════
# HOURLY GUEST PACE
# ═════════════════════════════��══════════════════════════════════════���


class TestGetServerHourlyGuestPace:

    async def test_hourly_pace(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1", guest_count=3)
        await _make_order(ledger, "o2", server_id="s1", guest_count=2)

        pace = await svc.get_server_hourly_guest_pace("s1")
        assert isinstance(pace, list)
        # Both orders created in the same hour, so one entry
        total_guests = sum(entry["count"] for entry in pace)
        assert total_guests == 5

    async def test_voided_excluded(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1", guest_count=4)
        await ledger.append(order_voided(
            terminal_id=T, order_id="o1", reason="test",
        ))
        svc.invalidate_cache()
        pace = await svc.get_server_hourly_guest_pace("s1")
        total = sum(e["count"] for e in pace)
        assert total == 0


# ══���════════════════════════════���════════════════════════���════════════
# CATEGORY MIX
# ═══════════════════════════════════════════��═════════════════════════


class TestGetServerCategoryMix:

    async def test_category_mix(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1", items=[
            {"id": "i1", "name": "Burger", "price": 15.00, "cat": "Food"},
            {"id": "i2", "name": "Beer", "price": 7.00, "cat": "Beverage"},
            {"id": "i3", "name": "Fries", "price": 5.00, "cat": "Food"},
        ])
        mix = await svc.get_server_category_mix("s1")
        assert isinstance(mix, list)
        # Food should be first (higher revenue: 20.00 vs 7.00)
        assert mix[0]["category"] == "Food"
        assert mix[0]["total"] == 20.00
        assert mix[1]["category"] == "Beverage"
        assert mix[1]["total"] == 7.00

    async def test_voided_excluded(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1", items=[
            {"id": "i1", "name": "Wings", "price": 12.00, "cat": "Food"},
        ])
        await ledger.append(order_voided(
            terminal_id=T, order_id="o1", reason="test",
        ))
        svc.invalidate_cache()
        mix = await svc.get_server_category_mix("s1")
        assert mix == []

    async def test_top_items_limited_to_three(self, svc, ledger):
        await _make_order(ledger, "o1", server_id="s1", items=[
            {"id": "i1", "name": "A", "price": 10.00, "cat": "Food"},
            {"id": "i2", "name": "B", "price": 8.00, "cat": "Food"},
            {"id": "i3", "name": "C", "price": 6.00, "cat": "Food"},
            {"id": "i4", "name": "D", "price": 4.00, "cat": "Food"},
        ])
        mix = await svc.get_server_category_mix("s1")
        assert len(mix[0]["top_items"]) == 3
