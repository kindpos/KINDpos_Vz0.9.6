"""
KINDpos Event Ledger

The Event Ledger is the source of truth for the entire system.
All state is derived from replaying events stored here.

Key properties:
- Append-only: Events are never modified or deleted
- Hash-chained: Each event includes previous event's hash (tamper detection)
- WAL mode: Concurrent reads/writes without blocking
- Crash-safe: SQLite WAL ensures durability
"""

import asyncio
import aiosqlite
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, AsyncGenerator
from contextlib import asynccontextmanager

from .events import Event, EventType


class EventLedger:
    """
    Async SQLite-based Event Ledger.

    Usage:
        async with EventLedger("./data/ledger.db") as ledger:
            event = await ledger.append(my_event)
            events = await ledger.get_events_for_order(order_id)
    """

    def __init__(self, db_path: str = "./data/event_ledger.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._db: Optional[aiosqlite.Connection] = None
        self._write_lock = asyncio.Lock()
        self._last_checksum: str = ""  # Cached for hot-path append; init from DB on connect

    async def connect(self) -> None:
        """Open database connection and initialize schema."""
        self._db = await aiosqlite.connect(str(self.db_path))

        # Enable WAL mode for concurrent access
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA synchronous=NORMAL")
        await self._db.execute("PRAGMA cache_size=10000")
        await self._db.execute("PRAGMA mmap_size=268435456")      # 256MB memory-mapped I/O
        await self._db.execute("PRAGMA journal_size_limit=67108864")  # 64MB WAL size cap
        await self._db.execute("PRAGMA temp_store=MEMORY")

        # Create events table
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                sequence_number INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT UNIQUE NOT NULL,
                timestamp TEXT NOT NULL,
                terminal_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                user_id TEXT,
                user_role TEXT,
                correlation_id TEXT,
                previous_checksum TEXT,
                checksum TEXT NOT NULL,
                synced INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Indexes for common queries
        await self._db.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_correlation 
            ON events(correlation_id)
        """)
        await self._db.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_type 
            ON events(event_type)
        """)
        await self._db.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_timestamp 
            ON events(timestamp)
        """)
        await self._db.execute("""
            CREATE INDEX IF NOT EXISTS idx_events_synced 
            ON events(synced) WHERE synced = 0
        """)

        await self._db.commit()

        # Initialize cached checksum from DB for hot-path append (C-2 optimization).
        # Safe under single-writer assumption: only this process appends events.
        cursor = await self._db.execute(
            "SELECT checksum FROM events ORDER BY sequence_number DESC LIMIT 1"
        )
        row = await cursor.fetchone()
        self._last_checksum = row[0] if row else ""

    async def close(self) -> None:
        """Close database connection."""
        if self._db:
            await self._db.close()
            self._db = None

    async def __aenter__(self) -> "EventLedger":
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.close()

    # =========================================================================
    # WRITE OPERATIONS
    # =========================================================================

    async def append(self, event: Event) -> Event:
        """
        Append an event to the ledger.

        - Assigns sequence number
        - Computes checksum with hash chain
        - Returns the complete event
        """
        async with self._write_lock:
            # Use cached checksum instead of SELECT query (C-2 optimization)
            previous_checksum = self._last_checksum

            # Compute checksum
            checksum = event.compute_checksum(previous_checksum)

            # Serialize payload once for both INSERT and hash (H-3 optimization)
            payload_json = json.dumps(event.payload)

            # Insert event
            cursor = await self._db.execute(
                """
                INSERT INTO events (
                    event_id, timestamp, terminal_id, event_type, payload,
                    user_id, user_role, correlation_id, previous_checksum, checksum
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event.event_id,
                    event.timestamp.isoformat(),
                    event.terminal_id,
                    event.event_type.value,
                    payload_json,
                    event.user_id,
                    event.user_role,
                    event.correlation_id,
                    previous_checksum,
                    checksum,
                )
            )

            # Use lastrowid instead of SELECT query (C-2 optimization)
            sequence_number = cursor.lastrowid

            await self._db.commit()

            # Update cached checksum for next append
            self._last_checksum = checksum

            # Return complete event with sequence number and checksum
            return Event(
                event_id=event.event_id,
                timestamp=event.timestamp,
                terminal_id=event.terminal_id,
                event_type=event.event_type,
                payload=event.payload,
                user_id=event.user_id,
                user_role=event.user_role,
                correlation_id=event.correlation_id,
                sequence_number=sequence_number,
                previous_checksum=previous_checksum,
                checksum=checksum,
            )

    async def append_batch(self, events: list[Event]) -> list[Event]:
        """Append multiple events atomically."""
        results = []
        async with self._write_lock:
            # Use cached checksum instead of SELECT query (C-2 optimization)
            previous_checksum = self._last_checksum

            for event in events:
                if results:
                    previous_checksum = results[-1].checksum

                checksum = event.compute_checksum(previous_checksum)
                payload_json = json.dumps(event.payload)

                cursor = await self._db.execute(
                    """
                    INSERT INTO events (
                        event_id, timestamp, terminal_id, event_type, payload,
                        user_id, user_role, correlation_id, previous_checksum, checksum
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event.event_id,
                        event.timestamp.isoformat(),
                        event.terminal_id,
                        event.event_type.value,
                        payload_json,
                        event.user_id,
                        event.user_role,
                        event.correlation_id,
                        previous_checksum,
                        checksum,
                    )
                )

                results.append(Event(
                    event_id=event.event_id,
                    timestamp=event.timestamp,
                    terminal_id=event.terminal_id,
                    event_type=event.event_type,
                    payload=event.payload,
                    user_id=event.user_id,
                    user_role=event.user_role,
                    correlation_id=event.correlation_id,
                    sequence_number=cursor.lastrowid,
                    previous_checksum=previous_checksum,
                    checksum=checksum,
                ))

            await self._db.commit()

            # Update cached checksum to last event in batch
            if results:
                self._last_checksum = results[-1].checksum

        return results

    # =========================================================================
    # READ OPERATIONS
    # =========================================================================

    def _row_to_event(self, row: tuple) -> Event:
        """Convert a database row to an Event object."""
        return Event(
            sequence_number=row[0],
            event_id=row[1],
            timestamp=datetime.fromisoformat(row[2]),
            terminal_id=row[3],
            event_type=EventType(row[4]),
            payload=json.loads(row[5]),
            user_id=row[6],
            user_role=row[7],
            correlation_id=row[8],
            previous_checksum=row[9],
            checksum=row[10],
        )

    async def get_event(self, event_id: str) -> Optional[Event]:
        """Get a single event by ID."""
        cursor = await self._db.execute(
            """
            SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                   payload, user_id, user_role, correlation_id, previous_checksum, checksum
            FROM events WHERE event_id = ?
            """,
            (event_id,)
        )
        row = await cursor.fetchone()
        return self._row_to_event(row) if row else None

    async def get_events_by_correlation(self, correlation_id: str) -> list[Event]:
        """Get all events with a given correlation ID (e.g., all events for an order)."""
        cursor = await self._db.execute(
            """
            SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                   payload, user_id, user_role, correlation_id, previous_checksum, checksum
            FROM events 
            WHERE correlation_id = ?
            ORDER BY sequence_number ASC
            """,
            (correlation_id,)
        )
        rows = await cursor.fetchall()
        return [self._row_to_event(row) for row in rows]

    async def get_events_by_type(
            self,
            event_type: EventType,
            since: Optional[datetime] = None,
            limit: int = 1000
    ) -> list[Event]:
        """Get events of a specific type."""
        if since:
            cursor = await self._db.execute(
                """
                SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                       payload, user_id, user_role, correlation_id, previous_checksum, checksum
                FROM events 
                WHERE event_type = ? AND timestamp > ?
                ORDER BY sequence_number ASC
                LIMIT ?
                """,
                (event_type.value, since.isoformat(), limit)
            )
        else:
            cursor = await self._db.execute(
                """
                SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                       payload, user_id, user_role, correlation_id, previous_checksum, checksum
                FROM events 
                WHERE event_type = ?
                ORDER BY sequence_number ASC
                LIMIT ?
                """,
                (event_type.value, limit)
            )
        rows = await cursor.fetchall()
        return [self._row_to_event(row) for row in rows]

    async def get_events_by_types(
            self,
            event_types: list[EventType],
            limit: int = 5000
    ) -> list[Event]:
        """Get events matching any of the given types in a single query."""
        if not event_types:
            return []
        placeholders = ",".join("?" for _ in event_types)
        values = [et.value for et in event_types]
        values.append(limit)
        cursor = await self._db.execute(
            f"""
            SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                   payload, user_id, user_role, correlation_id, previous_checksum, checksum
            FROM events
            WHERE event_type IN ({placeholders})
            ORDER BY sequence_number ASC
            LIMIT ?
            """,
            values
        )
        rows = await cursor.fetchall()
        return [self._row_to_event(row) for row in rows]

    async def get_events_since(
            self,
            sequence_number: int = 0,
            limit: int = 1000
    ) -> list[Event]:
        """Get events since a given sequence number (for sync)."""
        cursor = await self._db.execute(
            """
            SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                   payload, user_id, user_role, correlation_id, previous_checksum, checksum
            FROM events 
            WHERE sequence_number > ?
            ORDER BY sequence_number ASC
            LIMIT ?
            """,
            (sequence_number, limit)
        )
        rows = await cursor.fetchall()
        return [self._row_to_event(row) for row in rows]

    async def get_last_day_close_sequence(self) -> int:
        """Get the sequence number of the most recent DAY_CLOSED event.

        Returns 0 if no day has been closed yet, meaning all events
        are in the 'current day'.
        """
        cursor = await self._db.execute(
            """
            SELECT sequence_number FROM events
            WHERE event_type = 'day.closed'
            ORDER BY sequence_number DESC
            LIMIT 1
            """
        )
        row = await cursor.fetchone()
        return row[0] if row else 0

    async def get_unsynced_events(self, limit: int = 100) -> list[Event]:
        """Get events that haven't been synced to cloud."""
        cursor = await self._db.execute(
            """
            SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                   payload, user_id, user_role, correlation_id, previous_checksum, checksum
            FROM events 
            WHERE synced = 0
            ORDER BY sequence_number ASC
            LIMIT ?
            """,
            (limit,)
        )
        rows = await cursor.fetchall()
        return [self._row_to_event(row) for row in rows]

    async def mark_synced(self, event_ids: list[str]) -> None:
        """Mark events as synced."""
        if not event_ids:
            return
        placeholders = ",".join("?" * len(event_ids))
        await self._db.execute(
            f"UPDATE events SET synced = 1 WHERE event_id IN ({placeholders})",
            event_ids
        )
        await self._db.commit()

    async def get_latest_sequence(self) -> int:
        """Get the latest sequence number."""
        cursor = await self._db.execute(
            "SELECT MAX(sequence_number) FROM events"
        )
        row = await cursor.fetchone()
        return row[0] or 0

    async def count_events(self) -> int:
        """Get total event count."""
        cursor = await self._db.execute("SELECT COUNT(*) FROM events")
        row = await cursor.fetchone()
        return row[0]

    # =========================================================================
    # INTEGRITY VERIFICATION
    # =========================================================================

    async def verify_chain(self, start: int = 0, end: Optional[int] = None) -> tuple[bool, Optional[int]]:
        """
        Verify the hash chain integrity.

        Returns:
            (is_valid, first_invalid_sequence) - If valid, second value is None
        """
        query = """
            SELECT sequence_number, event_id, timestamp, terminal_id, event_type,
                   payload, user_id, user_role, correlation_id, previous_checksum, checksum
            FROM events 
            WHERE sequence_number > ?
        """
        params = [start]

        if end:
            query += " AND sequence_number <= ?"
            params.append(end)

        query += " ORDER BY sequence_number ASC"

        cursor = await self._db.execute(query, params)

        previous_checksum = ""
        if start > 0:
            # Get the checksum of the event before our range
            prev_cursor = await self._db.execute(
                "SELECT checksum FROM events WHERE sequence_number = ?",
                (start,)
            )
            prev_row = await prev_cursor.fetchone()
            if prev_row:
                previous_checksum = prev_row[0]

        async for row in cursor:
            event = self._row_to_event(row)
            expected_checksum = event.compute_checksum(previous_checksum)

            if event.checksum != expected_checksum:
                return False, event.sequence_number

            if event.previous_checksum != previous_checksum:
                return False, event.sequence_number

            previous_checksum = event.checksum

        return True, None


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

async def get_order_events(ledger: EventLedger, order_id: str) -> list[Event]:
    """Get all events for a specific order."""
    return await ledger.get_events_by_correlation(order_id)


async def get_open_orders(ledger: EventLedger) -> list[str]:
    """Get IDs of orders that are still open (created but not closed/voided)."""
    # Single query for all three event types instead of three separate queries
    events = await ledger.get_events_by_types(
        [EventType.ORDER_CREATED, EventType.ORDER_CLOSED, EventType.ORDER_VOIDED],
        limit=10000,
    )

    created_order_ids: set[str] = set()
    closed_order_ids: set[str] = set()

    for e in events:
        order_id = e.payload["order_id"]
        if e.event_type == EventType.ORDER_CREATED:
            created_order_ids.add(order_id)
        else:
            closed_order_ids.add(order_id)

    return list(created_order_ids - closed_order_ids)
