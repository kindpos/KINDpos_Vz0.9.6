"""
Printer Discovery API Endpoints
Simplified REST endpoints for the printer discovery scene.
"""

import asyncio
import ipaddress
import socket
import time
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator

from app.config import settings
from app.api.dependencies import get_ledger
from app.core.event_ledger import EventLedger
from app.core.events import EventType, create_event
from app.services.overseer_config_service import OverseerConfigService

router = APIRouter(prefix="/printers", tags=["printers"])


# ── Request / Response Models ──────────────────────────


class TestPrintRequest(BaseModel):
    ip: str
    port: int = 9100


class SavePrinterRequest(BaseModel):
    name: str
    ip: str
    port: int = 9100
    role: Literal["kitchen", "bar", "receipt", "backup"]

    @field_validator("ip")
    @classmethod
    def validate_ip(cls, v):
        try:
            ipaddress.ip_address(v)
        except ValueError:
            raise ValueError(f"Invalid IP address: {v}")
        return v


# ── Helpers ────────────────────────────────────────────


async def _check_port(ip: str, port: int, timeout: float = 0.3):
    """Async TCP connect check. Returns response_ms or None on failure."""
    start = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout,
        )
        ms = round((time.monotonic() - start) * 1000)
        writer.close()
        await writer.wait_closed()
        return ms
    except Exception:
        return None


async def _resolve_hostname(ip: str) -> str:
    """Try reverse DNS lookup, fallback to empty string."""
    loop = asyncio.get_event_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(None, socket.getfqdn, ip),
            timeout=1.0,
        )
        # getfqdn returns the IP itself if lookup fails
        return result if result != ip else ""
    except Exception:
        return ""


def _build_test_receipt(ip: str) -> bytes:
    """Build ESC/POS test receipt bytes."""
    ESC = b'\x1b'
    GS = b'\x1d'

    INIT = ESC + b'\x40'
    CENTER = ESC + b'\x61\x01'
    LEFT = ESC + b'\x61\x00'
    BOLD_ON = ESC + b'\x45\x01'
    BOLD_OFF = ESC + b'\x45\x00'
    DOUBLE_WIDTH = ESC + b'\x21\x20'
    NORMAL_SIZE = ESC + b'\x21\x00'
    FEED = ESC + b'\x64\x03'
    CUT = GS + b'\x56\x00'

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    receipt = bytearray()
    receipt += INIT
    receipt += CENTER
    receipt += b'================================\n'
    receipt += DOUBLE_WIDTH + BOLD_ON
    receipt += b'K I N D p o s\n'
    receipt += NORMAL_SIZE + BOLD_OFF
    receipt += CENTER
    receipt += b'Nice. Dependable. Yours.\n'
    receipt += b'================================\n'
    receipt += b'\n'
    receipt += BOLD_ON + DOUBLE_WIDTH
    receipt += b'KINDpos Test Print\n'
    receipt += NORMAL_SIZE + BOLD_OFF
    receipt += b'\n'
    receipt += LEFT
    receipt += f'  Device: {ip}\n'.encode()
    receipt += f'  Date:   {now}\n'.encode()
    receipt += b'\n'
    receipt += CENTER
    receipt += BOLD_ON
    receipt += b'Connection OK\n'
    receipt += BOLD_OFF
    receipt += b'\n'
    receipt += b'================================\n'
    receipt += BOLD_ON
    receipt += b'KIND Technologies\n'
    receipt += BOLD_OFF
    receipt += b'================================\n'
    receipt += FEED
    receipt += CUT

    return bytes(receipt)


# ── Endpoints ──────────────────────────────────────────


