"""
receipt_test.py — KINDpos Receipt Printer Test

Prints merchant, customer, and itemized receipts on the Volcora WRP-208
thermal printer via Ethernet TCP (port 9100) using raw ESC/POS commands.

No external dependencies — raw socket, same approach as the working
Overseer test print. Pure Python stdlib.

Target: Volcora WRP-208 (80mm, Ethernet, ESC/POS, auto-cutter)
MAC: 00:53:53:FA:54:3E
Default IP: 10.0.0.186 (DHCP — resolve by MAC if changed)
Port: 9100
Paper: 80mm (print area ~72mm = 48 chars Font A, 64 chars Font B)

Usage:
    python receipt_test.py                         # Print all 3 receipts
    python receipt_test.py --customer              # Customer receipt only
    python receipt_test.py --merchant              # Merchant receipt only
    python receipt_test.py --itemized              # Itemized ticket only
    python receipt_test.py --ip 10.0.0.186         # Override IP
    python receipt_test.py --find                  # Find printer by MAC

Install: Nothing. Pure Python stdlib.

KINDpos — Nice. Dependable. Yours.
"""

import argparse
import socket
import subprocess
import sys
import time
from datetime import datetime


# ═══════════════════════════════════════════════════════════════════
# Printer identity — MAC-anchored, same as Dejavoo pattern
# ═══════════════════════════════════════════════════════════════════

MAC_ADDRESS = "00:53:53:fa:54:3e"
DEFAULT_IP = "10.0.0.186"
PORT = 9100
TIMEOUT = 5.0

# 80mm paper: 48 chars at Font A (12x24)
LINE_WIDTH = 48


# ═══════════════════════════════════════════════════════════════════
# ESC/POS command bytes
# ═══════════════════════════════════════════════════════════════════

ESC = b'\x1b'
GS = b'\x1d'

# Initialize printer
INIT = ESC + b'\x40'

# Text formatting
BOLD_ON = ESC + b'\x45\x01'
BOLD_OFF = ESC + b'\x45\x00'
DOUBLE_HEIGHT_ON = ESC + b'\x21\x10'
DOUBLE_WIDTH_ON = ESC + b'\x21\x20'
DOUBLE_HW_ON = ESC + b'\x21\x30'      # Double height + width
NORMAL_SIZE = ESC + b'\x21\x00'
UNDERLINE_ON = ESC + b'\x2d\x01'
UNDERLINE_OFF = ESC + b'\x2d\x00'
FONT_A = ESC + b'\x4d\x00'            # 12x24, 48 chars/line
FONT_B = ESC + b'\x4d\x01'            # 9x17, 64 chars/line

# Alignment
ALIGN_LEFT = ESC + b'\x61\x00'
ALIGN_CENTER = ESC + b'\x61\x01'
ALIGN_RIGHT = ESC + b'\x61\x02'

# Paper operations
FEED_LINES = lambda n: ESC + b'\x64' + bytes([n])
CUT_FULL = GS + b'\x56\x00'
CUT_PARTIAL = GS + b'\x56\x01'


# ═══════════════════════════════════════════════════════════════════
# Pretty terminal output
# ═══════════════════════════════════════════════════════════════════

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD_T = "\033[1m"
DIM = "\033[2m"
RESET = "\033[0m"

def banner(text):
    print(f"\n{CYAN}{'=' * 60}")
    print(f"  {BOLD_T}{text}{RESET}{CYAN}")
    print(f"{'=' * 60}{RESET}\n")

def ok(msg):
    print(f"  {GREEN}+{RESET} {msg}")

def fail(msg):
    print(f"  {RED}x{RESET} {msg}")

def info(msg):
    print(f"  {DIM}>{RESET} {msg}")

def warn(msg):
    print(f"  {YELLOW}!{RESET} {msg}")


# ═══════════════════════════════════════════════════════════════════
# MAC-based printer finder (same pattern as Dejavoo)
# ═══════════════════════════════════════════════════════════════════

