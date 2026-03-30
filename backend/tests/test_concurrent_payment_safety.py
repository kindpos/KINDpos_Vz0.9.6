"""
Concurrent Payment Safety Tests
================================
Verifies that concurrent payment operations against the same order
are serialized correctly by the asyncio write lock, producing
consistent state with no duplicate or corrupted events.
"""

import asyncio
import os
import uuid
import pytest
import pytest_asyncio
from pathlib import Path

from app.core.event_ledger import EventLedger
from app.core.events import (
    EventType,
    order_created,
    item_added,
    payment_initiated,
    payment_confirmed,
    tip_adjusted,
)
from app.core.projections import project_order


# ─── Isolated test database ────────────────────────────────
CONC_TEST_DB = Path("./data/test_concurrent_payment_safety.db")

TERMINAL = "terminal-conc-01"
TAX_RATE = 0.0  # Zero tax for clean arithmetic


@pytest_asyncio.fixture
async def ledger():
    """Fresh EventLedger for concurrency tests."""
    if CONC_TEST_DB.exists():
        os.remove(CONC_TEST_DB)
    async with EventLedger(str(CONC_TEST_DB)) as _ledger:
        yield _ledger
    if CONC_TEST_DB.exists():
        os.remove(CONC_TEST_DB)


# ─── Helpers ────────────────────────────────────────────────

async def _create_order(ledger, order_id, price):
    """Create an order with a single item."""
    evt = order_created(terminal_id=TERMINAL, order_id=order_id, correlation_id=order_id)
    await ledger.append(evt)
    evt = item_added(
        terminal_id=TERMINAL, order_id=order_id,
        item_id=f"{order_id}-item-0", menu_item_id="menu-0",
        name="Test Item", price=price, quantity=1,
    )
    await ledger.append(evt)


async def _full_payment_flow(ledger, order_id, amount, payment_id):
    """Initiate + confirm a payment. Returns the confirmed event."""
    txn = f"txn-{uuid.uuid4().hex[:8]}"
    init_evt = payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=payment_id, amount=amount, method="card",
    )
    await ledger.append(init_evt)
    confirm_evt = payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=payment_id, transaction_id=txn, amount=amount,
    )
    await ledger.append(confirm_evt)


async def _project(ledger, order_id):
    events = await ledger.get_events_by_correlation(order_id)
    return project_order(events, tax_rate=TAX_RATE)


# ─── Tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_concurrent_full_payments_both_serialized(ledger):
    """
    Submit two full payments concurrently via asyncio.gather.
    The write lock serializes them — both append successfully.
    Verify the ledger records both and the projected state is consistent.
    Only one should logically succeed in a real system (checked at route level),
    but at the ledger level, the lock prevents corruption.
    """
    order_id = "order-conc-double"
    await _create_order(ledger, order_id, 100.00)

    pid_a = "pay-conc-a"
    pid_b = "pay-conc-b"

    # Fire both payment flows concurrently
    await asyncio.gather(
        _full_payment_flow(ledger, order_id, 100.00, pid_a),
        _full_payment_flow(ledger, order_id, 100.00, pid_b),
    )

    # Both payments were serialized through the lock — no corruption
    order = await _project(ledger, order_id)
    confirmed = [p for p in order.payments if p.status == "confirmed"]

    # Both were recorded (the ledger is append-only; business rejection is route-level)
    assert len(confirmed) == 2
    # Total paid is the sum of both
    assert order.amount_paid == 200.00

    # Critically: verify the hash chain is intact (no corruption from concurrency)
    is_valid, invalid_seq = await ledger.verify_chain()
    assert is_valid is True
    assert invalid_seq is None


