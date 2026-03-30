"""
KINDpos Setup Wizard Routes

Provides the setup status endpoint and POST endpoints for each wizard step.
Gates the system until core configuration is complete.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
import uuid

from app.api.dependencies import get_ledger
from app.core.event_ledger import EventLedger
from app.core.events import EventType, create_event
from app.core.modifier_projection import project_modifiers

router = APIRouter(prefix="/setup", tags=["setup"])
modifiers_router = APIRouter(tags=["modifiers"])


# ── Request Models ──────────────────────────────────────

class EmployeeInput(BaseModel):
    name: str
    role: str
    pin: str


class TaxRateInput(BaseModel):
    rate: float


class MenuItemInput(BaseModel):
    name: str
    price: float
    category: str = "Uncategorized"
    description: Optional[str] = None


class MenuCategoryInput(BaseModel):
    name: str
    items: List[MenuItemInput] = []


class MenuInput(BaseModel):
    categories: List[MenuCategoryInput] = []
    skip: bool = False


class ModifierInput(BaseModel):
    name: str
    price: float = 0.0
    prefix_options: List[str] = []


class PaymentDeviceInput(BaseModel):
    device_type: str  # "mock" or "dejavoo_spin"
    device_id: Optional[str] = None
    tpn: Optional[str] = None
    register_id: Optional[str] = None
    auth_key: Optional[str] = None


class CashDiscountInput(BaseModel):
    rate: float = 0.035
    enabled: bool = True


# ── Setup Status ────────────────────────────────────────

@router.get("/status")
async def get_setup_status(ledger: EventLedger = Depends(get_ledger)):
    """Check which setup steps are complete by querying the event ledger."""

    # Query each required event type
    employees = await ledger.get_events_by_type(EventType.EMPLOYEE_CREATED, limit=1000)
    tax_rules = await ledger.get_events_by_type(EventType.STORE_TAX_RULE_CREATED, limit=100)
    menu_items = await ledger.get_events_by_type(EventType.MENU_ITEM_CREATED, limit=1000)
    menu_cats = await ledger.get_events_by_type(EventType.MENU_CATEGORY_CREATED, limit=100)
    modifiers = await ledger.get_events_by_type(EventType.MODIFIER_CREATED, limit=1000)
    payment_device = await ledger.get_events_by_type(EventType.PAYMENT_DEVICE_CONFIGURED, limit=10)
    cash_discount = await ledger.get_events_by_type(EventType.CASH_DISCOUNT_CONFIGURED, limit=10)

    # Also check legacy batch events for menu
    items_batch = await ledger.get_events_by_type(EventType.ITEMS_BATCH_CREATED, limit=10)

    emp_complete = len(employees) > 0
    tax_complete = len(tax_rules) > 0
    menu_complete = len(menu_items) > 0 or len(items_batch) > 0
    mod_complete = len(modifiers) > 0
    pay_complete = len(payment_device) > 0
    cash_complete = len(cash_discount) > 0

    # Get latest cash discount value
    cash_value = None
    if cash_discount:
        latest = sorted(cash_discount, key=lambda e: e.sequence_number or 0)[-1]
        cash_value = latest.payload.get("rate")

    # Get latest payment device type
    device_type = None
    if payment_device:
        latest = sorted(payment_device, key=lambda e: e.sequence_number or 0)[-1]
        device_type = latest.payload.get("device_type")

    # Get latest tax rate
    tax_value = None
    if tax_rules:
        latest = sorted(tax_rules, key=lambda e: e.sequence_number or 0)[-1]
        tax_value = latest.payload.get("rate_percent")

    steps = {
        "employees": {"complete": emp_complete, "count": len(employees)},
        "tax_rate": {"complete": tax_complete, "value": tax_value},
        "menu": {
            "complete": menu_complete,
            "category_count": len(menu_cats),
            "item_count": len(menu_items),
        },
        "modifiers": {"complete": mod_complete, "count": len(modifiers)},
        "payment_device": {"complete": pay_complete, "device_type": device_type},
        "cash_discount": {"complete": cash_complete, "value": cash_value},
    }

    setup_complete = all(s["complete"] for s in steps.values())

    return {"setup_complete": setup_complete, "steps": steps}


# ── Step 1: Employees ──────────────────────────────────

@router.post("/employees")
async def setup_employees(
    employees: List[EmployeeInput],
    ledger: EventLedger = Depends(get_ledger),
):
    """Create employees from the setup wizard."""
    created = []
    for emp in employees:
        emp_id = f"emp_{uuid.uuid4().hex[:8]}"
        event = create_event(
            event_type=EventType.EMPLOYEE_CREATED,
            terminal_id="SETUP_WIZARD",
            payload={
                "employee_id": emp_id,
                "display_name": emp.name,
                "name": emp.name,
                "pin": emp.pin,
                "role": emp.role,
            },
        )
        await ledger.append(event)
        created.append({"employee_id": emp_id, "name": emp.name, "role": emp.role})
    return {"status": "ok", "employees_created": len(created), "employees": created}


# ── Step 2: Tax Rate ───────────────────────────────────

@router.post("/tax-rate")
async def setup_tax_rate(
    data: TaxRateInput,
    ledger: EventLedger = Depends(get_ledger),
):
    """Set the store tax rate."""
    event = create_event(
        event_type=EventType.STORE_TAX_RULE_CREATED,
        terminal_id="SETUP_WIZARD",
        payload={
            "tax_rule_id": "default",
            "name": "Default Sales Tax",
            "rate_percent": data.rate,
            "applies_to": "all",
        },
    )
    await ledger.append(event)
    return {"status": "ok", "rate_percent": data.rate}


# ── Step 3: Menu ───────────────────────────────────────

@router.post("/menu")
async def setup_menu(
    data: MenuInput,
    ledger: EventLedger = Depends(get_ledger),
):
    """Import menu categories and items."""
    if data.skip:
        return {"status": "skipped", "message": "Menu setup deferred to Settings"}

    events = []
    item_count = 0
    for cat in data.categories:
        cat_id = f"cat_{uuid.uuid4().hex[:8]}"
        events.append(
            create_event(
                event_type=EventType.MENU_CATEGORY_CREATED,
                terminal_id="SETUP_WIZARD",
                payload={
                    "category_id": cat_id,
                    "name": cat.name,
                    "label": cat.name,
                    "display_order": 0,
                },
            )
        )
        for item in cat.items:
            item_id = f"item_{uuid.uuid4().hex[:8]}"
            events.append(
                create_event(
                    event_type=EventType.MENU_ITEM_CREATED,
                    terminal_id="SETUP_WIZARD",
                    payload={
                        "item_id": item_id,
                        "name": item.name,
                        "price": item.price,
                        "category": cat.name,
                        "category_id": cat_id,
                        "description": item.description or "",
                    },
                )
            )
            item_count += 1

    if events:
        await ledger.append_batch(events)

    return {
        "status": "ok",
        "categories_created": len(data.categories),
        "items_created": item_count,
    }


# ── Step 4: Modifiers ─────────────────────────────────

@router.post("/modifiers")
async def setup_modifiers(
    modifiers: List[ModifierInput],
    ledger: EventLedger = Depends(get_ledger),
):
    """Create modifiers from the setup wizard."""
    events = []
    for mod in modifiers:
        mod_id = f"mod_{uuid.uuid4().hex[:8]}"
        events.append(
            create_event(
                event_type=EventType.MODIFIER_CREATED,
                terminal_id="SETUP_WIZARD",
                payload={
                    "modifier_id": mod_id,
                    "name": mod.name,
                    "price": mod.price,
                    "prefix_options": mod.prefix_options,
                },
            )
        )

    if events:
        await ledger.append_batch(events)

    return {"status": "ok", "modifiers_created": len(events)}


# ── Step 5: Payment Device ─────────────────────────────

@router.post("/payment-device")
async def setup_payment_device(
    data: PaymentDeviceInput,
    ledger: EventLedger = Depends(get_ledger),
):
    """Configure the payment device."""
    payload = {
        "device_type": data.device_type,
        "device_id": data.device_id or f"dev_{uuid.uuid4().hex[:8]}",
    }
    if data.device_type == "dejavoo_spin":
        payload.update({
            "tpn": data.tpn,
            "register_id": data.register_id,
            "auth_key": data.auth_key,
        })

    event = create_event(
        event_type=EventType.PAYMENT_DEVICE_CONFIGURED,
        terminal_id="SETUP_WIZARD",
        payload=payload,
    )
    await ledger.append(event)
    return {"status": "ok", "device_type": data.device_type}


# ── Step 6: Cash Discount ─────────────────────────────

@router.post("/cash-discount")
async def setup_cash_discount(
    data: CashDiscountInput,
    ledger: EventLedger = Depends(get_ledger),
):
    """Configure the cash discount program."""
    event = create_event(
        event_type=EventType.CASH_DISCOUNT_CONFIGURED,
        terminal_id="SETUP_WIZARD",
        payload={
            "rate": data.rate,
            "enabled": data.enabled,
        },
    )
    await ledger.append(event)
    return {"status": "ok", "rate": data.rate, "enabled": data.enabled}


# ── Modifiers Query Endpoint (top-level) ───────────────

@modifiers_router.get("/modifiers")
async def get_modifiers(ledger: EventLedger = Depends(get_ledger)):
    """Get current modifier list projected from events."""
    mod_events = await ledger.get_events_by_types(
        [EventType.MODIFIER_CREATED, EventType.MODIFIER_UPDATED, EventType.MODIFIER_DELETED],
        limit=5000,
    )
    mods = project_modifiers(mod_events)
    return [m.model_dump() for m in mods]