def find_printer_by_mac():
    """Find the Volcora's current IP via ARP table lookup."""
    mac_lower = MAC_ADDRESS.lower()

    # Try arp -an (Linux/Mac)
    try:
        result = subprocess.run(
            ["arp", "-an"], capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            if mac_lower in line.lower():
                start = line.find("(")
                end = line.find(")")
                if start != -1 and end != -1:
                    return line[start + 1:end]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try arp -a (Windows)
    try:
        result = subprocess.run(
            ["arp", "-a"], capture_output=True, text=True, timeout=5
        )
        mac_dash = mac_lower.replace(":", "-")
        for line in result.stdout.splitlines():
            if mac_dash in line.lower() or mac_lower in line.lower():
                parts = line.split()
                if parts:
                    return parts[0].strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Try ip neigh (Linux)
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


# ═══════════════════════════════════════════════════════════════════
# Receipt builder — accumulates ESC/POS byte buffer
# ═══════════════════════════════════════════════════════════════════

class ReceiptBuilder:
    """
    Builds an ESC/POS receipt as a byte buffer.
    No dependencies — just bytes going to a TCP socket.
    """

    def __init__(self):
        self.buffer = bytearray()
        self.buffer.extend(INIT)
        self.buffer.extend(FONT_A)

    def center(self):
        self.buffer.extend(ALIGN_CENTER)
        return self

    def left(self):
        self.buffer.extend(ALIGN_LEFT)
        return self

    def bold(self, on=True):
        self.buffer.extend(BOLD_ON if on else BOLD_OFF)
        return self

    def double_height(self, on=True):
        self.buffer.extend(DOUBLE_HEIGHT_ON if on else NORMAL_SIZE)
        return self

    def double_hw(self, on=True):
        self.buffer.extend(DOUBLE_HW_ON if on else NORMAL_SIZE)
        return self

    def normal(self):
        self.buffer.extend(NORMAL_SIZE)
        self.buffer.extend(BOLD_OFF)
        return self

    def font_b(self):
        self.buffer.extend(FONT_B)
        return self

    def font_a(self):
        self.buffer.extend(FONT_A)
        return self

    def text(self, s):
        self.buffer.extend(s.encode('utf-8', errors='replace'))
        return self

    def line(self, s=""):
        self.text(s + "\n")
        return self

    def left_right(self, l, r, width=LINE_WIDTH):
        space = width - len(l) - len(r)
        if space < 1:
            space = 1
        self.line(l + (" " * space) + r)
        return self

    def separator(self, char="-"):
        self.line(char * LINE_WIDTH)
        return self

    def feed(self, lines=1):
        self.buffer.extend(FEED_LINES(lines))
        return self

    def cut(self):
        self.feed(6)
        self.buffer.extend(CUT_PARTIAL)
        return self

    def get_bytes(self):
        return bytes(self.buffer)


# ═══════════════════════════════════════════════════════════════════
# Sample order data — food truck transaction
# ═══════════════════════════════════════════════════════════════════

RESTAURANT = {
    "name": "KINDpos Demo Truck",
    "address": "1234 Food Truck Lane",
    "city_state_zip": "Cape Coral, FL 33914",
    "phone": "(239) 555-0142",
}

ORDER = {
    "check_number": "1042",
    "server": "Alex",
    "terminal": "T1",
    "order_type": "Counter",
    "items": [
        {"qty": 1, "name": "Half Rack Ribs", "price": 18.99, "mods": []},
        {"qty": 1, "name": "Pulled Pork Sandwich", "price": 12.99,
         "mods": ["EXTRA Sauce"]},
        {"qty": 1, "name": "Pulled Pork Combo", "price": 16.99,
         "mods": ["EXTRA Sauce", "w/ Drink"]},
    ],
    "subtotal": 48.97,
    "tax_rate": 0.07,
    "tax": 3.43,
    "total": 52.40,
    "payment": {
        "method": "VISA",
        "last_four": "1420",
        "entry_method": "Contactless",
        "auth_code": "A12345",
        "ref_id": "KIND_1774452982",
    },
    "tip": 8.00,
    "grand_total": 60.40,
}


# ═══════════════════════════════════════════════════════════════════
# Receipt templates
# ═══════════════════════════════════════════════════════════════════

def build_customer_receipt():
    """
    Customer receipt — the one they take home.
    Auto-prints on PAYMENT_APPROVED and CASH_PAYMENT events.
    """
    now = datetime.now()
    r = ReceiptBuilder()

    # Header
    r.center().bold().double_hw()
    r.line(RESTAURANT["name"])
    r.normal().center()
    r.line(RESTAURANT["address"])
    r.line(RESTAURANT["city_state_zip"])
    r.line(RESTAURANT["phone"])
    r.feed(1)

    # Check number
    r.center().bold().double_height()
    r.line("CHECK " + ORDER["check_number"])
    r.normal()
    r.feed(1)

    # Order info
    r.left()
    r.left_right("Order: " + ORDER["order_type"], "Server: " + ORDER["server"])
    r.left_right("Date: " + now.strftime("%m/%d/%Y"), "Time: " + now.strftime("%I:%M %p"))
    r.left_right("Terminal: " + ORDER["terminal"], "Check: #" + ORDER["check_number"])
    r.separator()

    # Items
    for item in ORDER["items"]:
        line_total = "${:.2f}".format(item["price"] * item["qty"])
        item_line = "{}x {}".format(item["qty"], item["name"])
        r.bold()
        r.left_right(item_line, line_total)
        r.bold(False)
        if item["qty"] > 1:
            r.line("      @ ${:.2f} each".format(item["price"]))
        for mod in item["mods"]:
            r.line("      " + mod)

    r.separator()

    # Totals
    r.left_right("Subtotal:", "${:.2f}".format(ORDER["subtotal"]))
    r.left_right("Tax ({:.0f}%):".format(ORDER["tax_rate"] * 100), "${:.2f}".format(ORDER["tax"]))
    r.separator()
    r.bold()
    r.left_right("TOTAL:", "${:.2f}".format(ORDER["total"]))
    r.bold(False)
    r.feed(1)
    r.left_right("Tip:", "${:.2f}".format(ORDER["tip"]))
    r.separator()
    r.bold().double_height()
    r.left_right("GRAND TOTAL:", "${:.2f}".format(ORDER["grand_total"]))
    r.normal()

    # Payment info
    pay = ORDER["payment"]
    r.feed(1)
    r.left_right("Payment:", "{} ****{}".format(pay["method"], pay["last_four"]))
    r.left_right("Entry:", pay["entry_method"])
    r.left_right("Auth:", pay["auth_code"])
    r.left_right("Ref:", pay["ref_id"])

    # Footer
    r.feed(1)
    r.center()
    r.line("Thank you!")
    r.line("Nice. Dependable. Yours.")
    r.feed(1)
    r.bold()
    r.line("** CUSTOMER COPY **")
    r.normal()

    r.cut()
    return r.get_bytes()


def build_merchant_receipt():
    """
    Merchant receipt — stays with the house.
    Tip line + signature line for card transactions.
    Prints automatically after customer copy.
    """
    now = datetime.now()
    r = ReceiptBuilder()

    # Header (abbreviated)
    r.center().bold().double_hw()
    r.line(RESTAURANT["name"])
    r.normal()
    r.feed(1)

    # Check number
    r.center().bold().double_height()
    r.line("CHECK " + ORDER["check_number"])
    r.normal()
    r.feed(1)

    # Order info
    r.left()
    r.left_right("Order: " + ORDER["order_type"], "Server: " + ORDER["server"])
    r.left_right("Date: " + now.strftime("%m/%d/%Y"), "Time: " + now.strftime("%I:%M %p"))
    r.left_right("Terminal: " + ORDER["terminal"], "Check: #" + ORDER["check_number"])
    r.separator()

    # Items
    for item in ORDER["items"]:
        line_total = "${:.2f}".format(item["price"] * item["qty"])
        item_line = "{}x {}".format(item["qty"], item["name"])
        r.bold()
        r.left_right(item_line, line_total)
        r.bold(False)
        if item["qty"] > 1:
            r.line("      @ ${:.2f} each".format(item["price"]))
        for mod in item["mods"]:
            r.line("      " + mod)

    r.separator()

    # Totals — NO tip on merchant copy (blank lines instead)
    r.left_right("Subtotal:", "${:.2f}".format(ORDER["subtotal"]))
    r.left_right("Tax ({:.0f}%):".format(ORDER["tax_rate"] * 100), "${:.2f}".format(ORDER["tax"]))
    r.separator()
    r.bold()
    r.left_right("TOTAL:", "${:.2f}".format(ORDER["total"]))
    r.bold(False)

    # Payment info
    pay = ORDER["payment"]
    r.feed(1)
    r.left_right("Payment:", "{} ****{}".format(pay["method"], pay["last_four"]))
    r.left_right("Entry:", pay["entry_method"])
    r.left_right("Auth:", pay["auth_code"])

    # Tip + signature lines (blank for customer to fill in)
    r.feed(1)
    r.left_right("Tip:", "$________")
    r.feed(1)
    r.left_right("Total:", "$________")
    r.feed(2)
    r.line("Signature: _______________________")

    # Footer
    r.feed(1)
    r.center()
    r.line("Thank you!")
    r.feed(1)
    r.bold()
    r.line("** MERCHANT COPY **")
    r.normal()

    r.cut()
    return r.get_bytes()


def build_itemized_ticket():
    """
    Itemized ticket — simplified five-zone kitchen format.
    No prices. Just items, quantities, modifiers.
    For food trucks: order confirmation / prep list.
    """
    now = datetime.now()
    r = ReceiptBuilder()

    # Zone 1 — Header
    r.center().bold().double_hw()
    r.line("CHECK " + ORDER["check_number"])
    r.normal().center().bold()
    r.line(ORDER["order_type"])
    r.line(now.strftime("%I:%M %p"))
    r.normal()
    r.feed(1)

    # Zone 2 — Context
    r.left().bold()
    r.line("Server: {} | {}".format(ORDER["server"], ORDER["order_type"]))
    r.normal()
    r.separator()

    # Zone 3 — Items (no prices)
    for item in ORDER["items"]:
        r.bold()
        r.line("{}x {}".format(item["qty"], item["name"]))
        r.bold(False)
        for mod in item["mods"]:
            r.line("      " + mod)

    r.separator()

    # Zone 5 — Footer (Font B)
    r.font_b().center()
    r.line("Terminal: {} | Ticket 1 of 1".format(ORDER["terminal"]))
    r.line("ORIGINAL TICKET")
    r.font_a()

    r.cut()
    return r.get_bytes()


# ═══════════════════════════════════════════════════════════════════
# TCP sender
# ═══════════════════════════════════════════════════════════════════

def send_to_printer(ip, data):
    """Send raw ESC/POS bytes to printer over TCP port 9100."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(TIMEOUT)
            sock.connect((ip, PORT))
            sock.sendall(data)
            return True
    except ConnectionRefusedError:
        fail("Connection refused at {}:{}".format(ip, PORT))
        warn("Is the printer powered on and connected to the network?")
        return False
    except socket.timeout:
        fail("Connection timed out to {}:{}".format(ip, PORT))
        return False
    except OSError as e:
        fail("Network error: {}".format(e))
        return False


# ═══════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="KINDpos Receipt Printer Test (Volcora WRP-208 Ethernet)",
        epilog="Examples:\n"
               "  python receipt_test.py                  Print all 3 receipts\n"
               "  python receipt_test.py --customer       Customer copy only\n"
               "  python receipt_test.py --merchant       Merchant copy only\n"
               "  python receipt_test.py --itemized       Itemized ticket\n"
               "  python receipt_test.py --find           Find printer by MAC\n"
               "  python receipt_test.py --ip 10.0.0.186  Use specific IP\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--ip", help="Printer IP (skips MAC lookup)")
    parser.add_argument("--find", action="store_true",
                        help="Find printer by MAC address")
    parser.add_argument("--customer", action="store_true",
                        help="Print customer receipt only")
    parser.add_argument("--merchant", action="store_true",
                        help="Print merchant receipt only")
    parser.add_argument("--itemized", action="store_true",
                        help="Print itemized ticket only")

    args = parser.parse_args()

    print("\n{}KINDpos Receipt Printer Test{}".format(BOLD_T, RESET))
    print("{}Volcora WRP-208 | Ethernet | Port 9100{}".format(DIM, RESET))
    print("{}Nice. Dependable. Yours.{}\n".format(DIM, RESET))

    # Resolve IP
    ip = args.ip
    if not ip:
        info("Looking for Volcora by MAC: " + MAC_ADDRESS)
        ip = find_printer_by_mac()
        if ip:
            ok("Found at {} (via MAC {})".format(ip, MAC_ADDRESS))
        else:
            warn("MAC lookup failed. Using default IP: " + DEFAULT_IP)
            ip = DEFAULT_IP

    if args.find:
        sys.exit(0)

    info("Target: {}:{}".format(ip, PORT))

    # Test connectivity
    info("Testing connection...")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(TIMEOUT)
            sock.connect((ip, PORT))
        ok("Printer reachable at {}:{}".format(ip, PORT))
    except Exception as e:
        fail("Cannot connect to {}:{} - {}".format(ip, PORT, e))
        sys.exit(1)

    print()

    # Determine what to print
    print_all = not (args.customer or args.merchant or args.itemized)

    if args.customer or print_all:
        banner("CUSTOMER RECEIPT")
        data = build_customer_receipt()
        info("Sending {} bytes...".format(len(data)))
        if send_to_printer(ip, data):
            ok("Customer receipt printed")

    if args.merchant or print_all:
        if print_all:
            time.sleep(0.5)
        banner("MERCHANT RECEIPT")
        data = build_merchant_receipt()
        info("Sending {} bytes...".format(len(data)))
        if send_to_printer(ip, data):
            ok("Merchant receipt printed")

    if args.itemized or print_all:
        if print_all:
            time.sleep(0.5)
        banner("ITEMIZED TICKET")
        data = build_itemized_ticket()
        info("Sending {} bytes...".format(len(data)))
        if send_to_printer(ip, data):
            ok("Itemized ticket printed")

    print("\n  {}Done!{} Check the printer.\n".format(GREEN, RESET))


if __name__ == "__main__":
    main()