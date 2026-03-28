from typing import List, Dict, Any
from app.core.event_ledger import EventLedger
from app.core.events import EventType, Event
from app.models.config_events import (
    StoreConfigBundle, StoreInfo, TaxRule, CCProcessingRate, 
    OperatingHours, StoreOrderTypes, StoreAutoGratuity
)

class StoreConfigService:
    def __init__(self, ledger: EventLedger):
        self.ledger = ledger

    async def get_projected_config(self) -> StoreConfigBundle:
        # Fetch all store related events
        # In a real system, we'd filter by store.* event types
        # For simplicity, we'll fetch all and filter in memory or use a specialized query
        
        # We need to find all STORE_* event types
        store_event_types = [
            EventType.STORE_INFO_UPDATED,
            EventType.STORE_CC_PROCESSING_RATE_UPDATED,
            EventType.STORE_TAX_RULE_CREATED,
            EventType.STORE_TAX_RULE_UPDATED,
            EventType.STORE_TAX_RULE_DELETED,
            EventType.STORE_OPERATING_HOURS_UPDATED,
            EventType.STORE_ORDER_TYPES_UPDATED,
            EventType.STORE_AUTO_GRATUITY_UPDATED
        ]
        
        # This is a bit inefficient to call for each type, but it works with existing ledger API
        all_events = []
        for et in store_event_types:
            events = await self.ledger.get_events_by_type(et, limit=5000)
            if isinstance(events, list):
                all_events.extend(events)
            else:
                # Fallback if it's somehow still a coroutine (should not happen with await)
                print(f"WARNING: events for {et} is {type(events)}")
            
        # Sort by sequence to ensure correct projection
        all_events.sort(key=lambda x: x.sequence_number or 0)
        
        return self.project_events(all_events)

    def project_events(self, events: List[Event]) -> StoreConfigBundle:
        config = {
            "info": {
                "restaurant_name": "KINDpos",
                "address_line_1": "",
                "city": "",
                "state": "",
                "zip": "",
                "phone": ""
            },
            "tax_rules": {},
            "cc_processing": {
                "rate_percent": 2.9,
                "per_transaction_fee": 0.30
            },
            "operating_hours": {},
            "order_types": { "enabled_types": [] },
            "auto_gratuity": { "enabled": False, "party_size_threshold": 6, "rate_percent": 20.0, "applies_to_order_types": ["dine_in"] },
            "cash_discount_rate": 0.0
        }

        for event in events:
            etype = event.event_type
            payload = event.payload

            if etype == EventType.STORE_INFO_UPDATED:
                config["info"] = payload
            elif etype == EventType.STORE_TAX_RULE_CREATED:
                rid = payload["tax_rule_id"]
                config["tax_rules"][rid] = payload
            elif etype == EventType.STORE_TAX_RULE_UPDATED:
                rid = payload["tax_rule_id"]
                config["tax_rules"][rid] = payload
            elif etype == EventType.STORE_TAX_RULE_DELETED:
                rid = payload["tax_rule_id"]
                config["tax_rules"].pop(rid, None)
            elif etype == EventType.STORE_CC_PROCESSING_RATE_UPDATED:
                config["cc_processing"] = payload
            elif etype == EventType.STORE_OPERATING_HOURS_UPDATED:
                config["operating_hours"] = payload.get("hours", {})
            elif etype == EventType.STORE_ORDER_TYPES_UPDATED:
                config["order_types"] = payload
            elif etype == EventType.STORE_AUTO_GRATUITY_UPDATED:
                config["auto_gratuity"] = payload

        # Format tax_rules as list
        config["tax_rules"] = list(config["tax_rules"].values())
        
        return StoreConfigBundle(**config)
