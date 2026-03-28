"""
Hardware Discovery API Endpoints
Network scanning and printer discovery via Server-Sent Events.
"""

import json
import asyncio
import threading
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import socket
from datetime import datetime

from app.config import settings
from shared.scanner.printer_detector import PrinterDiscovery

router = APIRouter(prefix="/hardware", tags=["hardware"])

class ScanRequest(BaseModel):
    """Request body for printer discovery."""
    network: Optional[str] = None  # Defaults to config.default_subnet
    timeout: Optional[float] = None  # Defaults to config.scan_timeout

def _run_scan_in_thread(queue: asyncio.Queue, loop, network: str):
    """
    Run printer discovery in a background thread.
    """
    scanner = PrinterDiscovery()

    def on_progress(event_type: str, data: dict):
        """Bridge scanner callbacks to the async SSE queue."""
        event = {"type": event_type, **data}
        asyncio.run_coroutine_threadsafe(queue.put(event), loop)

    scanner.on_progress = on_progress

    try:
        printers = scanner.scan_network(network, methods=["port_scan", "mdns", "usb"])

        # Send final device configs for frontend to render
        for device in printers:
            config = device.to_printer_config_dict()
            event_type = "printer_config"
            
            # Map "spin" protocol to card reader event
            if config.get("protocol") == "spin" or any(p in [8443, 9000] for p in device.open_ports):
                event_type = "reader_config"
                # Adjust format for payment device if needed
                config["name"] = config["name"].replace("Printer", "Terminal")
                config["device_type"] = "terminal"
                config["port"] = 8443 if 8443 in device.open_ports else 9000
                config["protocol"] = "spin"
                config["ip_address"] = device.ip_address
                config["ip"] = device.ip_address
            else:
                config["ip"] = device.ip_address
            
            # Log for debugging discovery misses
            print(f"[HARDWARE] Emitting {event_type} for {device.ip_address}: {config.get('name')}")
            
            asyncio.run_coroutine_threadsafe(
                queue.put({"type": event_type, **config}),
                loop,
            )

    except Exception as e:
        asyncio.run_coroutine_threadsafe(
            queue.put({"type": "error", "message": f"Scan failed: {str(e)}"}),
            loop,
        )

    # Signal completion to the SSE generator
    asyncio.run_coroutine_threadsafe(queue.put({"type": "__DONE__"}), loop)

@router.post("/discover-printers")
async def discover_printers(request: ScanRequest = ScanRequest()):
    """
    Execute printer discovery and stream results via Server-Sent Events.
    """
    network = request.network or settings.default_subnet

    async def discovery_stream():
        queue = asyncio.Queue()
        loop = asyncio.get_event_loop()

        thread = threading.Thread(
            target=_run_scan_in_thread,
            args=(queue, loop, network),
            daemon=True,
        )
        thread.start()

        while True:
            event = await queue.get()

            if event.get("type") == "__DONE__":
                break

            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        discovery_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

@router.get("/status")
async def hardware_status():
    """Basic hardware API status check."""
    return {
        "status": "online",
        "message": "Hardware discovery API ready",
        "default_subnet": settings.default_subnet,
        "endpoints": {
            "discover_printers": "POST /api/hardware/discover-printers",
            "status": "GET /api/hardware/status",
        },
    }

class TestPrintRequest(BaseModel):
    """Request body for test print."""
    ip: str
    port: int = 9100

class TestConnectionRequest(BaseModel):
    """Request body for TCP connectivity test."""
    ip: str
    port: int = 9100
    timeout: float = 2.0

