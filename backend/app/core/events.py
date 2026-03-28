"""
KINDpos Event Definitions

Events are the source of truth. Everything else is a projection.
This module defines all event types and provides factory functions
for creating properly structured events.
"""

from enum import Enum
from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, Field
import uuid
import hashlib
import json


class OrderType(str, Enum):
    """Core order types used by KINDpos."""
    DINE_IN   = "dine_in"
    TO_GO     = "to_go"
    BAR_TAB   = "bar_tab"
    DELIVERY  = "delivery"
    STAFF     = "staff"


class EventType(str, Enum):
    """
    All possible event types in the system.

    Convention: dot.notation (domain.action) for all values.
    Enum member names use SCREAMING_SNAKE for Python readability.
    """

    # Order lifecycle
    ORDER_CREATED = "order.created"
    ORDER_CLOSED = "order.closed"
    ORDER_VOIDED = "order.voided"
    ORDER_TYPE_CHANGED = "order.type_changed"

    # Item management
    ITEM_ADDED = "item.added"
    ITEM_REMOVED = "item.removed"
    ITEM_MODIFIED = "item.modified"
    ITEM_SENT = "item.sent"
    MODIFIER_APPLIED = "item.modifier_applied"

    # Discounts
    DISCOUNT_REQUESTED = "discount.requested"
    DISCOUNT_APPROVED = "discount.approved"
    DISCOUNT_REJECTED = "discount.rejected"

    # Printing
    TICKET_PRINTED = "ticket.printed"
    TICKET_PRINT_FAILED = "ticket.print_failed"
    TICKET_REPRINTED = "ticket.reprinted"
    RECEIPT_PRINTED = "receipt.printed"
    RECEIPT_REPRINTED = "receipt.reprinted"
    PRINT_JOB_QUEUED = "print.job_queued"
    PRINT_JOB_SENT = "print.job_sent"
    PRINT_JOB_COMPLETED = "print.job_completed"
    PRINT_JOB_FAILED = "print.job_failed"
    PRINT_JOB_RETRIED = "print.job_retried"
    PRINT_RETRYING = "print.retrying"
    PRINT_REROUTED = "print.rerouted"

    # Delivery lifecycle
    DELIVERY_INFO_ADDED = "delivery.info_added"
    DRIVER_ASSIGNED = "delivery.driver_assigned"
    DELIVERY_DISPATCHED = "delivery.dispatched"
    DELIVERY_COMPLETED = "delivery.completed"

    # Printer lifecycle
    PRINTER_REGISTERED = "printer.registered"
    PRINTER_STATUS_CHANGED = "printer.status_changed"
    PRINTER_ERROR = "printer.error"

    # Printer configuration
    PRINTER_ROLE_ASSIGNED = "printer.role_assigned"
    PRINTER_ROLE_CREATED = "printer.role_created"
    PRINTER_FALLBACK_ASSIGNED = "printer.fallback_assigned"
    PRINTER_CONFIG_UPDATED = "printer.config_updated"
    TEMPLATE_CONFIG_UPDATED = "printer.template_config_updated"

    # Printer maintenance
    PRINTER_REBOOT_STARTED = "printer.reboot_started"
    PRINTER_REBOOT_COMPLETED = "printer.reboot_completed"
    PRINTER_HEALTH_WARNING = "printer.health_warning"

    # Cash drawer
    DRAWER_OPENED = "drawer.opened"
    DRAWER_OPEN_FAILED = "drawer.open_failed"

    # Payment device lifecycle
    PAYMENT_DEVICE_REGISTERED = "payment_device.registered"
    PAYMENT_DEVICE_CONNECTED = "payment_device.connected"
    PAYMENT_DEVICE_DISCONNECTED = "payment_device.disconnected"
    PAYMENT_DEVICE_ERROR = "payment_device.error"
    PAYMENT_DEVICE_REBOOTED = "payment_device.rebooted"

    # Payment processing
    PAYMENT_INITIATED = "payment.initiated"
    PAYMENT_WAITING = "payment.waiting"
    PAYMENT_PROCESSING = "payment.processing"
    PAYMENT_APPROVED = "payment.approved"
    PAYMENT_CONFIRMED = "payment.confirmed"
    PAYMENT_DECLINED = "payment.declined"
    PAYMENT_CANCELLED = "payment.cancelled"
    PAYMENT_TIMED_OUT = "payment.timeout"
    PAYMENT_ERROR = "payment.error"
    PAYMENT_FAILED = "payment.failed"

    # Post-authorization
    PAYMENT_CAPTURED = "payment.captured"
    PAYMENT_VOIDED = "payment.voided"
    PAYMENT_REFUNDED = "payment.refunded"
    PAYMENT_REFUND_FAILED = "payment.refund_failed"
    TIP_ADDED = "tip.added"
    TIP_ADJUST_SENT = "tip.adjust_sent"
    TIP_ADJUST_CONFIRMED = "tip.adjust_confirmed"
    TIP_ADJUST_FAILED = "tip.adjust_failed"
    TIP_ADJUSTED = "payment.tip_adjusted"

    # Batch / Day
    BATCH_CLOSED = "batch.closed"
    BATCH_SUBMITTED = "batch.submitted"
    DAY_CLOSED = "day.closed"

    # Device
    DEVICE_STATUS_CHANGED = "device.status_changed"
    DEVICE_DISCOVERED = "device.discovered"
    DEVICE_IP_CHANGED = "device.ip_changed"
    DEVICE_RESTORED = "device.restored"

    # Split payments
    SPLIT_STARTED = "split.started"
    SPLIT_PAYMENT_COMPLETED = "split.payment_completed"
    SPLIT_COMPLETED = "split.completed"

    # Idempotency
    DUPLICATE_PAYMENT_BLOCKED = "payment.duplicate_blocked"

    # Store Configuration (Overseer)
    STORE_INFO_UPDATED = "store.info_updated"
    STORE_CC_PROCESSING_RATE_UPDATED = "store.cc_processing_rate_updated"
    STORE_TAX_RULE_CREATED = "store.tax_rule_created"
    STORE_TAX_RULE_UPDATED = "store.tax_rule_updated"
    STORE_TAX_RULE_DELETED = "store.tax_rule_deleted"
    STORE_OPERATING_HOURS_UPDATED = "store.operating_hours_updated"
    STORE_ORDER_TYPES_UPDATED = "store.order_types_updated"
    STORE_AUTO_GRATUITY_UPDATED = "store.auto_gratuity_updated"

    # Employee & Roles
    EMPLOYEE_ROLE_CREATED = "employee.role_created"
    EMPLOYEE_ROLE_UPDATED = "employee.role_updated"
    EMPLOYEE_ROLE_DELETED = "employee.role_deleted"
    EMPLOYEE_CREATED = "employee.created"
    EMPLOYEE_UPDATED = "employee.updated"
    EMPLOYEE_DELETED = "employee.deleted"
    TIPOUT_RULE_CREATED = "tipout.rule_created"
    TIPOUT_RULE_UPDATED = "tipout.rule_updated"
    TIPOUT_RULE_DELETED = "tipout.rule_deleted"

    # Menu management
    MENU_ITEM_CREATED = "menu.item_created"
    MENU_ITEM_UPDATED = "menu.item_updated"
    MENU_ITEM_DELETED = "menu.item_deleted"
    MENU_CATEGORY_CREATED = "menu.category_created"
    MENU_CATEGORY_UPDATED = "menu.category_updated"
    MENU_CATEGORY_DELETED = "menu.category_deleted"
    MENU_ITEM_86D = "menu.item_86d"
    MENU_ITEM_RESTORED = "menu.item_restored"

    MODIFIER_GROUP_CREATED = "menu.modifier_group_created"
    MODIFIER_GROUP_UPDATED = "menu.modifier_group_updated"
    MODIFIER_GROUP_DELETED = "menu.modifier_group_deleted"

    # Floor Plan
    FLOORPLAN_SECTION_CREATED = "floorplan.section_created"
    FLOORPLAN_SECTION_UPDATED = "floorplan.section_updated"
    FLOORPLAN_SECTION_DELETED = "floorplan.section_deleted"
    FLOORPLAN_LAYOUT_UPDATED = "floorplan.layout_updated"

    # Hardware
    TERMINAL_REGISTERED = "terminal.registered"
    TERMINAL_UPDATED = "terminal.updated"
    TERMINAL_TRAINING_MODE_CHANGED = "terminal.training_mode_changed"
    ROUTING_MATRIX_UPDATED = "routing.matrix_updated"
    ROUTING_ITEM_OVERRIDE_CREATED = "routing.item_override_created"
    ROUTING_ITEM_OVERRIDE_DELETED = "routing.item_override_deleted"

    # Reporting
    REPORTING_DASHBOARD_CONFIGURED = "reporting.dashboard_configured"
    REPORTING_CUSTOM_REPORT_SAVED = "reporting.custom_report_saved"
    REPORTING_ACCOUNTS_MAPPING_UPDATED = "reporting.accounts_mapping_updated"

    # Legacy batch events (from Terminal prototype import)
    RESTAURANT_CONFIGURED = "restaurant.configured"
    TAX_RULES_BATCH_CREATED = "tax_rules.batch_created"
    CATEGORIES_BATCH_CREATED = "categories.batch_created"
    ITEMS_BATCH_CREATED = "items.batch_created"

    # System
    USER_LOGGED_IN = "system.user_logged_in"
    USER_LOGGED_OUT = "system.user_logged_out"


