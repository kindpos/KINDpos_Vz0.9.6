"""
dejavoo_test.py — Standalone Dejavoo P8 communication test

Run this from any machine on the same LAN as the P8.
No KINDpos dependencies required — just httpx.

Usage:
    python dejavoo_test.py                          # StatusCheck only (safe, no transaction)
    python dejavoo_test.py --sale                   # StatusCheck + $0.01 test sale
    python dejavoo_test.py --ip 10.0.0.31           # Override IP (skip MAC lookup)
    python dejavoo_test.py --sale --void            # Sale then void it
    python dejavoo_test.py --find                   # Scan LAN for the P8 by MAC

Install:  pip install httpx

KINDpos — Nice. Dependable. Yours.
"""

import argparse
import asyncio
import subprocess
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

try:
    import httpx
except ImportError:
    print("\n  httpx not installed. Run: pip install httpx\n")
    sys.exit(1)


# ═══════════════════════════════════════════════════════════════════
# P8 credentials — confirmed March 23, 2026 hardware session
# ═══════════════════════════════════════════════════════════════════

REGISTER_ID = "833401"
TPN = "220926700589"
AUTH_KEY = "WcqwNegEmC"
PORT = 9000
MAC_ADDRESS = "54:47:41:c6:24:da"

# ═══════════════════════════════════════════════════════════════════
# Pretty printing
# ═══════════════════════════════════════════════════════════════════

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"


def banner(text: str):
    width = 60
    print(f"\n{CYAN}{'═' * width}")
    print(f"  {BOLD}{text}{RESET}{CYAN}")
    print(f"{'═' * width}{RESET}\n")


def ok(msg: str):
    print(f"  {GREEN}✓{RESET} {msg}")


def fail(msg: str):
    print(f"  {RED}✗{RESET} {msg}")


def info(msg: str):
    print(f"  {DIM}→{RESET} {msg}")


def warn(msg: str):
    print(f"  {YELLOW}⚠{RESET} {msg}")


def field(label: str, value: str, highlight: bool = False):
    color = GREEN if highlight else ""
    reset = RESET if highlight else ""
    print(f"    {DIM}{label:.<30}{RESET} {color}{value}{reset}")


# ═══════════════════════════════════════════════════════════════════
# MAC-based device finder
# ═══════════════════════════════════════════════════════════════════