@pytest.mark.asyncio
async def test_concurrent_tip_and_payment_no_corruption(ledger):
    """
    Submit a tip adjustment and a new payment simultaneously.
    Assert no data corruption and final amounts are consistent.
    """
    order_id = "order-conc-tip"
    await _create_order(ledger, order_id, 100.00)

    # First: complete an initial payment
    pid_first = "pay-first"
    await _full_payment_flow(ledger, order_id, 60.00, pid_first)

    # Now concurrently: adjust tip on first payment + submit second payment
    pid_second = "pay-second"

    async def do_tip():
        evt = tip_adjusted(
            terminal_id=TERMINAL, order_id=order_id,
            payment_id=pid_first, tip_amount=10.00,
        )
        await ledger.append(evt)

    async def do_payment():
        await _full_payment_flow(ledger, order_id, 40.00, pid_second)

    await asyncio.gather(do_tip(), do_payment())

    order = await _project(ledger, order_id)

    # First payment: $60, tip $10
    first = [p for p in order.payments if p.payment_id == pid_first][0]
    assert first.amount == 60.00
    assert first.tip_amount == 10.00

    # Second payment: $40
    second = [p for p in order.payments if p.payment_id == pid_second][0]
    assert second.amount == 40.00
    assert second.status == "confirmed"

    # Total paid = 60 + 40 = 100
    assert order.amount_paid == 100.00
    assert order.is_fully_paid is True

    # Hash chain intact
    is_valid, _ = await ledger.verify_chain()
    assert is_valid is True


@pytest.mark.asyncio
async def test_concurrent_splits_exceeding_total(ledger):
    """
    Two split payments submitted concurrently that together exceed order total.
    At the ledger level, both are serialized and recorded.
    Verify consistent state — the projection shows overpayment.
    """
    order_id = "order-conc-oversplit"
    await _create_order(ledger, order_id, 100.00)

    # Two $70 splits concurrently = $140 total (exceeds $100)
    await asyncio.gather(
        _full_payment_flow(ledger, order_id, 70.00, "split-a"),
        _full_payment_flow(ledger, order_id, 70.00, "split-b"),
    )

    order = await _project(ledger, order_id)
    confirmed = [p for p in order.payments if p.status == "confirmed"]

    assert len(confirmed) == 2
    assert order.amount_paid == 140.00
    assert order.total == 100.00
    # Overpayment is detectable
    assert order.balance_due == -40.00
    assert order.is_fully_paid is True

    # Hash chain still intact
    is_valid, _ = await ledger.verify_chain()
    assert is_valid is True


@pytest.mark.asyncio
async def test_no_duplicate_events_after_concurrent_writes(ledger):
    """
    After any concurrent scenario, verify no duplicate payment events
    exist for the same logical payment_id.
    """
    order_id = "order-conc-nodup"
    await _create_order(ledger, order_id, 100.00)

    # Submit 5 different payments concurrently
    payment_ids = [f"pay-{i}" for i in range(5)]
    await asyncio.gather(*(
        _full_payment_flow(ledger, order_id, 20.00, pid)
        for pid in payment_ids
    ))

    # Retrieve all events for this order
    events = await ledger.get_events_by_correlation(order_id)

    # Check for duplicate PAYMENT_CONFIRMED events per payment_id
    confirmed_pids = [
        e.payload["payment_id"]
        for e in events
        if e.event_type == EventType.PAYMENT_CONFIRMED
    ]
    assert len(confirmed_pids) == len(set(confirmed_pids)), (
        f"Duplicate confirmed payment events found: {confirmed_pids}"
    )

    # Check for duplicate PAYMENT_INITIATED events per payment_id
    initiated_pids = [
        e.payload["payment_id"]
        for e in events
        if e.event_type == EventType.PAYMENT_INITIATED
    ]
    assert len(initiated_pids) == len(set(initiated_pids)), (
        f"Duplicate initiated payment events found: {initiated_pids}"
    )

    # Each payment_id should have exactly 1 initiated + 1 confirmed
    for pid in payment_ids:
        assert initiated_pids.count(pid) == 1
        assert confirmed_pids.count(pid) == 1

    # Hash chain intact after all concurrent writes
    is_valid, _ = await ledger.verify_chain()
    assert is_valid is True
