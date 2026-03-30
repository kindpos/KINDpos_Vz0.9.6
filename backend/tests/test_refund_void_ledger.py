"""
Refund / Void Ledger Integrity Tests
=====================================
Verifies that refund and void events correctly reference original
payments, that financial summaries reflect the adjustments, that
double-refunds are detectable, and that the hash chain remains
valid throughout.
"""

import os
import uuid
import pytest
import pytest_asyncio
from pathlib import Path

from app.core.event_ledger import EventLedger
from app.core.events import (
    EventType,
    create_event,
    order_created,
    item_added,
    payment_initiated,
    payment_confirmed,
    order_voided,
)
from app.core.projections import project_order, project_orders


# ─── Isolated test database ────────────────────────────────
RV_TEST_DB = Path("./data/test_refund_void_ledger.db")

TERMINAL = "terminal-rv-01"
TAX_RATE = 0.0  # Zero tax for clean arithmetic


@pytest_asyncio.fixture
async def ledger():
    """Fresh EventLedger for refund/void tests."""
    if RV_TEST_DB.exists():
        os.remove(RV_TEST_DB)
    async with EventLedger(str(RV_TEST_DB)) as _ledger:
        yield _ledger
    if RV_TEST_DB.exists():
        os.remove(RV_TEST_DB)


# ─── Helpers ────────────────────────────────────────────────

async def _create_and_pay(ledger, order_id, price, payment_id=None):
    """Create order, add item, pay in full. Returns (order, payment_id, confirm_event)."""
    pid = payment_id or f"pay-{uuid.uuid4().hex[:8]}"
    txn = f"txn-{uuid.uuid4().hex[:8]}"

    await ledger.append(order_created(
        terminal_id=TERMINAL, order_id=order_id, correlation_id=order_id,
    ))
    await ledger.append(item_added(
        terminal_id=TERMINAL, order_id=order_id,
        item_id=f"{order_id}-item-0", menu_item_id="menu-0",
        name="Test Item", price=price, quantity=1,
    ))
    await ledger.append(payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=price, method="card",
    ))
    confirm = await ledger.append(payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, transaction_id=txn, amount=price,
    ))

    events = await ledger.get_events_by_correlation(order_id)
    order = project_order(events, tax_rate=TAX_RATE)
    return order, pid, confirm


async def _emit_refund(ledger, order_id, payment_id, amount):
    """Emit a PAYMENT_REFUNDED event referencing the original payment."""
    evt = create_event(
        event_type=EventType.PAYMENT_REFUNDED,
        terminal_id=TERMINAL,
        payload={
            "order_id": order_id,
            "payment_id": payment_id,
            "refund_id": f"ref-{uuid.uuid4().hex[:8]}",
            "amount": amount,
        },
        correlation_id=order_id,
    )
    return await ledger.append(evt)


async def _emit_void(ledger, order_id, payment_id):
    """Emit a PAYMENT_VOIDED event referencing the original payment."""
    evt = create_event(
        event_type=EventType.PAYMENT_VOIDED,
        terminal_id=TERMINAL,
        payload={
            "order_id": order_id,
            "payment_id": payment_id,
            "void_id": f"void-{uuid.uuid4().hex[:8]}",
        },
        correlation_id=order_id,
    )
    return await ledger.append(evt)


def _net_revenue(events):
    """Compute net revenue: confirmed payments - refunds - voided payments."""
    confirmed = {}
    refunded = 0.0
    voided_pids = set()

    for e in events:
        if e.event_type == EventType.PAYMENT_CONFIRMED:
            pid = e.payload.get("payment_id")
            confirmed[pid] = e.payload.get("amount", 0)
        elif e.event_type == EventType.PAYMENT_REFUNDED:
            refunded += e.payload.get("amount", 0)
        elif e.event_type == EventType.PAYMENT_VOIDED:
            pid = e.payload.get("payment_id")
            voided_pids.add(pid)

    total_confirmed = sum(
        amt for pid, amt in confirmed.items() if pid not in voided_pids
    )
    return round(total_confirmed - refunded, 2)


def _refund_count_for_payment(events, payment_id):
    """Count how many PAYMENT_REFUNDED events target a specific payment_id."""
    return sum(
        1 for e in events
        if e.event_type == EventType.PAYMENT_REFUNDED
        and e.payload.get("payment_id") == payment_id
    )


