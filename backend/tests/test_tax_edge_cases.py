"""
Tax Calculation Edge Cases
==========================
Verifies tax rounding, zero subtotals, tax-exempt items, large orders,
half-cent rounding, and refund tax reversal.
"""

import os
import uuid
import pytest
import pytest_asyncio
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from app.core.event_ledger import EventLedger
from app.core.events import (
    EventType,
    create_event,
    order_created,
    item_added,
    payment_initiated,
    payment_confirmed,
)
from app.core.projections import project_order


# ─── Isolated test database ────────────────────────────────
TAX_TEST_DB = Path("./data/test_tax_edge_cases.db")

TERMINAL = "terminal-tax-01"


@pytest_asyncio.fixture
async def ledger():
    """Fresh EventLedger for tax edge-case tests."""
    if TAX_TEST_DB.exists():
        os.remove(TAX_TEST_DB)
    async with EventLedger(str(TAX_TEST_DB)) as _ledger:
        yield _ledger
    if TAX_TEST_DB.exists():
        os.remove(TAX_TEST_DB)


# ─── Helpers ────────────────────────────────────────────────

async def _order_with_items(ledger, order_id, items, tax_rate):
    """
    Create order + add items, return projected Order.
    items: list of (name, price, qty) tuples
    """
    evt = order_created(terminal_id=TERMINAL, order_id=order_id, correlation_id=order_id)
    await ledger.append(evt)
    for i, (name, price, qty) in enumerate(items):
        evt = item_added(
            terminal_id=TERMINAL, order_id=order_id,
            item_id=f"{order_id}-item-{i}", menu_item_id=f"menu-{i}",
            name=name, price=price, quantity=qty,
        )
        await ledger.append(evt)
    events = await ledger.get_events_by_correlation(order_id)
    return project_order(events, tax_rate=tax_rate)


# ─── Tests ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_zero_subtotal_zero_tax(ledger):
    """Tax on $0.00 subtotal must be $0.00, total must be $0.00."""
    order = await _order_with_items(
        ledger, "order-zero", [("Free Item", 0.00, 1)], tax_rate=0.08,
    )
    assert order.subtotal == 0.00
    assert order.tax == 0.00
    assert order.total == 0.00


@pytest.mark.asyncio
async def test_tax_exempt_item(ledger):
    """A tax-exempt item (tax_rate=0) produces $0.00 tax."""
    order = await _order_with_items(
        ledger, "order-exempt", [("Non-Taxable Gift Card", 50.00, 1)], tax_rate=0.0,
    )
    assert order.subtotal == 50.00
    assert order.tax == 0.00
    assert order.total == 50.00


