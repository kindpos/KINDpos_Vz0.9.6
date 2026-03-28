"""
Order API Routes

Endpoints for order management.
All mutations go through the Event Ledger.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

from app.config import settings
from app.api.dependencies import get_ledger
from app.core.event_ledger import EventLedger
from app.core.events import (
    order_created,
    item_added,
    item_removed,
    item_modified,
    item_sent,
    modifier_applied,
    payment_initiated,
    payment_confirmed,
    payment_failed,
    order_closed,
    order_voided,
    ticket_printed,
    batch_submitted,
    day_closed,
    create_event,
    EventType,
)
from app.core.projections import project_order, project_orders, Order
from app.core.event_ledger import get_open_orders

router = APIRouter(prefix="/orders", tags=["orders"])


# =============================================================================
# DAY BOUNDARY HELPER
# =============================================================================

async def get_current_day_events(ledger: EventLedger, limit: int = 50000) -> list:
    """Get events since the last day close (current business day)."""
    boundary = await ledger.get_last_day_close_sequence()
    return await ledger.get_events_since(boundary, limit=limit)


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class CreateOrderRequest(BaseModel):
    """Request to create a new order."""
    table: Optional[str] = None
    server_id: Optional[str] = None
    server_name: Optional[str] = None
    order_type: str = "dine_in"
    guest_count: int = 1


class AddItemRequest(BaseModel):
    """Request to add an item to an order."""
    menu_item_id: str
    name: str
    price: float
    quantity: int = 1
    category: Optional[str] = None
    notes: Optional[str] = None
    seat_number: Optional[int] = None


class ModifyItemRequest(BaseModel):
    """Request to modify an item."""
    quantity: Optional[int] = None
    price: Optional[float] = None
    notes: Optional[str] = None


class ApplyModifierRequest(BaseModel):
    """Request to apply a modifier to an item."""
    modifier_id: str
    modifier_name: str
    modifier_price: float = 0.0
    action: str = "add"  # add, remove


class InitiatePaymentRequest(BaseModel):
    """Request to initiate a payment."""
    amount: float
    method: str  # card, cash, gift_card


class ConfirmPaymentRequest(BaseModel):
    """Request to confirm a payment."""
    transaction_id: str
    amount: float


class FailPaymentRequest(BaseModel):
    """Request to record a failed payment."""
    error: str
    error_code: Optional[str] = None


class VoidOrderRequest(BaseModel):
    """Request to void an order."""
    reason: str
    approved_by: Optional[str] = None


class OrderItemResponse(BaseModel):
    """Response model for an order item."""
    item_id: str
    menu_item_id: str
    name: str
    price: float
    quantity: int
    category: Optional[str]
    notes: Optional[str]
    modifiers: list[dict]
    subtotal: float


class PaymentResponse(BaseModel):
    """Response model for a payment."""
    payment_id: str
    amount: float
    method: str
    status: str
    tip_amount: float = 0.0
    transaction_id: Optional[str] = None


class OrderResponse(BaseModel):
    """Response model for an order."""
    order_id: str
    table: Optional[str]
    server_id: Optional[str]
    server_name: Optional[str]
    order_type: str
    guest_count: int
    status: str
    items: list[OrderItemResponse]
    payments: list[PaymentResponse] = []
    subtotal: float
    discount_total: float
    tax: float
    total: float
    amount_paid: float
    balance_due: float
    created_at: Optional[datetime]

    @classmethod
    def from_order(cls, order: Order) -> "OrderResponse":
        """Convert an Order projection to a response."""
        return cls(
            order_id=order.order_id,
            table=order.table,
            server_id=order.server_id,
            server_name=order.server_name,
            order_type=order.order_type,
            guest_count=order.guest_count,
            status=order.status,
            items=[
                OrderItemResponse(
                    item_id=item.item_id,
                    menu_item_id=item.menu_item_id,
                    name=item.name,
                    price=item.price,
                    quantity=item.quantity,
                    category=item.category,
                    notes=item.notes,
                    modifiers=item.modifiers,
                    subtotal=item.subtotal,
                )
                for item in order.items
            ],
            payments=[
                PaymentResponse(
                    payment_id=p.payment_id,
                    amount=p.amount,
                    method=p.method,
                    status=p.status,
                    tip_amount=p.tip_amount,
                    transaction_id=p.transaction_id,
                )
                for p in order.payments
            ],
            subtotal=order.subtotal,
            discount_total=order.discount_total,
            tax=order.tax,
            total=order.total,
            amount_paid=order.amount_paid,
            balance_due=order.balance_due,
            created_at=order.created_at,
        )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

async def get_order_or_404(ledger: EventLedger, order_id: str) -> Order:
    """Get an order by ID or raise 404."""
    events = await ledger.get_events_by_correlation(order_id)
    if not events:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {order_id} not found"
        )
    order = project_order(events, tax_rate=settings.tax_rate)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order {order_id} not found"
        )
    return order


# =============================================================================
# ROUTES
# =============================================================================

@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
        request: CreateOrderRequest,
        ledger: EventLedger = Depends(get_ledger),
):
    """Create a new order."""
    order_id = f"order_{uuid.uuid4().hex[:12]}"

    event = order_created(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        table=request.table,
        server_id=request.server_id,
        server_name=request.server_name,
        order_type=request.order_type,
        guest_count=request.guest_count,
    )
    # Set correlation_id for ORDER_CREATED
    event = event.model_copy(update={"correlation_id": order_id})

    await ledger.append(event)

    # Return the projected order
    events = await ledger.get_events_by_correlation(order_id)
    order = project_order(events, tax_rate=settings.tax_rate)
    return OrderResponse.from_order(order)


@router.get("", response_model=list[OrderResponse])
async def list_orders(
        status_filter: Optional[str] = None,
        table: Optional[str] = None,
        server_id: Optional[str] = None,
        ledger: EventLedger = Depends(get_ledger),
):
    """List orders with optional filters."""
    # Get recent events (last 1000)
    events = await get_current_day_events(ledger, limit=10000)
    orders = project_orders(events, tax_rate=settings.tax_rate)

    # Apply filters
    result = list(orders.values())

    if status_filter:
        result = [o for o in result if o.status == status_filter]

    if table:
        result = [o for o in result if o.table == table]

    if server_id:
        result = [o for o in result if o.server_id == server_id]

    # Sort by created_at descending
    result.sort(key=lambda o: o.created_at or datetime.min, reverse=True)

    return [OrderResponse.from_order(o) for o in result]


@router.get("/active", response_model=list[OrderResponse])
async def list_active_orders(
        ledger: EventLedger = Depends(get_ledger),
):
    """Get all active (open or printed) orders."""
    events = await get_current_day_events(ledger, limit=10000)
    orders = project_orders(events, tax_rate=settings.tax_rate)
    active_orders = [o for o in orders.values() if o.status in ["open", "printed"]]
    active_orders.sort(key=lambda o: o.created_at or datetime.min, reverse=True)
    return [OrderResponse.from_order(o) for o in active_orders]


@router.get("/open", response_model=list[OrderResponse])
async def list_open_orders(
        ledger: EventLedger = Depends(get_ledger),
):
    """Get all open orders."""
    events = await get_current_day_events(ledger, limit=10000)
    orders = project_orders(events, tax_rate=settings.tax_rate)
    open_orders = [o for o in orders.values() if o.status == "open"]
    open_orders.sort(key=lambda o: o.created_at or datetime.min, reverse=True)
    return [OrderResponse.from_order(o) for o in open_orders]


@router.get("/day-summary")
async def get_day_summary(ledger: EventLedger = Depends(get_ledger)):
    """Get current day summary without closing anything."""
    all_events = await get_current_day_events(ledger)
    all_orders = project_orders(all_events, tax_rate=settings.tax_rate)

    open_count = 0
    closed_count = 0
    total_sales = 0.0
    total_tips = 0.0
    cash_total = 0.0
    card_total = 0.0
    payments_list = []

    for order in all_orders.values():
        if order.status == "open":
            open_count += 1
        elif order.status in ("closed", "paid"):
            closed_count += 1
            total_sales += order.total
            for p in order.payments:
                if p.status == "confirmed":
                    payments_list.append({
                        "order_id": order.order_id,
                        "payment_id": p.payment_id,
                        "amount": p.amount,
                        "method": p.method,
                        "tip": p.tip_amount,
                    })
                    if p.method == "cash":
                        cash_total += p.amount
                    else:
                        card_total += p.amount

    for e in all_events:
        if e.event_type == EventType.TIP_ADJUSTED:
            tip_amt = e.payload.get("tip_amount", 0.0)
            total_tips += tip_amt
            pid = e.payload.get("payment_id")
            for pm in payments_list:
                if pm["payment_id"] == pid:
                    pm["tip"] = tip_amt

    return {
        "open_orders": open_count,
        "closed_orders": closed_count,
        "total_sales": round(total_sales, 2),
        "total_tips": round(total_tips, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "payments": payments_list,
    }


@router.get("/day-history")
async def get_day_history(ledger: EventLedger = Depends(get_ledger)):
    """Get all closed day summaries for audit/reporting.

    Each entry is the stored payload from a DAY_CLOSED event.
    """
    day_events = await ledger.get_events_by_type(EventType.DAY_CLOSED)
    return [
        {
            "event_id": e.event_id,
            "closed_at": e.timestamp.isoformat() if e.timestamp else None,
            **e.payload,
        }
        for e in day_events
    ]


@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(
        order_id: str,
        ledger: EventLedger = Depends(get_ledger),
):
    """Get a specific order by ID."""
    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.post("/{order_id}/items", response_model=OrderResponse)
async def add_item(
        order_id: str,
        request: AddItemRequest,
        ledger: EventLedger = Depends(get_ledger),
):
    """Add an item to an order."""
    order = await get_order_or_404(ledger, order_id)

    if order.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot add items to {order.status} order"
        )

    item_id = f"item_{uuid.uuid4().hex[:8]}"

    event = item_added(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        item_id=item_id,
        menu_item_id=request.menu_item_id,
        name=request.name,
        price=request.price,
        quantity=request.quantity,
        category=request.category,
        notes=request.notes,
        seat_number=request.seat_number,
    )
    await ledger.append(event)

    # Return updated order
    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.delete("/{order_id}/items/{item_id}", response_model=OrderResponse)
async def remove_item(
        order_id: str,
        item_id: str,
        reason: Optional[str] = None,
        ledger: EventLedger = Depends(get_ledger),
):
    """Remove an item from an order."""
    order = await get_order_or_404(ledger, order_id)

    if order.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot remove items from {order.status} order"
        )

    # Verify item exists
    if not any(item.item_id == item_id for item in order.items):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item {item_id} not found in order"
        )

    event = item_removed(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        item_id=item_id,
        reason=reason,
    )
    await ledger.append(event)

    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.patch("/{order_id}/items/{item_id}", response_model=OrderResponse)
async def modify_item(
        order_id: str,
        item_id: str,
        request: ModifyItemRequest,
        ledger: EventLedger = Depends(get_ledger),
):
    """Modify an item on an order."""
    order = await get_order_or_404(ledger, order_id)

    if order.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot modify items on {order.status} order"
        )

    # Verify item exists
    if not any(item.item_id == item_id for item in order.items):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item {item_id} not found in order"
        )

    event = item_modified(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        item_id=item_id,
        quantity=request.quantity,
        price=request.price,
        notes=request.notes,
    )
    await ledger.append(event)

    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.post("/{order_id}/items/{item_id}/modifiers", response_model=OrderResponse)
async def apply_modifier(
        order_id: str,
        item_id: str,
        request: ApplyModifierRequest,
        ledger: EventLedger = Depends(get_ledger),
):
    """Apply a modifier to an item."""
    order = await get_order_or_404(ledger, order_id)

    if order.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot modify items on {order.status} order"
        )

    if not any(item.item_id == item_id for item in order.items):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item {item_id} not found in order"
        )

    event = modifier_applied(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        item_id=item_id,
        modifier_id=request.modifier_id,
        modifier_name=request.modifier_name,
        modifier_price=request.modifier_price,
        action=request.action,
    )
    await ledger.append(event)

    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.post("/{order_id}/payments", response_model=OrderResponse)
async def initiate_payment(
        order_id: str,
        request: InitiatePaymentRequest,
        ledger: EventLedger = Depends(get_ledger),
):
    """Initiate a payment on an order."""
    order = await get_order_or_404(ledger, order_id)

    if order.status not in ("open", "paid"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot process payment on {order.status} order"
        )

    payment_id = f"pay_{uuid.uuid4().hex[:8]}"

    event = payment_initiated(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        payment_id=payment_id,
        amount=request.amount,
        method=request.method,
    )
    await ledger.append(event)

    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.post("/{order_id}/payments/{payment_id}/confirm", response_model=OrderResponse)
async def confirm_payment(
        order_id: str,
        payment_id: str,
        request: ConfirmPaymentRequest,
        ledger: EventLedger = Depends(get_ledger),
):
    """Confirm a payment."""
    order = await get_order_or_404(ledger, order_id)

    # Verify payment exists
    if not any(p.payment_id == payment_id for p in order.payments):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment {payment_id} not found"
        )

    event = payment_confirmed(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        payment_id=payment_id,
        transaction_id=request.transaction_id,
        amount=request.amount,
    )
    await ledger.append(event)

    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.post("/{order_id}/close", response_model=OrderResponse)
async def close_order(
        order_id: str,
        ledger: EventLedger = Depends(get_ledger),
):
    """Close an order."""
    order = await get_order_or_404(ledger, order_id)

    if order.status == "closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is already closed"
        )

    if order.status == "voided":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot close a voided order"
        )

    if order.balance_due > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order has balance due: ${order.balance_due:.2f}"
        )

    event = order_closed(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        total=order.total,
    )
    await ledger.append(event)

    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


@router.post("/{order_id}/void", response_model=OrderResponse)
async def void_order(
        order_id: str,
        request: VoidOrderRequest,
        ledger: EventLedger = Depends(get_ledger),
):
    """Void an order."""
    order = await get_order_or_404(ledger, order_id)

    if order.status == "voided":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is already voided"
        )

    if order.status == "closed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot void a closed order"
        )

    event = order_voided(
        terminal_id=settings.terminal_id,
        order_id=order_id,
        reason=request.reason,
        approved_by=request.approved_by,
    )
    await ledger.append(event)

    order = await get_order_or_404(ledger, order_id)
    return OrderResponse.from_order(order)


# =============================================================================
# SEND TO KITCHEN
# =============================================================================

class SentItemResponse(BaseModel):
    item_id: str
    name: str
    category: Optional[str]
    seat_number: Optional[int]


class SendResponse(BaseModel):
    sent_count: int
    items: list[SentItemResponse]


@router.post("/{order_id}/send", response_model=SendResponse)
async def send_order(
        order_id: str,
        ledger: EventLedger = Depends(get_ledger),
):
    """Send unsent items to kitchen/bar printers."""
    order = await get_order_or_404(ledger, order_id)

    if order.status != "open":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot send items on {order.status} order"
        )

    unsent = [item for item in order.items if not getattr(item, 'sent', False)]
    if not unsent:
        return SendResponse(sent_count=0, items=[])

    from datetime import timezone
    sent_at = datetime.now(timezone.utc).isoformat()
    sent_items = []

    for item in unsent:
        event = item_sent(
            terminal_id=settings.terminal_id,
            order_id=order_id,
            item_id=item.item_id,
            name=item.name,
            seat_number=item.seat_number,
            category=item.category,
            sent_at=sent_at,
        )
        await ledger.append(event)
        sent_items.append(SentItemResponse(
            item_id=item.item_id,
            name=item.name,
            category=item.category,
            seat_number=item.seat_number,
        ))

    return SendResponse(sent_count=len(sent_items), items=sent_items)


# =============================================================================
# CLOSE BATCH
# =============================================================================

@router.post("/close-batch")
async def close_batch(ledger: EventLedger = Depends(get_ledger)):
    """Close all open orders, compute batch totals, and emit settlement events."""
    open_ids = await get_open_orders(ledger)
    closed_count = 0
    closed_order_ids = []

    for oid in open_ids:
        events = await ledger.get_events_by_correlation(oid)
        order = project_order(events, tax_rate=settings.tax_rate)
        if order and order.status == "open":
            evt = order_closed(
                terminal_id=settings.terminal_id,
                order_id=oid,
                total=order.total,
            )
            await ledger.append(evt)
            closed_count += 1
            closed_order_ids.append(oid)

    # Compute batch totals from current-day orders
    day_events = await get_current_day_events(ledger)
    all_orders = project_orders(day_events, tax_rate=settings.tax_rate)

    batch_total = 0.0
    batch_cash = 0.0
    batch_card = 0.0
    all_order_ids = []
    for order in all_orders.values():
        if order.status in ("closed", "paid"):
            batch_total += order.total
            all_order_ids.append(order.order_id)
            for p in order.payments:
                if p.status == "confirmed":
                    if p.method == "cash":
                        batch_cash += p.amount
                    else:
                        batch_card += p.amount

    # Emit BATCH_SUBMITTED with full settlement record
    submit_evt = batch_submitted(
        terminal_id=settings.terminal_id,
        order_count=len(all_order_ids),
        total_amount=batch_total,
        cash_total=batch_cash,
        card_total=batch_card,
        order_ids=all_order_ids,
    )
    await ledger.append(submit_evt)

    # Keep BATCH_CLOSED for backward compatibility
    batch_evt = create_event(
        event_type=EventType.BATCH_CLOSED,
        terminal_id=settings.terminal_id,
        payload={"order_count": closed_count},
    )
    await ledger.append(batch_evt)

    return {
        "success": True,
        "orders_closed_now": closed_count,
        "batch_total": round(batch_total, 2),
        "cash_total": round(batch_cash, 2),
        "card_total": round(batch_card, 2),
        "order_count": len(all_order_ids),
    }


# =============================================================================
# CLOSE DAY (manager action)
# =============================================================================

@router.post("/close-day")
async def close_day(ledger: EventLedger = Depends(get_ledger)):
    """
    End-of-day: close remaining orders, settle batch, store auditable
    day summary as a DAY_CLOSED event. After this, the next business
    day starts fresh — all day-scoped queries will only see new events.
    """
    # Close any remaining open orders
    open_ids = await get_open_orders(ledger)
    closed_count = 0
    for oid in open_ids:
        events = await ledger.get_events_by_correlation(oid)
        order = project_order(events, tax_rate=settings.tax_rate)
        if order and order.status in ("open", "paid"):
            evt = order_closed(
                terminal_id=settings.terminal_id,
                order_id=oid,
                total=order.total,
            )
            await ledger.append(evt)
            closed_count += 1

    # Build day summary BEFORE emitting boundary events
    all_events = await get_current_day_events(ledger)
    all_orders = project_orders(all_events, tax_rate=settings.tax_rate)

    total_orders = len(all_orders)
    total_sales = 0.0
    total_tips = 0.0
    cash_total = 0.0
    card_total = 0.0
    order_ids = []
    payment_count = 0

    for order in all_orders.values():
        if order.status in ("closed", "paid"):
            total_sales += order.total
            order_ids.append(order.order_id)
            for p in order.payments:
                if p.status == "confirmed":
                    payment_count += 1
                    if p.method == "cash":
                        cash_total += p.amount
                    else:
                        card_total += p.amount

    for e in all_events:
        if e.event_type == EventType.TIP_ADJUSTED:
            total_tips += e.payload.get("tip_amount", 0.0)

    # First event timestamp = when the day started
    opened_at = all_events[0].timestamp.isoformat() if all_events else None

    # Emit BATCH_SUBMITTED (settlement record)
    submit_evt = batch_submitted(
        terminal_id=settings.terminal_id,
        order_count=total_orders,
        total_amount=total_sales,
        cash_total=cash_total,
        card_total=card_total,
        order_ids=order_ids,
    )
    await ledger.append(submit_evt)

    # Emit DAY_CLOSED — this is the auditable snapshot and day boundary
    today = datetime.now().strftime("%Y-%m-%d")
    close_evt = day_closed(
        terminal_id=settings.terminal_id,
        date=today,
        total_orders=total_orders,
        total_sales=total_sales,
        total_tips=total_tips,
        cash_total=cash_total,
        card_total=card_total,
        order_ids=order_ids,
        payment_count=payment_count,
        opened_at=opened_at,
    )
    await ledger.append(close_evt)

    summary = {
        "date": today,
        "total_orders": total_orders,
        "orders_closed_now": closed_count,
        "total_sales": round(total_sales, 2),
        "total_tips": round(total_tips, 2),
        "cash_total": round(cash_total, 2),
        "card_total": round(card_total, 2),
        "order_ids": order_ids,
        "payment_count": payment_count,
        "opened_at": opened_at,
    }

    return {"success": True, "summary": summary}


