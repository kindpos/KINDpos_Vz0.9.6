"""
Seed script — appends EMPLOYEE_CREATED events for the default staff roster.

Usage (from backend/ directory):
    ..\\.venv\\Scripts\\python.exe seed_employees.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.core.event_ledger import EventLedger
from app.core.events import create_event, EventType

STAFF = [
    {"employee_id": "alex",   "first_name": "Alex",   "last_name": "M.",      "display_name": "Alex M.",   "role_id": "manager", "pin": "1234", "hourly_rate": 0.0},
    {"employee_id": "jordan", "first_name": "Jordan", "last_name": "K.",      "display_name": "Jordan K.", "role_id": "server",  "pin": "5678", "hourly_rate": 0.0},
    {"employee_id": "casey",  "first_name": "Casey",  "last_name": "R.",      "display_name": "Casey R.",  "role_id": "server",  "pin": "9012", "hourly_rate": 0.0},
    {"employee_id": "sam",    "first_name": "Sam",    "last_name": "T.",      "display_name": "Sam T.",    "role_id": "server",  "pin": "3456", "hourly_rate": 0.0},
]

async def main():
    ledger = EventLedger("./data/event_ledger.db")
    await ledger.connect()

    # Check for existing employees so re-running is safe
    existing = await ledger.get_events_by_type(EventType.EMPLOYEE_CREATED, limit=1000)
    existing_ids = {e.payload.get("employee_id") for e in existing}

    seeded = 0
    for emp in STAFF:
        if emp["employee_id"] in existing_ids:
            print(f"  skip  {emp['display_name']} (already in ledger)")
            continue
        event = create_event(
            event_type=EventType.EMPLOYEE_CREATED,
            terminal_id="SEED",
            payload={**emp, "active": True},
        )
        await ledger.append(event)
        print(f"  added {emp['display_name']}  [{emp['role_id']}]  PIN: {emp['pin']}")
        seeded += 1

    await ledger.close()
    print(f"\nDone — {seeded} employee(s) seeded.")

if __name__ == "__main__":
    asyncio.run(main())