class Event(BaseModel):
    """
    Immutable event record.

    Once created, events are never modified or deleted.
    The checksum creates a hash chain for tamper detection.
    """

    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    terminal_id: str
    event_type: EventType
    payload: dict[str, Any]
    sequence_number: Optional[int] = None  # Set by EventLedger on insert
    previous_checksum: Optional[str] = None  # Hash chain
    checksum: Optional[str] = None  # Computed on insert

    # Metadata
    user_id: Optional[str] = None
    user_role: Optional[str] = None
    correlation_id: Optional[str] = None  # Links related events

    class Config:
        frozen = True  # Make immutable after creation

    def compute_checksum(self, previous_checksum: str = "") -> str:
        """
        Compute SHA-256 checksum including previous event's checksum.
        This creates a hash chain - if any event is tampered with,
        all subsequent checksums become invalid.
        """
        data = {
            "event_id": self.event_id,
            "timestamp": self.timestamp.isoformat(),
            "terminal_id": self.terminal_id,
            "event_type": self.event_type.value,
            "payload": self.payload,
            "previous_checksum": previous_checksum,
        }
        serialized = json.dumps(data, sort_keys=True)
        return hashlib.sha256(serialized.encode()).hexdigest()


# =============================================================================
# EVENT FACTORY FUNCTIONS
# =============================================================================
# These ensure events are created with the correct structure

