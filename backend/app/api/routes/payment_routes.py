from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import asyncio
import uuid

# Correcting relative imports for app.api.routes
from ..dependencies import get_ledger
from ...core.event_ledger import EventLedger
from ...core.adapters.payment_manager import PaymentManager
from ...core.adapters.payment_validator import PaymentValidator
from ...core.adapters.base_payment import TransactionRequest, TransactionResult, ValidationStatus, ValidationResult, PaymentDeviceConfig, PaymentDeviceType
from ...core.adapters.mock_payment import MockPaymentDevice
from ...core.events import (
    payment_initiated, payment_confirmed, order_closed, tip_adjusted,
    create_event, EventType,
)
from ...core.projections import project_order
from ...config import settings

router = APIRouter(prefix="/payments", tags=["payments"])

_manager: Optional[PaymentManager] = None
_validator: Optional[PaymentValidator] = None

_device_initialized = False
_device_init_lock = asyncio.Lock()

async def _ensure_configured_device(manager: PaymentManager, ledger: EventLedger):
    """Register payment device based on PAYMENT_DEVICE_CONFIGURED events.
    If no configuration event exists, no device is registered — the setup wizard
    must be completed first."""
    global _device_initialized
    if _device_initialized:
        return
    async with _device_init_lock:
        if _device_initialized:
            return
        _device_initialized = True

    # Query for device configuration events
    config_events = await ledger.get_events_by_type(
        EventType.PAYMENT_DEVICE_CONFIGURED, limit=100
    )
    if not config_events:
        return  # No device configured — wizard not completed

    # Use the latest configuration
    latest = sorted(config_events, key=lambda e: e.sequence_number or 0)[-1]
    device_type = latest.payload.get("device_type", "mock")
    device_id = latest.payload.get("device_id", "configured_001")

    if device_type == "mock":
        mock = MockPaymentDevice()
        config = PaymentDeviceConfig(
            device_id=device_id,
            name="Mock Payment Device (configured)",
            device_type=PaymentDeviceType.SMART_TERMINAL,
            ip_address="127.0.0.1",
            mac_address="00:00:00:00:00:00",
            port=8443,
            protocol="mock",
            processor_id="mock_processor",
        )
        await mock.connect(config)
        manager.register_device(mock)
        manager.map_terminal_to_device(settings.terminal_id, device_id)
        manager.map_terminal_to_device("T-01", device_id)
    # Future: elif device_type == "dejavoo_spin": register real Dejavoo device

def get_payment_manager(ledger: EventLedger = Depends(get_ledger)) -> PaymentManager:
    global _manager
    if _manager is None:
        _manager = PaymentManager(ledger, settings.terminal_id)
    return _manager

def get_payment_validator(ledger: EventLedger = Depends(get_ledger)) -> PaymentValidator:
    global _validator
    if _validator is None:
        _validator = PaymentValidator(ledger)
    return _validator

@router.post("/sale")
async def process_sale(
    request: TransactionRequest,
    ledger: EventLedger = Depends(get_ledger),
    manager: PaymentManager = Depends(get_payment_manager),
    validator: PaymentValidator = Depends(get_payment_validator)
):
    """Initiate sale. Returns ValidationResult or TransactionResult."""
    await _ensure_configured_device(manager, ledger)

    # If no device is registered, setup wizard hasn't been completed
    if not manager._devices:
        raise HTTPException(
            status_code=503,
            detail={"error": "no_payment_device", "message": "Complete setup wizard to configure payment processing"}
        )

    # 1. Resolve Device
    device_id = manager._terminal_device_map.get(request.terminal_id)
    device = manager._devices.get(device_id) if device_id else None

    # 2. Validate
    v_result = await validator.validate(request, device)
    if v_result.status == ValidationStatus.REJECTED:
        raise HTTPException(status_code=400, detail=v_result.reason)

    if v_result.status == ValidationStatus.NEEDS_APPROVAL:
        return v_result # Return to frontend for PIN entry

    # 3. Process
    result = await manager.initiate_sale(request)
    return result


# =============================================================================
# CASH PAYMENT
# =============================================================================

class CashPaymentRequest(BaseModel):
    order_id: str
    amount: float
    tip: float = 0.0
    payment_method: str = "cash"


