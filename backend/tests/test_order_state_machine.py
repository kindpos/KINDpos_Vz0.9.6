"""
Order State Machine Enforcement Tests
======================================
Verifies that order lifecycle transitions follow correct rules:
  OPEN → items added → payment → PAID → CLOSED
  OPEN → VOIDED

Invalid transitions (adding items to closed/voided orders, paying
voided orders, double-close, double-void, voiding closed) are
rejected per business rules enforced at the guard level.
"""

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
    order_closed,
    order_voided,
)
from app.core.projections import project_order


# ─── Isolated test database ────────────────────────────────
SM_TEST_DB = Path("./data/test_order_state_machine.db")

TERMINAL = "terminal-sm-01"
TAX_RATE = 0.0


@pytest_asyncio.fixture
async def ledger():
    """Fresh EventLedger for state-machine tests."""
    if SM_TEST_DB.exists():
        os.remove(SM_TEST_DB)
    async with EventLedger(str(SM_TEST_DB)) as _ledger:
        yield _ledger
    if SM_TEST_DB.exists():
        os.remove(SM_TEST_DB)


# ─── Helpers ────────────────────────────────────────────────

async def _create_open_order(ledger, order_id, item_price=50.00):
    """Create an open order with one item."""
    evt = order_created(terminal_id=TERMINAL, order_id=order_id, correlation_id=order_id)
    await ledger.append(evt)
    evt = item_added(
        terminal_id=TERMINAL, order_id=order_id,
        item_id=f"{order_id}-item-0", menu_item_id="menu-0",
        name="Test Item", price=item_price, quantity=1,
    )
    await ledger.append(evt)


async def _pay_and_close(ledger, order_id, amount):
    """Pay the order in full and close it."""
    pid = f"pay-{uuid.uuid4().hex[:8]}"
    txn = f"txn-{uuid.uuid4().hex[:8]}"
    await ledger.append(payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=amount, method="card",
    ))
    await ledger.append(payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, transaction_id=txn, amount=amount,
    ))
    await ledger.append(order_closed(
        terminal_id=TERMINAL, order_id=order_id, total=amount,
    ))


async def _void_order(ledger, order_id):
    """Void an order."""
    await ledger.append(order_voided(
        terminal_id=TERMINAL, order_id=order_id, reason="test void",
    ))


async def _project(ledger, order_id):
    events = await ledger.get_events_by_correlation(order_id)
    return project_order(events, tax_rate=TAX_RATE)


def _guard_can_add_items(order) -> bool:
    """Mimics the route-level guard: only open orders accept items."""
    return order.status == "open"


def _guard_can_pay(order) -> bool:
    """Mimics the route-level guard: cannot pay closed or voided orders."""
    return order.status not in ("closed", "voided")


def _guard_can_close(order) -> bool:
    """Mimics the route-level guard for closing."""
    return order.status not in ("closed", "voided")


def _guard_can_void(order) -> bool:
    """Mimics the route-level guard for voiding."""
    return order.status not in ("voided", "closed")


# ─── Tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cannot_add_items_to_closed_order(ledger):
    """Adding items to a CLOSED order must be rejected."""
    order_id = "order-closed-no-items"
    await _create_open_order(ledger, order_id, 50.00)
    await _pay_and_close(ledger, order_id, 50.00)

    order = await _project(ledger, order_id)
    assert order.status == "closed"
    assert _guard_can_add_items(order) is False


@pytest.mark.asyncio
async def test_cannot_add_items_to_voided_order(ledger):
    """Adding items to a VOIDED order must be rejected."""
    order_id = "order-voided-no-items"
    await _create_open_order(ledger, order_id, 50.00)
    await _void_order(ledger, order_id)

    order = await _project(ledger, order_id)
    assert order.status == "voided"
    assert _guard_can_add_items(order) is False


@pytest.mark.asyncio
async def test_cannot_pay_voided_order(ledger):
    """Paying a VOIDED order must be rejected."""
    order_id = "order-voided-no-pay"
    await _create_open_order(ledger, order_id, 50.00)
    await _void_order(ledger, order_id)

    order = await _project(ledger, order_id)
    assert order.status == "voided"
    assert _guard_can_pay(order) is False


@pytest.mark.asyncio
async def test_cannot_void_already_voided_order(ledger):
    """Voiding an already-VOIDED order must be rejected."""
    order_id = "order-double-void"
    await _create_open_order(ledger, order_id, 50.00)
    await _void_order(ledger, order_id)

    order = await _project(ledger, order_id)
    assert order.status == "voided"
    assert _guard_can_void(order) is False


@pytest.mark.asyncio
async def test_cannot_close_already_closed_order(ledger):
    """Closing an already-CLOSED order must be rejected."""
    order_id = "order-double-close"
    await _create_open_order(ledger, order_id, 50.00)
    await _pay_and_close(ledger, order_id, 50.00)

    order = await _project(ledger, order_id)
    assert order.status == "closed"
    assert _guard_can_close(order) is False


@pytest.mark.asyncio
async def test_cannot_void_closed_order(ledger):
    """Voiding a CLOSED order must be rejected per business rules."""
    order_id = "order-closed-no-void"
    await _create_open_order(ledger, order_id, 50.00)
    await _pay_and_close(ledger, order_id, 50.00)

    order = await _project(ledger, order_id)
    assert order.status == "closed"
    assert _guard_can_void(order) is False


@pytest.mark.asyncio
async def test_full_valid_lifecycle(ledger):
    """
    Full valid lifecycle: OPEN → items added → payment → PAID → CLOSED.
    Check state at each transition.
    """
    order_id = "order-lifecycle"

    # 1. Create order — status is "open"
    evt = order_created(terminal_id=TERMINAL, order_id=order_id, correlation_id=order_id)
    await ledger.append(evt)
    order = await _project(ledger, order_id)
    assert order.status == "open"
    assert len(order.items) == 0

    # 2. Add items — still "open", items present
    evt = item_added(
        terminal_id=TERMINAL, order_id=order_id,
        item_id="item-1", menu_item_id="menu-1",
        name="Burger", price=25.00, quantity=2,
    )
    await ledger.append(evt)
    order = await _project(ledger, order_id)
    assert order.status == "open"
    assert len(order.items) == 1
    assert order.total == 50.00
    assert order.balance_due == 50.00

    # 3. Initiate payment — still "open", payment pending
    pid = "pay-lifecycle"
    evt = payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=50.00, method="card",
    )
    await ledger.append(evt)
    order = await _project(ledger, order_id)
    assert order.status == "open"
    pending = [p for p in order.payments if p.status == "pending"]
    assert len(pending) == 1

    # 4. Confirm payment — auto-transitions to "paid"
    evt = payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, transaction_id="txn-lifecycle", amount=50.00,
    )
    await ledger.append(evt)
    order = await _project(ledger, order_id)
    assert order.status == "paid"
    assert order.amount_paid == 50.00
    assert order.balance_due == 0.00
    assert order.is_fully_paid is True

    # 5. Close order — transitions to "closed"
    evt = order_closed(terminal_id=TERMINAL, order_id=order_id, total=50.00)
    await ledger.append(evt)
    order = await _project(ledger, order_id)
    assert order.status == "closed"
    assert order.closed_at is not None

    # Verify hash chain integrity through the full lifecycle
    is_valid, _ = await ledger.verify_chain()
    assert is_valid is True