def create_event(
        event_type: EventType,
        terminal_id: str,
        payload: dict[str, Any],
        user_id: Optional[str] = None,
        user_role: Optional[str] = None,
        correlation_id: Optional[str] = None,
) -> Event:
    """Create a new event with proper structure."""
    return Event(
        terminal_id=terminal_id,
        event_type=event_type,
        payload=payload,
        user_id=user_id,
        user_role=user_role,
        correlation_id=correlation_id,
    )


# -----------------------------------------------------------------------------
# Order Events
# -----------------------------------------------------------------------------

def order_created(
        terminal_id: str,
        order_id: str,
        table: Optional[str] = None,
        server_id: Optional[str] = None,
        server_name: Optional[str] = None,
        order_type: str = "dine_in",  # dine_in, takeout, delivery
        guest_count: int = 1,
        **kwargs
) -> Event:
    """Create an ORDER_CREATED event."""
    return create_event(
        event_type=EventType.ORDER_CREATED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "table": table,
            "server_id": server_id,
            "server_name": server_name,
            "order_type": order_type,
            "guest_count": guest_count,
        },
        **kwargs
    )


def item_added(
        terminal_id: str,
        order_id: str,
        item_id: str,
        menu_item_id: str,
        name: str,
        price: float,
        quantity: int = 1,
        category: Optional[str] = None,
        notes: Optional[str] = None,
        seat_number: Optional[int] = None,
        **kwargs
) -> Event:
    """Create an ITEM_ADDED event."""
    return create_event(
        event_type=EventType.ITEM_ADDED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "item_id": item_id,
            "menu_item_id": menu_item_id,
            "name": name,
            "price": round(float(price), 2),
            "quantity": quantity,
            "category": category,
            "notes": notes,
            "seat_number": seat_number,
        },
        correlation_id=order_id,
        **kwargs
    )


def item_sent(
        terminal_id: str,
        order_id: str,
        item_id: str,
        name: str,
        seat_number: Optional[int] = None,
        category: Optional[str] = None,
        sent_at: Optional[str] = None,
        **kwargs
) -> Event:
    """Create an ITEM_SENT event."""
    return create_event(
        event_type=EventType.ITEM_SENT,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "item_id": item_id,
            "name": name,
            "seat_number": seat_number,
            "category": category,
            "sent_at": sent_at or datetime.now(timezone.utc).isoformat(),
        },
        correlation_id=order_id,
        **kwargs
    )


def item_removed(
        terminal_id: str,
        order_id: str,
        item_id: str,
        reason: Optional[str] = None,
        **kwargs
) -> Event:
    """Create an ITEM_REMOVED event."""
    return create_event(
        event_type=EventType.ITEM_REMOVED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "item_id": item_id,
            "reason": reason,
        },
        correlation_id=order_id,
        **kwargs
    )