def find_p8_by_mac() -> str | None:
    """Scan ARP table for the P8's MAC address."""
    mac_lower = MAC_ADDRESS.lower()
    try:
        result = subprocess.run(
            ["arp", "-an"], capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if mac_lower in line.lower():
                start = line.find("(")
                end = line.find(")")
                if start != -1 and end != -1:
                    return line[start + 1 : end]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try ip neigh on Linux (Pi)
    try:
        result = subprocess.run(
            ["ip", "neigh"], capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if mac_lower in line.lower():
                return line.split()[0]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    return None


def ping_sweep(subnet: str = "10.0.0") -> None:
    """Quick ping sweep to populate ARP table before MAC lookup."""
    info(f"Pinging {subnet}.1-254 to populate ARP table...")
    procs = []
    for i in range(1, 255):
        try:
            p = subprocess.Popen(
                ["ping", "-c", "1", "-W", "1", f"{subnet}.{i}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            procs.append(p)
        except FileNotFoundError:
            # Windows uses -n instead of -c
            p = subprocess.Popen(
                ["ping", "-n", "1", "-w", "500", f"{subnet}.{i}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            procs.append(p)

    # Wait for all pings (they run in parallel)
    for p in procs:
        p.wait()


# ═══════════════════════════════════════════════════════════════════
# XML helpers
# ═══════════════════════════════════════════════════════════════════

def build_xml(fields: dict) -> str:
    parts = ["<request>"]
    for key, value in fields.items():
        escaped = (
            str(value)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        parts.append(f"  <{key}>{escaped}</{key}>")
    parts.append("</request>")
    return "\n".join(parts)


def auth_block() -> dict:
    return {
        "RegisterId": REGISTER_ID,
        "TPN": TPN,
        "AuthKey": AUTH_KEY,
    }


def parse_response(body: str) -> tuple[dict, dict]:
    """Returns (fields, ext_data) from raw response."""
    if "<xmp>" in body:
        start = body.find("<xmp>") + 5
        end = body.find("</xmp>")
        if end > start:
            body = body[start:end]

    root = ET.fromstring(body.strip())
    fields = {child.tag: (child.text or "") for child in root}

    ext_data = {}
    if "ExtData" in fields and fields["ExtData"]:
        for pair in fields["ExtData"].split(","):
            pair = pair.strip()
            if "=" in pair:
                key, val = pair.split("=", 1)
                ext_data[key.strip()] = urllib.parse.unquote(val.strip())

    return fields, ext_data


# ═══════════════════════════════════════════════════════════════════
# HTTP transport
# ═══════════════════════════════════════════════════════════════════

async def send_to_p8(
    ip: str, xml: str, timeout: float = 120.0
) -> tuple[dict, dict] | None:
    """Send XML to P8, return (fields, ext_data) or None on failure."""
    encoded = urllib.parse.quote(xml.strip())
    url = f"http://{ip}:{PORT}/spin/cgi.html?TerminalTransaction={encoded}"

    info(f"GET http://{ip}:{PORT}/spin/cgi.html?TerminalTransaction=...")

    async with httpx.AsyncClient() as client:
        start = time.monotonic()
        try:
            resp = await client.get(url, timeout=timeout)
            elapsed = time.monotonic() - start
            ok(f"Response received in {elapsed:.2f}s (HTTP {resp.status_code})")

            if resp.status_code != 200:
                fail(f"Unexpected HTTP status: {resp.status_code}")
                print(f"\n{DIM}{resp.text[:500]}{RESET}\n")
                return None

            return parse_response(resp.text)

        except httpx.ConnectError:
            fail(f"Connection refused — P8 not reachable at {ip}:{PORT}")
            warn("Is the P8 powered on and connected to WiFi?")
            warn("Is DVSPIn (Semi-Integration) enabled on the device?")
            return None

        except httpx.TimeoutException:
            elapsed = time.monotonic() - start
            fail(f"Timed out after {elapsed:.1f}s")
            return None


# ═══════════════════════════════════════════════════════════════════
# Test operations
# ═══════════════════════════════════════════════════════════════════

async def test_status(ip: str) -> bool:
    """StatusCheck — safe, no transaction, just verifies communication."""
    banner("TEST 1: StatusCheck")
    info("This is safe — no transaction is created on the device.")

    xml = build_xml({"TransType": "StatusCheck", **auth_block()})

    result = send_to_p8(ip, xml, timeout=10.0)
    resp = await result
    if resp is None:
        return False

    fields, ext_data = resp

    print()
    field("ResultCode", fields.get("ResultCode", "?"),
          highlight=fields.get("ResultCode") == "0")
    field("Message", fields.get("Message", "?"))
    field("RespMSG", urllib.parse.unquote(fields.get("RespMSG", "")))
    field("Serial (SN)", fields.get("SN", "?"))
    field("RegisterId", fields.get("RegisterId", "?"))
    field("TPN", fields.get("TPN", "?"))

    if fields.get("ResultCode") == "0" or fields.get("SN"):
        print()
        ok("P8 is alive and responding to SPIn requests.")
        return True
    else:
        msg = urllib.parse.unquote(fields.get("RespMSG", ""))
        if "authentication" in msg.lower():
            fail("Authentication failed — check RegisterId/TPN/AuthKey")
        else:
            warn(f"Unexpected response: {msg}")
        return False


async def test_sale(ip: str) -> str | None:
    """$0.01 test sale. Returns RefId if successful, None otherwise."""
    banner("TEST 2: $0.01 Sale")
    warn("This will prompt for a card tap/insert/swipe on the P8.")
    warn("In UAT mode, real cards will DECLINE. This is expected.")
    print()

    ref_id = f"KIND_TEST_{int(time.time())}"
    info(f"RefId (idempotency key): {ref_id}")

    xml = build_xml({
        "PaymentType": "Credit",
        "TransType": "Sale",
        "Amount": "0.01",
        "Tip": "0.00",
        "Frequency": "OneTime",
        "RefId": ref_id,
        **auth_block(),
        "PrintReceipt": "No",
        "SigCapture": "No",
    })

    info("Waiting for card interaction (up to 120s)...")
    print()

    resp = await send_to_p8(ip, xml, timeout=120.0)
    if resp is None:
        return None

    fields, ext_data = resp

    print()
    result_code = fields.get("ResultCode", "?")
    message = fields.get("Message", "?")

    field("ResultCode", result_code, highlight=result_code == "0")
    field("Message", message, highlight=message == "Approved")
    field("RespMSG", urllib.parse.unquote(fields.get("RespMSG", "")))
    field("RefId echoed", fields.get("RefId", "?"))
    field("AuthCode", fields.get("AuthCode", ""))
    field("HostResponseCode", fields.get("HostResponseCode", ""))
    field("HostResponseMessage",
          urllib.parse.unquote(fields.get("HostResponseMessage", "")))
    field("Serial (SN)", fields.get("SN", ""))

    if ext_data:
        print(f"\n    {BOLD}ExtData:{RESET}")
        field("CardType", ext_data.get("CardType", ""))
        field("AcntLast4", ext_data.get("AcntLast4", ""))
        field("AcntFirst4", ext_data.get("AcntFirst4", ""))
        field("EntryType", ext_data.get("EntryType", ""))
        field("Amount", ext_data.get("Amount", ""))
        field("TotalAmt", ext_data.get("TotalAmt", ""))
        field("Tip", ext_data.get("Tip", ""))
        field("BatchNum", ext_data.get("BatchNum", ""))
        field("RRN", ext_data.get("RRN", ""))
        field("txnId", ext_data.get("txnId", ""))
        field("networkMode", ext_data.get("networkMode", ""))

        if ext_data.get("txnStartTime") and ext_data.get("txnEndTime"):
            try:
                start_ms = int(ext_data["txnStartTime"])
                end_ms = int(ext_data["txnEndTime"])
                processing_s = (end_ms - start_ms) / 1000
                field("Processing time", f"{processing_s:.1f}s")
            except ValueError:
                pass

    print()
    if result_code == "0":
        ok(f"APPROVED — transaction {ref_id} succeeded.")
        return ref_id
    else:
        reason = ext_data.get("declineReason", "") or fields.get("RespMSG", "")
        reason = urllib.parse.unquote(reason)
        warn(f"DECLINED (expected in UAT with real cards): {reason}")
        info("To get approvals, you need processor-provided test cards for UAT mode.")
        return None


async def test_void(ip: str, ref_id: str) -> bool:
    """Void a previous transaction by RefId."""
    banner("TEST 3: Void")
    info(f"Voiding RefId: {ref_id}")

    xml = build_xml({
        "PaymentType": "Credit",
        "TransType": "Void",
        "RefId": ref_id,
        **auth_block(),
        "PrintReceipt": "No",
    })

    resp = await send_to_p8(ip, xml, timeout=120.0)
    if resp is None:
        return False

    fields, ext_data = resp

    print()
    result_code = fields.get("ResultCode", "?")
    field("ResultCode", result_code, highlight=result_code == "0")
    field("Message", fields.get("Message", "?"))
    field("RespMSG", urllib.parse.unquote(fields.get("RespMSG", "")))

    if result_code == "0":
        ok("Void succeeded.")
        return True
    else:
        warn(f"Void failed: {urllib.parse.unquote(fields.get('RespMSG', ''))}")
        info("Void requires a prior approved transaction in the current batch.")
        return False


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════

async def main():
    parser = argparse.ArgumentParser(
        description="KINDpos — Dejavoo P8 communication test",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python dejavoo_test.py                    # StatusCheck only (safe)
  python dejavoo_test.py --find             # Find P8 by MAC address
  python dejavoo_test.py --sale             # StatusCheck + $0.01 sale
  python dejavoo_test.py --sale --void      # Sale then void it
  python dejavoo_test.py --ip 10.0.0.31    # Use specific IP
        """,
    )
    parser.add_argument(
        "--ip",
        help="P8 IP address (skips MAC lookup)",
    )
    parser.add_argument(
        "--find",
        action="store_true",
        help="Find P8 on LAN by MAC address and exit",
    )
    parser.add_argument(
        "--sale",
        action="store_true",
        help="Run a $0.01 test sale after StatusCheck",
    )
    parser.add_argument(
        "--void",
        action="store_true",
        help="Void the test sale (requires --sale and an approved txn)",
    )
    parser.add_argument(
        "--sweep",
        action="store_true",
        help="Ping sweep LAN before MAC lookup (populates ARP table)",
    )

    args = parser.parse_args()

    print(f"\n{BOLD}KINDpos Dejavoo P8 Test{RESET}")
    print(f"{DIM}Nice. Dependable. Yours.{RESET}\n")

    # ── Resolve IP ──
    ip = args.ip
    if not ip:
        info(f"Looking for P8 by MAC: {MAC_ADDRESS}")
        ip = find_p8_by_mac()

        if not ip and (args.sweep or args.find):
            ping_sweep()
            ip = find_p8_by_mac()

        if ip:
            ok(f"Found P8 at {ip} (via MAC {MAC_ADDRESS})")
        else:
            fail(f"P8 not found in ARP table for MAC {MAC_ADDRESS}")
            warn("Try: --sweep to ping the subnet first, or --ip to specify directly")
            if not args.find:
                sys.exit(1)
            else:
                sys.exit(0)

    if args.find:
        # Just finding, we're done
        sys.exit(0)

    info(f"Target: {ip}:{PORT}")
    print()

    # ── StatusCheck ──
    status_ok = await test_status(ip)
    if not status_ok:
        fail("StatusCheck failed. Stopping here.")
        sys.exit(1)

    # ── Sale ──
    approved_ref_id = None
    if args.sale:
        approved_ref_id = await test_sale(ip)

    # ── Void ──
    if args.void:
        if approved_ref_id:
            await test_void(ip, approved_ref_id)
        else:
            warn("Skipping void — no approved transaction to void.")
            info("Void requires a prior approved sale in this batch.")

    # ── Summary ──
    banner("DONE")
    ok(f"P8 communication verified at {ip}:{PORT}")
    info(f"MAC: {MAC_ADDRESS}")
    info(f"Protocol: HTTP GET → /spin/cgi.html?TerminalTransaction=<xml>")
    if approved_ref_id:
        info(f"Last approved RefId: {approved_ref_id}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