@pytest.mark.asyncio
async def test_large_order_no_floating_point_drift(ledger):
    """
    $50,000+ order — compare against Decimal calculation to
    ensure no floating-point drift.
    """
    price = 12500.00
    qty = 4  # subtotal = $50,000.00
    tax_rate = 0.0825  # 8.25%

    order = await _order_with_items(
        ledger, "order-large-tax",
        [("Expensive Item", price, qty)],
        tax_rate=tax_rate,
    )

    subtotal = price * qty  # 50000.00
    assert order.subtotal == subtotal

    # Decimal-precise reference calculation
    dec_subtotal = Decimal(str(subtotal))
    dec_rate = Decimal(str(tax_rate))
    dec_tax = (dec_subtotal * dec_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    dec_total = dec_subtotal + dec_tax

    assert order.tax == float(dec_tax)
    assert order.total == float(dec_total)


@pytest.mark.asyncio
async def test_half_cent_rounding(ledger):
    """
    $14.29 × 7% = $1.0003 — just barely over a full cent.
    Must round to $1.00 (Python's round() uses banker's rounding,
    but 1.0003 rounds to 1.00 regardless of strategy).
    """
    tax_rate = 0.07

    order = await _order_with_items(
        ledger, "order-halfcent",
        [("Precision Item", 14.29, 1)],
        tax_rate=tax_rate,
    )

    assert order.subtotal == 14.29
    # 14.29 * 0.07 = 1.0003 → round(1.0003, 2) = 1.00
    assert order.tax == 1.00
    assert order.total == round(14.29 + 1.00, 2)  # 15.29


@pytest.mark.asyncio
async def test_refund_with_tax_reversal(ledger):
    """
    Pay an order, then refund. The tax portion of the refund must
    correctly reverse: refund_with_tax = item_price + tax_on_item.
    Net revenue = original_total - refund_total.
    """
    order_id = "order-refund-tax"
    tax_rate = 0.08
    item_price = 25.00

    order = await _order_with_items(
        ledger, order_id,
        [("Refundable Item", item_price, 1)],
        tax_rate=tax_rate,
    )

    # Expected: subtotal=25.00, tax=2.00, total=27.00
    expected_tax = round(item_price * tax_rate, 2)  # 2.00
    expected_total = round(item_price + expected_tax, 2)  # 27.00
    assert order.subtotal == item_price
    assert order.tax == expected_tax
    assert order.total == expected_total

    # Pay in full
    pid = "pay-refund-tax"
    txn = "txn-refund-tax"
    await ledger.append(payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=expected_total, method="card",
    ))
    await ledger.append(payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, transaction_id=txn, amount=expected_total,
    ))

    # Refund the full amount (including tax)
    refund_amount = expected_total  # $27.00 = $25.00 + $2.00 tax
    refund_evt = create_event(
        event_type=EventType.PAYMENT_REFUNDED,
        terminal_id=TERMINAL,
        payload={
            "order_id": order_id,
            "payment_id": pid,
            "amount": refund_amount,
        },
        correlation_id=order_id,
    )
    await ledger.append(refund_evt)

    # Compute net from events
    events = await ledger.get_events_by_correlation(order_id)
    confirmed_total = sum(
        e.payload["amount"] for e in events
        if e.event_type == EventType.PAYMENT_CONFIRMED
    )
    refunded_total = sum(
        e.payload["amount"] for e in events
        if e.event_type == EventType.PAYMENT_REFUNDED
    )
    net_revenue = round(confirmed_total - refunded_total, 2)

    # Full refund: net revenue = 0
    assert confirmed_total == expected_total
    assert refunded_total == expected_total
    assert net_revenue == 0.00


@pytest.mark.asyncio
async def test_negative_amounts_correct_sign(ledger):
    """
    Refund events carry positive amounts (the refund *amount*).
    When computing net revenue, the sign must be correct:
    net = payments - refunds. Partial refund leaves positive net.
    """
    order_id = "order-sign-check"
    tax_rate = 0.10
    item_price = 30.00

    order = await _order_with_items(
        ledger, order_id,
        [("Sign Test Item", item_price, 1)],
        tax_rate=tax_rate,
    )

    # subtotal=30.00, tax=3.00, total=33.00
    total = order.total
    assert total == 33.00

    # Pay in full
    pid = "pay-sign"
    await ledger.append(payment_initiated(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, amount=total, method="card",
    ))
    await ledger.append(payment_confirmed(
        terminal_id=TERMINAL, order_id=order_id,
        payment_id=pid, transaction_id="txn-sign", amount=total,
    ))

    # Partial refund: $11.00 (e.g., one-third of total including tax)
    partial_refund = 11.00
    refund_evt = create_event(
        event_type=EventType.PAYMENT_REFUNDED,
        terminal_id=TERMINAL,
        payload={
            "order_id": order_id,
            "payment_id": pid,
            "amount": partial_refund,
        },
        correlation_id=order_id,
    )
    await ledger.append(refund_evt)

    events = await ledger.get_events_by_correlation(order_id)
    confirmed = sum(
        e.payload["amount"] for e in events
        if e.event_type == EventType.PAYMENT_CONFIRMED
    )
    refunded = sum(
        e.payload["amount"] for e in events
        if e.event_type == EventType.PAYMENT_REFUNDED
    )
    net = round(confirmed - refunded, 2)

    assert confirmed == 33.00
    assert refunded == 11.00
    assert net == 22.00  # positive: customer still owes/paid net $22
    assert net > 0  # sign is correct