def item_modified(
        terminal_id: str,
        order_id: str,
        item_id: str,
        quantity: Optional[int] = None,
        price: Optional[float] = None,
        notes: Optional[str] = None,
        **kwargs
) -> Event:
    """Create an ITEM_MODIFIED event."""
    payload = {
        "order_id": order_id,
        "item_id": item_id,
    }
    if quantity is not None:
        payload["quantity"] = quantity
    if price is not None:
        payload["price"] = price
    if notes is not None:
        payload["notes"] = notes

    return create_event(
        event_type=EventType.ITEM_MODIFIED,
        terminal_id=terminal_id,
        payload=payload,
        correlation_id=order_id,
        **kwargs
    )


def modifier_applied(
        terminal_id: str,
        order_id: str,
        item_id: str,
        modifier_id: str,
        modifier_name: str,
        modifier_price: float = 0.0,
        action: str = "add",  # add, remove, replace
        **kwargs
) -> Event:
    """Create a MODIFIER_APPLIED event."""
    return create_event(
        event_type=EventType.MODIFIER_APPLIED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "item_id": item_id,
            "modifier_id": modifier_id,
            "modifier_name": modifier_name,
            "modifier_price": modifier_price,
            "action": action,
        },
        correlation_id=order_id,
        **kwargs
    )


# -----------------------------------------------------------------------------
# Payment Events
# -----------------------------------------------------------------------------

def payment_initiated(
        terminal_id: str,
        order_id: str,
        payment_id: str,
        amount: float,
        method: str,  # card, cash, gift_card
        **kwargs
) -> Event:
    """Create a PAYMENT_INITIATED event."""
    return create_event(
        event_type=EventType.PAYMENT_INITIATED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "payment_id": payment_id,
            "amount": amount,
            "method": method,
        },
        correlation_id=order_id,
        **kwargs
    )


def payment_confirmed(
        terminal_id: str,
        order_id: str,
        payment_id: str,
        transaction_id: str,
        amount: float,
        **kwargs
) -> Event:
    """Create a PAYMENT_CONFIRMED event."""
    return create_event(
        event_type=EventType.PAYMENT_CONFIRMED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "payment_id": payment_id,
            "transaction_id": transaction_id,
            "amount": round(float(amount), 2),
        },
        correlation_id=order_id,
        **kwargs
    )


def payment_failed(
        terminal_id: str,
        order_id: str,
        payment_id: str,
        error: str,
        error_code: Optional[str] = None,
        **kwargs
) -> Event:
    """Create a PAYMENT_FAILED event."""
    return create_event(
        event_type=EventType.PAYMENT_FAILED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "payment_id": payment_id,
            "error": error,
            "error_code": error_code,
        },
        correlation_id=order_id,
        **kwargs
    )


# -----------------------------------------------------------------------------
# Order Completion Events
# -----------------------------------------------------------------------------

def order_closed(
        terminal_id: str,
        order_id: str,
        total: float,
        **kwargs
) -> Event:
    """Create an ORDER_CLOSED event."""
    return create_event(
        event_type=EventType.ORDER_CLOSED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "total": total,
        },
        correlation_id=order_id,
        **kwargs
    )


def order_voided(
        terminal_id: str,
        order_id: str,
        reason: str,
        approved_by: Optional[str] = None,
        **kwargs
) -> Event:
    """Create an ORDER_VOIDED event."""
    return create_event(
        event_type=EventType.ORDER_VOIDED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "reason": reason,
            "approved_by": approved_by,
        },
        correlation_id=order_id,
        **kwargs
    )


# -----------------------------------------------------------------------------
# Print Events
# -----------------------------------------------------------------------------

def ticket_printed(
        terminal_id: str,
        order_id: str,
        printer_id: str,
        printer_name: str,
        ticket_type: str = "kitchen",  # kitchen, bar, receipt
        **kwargs
) -> Event:
    """Create a TICKET_PRINTED event."""
    return create_event(
        event_type=EventType.TICKET_PRINTED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "printer_id": printer_id,
            "printer_name": printer_name,
            "ticket_type": ticket_type,
        },
        correlation_id=order_id,
        **kwargs
    )


def ticket_print_failed(
        terminal_id: str,
        order_id: str,
        printer_id: str,
        error: str,
        will_retry: bool = True,
        **kwargs
) -> Event:
    """Create a TICKET_PRINT_FAILED event."""
    return create_event(
        event_type=EventType.TICKET_PRINT_FAILED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "printer_id": printer_id,
            "error": error,
            "will_retry": will_retry,
        },
        correlation_id=order_id,
        **kwargs
    )


