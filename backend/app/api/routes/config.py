from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Dict, Any
from app.api.dependencies import get_ledger
from app.core.event_ledger import EventLedger
from app.core.events import EventType, Event, create_event
from app.models.config_events import (
    StoreConfigBundle, StoreInfo, CCProcessingRate, PendingChange,
    Role, Employee, TipoutRule, MenuItem, MenuCategory, Section, FloorPlanLayout,
    Terminal, Printer, RoutingMatrix
)
from app.services.store_config_service import StoreConfigService
from app.services.overseer_config_service import OverseerConfigService

router = APIRouter(prefix="/config", tags=["config"])

# Mock WebSocket broadcast for now as we don't have a real implementation handy in routers
async def broadcast_config_update(sections: List[str]):
    print(f"WS BROADCAST: config.updated for {sections}")

@router.get("/store", response_model=StoreConfigBundle)
async def get_store_config(ledger: EventLedger = Depends(get_ledger)):
    service = StoreConfigService(ledger)
    return await service.get_projected_config()

# New Overseer Endpoints
@router.get("/roles", response_model=List[Role])
async def get_roles(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_roles()

@router.get("/employees", response_model=List[Employee])
async def get_employees(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_employees()

@router.get("/tipout", response_model=List[TipoutRule])
async def get_tipout(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_tipout_rules()

@router.get("/menu/categories", response_model=List[MenuCategory])
async def get_menu_categories(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_menu_categories()

@router.get("/menu/items", response_model=List[MenuItem])
async def get_menu_items(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_menu_items()

@router.get("/floorplan/sections", response_model=List[Section])
async def get_floorplan_sections(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_floorplan_sections()

@router.get("/floorplan", response_model=FloorPlanLayout)
async def get_floorplan(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_floorplan_layout()

@router.get("/terminals", response_model=List[Terminal])
async def get_terminals(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_terminals()

@router.get("/routing", response_model=RoutingMatrix)
async def get_routing(ledger: EventLedger = Depends(get_ledger)):
    service = OverseerConfigService(ledger)
    return await service.get_routing_matrix()

@router.post("/store/info")
async def update_store_info(info: StoreInfo, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    event = create_event(
        event_type=EventType.STORE_INFO_UPDATED,
        terminal_id="OVERSEER",
        payload=info.model_dump()
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["store"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.post("/store/cc-rate")
async def update_cc_rate(rate: CCProcessingRate, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    event = create_event(
        event_type=EventType.STORE_CC_PROCESSING_RATE_UPDATED,
        terminal_id="OVERSEER",
        payload=rate.model_dump()
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["store"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.post("/push")
async def push_changes(changes: List[PendingChange], background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    events = []
    sections = set()
    for change in changes:
        event = create_event(
            event_type=EventType(change.event_type),
            terminal_id="OVERSEER",
            payload=change.payload
        )
        events.append(event)
        
        # Infer section from event type
        etype = change.event_type
        if etype.startswith("store."):
            sections.add("store")
        elif etype.startswith("employee.") or etype.startswith("tipout."):
            sections.add("employees")
        elif etype.startswith("menu.") or etype.startswith("category."):
            sections.add("menu")
        elif etype.startswith("floorplan."):
            sections.add("floor_plan")
        elif etype.startswith("terminal.") or etype.startswith("routing."):
            sections.add("hardware")
    
    if events:
        await ledger.append_batch(events)
        background_tasks.add_task(broadcast_config_update, list(sections))
    
    return {
        "status": "ok",
        "events_written": len(events),
        "event_ids": [e.sequence_number for e in events]
    }

@router.post("/menu/86")
async def item_86(item_id: str, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    event = create_event(
        event_type=EventType.MENU_ITEM_86D,
        terminal_id="OVERSEER",
        payload={"item_id": item_id}
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["menu"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.post("/menu/restore")
async def item_restore(item_id: str, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    event = create_event(
        event_type=EventType.MENU_ITEM_RESTORED,
        terminal_id="OVERSEER",
        payload={"item_id": item_id}
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["menu"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.post("/roles")
async def create_role(role: Role, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    event = create_event(
        event_type=EventType.EMPLOYEE_ROLE_CREATED,
        terminal_id="OVERSEER",
        payload=role.model_dump()
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["employees"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.put("/roles/{role_id}")
async def update_role(role_id: str, role: Role, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    event = create_event(
        event_type=EventType.EMPLOYEE_ROLE_UPDATED,
        terminal_id="OVERSEER",
        payload=role.model_dump()
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["employees"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.delete("/roles/{role_id}")
async def delete_role(role_id: str, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    event = create_event(
        event_type=EventType.EMPLOYEE_ROLE_DELETED,
        terminal_id="OVERSEER",
        payload={"role_id": role_id}
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["employees"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.post("/employees")
async def create_employee(employee: Employee, background_tasks: BackgroundTasks, ledger: EventLedger = Depends(get_ledger)):
    # In a real system, we'd use employee.created event, 
    # but for now let's stick to the pattern.
    event = create_event(
        event_type=EventType.EMPLOYEE_CREATED,
        terminal_id="OVERSEER",
        payload=employee.model_dump()
    )
    await ledger.append(event)
    background_tasks.add_task(broadcast_config_update, ["employees"])
    return {"status": "ok", "event_id": event.sequence_number}

@router.get("/terminal-bundle")
async def get_terminal_bundle(ledger: EventLedger = Depends(get_ledger)):
    store_service = StoreConfigService(ledger)
    overseer_service = OverseerConfigService(ledger)

    # Project cash discount from events
    cash_discount_events = await ledger.get_events_by_type(
        EventType.CASH_DISCOUNT_CONFIGURED, limit=100
    )
    cash_discount = {"rate": 0.035, "enabled": False}
    if cash_discount_events:
        latest = sorted(cash_discount_events, key=lambda e: e.sequence_number or 0)[-1]
        cash_discount = {
            "rate": latest.payload.get("rate", 0.035),
            "enabled": latest.payload.get("enabled", True),
        }

    from datetime import datetime, timezone
    return {
        "bundle_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "store": await store_service.get_projected_config(),
        "employees": await overseer_service.get_employees(),
        "roles": await overseer_service.get_roles(),
        "menu": {
            "categories": await overseer_service.get_menu_categories(),
            "items": await overseer_service.get_menu_items()
        },
        "floor_plan": {
            "sections": await overseer_service.get_floorplan_sections(),
            "layout": await overseer_service.get_floorplan_layout()
        },
        "hardware": {
            "terminals": await overseer_service.get_terminals(),
            "printers": await overseer_service.get_printers(),
            "routing": await overseer_service.get_routing_matrix()
        },
        "cash_discount": cash_discount,
    }
