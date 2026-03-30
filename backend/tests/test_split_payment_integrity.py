"""
Split Payment Arithmetic Integrity Tests
=========================================
Verifies that splitting an order across multiple payments
maintains exact arithmetic: sum of splits == order total,
partial failures leave correct balances, mixed methods
are recorded correctly, and overpayment is handled.
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
    payment_failed,
)
from app.core.projections import project_order


# ─── Isolated test database ────────────────────────────────
SPLIT_TEST_DB = Path("./data/test_split_payment_integrity.db")

TERMINAL = "terminal-split-01"
TAX_RATE = 0.0  # Zero tax keeps split arithmetic crystal-clear


@pytest_asyncio.fixture
async def ledger():
    """Fresh EventLedger for split-payment tests."""
    if SPLIT_TEST_DB.exists():
        os.remove(SPLIT_TEST_DB)
    async with EventLedger(str(SPLIT_TEST_DB)) as _ledger:
        yield _ledger
    if SPLIT_TEST_DB.exists():
        os.remove(SPLIT_TEST_DB)


# ─── Helpers ────────────────────────────────────────────────

async def _create_order(ledger, order_id, total_price):
    """Create an order with a single item at the given price."""
    evt = order_created(
        terminal_id=TERMINAL, order_id=order_id, correlation_id=order_id,
    )
    await ledger.append(evt)

    evt = item_added(
        terminal_id=TERMINAL,
        order_id=order_id,
        item_id=f"{order_id}-item-0",
        menu_item_id="menu-0",
        name="Test Item",
        price=total_price,
        quantity=1,
    )
    await ledger.append(evt)

    events = await ledger.get_events_by_correlation(order_id)
    return project_order(events, tax_rate=TAX_RATE)


async def _initiate_and_confirm(ledger, order_id, amount, method="card"):
    """Initiate + confirm a single payment split."""
    pid = f"pay-{uuid.uuid4().hex[:8]}"
    txn = f"txn-{uuid.uuid4().hex[:8]}"

    evt = payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=amount, method=method,
    )
    await ledger.append(evt)

    evt = payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, transaction_id=txn, amount=amount,
    )
    await ledger.append(evt)
    return pid


async def _initiate_and_fail(ledger, order_id, amount, method="card"):
    """Initiate a payment then mark it failed."""
    pid = f"pay-{uuid.uuid4().hex[:8]}"

    evt = payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=amount, method=method,
    )
    await ledger.append(evt)

    evt = payment_failed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, error="card declined",
    )
    await ledger.append(evt)
    return pid


async def _project(ledger, order_id):
    """Re-project the order from current ledger state."""
    events = await ledger.get_events_by_correlation(order_id)
    return project_order(events, tax_rate=TAX_RATE)


# ─── Tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_three_equal_splits_sum_to_total(ledger):
    """
    Split $100.00 into 3 equal payments.
    sum(split_amounts) must == order total exactly.
    """
    order_id = "order-3-equal"
    order = await _create_order(ledger, order_id, 100.00)
    assert order.total == 100.00

    # Three equal splits: $33.34 + $33.33 + $33.33 = $100.00
    splits = [33.34, 33.33, 33.33]
    assert sum(splits) == 100.00  # verify our test data first

    for amount in splits:
        await _initiate_and_confirm(ledger, order_id, amount)

    order = await _project(ledger, order_id)

    assert order.amount_paid == 100.00
    assert order.balance_due == 0.00
    assert order.is_fully_paid is True
    assert len([p for p in order.payments if p.status == "confirmed"]) == 3


@pytest.mark.asyncio
async def test_uneven_three_way_split_with_remainder(ledger):
    """
    $100.00 / 3 = $33.333... — doesn't divide evenly.
    Two guests pay $33.33, last guest pays $33.34 (the remainder).
    Total must reconcile exactly.
    """
    order_id = "order-3-uneven"
    order = await _create_order(ledger, order_id, 100.00)

    # Simulate the real scenario: first two pay truncated amount
    split_a = 33.33
    split_b = 33.33
    remainder = round(100.00 - split_a - split_b, 2)  # 33.34
    assert remainder == 33.34

    await _initiate_and_confirm(ledger, order_id, split_a)
    await _initiate_and_confirm(ledger, order_id, split_b)
    await _initiate_and_confirm(ledger, order_id, remainder)

    order = await _project(ledger, order_id)

    assert round(split_a + split_b + remainder, 2) == 100.00
    assert order.amount_paid == 100.00
    assert order.balance_due == 0.00
    assert order.is_fully_paid is True


@pytest.mark.asyncio
async def test_partial_split_third_fails_shows_balance(ledger):
    """
    3-way split: 2 succeed, 3rd fails.
    Order must show correct remaining balance and NOT be marked paid/closed.
    """
    order_id = "order-partial-fail"
    order = await _create_order(ledger, order_id, 100.00)

    # First two splits succeed
    await _initiate_and_confirm(ledger, order_id, 33.33)
    await _initiate_and_confirm(ledger, order_id, 33.33)

    # Third split fails
    await _initiate_and_fail(ledger, order_id, 33.34)

    order = await _project(ledger, order_id)

    assert order.amount_paid == round(33.33 + 33.33, 2)  # 66.66
    assert order.balance_due == round(100.00 - 66.66, 2)  # 33.34
    assert order.is_fully_paid is False
    # Order should still be open (not paid, not closed)
    assert order.status == "open"

    # Verify the failed payment is recorded but not counted
    failed = [p for p in order.payments if p.status == "failed"]
    assert len(failed) == 1
    assert failed[0].error == "card declined"


@pytest.mark.asyncio
async def test_mixed_method_split_cash_and_card(ledger):
    """
    Split into 2 payments: cash + card. Both recorded with
    correct amounts and methods; order total reconciles.
    """
    order_id = "order-mixed-method"
    order = await _create_order(ledger, order_id, 100.00)

    cash_amount = 40.00
    card_amount = 60.00

    await _initiate_and_confirm(ledger, order_id, cash_amount, method="cash")
    await _initiate_and_confirm(ledger, order_id, card_amount, method="card")

    order = await _project(ledger, order_id)

    confirmed = [p for p in order.payments if p.status == "confirmed"]
    assert len(confirmed) == 2

    cash_payments = [p for p in confirmed if p.method == "cash"]
    card_payments = [p for p in confirmed if p.method == "card"]

    assert len(cash_payments) == 1
    assert cash_payments[0].amount == 40.00
    assert len(card_payments) == 1
    assert card_payments[0].amount == 60.00

    assert order.amount_paid == 100.00
    assert order.balance_due == 0.00
    assert order.is_fully_paid is True


@pytest.mark.asyncio
async def test_split_exceeding_total_overpays(ledger):
    """
    Sum of split amounts exceeds order total.
    The system records all confirmed payments; amount_paid > total
    is valid (overpayment / change scenario). balance_due goes negative.
    """
    order_id = "order-overpay"
    order = await _create_order(ledger, order_id, 100.00)

    # Two splits that exceed total: $60 + $60 = $120 > $100
    await _initiate_and_confirm(ledger, order_id, 60.00)
    await _initiate_and_confirm(ledger, order_id, 60.00)

    order = await _project(ledger, order_id)

    assert order.amount_paid == 120.00
    assert order.total == 100.00
    # Overpayment: balance_due is negative (customer gets change)
    assert order.balance_due == round(100.00 - 120.00, 2)  # -20.00
    assert order.is_fully_paid is True