def ticket_reprinted(
        terminal_id: str,
        order_id: str,
        printer_id: str,
        printer_name: str,
        original_job_id: str,
        reason: str = "",
        requested_by: Optional[str] = None,
        ticket_type: str = "kitchen",
        **kwargs
) -> Event:
    """
    Create a TICKET_REPRINTED event.
    Deliberate reprint by staff — distinct from accidental double-print.
    References the original job_id for audit trail.
    """
    return create_event(
        event_type=EventType.TICKET_REPRINTED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "printer_id": printer_id,
            "printer_name": printer_name,
            "original_job_id": original_job_id,
            "reason": reason,
            "requested_by": requested_by,
            "ticket_type": ticket_type,
        },
        correlation_id=order_id,
        **kwargs
    )


def print_retrying(
        terminal_id: str,
        order_id: str,
        printer_id: str,
        job_id: str,
        retry_count: int,
        error: str,
        **kwargs
) -> Event:
    """
    Create a PRINT_RETRYING event.
    Silent retry — staff doesn't see this, but the ledger records it.
    """
    return create_event(
        event_type=EventType.PRINT_RETRYING,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "printer_id": printer_id,
            "job_id": job_id,
            "retry_count": retry_count,
            "error": error,
        },
        correlation_id=order_id,
        **kwargs
    )


def print_rerouted(
        terminal_id: str,
        order_id: str,
        job_id: str,
        original_printer_id: str,
        original_printer_name: str,
        rerouted_to_printer_id: str,
        rerouted_to_printer_name: str,
        reason: str,
        fallback_tier: str = "designated",  # "designated", "same_type", "emergency"
        **kwargs
) -> Event:
    """
    Create a PRINT_REROUTED event.
    Job was sent to a fallback printer because the primary failed.

    fallback_tier indicates which level of the fallback hierarchy was used:
        - "designated": Operator-assigned backup printer
        - "same_type": Nearest printer of same type (impact/thermal) and role
        - "emergency": Any available printer of matching role (last resort)
    """
    return create_event(
        event_type=EventType.PRINT_REROUTED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "job_id": job_id,
            "original_printer_id": original_printer_id,
            "original_printer_name": original_printer_name,
            "rerouted_to_printer_id": rerouted_to_printer_id,
            "rerouted_to_printer_name": rerouted_to_printer_name,
            "reason": reason,
            "fallback_tier": fallback_tier,
        },
        correlation_id=order_id,
        **kwargs
    )


# -----------------------------------------------------------------------------
# Printer Lifecycle Events
# -----------------------------------------------------------------------------

def printer_registered(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        printer_type: str,
        connection_string: str,
        role: str = "kitchen",
        discovered_via: str = "manual",  # "manual", "mdns", "usb"
        **kwargs
) -> Event:
    """
    Create a PRINTER_REGISTERED event.
    Fired when a new printer is discovered or manually added during setup.
    """
    return create_event(
        event_type=EventType.PRINTER_REGISTERED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "printer_type": printer_type,
            "connection_string": connection_string,
            "role": role,
            "discovered_via": discovered_via,
        },
        **kwargs
    )


def printer_status_changed(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        previous_status: str,
        new_status: str,
        reason: Optional[str] = None,
        **kwargs
) -> Event:
    """
    Create a PRINTER_STATUS_CHANGED event.
    Tracks every status transition for diagnostics and audit.
    """
    return create_event(
        event_type=EventType.PRINTER_STATUS_CHANGED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "previous_status": previous_status,
            "new_status": new_status,
            "reason": reason,
        },
        **kwargs
    )


def printer_error(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        error: str,
        error_code: Optional[str] = None,
        requires_attention: bool = True,
        **kwargs
) -> Event:
    """
    Create a PRINTER_ERROR event.
    Persistent error that couldn't be resolved by retries.
    If requires_attention is True, this triggers a manager alert.
    """
    return create_event(
        event_type=EventType.PRINTER_ERROR,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "error": error,
            "error_code": error_code,
            "requires_attention": requires_attention,
        },
        **kwargs
    )


# -----------------------------------------------------------------------------
# Printer Configuration Events
# -----------------------------------------------------------------------------

def printer_role_assigned(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        role: str,
        previous_role: Optional[str] = None,
        **kwargs
) -> Event:
    """Create a PRINTER_ROLE_ASSIGNED event."""
    return create_event(
        event_type=EventType.PRINTER_ROLE_ASSIGNED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "role": role,
            "previous_role": previous_role,
        },
        **kwargs
    )


