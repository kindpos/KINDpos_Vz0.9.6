"""
Payment Reconciliation Precision Tests
=======================================
Verifies that order totals, tax rounding, refunds, voids,
and edge-case amounts maintain 2-decimal-place precision
throughout the event-sourced ledger pipeline.
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
    order_closed,
)
from app.core.projections import project_order, project_orders


# ─── Isolated test database ────────────────────────────────
RECON_TEST_DB = Path("./data/test_payment_reconciliation.db")

TERMINAL = "terminal-recon-01"


@pytest_asyncio.fixture
async def ledger():
    """Fresh EventLedger for reconciliation tests."""
    if RECON_TEST_DB.exists():
        os.remove(RECON_TEST_DB)
    async with EventLedger(str(RECON_TEST_DB)) as _ledger:
        yield _ledger
    if RECON_TEST_DB.exists():
        os.remove(RECON_TEST_DB)


# ─── Helpers ────────────────────────────────────────────────

async def _create_order_with_items(ledger, order_id, items, tax_rate=0.07):
    """
    Create an order and add items. Returns projected Order.

    items: list of (name, price, qty) tuples
    """
    evt = order_created(terminal_id=TERMINAL, order_id=order_id, correlation_id=order_id)
    await ledger.append(evt)

    for i, (name, price, qty) in enumerate(items):
        evt = item_added(
            terminal_id=TERMINAL,
            order_id=order_id,
            item_id=f"{order_id}-item-{i}",
            menu_item_id=f"menu-{i}",
            name=name,
            price=price,
            quantity=qty,
        )
        await ledger.append(evt)

    events = await ledger.get_events_by_correlation(order_id)
    return project_order(events, tax_rate=tax_rate)


async def _pay_order(ledger, order_id, amount, payment_id=None, tax_rate=0.07):
    """Initiate + confirm a payment. Returns projected Order."""
    pid = payment_id or f"pay-{uuid.uuid4().hex[:8]}"
    txn_id = f"txn-{uuid.uuid4().hex[:8]}"

    evt = payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=amount, method="card",
    )
    await ledger.append(evt)

    evt = payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, transaction_id=txn_id, amount=amount,
    )
    await ledger.append(evt)

    events = await ledger.get_events_by_correlation(order_id)
    return project_order(events, tax_rate=tax_rate)


def _revenue_from_orders(orders: dict) -> float:
    """Sum totals of non-voided orders (simple revenue reconciliation)."""
    return round(
        sum(o.total for o in orders.values() if o.status != "voided"),
        2,
    )


def _net_payments_from_events(events: list) -> float:
    """
    Compute net payment from raw events:
    confirmed payments minus refunded amounts.
    """
    net = 0.0
    for e in events:
        if e.event_type == EventType.PAYMENT_CONFIRMED:
            net += e.payload.get("amount", 0)
        elif e.event_type == EventType.PAYMENT_REFUNDED:
            net -= e.payload.get("amount", 0)
    return round(net, 2)


# ─── Tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_full_payment_matches_order_total(ledger):
    """Single full payment equals the calculated order total to 2dp."""
    order_id = "order-full-pay"
    tax_rate = 0.08  # 8%

    # Items: $12.50 x2, $8.75 x1 => subtotal = $33.75
    order = await _create_order_with_items(
        ledger, order_id,
        [("Burger", 12.50, 2), ("Fries", 8.75, 1)],
        tax_rate=tax_rate,
    )

    expected_subtotal = 12.50 * 2 + 8.75  # 33.75
    expected_tax = round(expected_subtotal * tax_rate, 2)  # 2.70
    expected_total = round(expected_subtotal + expected_tax, 2)  # 36.45

    assert order.subtotal == expected_subtotal
    assert order.tax == expected_tax
    assert order.total == expected_total

    # Pay exactly the total
    order = await _pay_order(ledger, order_id, expected_total, tax_rate=tax_rate)

    assert order.amount_paid == expected_total
    assert order.balance_due == 0.00
    assert order.is_fully_paid is True


@pytest.mark.asyncio
async def test_repeating_decimal_tax_rounded(ledger):
    """
    $10.01 * 7% = $0.7007 — must round to $0.70, not drift.
    """
    order_id = "order-repeating-tax"
    tax_rate = 0.07

    order = await _create_order_with_items(
        ledger, order_id,
        [("Widget", 10.01, 1)],
        tax_rate=tax_rate,
    )

    # 10.01 * 0.07 = 0.7007 → round to 0.70
    assert order.subtotal == 10.01
    assert order.tax == 0.70
    expected_total = round(10.01 + 0.70, 2)  # 10.71
    assert order.total == expected_total

    order = await _pay_order(ledger, order_id, expected_total, tax_rate=tax_rate)
    assert order.amount_paid == expected_total
    assert order.balance_due == 0.00


@pytest.mark.asyncio
async def test_refund_subtracted_from_financial_summary(ledger):
    """
    After a refund event, net payments should subtract the refund amount.
    """
    order_id = "order-refund"
    tax_rate = 0.07
    payment_id = "pay-refund-01"

    order = await _create_order_with_items(
        ledger, order_id,
        [("Steak", 25.00, 1)],
        tax_rate=tax_rate,
    )
    total = order.total  # 25.00 + 1.75 = 26.75

    # Pay in full
    await _pay_order(ledger, order_id, total, payment_id=payment_id, tax_rate=tax_rate)

    # Issue a refund via PAYMENT_REFUNDED event
    refund_amount = 10.00
    refund_evt = create_event(
        event_type=EventType.PAYMENT_REFUNDED,
        terminal_id=TERMINAL,
        payload={
            "order_id": order_id,
            "payment_id": payment_id,
            "refund_id": f"ref-{uuid.uuid4().hex[:8]}",
            "amount": refund_amount,
        },
        correlation_id=order_id,
    )
    await ledger.append(refund_evt)

    # Verify net payments = original - refund
    events = await ledger.get_events_by_correlation(order_id)
    net = _net_payments_from_events(events)
    assert net == round(total - refund_amount, 2)  # 26.75 - 10.00 = 16.75


@pytest.mark.asyncio
async def test_voided_order_excluded_from_revenue(ledger):
    """Voided orders must not contribute to revenue totals."""
    tax_rate = 0.06

    # Order A — normal, paid
    oid_a = "order-normal"
    order_a = await _create_order_with_items(
        ledger, oid_a,
        [("Salad", 15.00, 1)],
        tax_rate=tax_rate,
    )
    total_a = order_a.total  # 15.00 + 0.90 = 15.90
    await _pay_order(ledger, oid_a, total_a, tax_rate=tax_rate)

    # Order B — voided before payment
    oid_b = "order-voided"
    await _create_order_with_items(
        ledger, oid_b,
        [("Lobster", 50.00, 1)],
        tax_rate=tax_rate,
    )
    void_evt = order_voided(
        terminal_id=TERMINAL, order_id=oid_b,
        reason="customer left",
    )
    await ledger.append(void_evt)

    # Project all orders
    all_events = await ledger.get_events_by_correlation(oid_a)
    all_events += await ledger.get_events_by_correlation(oid_b)
    orders = project_orders(all_events, tax_rate=tax_rate)

    # Voided order has status "voided"
    assert orders[oid_b].status == "voided"

    # Revenue excludes voided orders
    revenue = _revenue_from_orders(orders)
    assert revenue == total_a


@pytest.mark.asyncio
async def test_minimum_amount_no_precision_loss(ledger):
    """$0.01 order — no precision loss at the penny boundary."""
    order_id = "order-penny"
    tax_rate = 0.07

    order = await _create_order_with_items(
        ledger, order_id,
        [("Penny item", 0.01, 1)],
        tax_rate=tax_rate,
    )

    # 0.01 * 0.07 = 0.0007 → rounds to 0.00
    assert order.subtotal == 0.01
    assert order.tax == 0.00
    assert order.total == 0.01

    order = await _pay_order(ledger, order_id, 0.01, tax_rate=tax_rate)
    assert order.amount_paid == 0.01
    assert order.balance_due == 0.00
    assert order.is_fully_paid is True


@pytest.mark.asyncio
async def test_large_amount_no_overflow(ledger):
    """$99,999.99 order — no overflow or precision drift."""
    order_id = "order-big"
    tax_rate = 0.07

    order = await _create_order_with_items(
        ledger, order_id,
        [("Diamond Ring", 99999.99, 1)],
        tax_rate=tax_rate,
    )

    # 99999.99 * 0.07 = 6999.9993 → rounds to 7000.00
    assert order.subtotal == 99999.99
    assert order.tax == 7000.00
    expected_total = round(99999.99 + 7000.00, 2)  # 106999.99
    assert order.total == expected_total

    order = await _pay_order(ledger, order_id, expected_total, tax_rate=tax_rate)
    assert order.amount_paid == expected_total
    assert order.balance_due == 0.00
    assert order.is_fully_paid is True