@router.get("/scan")
async def scan_printers():
    """
    Scan the local subnet for devices with port 9100 open (ESC/POS printers).
    Returns a flat JSON list — no SSE streaming.
    """
    subnet_str = settings.default_subnet
    scan_start = time.monotonic()

    try:
        network = ipaddress.ip_network(subnet_str, strict=False)
    except ValueError:
        return {"subnet": subnet_str, "printers": [], "scan_time_ms": 0,
                "error": f"Invalid subnet: {subnet_str}",
                "timestamp": datetime.now(timezone.utc).isoformat()}

    hosts = [str(ip) for ip in network.hosts()]
    found = []

    # Scan in batches of 50 concurrent connections
    batch_size = 50
    for i in range(0, len(hosts), batch_size):
        batch = hosts[i:i + batch_size]
        tasks = [_check_port(ip, 9100, timeout=0.3) for ip in batch]
        results = await asyncio.gather(*tasks)

        for ip, ms in zip(batch, results):
            if ms is not None:
                found.append({"ip": ip, "port": 9100, "response_ms": ms})

    # Resolve hostnames for found printers (parallel)
    if found:
        hostname_tasks = [_resolve_hostname(p["ip"]) for p in found]
        hostnames = await asyncio.gather(*hostname_tasks)
        for printer, hostname in zip(found, hostnames):
            printer["hostname"] = hostname

    scan_ms = round((time.monotonic() - scan_start) * 1000)

    return {
        "subnet": subnet_str,
        "printers": found,
        "scan_time_ms": scan_ms,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/test")
async def test_printer(request: TestPrintRequest):
    """Send an ESC/POS test receipt to a printer via TCP."""
    start = time.monotonic()
    try:
        receipt_bytes = _build_test_receipt(request.ip)

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        sock.connect((request.ip, request.port))
        sock.sendall(receipt_bytes)
        sock.close()

        ms = round((time.monotonic() - start) * 1000)
        return {
            "success": True,
            "ip": request.ip,
            "message": f"Test print sent to {request.ip}:{request.port}",
            "response_ms": ms,
        }

    except socket.timeout:
        ms = round((time.monotonic() - start) * 1000)
        return {
            "success": False,
            "ip": request.ip,
            "error": f"Connection timed out — printer at {request.ip}:{request.port} not responding",
            "response_ms": ms,
        }
    except ConnectionRefusedError:
        ms = round((time.monotonic() - start) * 1000)
        return {
            "success": False,
            "ip": request.ip,
            "error": f"Connection refused — no printer on {request.ip}:{request.port}",
            "response_ms": ms,
        }
    except Exception as e:
        ms = round((time.monotonic() - start) * 1000)
        return {
            "success": False,
            "ip": request.ip,
            "error": f"Print failed: {str(e)}",
            "response_ms": ms,
        }


@router.post("/save")
async def save_printer(
    request: SavePrinterRequest,
    ledger: EventLedger = Depends(get_ledger),
):
    """Save a printer configuration by appending a PRINTER_REGISTERED event."""
    printer_id = f"printer_{uuid.uuid4().hex[:8]}"

    event = create_event(
        event_type=EventType.PRINTER_REGISTERED,
        terminal_id=settings.terminal_id,
        payload={
            "printer_id": printer_id,
            "name": request.name,
            "station": request.role,
            "ip_address": request.ip,
            "mac_address": "",
            "paper_width": "80mm",
            "print_logo": True,
            "active": True,
        },
    )
    await ledger.append(event)

    return {
        "success": True,
        "printer_id": printer_id,
        "message": f"Printer '{request.name}' saved",
    }


@router.get("/saved")
async def get_saved_printers(ledger: EventLedger = Depends(get_ledger)):
    """Return saved printers with online/offline status."""
    service = OverseerConfigService(ledger)
    printers = await service.get_printers()

    results = []
    # Check online status in parallel
    if printers:
        status_tasks = [_check_port(p.ip_address, 9100, timeout=1.0) for p in printers]
        statuses = await asyncio.gather(*status_tasks)

        for printer, ms in zip(printers, statuses):
            results.append({
                "id": printer.printer_id,
                "name": printer.name,
                "ip": printer.ip_address,
                "port": 9100,
                "role": printer.station,
                "online": ms is not None,
            })
    return {"printers": results}