def printer_role_created(
        terminal_id: str,
        role_name: str,
        created_by: Optional[str] = None,
        **kwargs
) -> Event:
    """
    Create a PRINTER_ROLE_CREATED event.
    Fired when an operator creates a custom role like "Pizza Station" or "Patio Bar".
    """
    return create_event(
        event_type=EventType.PRINTER_ROLE_CREATED,
        terminal_id=terminal_id,
        payload={
            "role_name": role_name,
            "created_by": created_by,
        },
        **kwargs
    )


def printer_fallback_assigned(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        fallback_printer_id: str,
        fallback_printer_name: str,
        **kwargs
) -> Event:
    """
    Create a PRINTER_FALLBACK_ASSIGNED event.
    Operator designates a specific backup printer.
    """
    return create_event(
        event_type=EventType.PRINTER_FALLBACK_ASSIGNED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "fallback_printer_id": fallback_printer_id,
            "fallback_printer_name": fallback_printer_name,
        },
        **kwargs
    )


# -----------------------------------------------------------------------------
# Printer Maintenance Events
# -----------------------------------------------------------------------------

def printer_reboot_started(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        reason: str = "scheduled_maintenance",
        **kwargs
) -> Event:
    """
    Create a PRINTER_REBOOT_STARTED event.
    Silent reboot during off-hours to preserve print head life.
    """
    return create_event(
        event_type=EventType.PRINTER_REBOOT_STARTED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "reason": reason,
        },
        **kwargs
    )


def printer_reboot_completed(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        duration_seconds: Optional[float] = None,
        **kwargs
) -> Event:
    """Create a PRINTER_REBOOT_COMPLETED event."""
    return create_event(
        event_type=EventType.PRINTER_REBOOT_COMPLETED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "duration_seconds": duration_seconds,
        },
        **kwargs
    )


def printer_health_warning(
        terminal_id: str,
        printer_id: str,
        printer_name: str,
        warning_type: str,
        details: Optional[str] = None,
        **kwargs
) -> Event:
    """
    Create a PRINTER_HEALTH_WARNING event.
    Proactive alert before a failure happens.
    """
    return create_event(
        event_type=EventType.PRINTER_HEALTH_WARNING,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "printer_name": printer_name,
            "warning_type": warning_type,
            "details": details,
        },
        **kwargs
    )


# -----------------------------------------------------------------------------
# Print Queue & Advanced Printing Events
# -----------------------------------------------------------------------------

def receipt_printed(
        terminal_id: str,
        order_id: str,
        printer_mac: str,
        copy_type: str,
        ticket_number: str,
        reprint: bool = False,
        reprinted_by: Optional[str] = None,
        **kwargs
) -> Event:
    """Create a RECEIPT_PRINTED event."""
    return create_event(
        event_type=EventType.RECEIPT_PRINTED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "printer_mac": printer_mac,
            "copy_type": copy_type,
            "ticket_number": ticket_number,
            "reprint": reprint,
            "reprinted_by": reprinted_by,
        },
        **kwargs
    )


def receipt_reprinted(
        terminal_id: str,
        order_id: str,
        printer_mac: str,
        copy_type: str,
        ticket_number: str,
        reprinted_by: str,
        **kwargs
) -> Event:
    """Create a RECEIPT_REPRINTED event (extends RECEIPT_PRINTED)."""
    return receipt_printed(
        terminal_id=terminal_id,
        order_id=order_id,
        printer_mac=printer_mac,
        copy_type=copy_type,
        ticket_number=ticket_number,
        reprint=True,
        reprinted_by=reprinted_by,
        **kwargs
    )


def print_job_queued(
        terminal_id: str,
        order_id: str,
        template_id: str,
        printer_mac: str,
        ticket_number: str,
        copy_type: Optional[str] = None,
        triggered_by: Optional[str] = None,
        **kwargs
) -> Event:
    """Create a PRINT_JOB_QUEUED event."""
    return create_event(
        event_type=EventType.PRINT_JOB_QUEUED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "template_id": template_id,
            "printer_mac": printer_mac,
            "copy_type": copy_type,
            "triggered_by": triggered_by,
            "ticket_number": ticket_number,
        },
        **kwargs
    )