@router.post("/test-connection")
async def test_connection(request: TestConnectionRequest):
    """Quick TCP check — no data sent, just tests if port is open."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(request.timeout)
        result = sock.connect_ex((request.ip, request.port))
        sock.close()
        return {
            "ip": request.ip,
            "port": request.port,
            "status": "online" if result == 0 else "unreachable",
        }
    except Exception as e:
        return {"ip": request.ip, "port": request.port, "status": "unreachable"}

@router.post("/test-print")
async def test_print(request: TestPrintRequest):
    """
    Send a KINDpos test receipt to a printer via raw ESC/POS over TCP or USB.
    """
    try:
        # ESC/POS command bytes
        ESC = b'\x1b'
        GS = b'\x1d'

        INIT = ESC + b'\x40'                # Initialize printer
        CENTER = ESC + b'\x61\x01'           # Center alignment
        LEFT = ESC + b'\x61\x00'             # Left alignment
        BOLD_ON = ESC + b'\x45\x01'          # Bold on
        BOLD_OFF = ESC + b'\x45\x00'         # Bold off
        DOUBLE_WIDTH = ESC + b'\x21\x20'     # Double width
        NORMAL_SIZE = ESC + b'\x21\x00'      # Normal size
        FEED = ESC + b'\x64\x03'             # Feed 3 lines
        CUT = GS + b'\x56\x00'              # Full cut

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Build the receipt
        receipt = bytearray()
        receipt += INIT
        receipt += CENTER

        # Header
        receipt += b'================================\n'
        receipt += DOUBLE_WIDTH + BOLD_ON
        receipt += b'K I N D p o s\n'
        receipt += NORMAL_SIZE + BOLD_OFF
        receipt += CENTER
        receipt += b'Nice. Dependable. Yours.\n'
        receipt += b'================================\n'
        receipt += b'\n'

        # Test banner
        receipt += BOLD_ON + DOUBLE_WIDTH
        receipt += b'KINDpos Test Print\n'
        receipt += NORMAL_SIZE + BOLD_OFF
        receipt += b'\n'

        # Device info
        receipt += LEFT
        receipt += f'  Device: {request.ip}\n'.encode() # Reusing IP field for USB path if needed
        receipt += f'  Date:   {now}\n'.encode()
        receipt += b'\n'

        # Confirmation message
        receipt += CENTER
        receipt += BOLD_ON
        receipt += b'Connection OK\n'
        receipt += BOLD_OFF
        receipt += b'\n'

        # Footer
        receipt += b'================================\n'
        receipt += BOLD_ON
        receipt += b'KIND Technologies\n'
        receipt += BOLD_OFF
        receipt += b'================================\n'

        receipt += FEED
        receipt += CUT

        # Send to printer
        if request.ip.startswith("usb://"):
            from escpos.printer import Usb
            # Parse usb://0xXXXX:0xXXXX
            parts = request.ip.replace("usb://", "").split(":")
            vid = int(parts[0], 16)
            pid = int(parts[1], 16)
            p = Usb(vid, pid)
            p._raw(bytes(receipt))
            p.close()
        else:
            # Send to printer via raw TCP socket
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5.0)
            sock.connect((request.ip, request.port))
            sock.sendall(bytes(receipt))
            sock.close()

        return {
            "success": True,
            "message": f"Test print sent to {request.ip}",
            "timestamp": now,
        }

    except socket.timeout:
        return {
            "success": False,
            "message": f"Connection timed out - printer at {request.ip}:{request.port} not responding",
        }
    except ConnectionRefusedError:
        return {
            "success": False,
            "message": f"Connection refused - no printer listening on {request.ip}:{request.port}",
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Print failed: {str(e)}",
        }
@router.post("/test-kitchen-ticket")
async def test_kitchen_ticket(request: TestPrintRequest):
    """Fire a real kitchen ticket through the full template pipeline."""
    import json as _json
    from app.printing.templates.kitchen_ticket import KitchenTicketTemplate
    from app.printing.escpos_formatter import ESCPOSFormatter
    from pathlib import Path

    try:
        fixture_path = Path(__file__).parent.parent.parent / "printing" / "fixtures" / "kitchen_ticket_hot.json"
        with open(fixture_path, 'r') as f:
            context = _json.load(f)

        template = KitchenTicketTemplate(paper_width=80)
        commands = template.render(context)

        formatter = ESCPOSFormatter(paper_width=80)
        raw_bytes = formatter.format(commands)

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        sock.connect((request.ip, request.port))
        sock.sendall(raw_bytes)
        sock.close()

        return {
            "success": True,
            "message": f"Kitchen ticket sent to {request.ip}:{request.port}",
            "commands_rendered": len(commands),
            "bytes_sent": len(raw_bytes),
        }
    except Exception as e:
        return {"success": False, "message": f"Kitchen ticket failed: {str(e)}"}

@router.post("/quick-discover")
async def quick_discover(subnet: str = "10.0.0.0/24"):
    """
    Fast device discovery using nmap directly.
    Scans POS ports (9100, 9000) with -Pn to catch payment devices.
    Returns IP, open ports, and MAC addresses.
    """
    import asyncio

    def _scan():
        try:
            import nmap
            nm = nmap.PortScanner()
            nm.scan(hosts=subnet, arguments="-p 9100,9000,515,631 -T4 -Pn --open")

            devices = []
            for host in nm.all_hosts():
                if nm[host].state() != 'up':
                    continue

                mac = ''
                if 'mac' in nm[host]['addresses']:
                    mac = nm[host]['addresses']['mac']

                vendor = ''
                if 'vendor' in nm[host] and mac:
                    vendor = nm[host]['vendor'].get(mac, '')

                open_ports = []
                if 'tcp' in nm[host]:
                    for port, info in nm[host]['tcp'].items():
                        if info['state'] == 'open':
                            port_type = 'payment' if port == 9000 else 'printer'
                            open_ports.append({'port': port, 'type': port_type})

                if open_ports:
                    devices.append({
                        'ip': host,
                        'mac': mac,
                        'vendor': vendor,
                        'ports': open_ports,
                        'status': 'online',
                    })

            return devices
        except Exception as e:
            return {'error': str(e)}

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _scan)

    if isinstance(result, dict) and 'error' in result:
        return {"devices": [], "error": result['error']}

    return {"devices": result, "scanned": subnet}