# ─── Tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refund_references_original_payment(ledger):
    """Refund event must reference the original payment's payment_id."""
    order_id = "order-ref-link"
    order, pid, confirm_evt = await _create_and_pay(ledger, order_id, 50.00)

    refund_evt = await _emit_refund(ledger, order_id, pid, 50.00)

    # The refund event's payload references the original payment_id
    assert refund_evt.payload["payment_id"] == pid
    assert refund_evt.payload["amount"] == 50.00


@pytest.mark.asyncio
async def test_void_references_original_payment(ledger):
    """Void event must reference the original payment's payment_id."""
    order_id = "order-void-link"
    order, pid, confirm_evt = await _create_and_pay(ledger, order_id, 75.00)

    void_evt = await _emit_void(ledger, order_id, pid)

    assert void_evt.payload["payment_id"] == pid


@pytest.mark.asyncio
async def test_revenue_after_refund(ledger):
    """After a refund, revenue = payment − refund."""
    order_id = "order-rev-refund"
    order, pid, _ = await _create_and_pay(ledger, order_id, 100.00)

    await _emit_refund(ledger, order_id, pid, 30.00)

    events = await ledger.get_events_by_correlation(order_id)
    assert _net_revenue(events) == 70.00  # 100 - 30


@pytest.mark.asyncio
async def test_revenue_after_void(ledger):
    """After a void, the voided payment is fully excluded from revenue."""
    order_id = "order-rev-void"
    order, pid, _ = await _create_and_pay(ledger, order_id, 100.00)

    await _emit_void(ledger, order_id, pid)

    events = await ledger.get_events_by_correlation(order_id)
    assert _net_revenue(events) == 0.00  # voided payment excluded entirely


@pytest.mark.asyncio
async def test_double_refund_detectable(ledger):
    """
    Payment → refund → second refund on same payment.
    The system must allow detection: count refunds per payment_id.
    A guard should reject the second refund (we verify the data
    makes double-refund detectable).
    """
    order_id = "order-double-ref"
    order, pid, _ = await _create_and_pay(ledger, order_id, 100.00)

    # First refund
    await _emit_refund(ledger, order_id, pid, 100.00)

    events = await ledger.get_events_by_correlation(order_id)
    assert _refund_count_for_payment(events, pid) == 1

    # A guard checks: already refunded → reject
    already_refunded = _refund_count_for_payment(events, pid) > 0
    assert already_refunded is True  # second refund would be blocked

    # If the guard is bypassed (e.g., append directly), verify
    # the double-refund is detectable in the event stream
    await _emit_refund(ledger, order_id, pid, 100.00)

    events = await ledger.get_events_by_correlation(order_id)
    refund_count = _refund_count_for_payment(events, pid)
    assert refund_count == 2  # two refund events recorded

    # Net revenue goes negative — clear signal of double-refund
    net = _net_revenue(events)
    assert net == -100.00  # 100 confirmed - 100 - 100 = -100


@pytest.mark.asyncio
async def test_hash_chain_valid_after_all_operations(ledger):
    """
    After payment, refund, void operations across multiple orders,
    the hash chain must remain valid.
    """
    # Order A: pay + refund
    _, pid_a, _ = await _create_and_pay(ledger, "order-chain-a", 80.00)
    await _emit_refund(ledger, "order-chain-a", pid_a, 20.00)

    # Order B: pay + void
    _, pid_b, _ = await _create_and_pay(ledger, "order-chain-b", 60.00)
    await _emit_void(ledger, "order-chain-b", pid_b)

    # Order C: pay + full refund
    _, pid_c, _ = await _create_and_pay(ledger, "order-chain-c", 40.00)
    await _emit_refund(ledger, "order-chain-c", pid_c, 40.00)

    # Verify entire chain
    is_valid, invalid_seq = await ledger.verify_chain()
    assert is_valid is True
    assert invalid_seq is None

    # Verify event count (3 orders × 4 events each + 1 refund/void each = 15)
    count = await ledger.count_events()
    assert count == 15  # 3*(created+item+initiated+confirmed) + 3 refund/void
