"""
Modifier Projection

Projects current modifier state from MODIFIER_CREATED / MODIFIER_UPDATED / MODIFIER_DELETED events.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from .events import Event, EventType


class Modifier(BaseModel):
    modifier_id: str
    name: str
    price: float = 0.0
    prefix_options: List[str] = []


def project_modifiers(events: List[Event]) -> List[Modifier]:
    """
    Build current modifier list by replaying events.
    Returns list of active modifiers sorted by name.
    """
    modifiers_map: Dict[str, Dict[str, Any]] = {}

    for event in events:
        payload = event.payload

        if event.event_type == EventType.MODIFIER_CREATED:
            mod_id = payload.get("modifier_id")
            if mod_id:
                modifiers_map[mod_id] = payload

        elif event.event_type == EventType.MODIFIER_UPDATED:
            mod_id = payload.get("modifier_id")
            if mod_id and mod_id in modifiers_map:
                modifiers_map[mod_id].update(payload)

        elif event.event_type == EventType.MODIFIER_DELETED:
            mod_id = payload.get("modifier_id")
            if mod_id and mod_id in modifiers_map:
                del modifiers_map[mod_id]

    return sorted(
        [Modifier(**m) for m in modifiers_map.values()],
        key=lambda m: m.name,
    )
