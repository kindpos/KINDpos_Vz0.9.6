from typing import List, Dict, Any
from app.core.event_ledger import EventLedger
from app.core.events import EventType, Event
from app.models.config_events import (
    Role, Employee, TipoutRule,
    MenuItem, MenuCategory,
    Section, FloorPlanLayout,
    Terminal, Printer, RoutingMatrix,
    DashboardConfig, CustomReport, AccountsMapping
)

class OverseerConfigService:
    def __init__(self, ledger: EventLedger):
        self.ledger = ledger

    async def get_roles(self) -> List[Role]:
        events = await self.ledger.get_events_by_types([
            EventType.EMPLOYEE_ROLE_CREATED,
            EventType.EMPLOYEE_ROLE_UPDATED,
            EventType.EMPLOYEE_ROLE_DELETED,
        ], limit=3000)
        events.sort(key=lambda x: x.sequence_number or 0)

        roles = {}
        for e in events:
            payload = e.payload
            rid = payload["role_id"]
            if e.event_type == EventType.EMPLOYEE_ROLE_DELETED:
                roles.pop(rid, None)
            else:
                roles[rid] = Role(**payload)
        return list(roles.values())

    async def get_employees(self) -> List[Employee]:
        events = await self.ledger.get_events_by_types([
            EventType.EMPLOYEE_CREATED,
            EventType.EMPLOYEE_UPDATED,
            EventType.EMPLOYEE_DELETED,
        ], limit=15000)
        events.sort(key=lambda x: x.sequence_number or 0)

        emps = {}
        for e in events:
            payload = e.payload
            eid = payload["employee_id"]
            if e.event_type == EventType.EMPLOYEE_DELETED:
                emps.pop(eid, None)
            else:
                emps[eid] = Employee(**payload)
        return list(emps.values())

    async def get_tipout_rules(self) -> List[TipoutRule]:
        events = await self.ledger.get_events_by_types([
            EventType.TIPOUT_RULE_CREATED,
            EventType.TIPOUT_RULE_UPDATED,
            EventType.TIPOUT_RULE_DELETED,
        ], limit=3000)
        events.sort(key=lambda x: x.sequence_number or 0)

        rules = {}
        for e in events:
            payload = e.payload
            rid = payload["rule_id"]
            if e.event_type == EventType.TIPOUT_RULE_DELETED:
                rules.pop(rid, None)
            else:
                rules[rid] = TipoutRule(**payload)
        return list(rules.values())

    async def get_menu_categories(self) -> List[MenuCategory]:
        events = await self.ledger.get_events_by_types([
            EventType.MENU_CATEGORY_CREATED,
            EventType.MENU_CATEGORY_UPDATED,
        ], limit=2000)
        events.sort(key=lambda x: x.sequence_number or 0)

        cats = {}
        for e in events:
            payload = e.payload
            cid = payload["category_id"]
            cats[cid] = MenuCategory(**payload)
        return list(cats.values())

    async def get_menu_items(self) -> List[MenuItem]:
        events = await self.ledger.get_events_by_types([
            EventType.MENU_ITEM_CREATED,
            EventType.MENU_ITEM_UPDATED,
            EventType.MENU_ITEM_DELETED,
        ], limit=15000)
        events.sort(key=lambda x: x.sequence_number or 0)

        items = {}
        for e in events:
            payload = e.payload
            iid = payload["item_id"]
            if e.event_type == EventType.MENU_ITEM_DELETED:
                items.pop(iid, None)
            else:
                items[iid] = MenuItem(**payload)
        return list(items.values())

    async def get_floorplan_sections(self) -> List[Section]:
        events = await self.ledger.get_events_by_types([
            EventType.FLOORPLAN_SECTION_CREATED,
            EventType.FLOORPLAN_SECTION_UPDATED,
            EventType.FLOORPLAN_SECTION_DELETED,
        ], limit=3000)
        events.sort(key=lambda x: x.sequence_number or 0)

        sections = {}
        for e in events:
            payload = e.payload
            sid = payload["section_id"]
            if e.event_type == EventType.FLOORPLAN_SECTION_DELETED:
                sections.pop(sid, None)
            else:
                sections[sid] = Section(**payload)
        return list(sections.values())

    async def get_floorplan_layout(self) -> FloorPlanLayout:
        events = await self.ledger.get_events_by_types([
            EventType.FLOORPLAN_LAYOUT_UPDATED,
        ], limit=1000)
        if not events:
            return FloorPlanLayout(canvas={"width": 1200, "height": 800}, tables=[], structures=[], fixtures=[])

        events.sort(key=lambda x: x.sequence_number or 0)
        latest = events[-1]
        return FloorPlanLayout(**latest.payload)

    async def get_terminals(self) -> List[Terminal]:
        events = await self.ledger.get_events_by_types([
            EventType.TERMINAL_REGISTERED,
            EventType.TERMINAL_UPDATED,
        ], limit=2000)
        events.sort(key=lambda x: x.sequence_number or 0)

        terms = {}
        for e in events:
            payload = e.payload
            tid = payload["terminal_id"]
            # Merge or overwrite
            if tid in terms:
                updated_payload = terms[tid].model_dump()
                updated_payload.update(payload)
                terms[tid] = Terminal(**updated_payload)
            else:
                terms[tid] = Terminal(**payload)
        return list(terms.values())

    async def get_printers(self) -> List[Printer]:
        events = await self.ledger.get_events_by_types([
            EventType.PRINTER_REGISTERED,
        ], limit=1000)
        events.sort(key=lambda x: x.sequence_number or 0)

        printers = {}
        for e in events:
            payload = e.payload
            pid = payload["printer_id"]
            printers[pid] = Printer(**payload)
        return list(printers.values())

    async def get_routing_matrix(self) -> RoutingMatrix:
        events = await self.ledger.get_events_by_types([
            EventType.ROUTING_MATRIX_UPDATED,
        ], limit=1000)
        if not events:
            return RoutingMatrix(matrix={})

        events.sort(key=lambda x: x.sequence_number or 0)
        return RoutingMatrix(**events[-1].payload)