@router.post("/cash")
async def process_cash_payment(
    request: CashPaymentRequest,
    ledger: EventLedger = Depends(get_ledger),
):
    """Process a cash payment — immediately confirmed, closes order if fully paid."""
    # Get current order state
    events = await ledger.get_events_by_correlation(request.order_id)
    if not events:
        raise HTTPException(status_code=404, detail=f"Order {request.order_id} not found")
    order = project_order(events, tax_rate=settings.tax_rate)
    if not order:
        raise HTTPException(status_code=404, detail=f"Order {request.order_id} not found")

    if order.status in ("closed", "voided"):
        raise HTTPException(status_code=400, detail=f"Cannot pay on {order.status} order")

    payment_id = f"pay_{uuid.uuid4().hex[:8]}"
    total_with_tip = round(request.amount + request.tip, 2)

    # Emit PAYMENT_INITIATED
    init_evt = payment_initiated(
        terminal_id=settings.terminal_id,
        order_id=request.order_id,
        payment_id=payment_id,
        amount=total_with_tip,
        method="cash",
    )
    await ledger.append(init_evt)

    # Cash is immediately confirmed
    confirm_evt = payment_confirmed(
        terminal_id=settings.terminal_id,
        order_id=request.order_id,
        payment_id=payment_id,
        transaction_id=f"cash_{uuid.uuid4().hex[:8]}",
        amount=total_with_tip,
    )
    await ledger.append(confirm_evt)

    # Record tip if any
    if request.tip > 0:
        tip_evt = tip_adjusted(
            terminal_id=settings.terminal_id,
            order_id=request.order_id,
            payment_id=payment_id,
            tip_amount=request.tip,
        )
        await ledger.append(tip_evt)

    # Re-project to check if fully paid
    events = await ledger.get_events_by_correlation(request.order_id)
    order = project_order(events, tax_rate=settings.tax_rate)

    # Auto-close if fully paid
    if order and order.is_fully_paid and order.status != "closed":
        close_evt = order_closed(
            terminal_id=settings.terminal_id,
            order_id=request.order_id,
            total=order.total,
        )
        await ledger.append(close_evt)

    return {
        "success": True,
        "payment_id": payment_id,
        "order_id": request.order_id,
        "amount": total_with_tip,
        "tip": request.tip,
    }


# =============================================================================
# TIP ADJUSTMENT (post-payment)
# =============================================================================

class TipAdjustRequest(BaseModel):
    order_id: str
    payment_id: str
    tip_amount: float


@router.post("/tip-adjust")
async def adjust_tip(
    request: TipAdjustRequest,
    ledger: EventLedger = Depends(get_ledger),
):
    """Adjust tip on an existing payment (e.g. from signed credit card receipt)."""
    events = await ledger.get_events_by_correlation(request.order_id)
    if not events:
        raise HTTPException(status_code=404, detail=f"Order {request.order_id} not found")
    order = project_order(events, tax_rate=settings.tax_rate)
    if not order:
        raise HTTPException(status_code=404, detail=f"Order {request.order_id} not found")

    # Find the payment
    target = None
    for p in order.payments:
        if p.payment_id == request.payment_id:
            target = p
            break
    if not target:
        raise HTTPException(status_code=404, detail=f"Payment {request.payment_id} not found")
    if target.status != "confirmed":
        raise HTTPException(status_code=400, detail="Can only adjust tips on confirmed payments")

    # Get previous tip from existing TIP_ADJUSTED events
    previous_tip = 0.0
    for e in events:
        if (e.event_type == EventType.TIP_ADJUSTED
                and e.payload.get("payment_id") == request.payment_id):
            previous_tip = e.payload.get("tip_amount", 0.0)

    tip_amt = round(request.tip_amount, 2)
    evt = tip_adjusted(
        terminal_id=settings.terminal_id,
        order_id=request.order_id,
        payment_id=request.payment_id,
        tip_amount=tip_amt,
        previous_tip=previous_tip,
    )
    await ledger.append(evt)

    return {
        "success": True,
        "order_id": request.order_id,
        "payment_id": request.payment_id,
        "tip_amount": tip_amt,
        "previous_tip": previous_tip,
    }


@router.get("/device-status")
async def get_device_status(manager: PaymentManager = Depends(get_payment_manager)):
    """All devices: id, name, status, last_checked."""
    return [
        {
            "id": d.config.device_id if d.config else "unknown",
            "name": d.config.name if d.config else "Unknown",
            "status": d.status,
            "ip": d.config.ip_address if d.config else None
        }
        for d in manager._devices.values()
    ]
