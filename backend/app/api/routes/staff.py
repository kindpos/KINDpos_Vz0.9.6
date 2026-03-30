from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from app.api.dependencies import get_ledger, get_snapshot_service
from app.core.event_ledger import EventLedger
from app.core.events import user_logged_in, user_logged_out, EventType
from app.config import settings
from app.services.overseer_config_service import OverseerConfigService
from app.services.server_snapshot_service import ServerSnapshotService

router = APIRouter(prefix="/servers", tags=["staff"])


@router.get("")
async def get_servers(ledger: EventLedger = Depends(get_ledger)):
    """
    Returns active employees shaped for the terminal login roster.
    Called by the terminal UI on mount to populate the PIN login screen.
    """
    service = OverseerConfigService(ledger)
    employees = await service.get_employees()
    return {
        "servers": [
            {
                "id": e.employee_id,
                "name": e.display_name,
                "pin": e.pin,
                "role": e.role_id,
            }
            for e in employees
            if e.active
        ]
    }


# =============================================================================
# SERVER SNAPSHOT DATA
# =============================================================================

@router.get("/{server_id}/snapshot")
async def get_server_snapshot(
    server_id: str,
    ledger: EventLedger = Depends(get_ledger),
    service: ServerSnapshotService = Depends(get_snapshot_service),
):
    """Get all data for the server snapshot screen."""
    config_service = OverseerConfigService(ledger)

    sales = await service.get_server_sales(server_id)
    checks = await service.get_server_checks(server_id)
    tips = await service.get_server_tips(server_id)
    
    rules = await config_service.get_tipout_rules()
    tip_out = await service.calculate_tip_out(server_id, rules=rules)
    
    blockers = await service.get_checkout_blockers(server_id)
    hourly_pace = await service.get_server_hourly_guest_pace(server_id)
    category_mix = await service.get_server_category_mix(server_id)
    
    return {
        "sales": sales,
        "checks": {
            "open_count": checks["open_count"],
            "closed_count": checks["closed_count"],
            "tables_turned": checks["tables_turned"]
        },
        "tips": tips,
        "tip_out": tip_out,
        "blockers": blockers,
        "hourly_pace": hourly_pace,
        "category_mix": category_mix
    }

class TipAdjustmentRequest(BaseModel):
    order_id: str
    payment_id: str
    tip_amount: float

@router.post("/tip-adjustment")
async def adjust_server_tip(
    request: TipAdjustmentRequest,
    service: ServerSnapshotService = Depends(get_snapshot_service),
):
    try:
        event = await service.adjust_tip(
            terminal_id=settings.terminal_id,
            order_id=request.order_id,
            payment_id=request.payment_id,
            tip_amount=request.tip_amount
        )
        return {"success": True, "event_id": event.sequence_number}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# CLOCK IN / OUT
# =============================================================================

class ClockInRequest(BaseModel):
    employee_id: str
    employee_name: str
    pin: Optional[str] = None


class ClockOutRequest(BaseModel):
    employee_id: str
    employee_name: str


@router.post("/clock-in")
async def clock_in(request: ClockInRequest, ledger: EventLedger = Depends(get_ledger)):
    """Record a staff clock-in event."""
    event = user_logged_in(
        terminal_id=settings.terminal_id,
        employee_id=request.employee_id,
        employee_name=request.employee_name,
    )
    await ledger.append(event)
    return {
        "success": True,
        "employee_id": request.employee_id,
        "employee_name": request.employee_name,
        "clocked_in_at": event.timestamp.isoformat(),
    }


@router.post("/clock-out")
async def clock_out(request: ClockOutRequest, ledger: EventLedger = Depends(get_ledger)):
    """Record a staff clock-out event."""
    event = user_logged_out(
        terminal_id=settings.terminal_id,
        employee_id=request.employee_id,
        employee_name=request.employee_name,
    )
    await ledger.append(event)
    return {
        "success": True,
        "employee_id": request.employee_id,
        "employee_name": request.employee_name,
        "clocked_out_at": event.timestamp.isoformat(),
    }


@router.get("/clocked-in")
async def get_clocked_in(ledger: EventLedger = Depends(get_ledger)):
    """Get all currently clocked-in staff by replaying login/logout events."""
    login_events = await ledger.get_events_by_type(EventType.USER_LOGGED_IN)
    logout_events = await ledger.get_events_by_type(EventType.USER_LOGGED_OUT)

    # Track latest clock-in per employee
    clocked_in = {}
    for e in sorted(login_events, key=lambda x: x.sequence_number or 0):
        eid = e.payload["employee_id"]
        clocked_in[eid] = {
            "employee_id": eid,
            "employee_name": e.payload["employee_name"],
            "clocked_in_at": e.timestamp.isoformat(),
        }

    # Remove anyone who clocked out after their last clock-in
    for e in sorted(logout_events, key=lambda x: x.sequence_number or 0):
        eid = e.payload["employee_id"]
        if eid in clocked_in:
            del clocked_in[eid]

    return {"staff": list(clocked_in.values())}