def print_job_sent(
        terminal_id: str,
        job_id: str,
        attempt_number: int,
        sent_at: str,
        **kwargs
) -> Event:
    """Create a PRINT_JOB_SENT event."""
    return create_event(
        event_type=EventType.PRINT_JOB_SENT,
        terminal_id=terminal_id,
        payload={
            "job_id": job_id,
            "attempt_number": attempt_number,
            "sent_at": sent_at,
        },
        **kwargs
    )


def print_job_completed(
        terminal_id: str,
        job_id: str,
        completed_at: str,
        attempt_number: int,
        **kwargs
) -> Event:
    """Create a PRINT_JOB_COMPLETED event."""
    return create_event(
        event_type=EventType.PRINT_JOB_COMPLETED,
        terminal_id=terminal_id,
        payload={
            "job_id": job_id,
            "completed_at": completed_at,
            "attempt_number": attempt_number,
        },
        **kwargs
    )


def print_job_failed(
        terminal_id: str,
        job_id: str,
        final_attempt_at: str,
        failure_reason: str,
        alert_sent: bool = False,
        **kwargs
) -> Event:
    """Create a PRINT_JOB_FAILED event."""
    return create_event(
        event_type=EventType.PRINT_JOB_FAILED,
        terminal_id=terminal_id,
        payload={
            "job_id": job_id,
            "final_attempt_at": final_attempt_at,
            "failure_reason": failure_reason,
            "alert_sent": alert_sent,
        },
        **kwargs
    )


def print_job_retried(
        terminal_id: str,
        job_id: str,
        retried_by: str,
        retried_at: str,
        **kwargs
) -> Event:
    """Create a PRINT_JOB_RETRIED event."""
    return create_event(
        event_type=EventType.PRINT_JOB_RETRIED,
        terminal_id=terminal_id,
        payload={
            "job_id": job_id,
            "retried_by": retried_by,
            "retried_at": retried_at,
        },
        **kwargs
    )


# -----------------------------------------------------------------------------
# Delivery Events
# -----------------------------------------------------------------------------

def delivery_info_added(
        terminal_id: str,
        order_id: str,
        customer_name: str,
        address: str,
        phone: str,
        notes: Optional[str] = None,
        **kwargs
) -> Event:
    """Create a DELIVERY_INFO_ADDED event."""
    return create_event(
        event_type=EventType.DELIVERY_INFO_ADDED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "customer_name": customer_name,
            "address": address,
            "phone": phone,
            "notes": notes,
        },
        **kwargs
    )


def driver_assigned(
        terminal_id: str,
        order_id: str,
        driver_id: str,
        driver_name: str,
        assigned_at: str,
        **kwargs
) -> Event:
    """Create a DRIVER_ASSIGNED event."""
    return create_event(
        event_type=EventType.DRIVER_ASSIGNED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "driver_id": driver_id,
            "driver_name": driver_name,
            "assigned_at": assigned_at,
        },
        **kwargs
    )


def delivery_dispatched(
        terminal_id: str,
        order_id: str,
        driver_id: str,
        dispatched_at: str,
        **kwargs
) -> Event:
    """Create a DELIVERY_DISPATCHED event."""
    return create_event(
        event_type=EventType.DELIVERY_DISPATCHED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "driver_id": driver_id,
            "dispatched_at": dispatched_at,
        },
        **kwargs
    )


def delivery_completed(
        terminal_id: str,
        order_id: str,
        driver_id: str,
        completed_at: str,
        tip_amount: float = 0.0,
        **kwargs
) -> Event:
    """Create a DELIVERY_COMPLETED event."""
    return create_event(
        event_type=EventType.DELIVERY_COMPLETED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "driver_id": driver_id,
            "completed_at": completed_at,
            "tip_amount": tip_amount,
        },
        **kwargs
    )


# -----------------------------------------------------------------------------
# Configuration Audit Events
# -----------------------------------------------------------------------------

def printer_config_updated(
        terminal_id: str,
        printer_mac: str,
        changed_by: str,
        previous_config: dict[str, Any],
        new_config: dict[str, Any],
        **kwargs
) -> Event:
    """Create a PRINTER_CONFIG_UPDATED event."""
    return create_event(
        event_type=EventType.PRINTER_CONFIG_UPDATED,
        terminal_id=terminal_id,
        payload={
            "printer_mac": printer_mac,
            "changed_by": changed_by,
            "previous_config": previous_config,
            "new_config": new_config,
        },
        **kwargs
    )


def template_config_updated(
        terminal_id: str,
        template_id: str,
        changed_by: str,
        previous_config: dict[str, Any],
        new_config: dict[str, Any],
        **kwargs
) -> Event:
    """Create a TEMPLATE_CONFIG_UPDATED event."""
    return create_event(
        event_type=EventType.TEMPLATE_CONFIG_UPDATED,
        terminal_id=terminal_id,
        payload={
            "template_id": template_id,
            "changed_by": changed_by,
            "previous_config": previous_config,
            "new_config": new_config,
        },
        **kwargs
    )


# -----------------------------------------------------------------------------
# Cash Drawer Events
# -----------------------------------------------------------------------------

def drawer_opened(
        terminal_id: str,
        printer_id: str,
        reason: str = "payment",  # "payment", "manual", "start_of_day"
        opened_by: Optional[str] = None,
        **kwargs
) -> Event:
    """
    Create a DRAWER_OPENED event.
    Cash drawers typically kick through the printer's DK port.
    Every open is logged — accountability matters.
    """
    return create_event(
        event_type=EventType.DRAWER_OPENED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "reason": reason,
            "opened_by": opened_by,
        },
        **kwargs
    )


# -----------------------------------------------------------------------------
# Staff / Clock Events
# -----------------------------------------------------------------------------

def user_logged_in(
        terminal_id: str,
        employee_id: str,
        employee_name: str,
        **kwargs
) -> Event:
    """Create a USER_LOGGED_IN event (clock in)."""
    return create_event(
        event_type=EventType.USER_LOGGED_IN,
        terminal_id=terminal_id,
        payload={
            "employee_id": employee_id,
            "employee_name": employee_name,
        },
        user_id=employee_id,
        **kwargs
    )


def user_logged_out(
        terminal_id: str,
        employee_id: str,
        employee_name: str,
        **kwargs
) -> Event:
    """Create a USER_LOGGED_OUT event (clock out)."""
    return create_event(
        event_type=EventType.USER_LOGGED_OUT,
        terminal_id=terminal_id,
        payload={
            "employee_id": employee_id,
            "employee_name": employee_name,
        },
        user_id=employee_id,
        **kwargs
    )


# -----------------------------------------------------------------------------
# Tip Adjustment Events
# -----------------------------------------------------------------------------

def tip_adjusted(
        terminal_id: str,
        order_id: str,
        payment_id: str,
        tip_amount: float,
        previous_tip: float = 0.0,
        **kwargs
) -> Event:
    """Create a TIP_ADJUSTED event for post-payment tip adjustment."""
    return create_event(
        event_type=EventType.TIP_ADJUSTED,
        terminal_id=terminal_id,
        payload={
            "order_id": order_id,
            "payment_id": payment_id,
            "tip_amount": round(float(tip_amount), 2),
            "previous_tip": round(float(previous_tip), 2),
        },
        correlation_id=order_id,
        **kwargs
    )


def drawer_open_failed(
        terminal_id: str,
        printer_id: str,
        error: str,
        **kwargs
) -> Event:
    """Create a DRAWER_OPEN_FAILED event."""
    return create_event(
        event_type=EventType.DRAWER_OPEN_FAILED,
        terminal_id=terminal_id,
        payload={
            "printer_id": printer_id,
            "error": error,
        },
        **kwargs
    )


def batch_submitted(
        terminal_id: str,
        order_count: int,
        total_amount: float,
        cash_total: float,
        card_total: float,
        order_ids: list[str],
        **kwargs
) -> Event:
    """Create a BATCH_SUBMITTED event for batch settlement."""
    return create_event(
        event_type=EventType.BATCH_SUBMITTED,
        terminal_id=terminal_id,
        payload={
            "order_count": order_count,
            "total_amount": round(total_amount, 2),
            "cash_total": round(cash_total, 2),
            "card_total": round(card_total, 2),
            "order_ids": order_ids,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        },
        **kwargs
    )


def day_closed(
        terminal_id: str,
        date: str,
        total_orders: int,
        total_sales: float,
        total_tips: float,
        cash_total: float,
        card_total: float,
        order_ids: list[str],
        payment_count: int,
        opened_at: str | None = None,
        **kwargs
) -> Event:
    """Create a DAY_CLOSED event with full auditable day summary."""
    return create_event(
        event_type=EventType.DAY_CLOSED,
        terminal_id=terminal_id,
        payload={
            "date": date,
            "total_orders": total_orders,
            "total_sales": round(total_sales, 2),
            "total_tips": round(total_tips, 2),
            "cash_total": round(cash_total, 2),
            "card_total": round(card_total, 2),
            "order_ids": order_ids,
            "payment_count": payment_count,
            "opened_at": opened_at,
            "closed_at": datetime.now(timezone.utc).isoformat(),
        },
        **kwargs
    )
