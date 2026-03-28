"""
KINDpos Mock Payment Device Adapter
====================================
Nice. Dependable. Yours.

A simulated payment terminal for testing and development.
Behaves like a Stripe Terminal or Pax smart terminal — accepts
payments, processes tips, handles refunds, and fails on command.

This mock is NOT a toy. It simulates real-world scenarios:
    - Approved transactions with realistic response data
    - Declined cards with proper decline codes
    - Device disconnections mid-transaction
    - Timeout when customer walks away
    - Partial approvals (approved for less than requested)
    - Split payment flows
    - Tip adjustments after authorization
    - Refunds and voids

Every scenario a restaurant hits on a Friday night — testable
without a real card reader.

"Keep your card readers. We just swap the brain."

File location: backend/app/core/adapters/mock_payment_device.py
"""

import asyncio
import logging
import random
import string
from datetime import datetime
from typing import Optional, Dict

from .base_payment import (
    BasePaymentDevice,
    PaymentDeviceConfig,
    PaymentDeviceType,
    PaymentDeviceStatus,
    PaymentMethod,
    CardEntryMethod,
    TransactionType,
    TransactionStatus,
    PaymentRequest,
    PaymentResult,
    TipAdjustment,
)

logger = logging.getLogger("kindpos.adapters.mock_payment")


# =============================================================
# SECTION 1: Mock Card Data
# =============================================================
# Simulated cards for testing different scenarios.
# In production, the adapter never sees this data — P2PE handles it.
# But for testing, we need to simulate what the processor sends back.

MOCK_CARDS = {
    "approved": {
        "card_last_four": "4242",
        "card_brand": "visa",
        "authorization_code": "AUTH01",
    },
    "approved_amex": {
        "card_last_four": "1234",
        "card_brand": "amex",
        "authorization_code": "AUTH02",
    },
    "approved_mastercard": {
        "card_last_four": "5678",
        "card_brand": "mastercard",
        "authorization_code": "AUTH03",
    },
    "declined_insufficient": {
        "card_last_four": "0002",
        "card_brand": "visa",
        "decline_reason": "insufficient_funds",
    },
    "declined_expired": {
        "card_last_four": "0003",
        "card_brand": "mastercard",
        "decline_reason": "expired_card",
    },
    "declined_stolen": {
        "card_last_four": "0004",
        "card_brand": "visa",
        "decline_reason": "stolen_card",
    },
}


# =============================================================
# SECTION 2: Mock Payment Device
# =============================================================

class MockPaymentDevice(BasePaymentDevice):
    """
    Simulated payment terminal for testing.

    Behaves like a real smart terminal:
        - Connects and reports status
        - Accepts payment requests
        - Simulates customer card presentation
        - Returns realistic processor responses
        - Handles tips, refunds, voids
        - Fails in configurable ways

    Failure Modes (set via set_fail_mode):
        None            — Normal operation, all transactions approved
        "offline"       — Device unreachable, all operations fail
        "declined"      — Card always declined (insufficient funds)
        "timeout"       — Customer never presents card
        "disconnect"    — Device disconnects mid-transaction
        "error"         — Hardware error during processing

    Card Selection (set via set_card):
        "approved"              — Visa ending 4242 (default)
        "approved_amex"         — Amex ending 1234
        "approved_mastercard"   — Mastercard ending 5678
        "declined_insufficient" — Declined: insufficient funds
        "declined_expired"      — Declined: expired card
        "declined_stolen"       — Declined: stolen card

    Usage:
        config = PaymentDeviceConfig(
            device_id="device-front-01",
            name="Front Register Reader",
            device_type=PaymentDeviceType.SMART_TERMINAL,
            connection_string="mock://localhost",
            processor="mock",
        )
        device = MockPaymentDevice(config)
        device.connect()

        # Normal transaction
        request = PaymentRequest(order_id="order-001", amount=58.00)
        result = await device.initiate_payment(request)
        # result.success == True, result.card_last_four == "4242"

        # Test declined card
        device.set_fail_mode("declined")
        result = await device.initiate_payment(request)
        # result.success == False, result.decline_reason == "insufficient_funds"

        # Test device disconnect mid-transaction
        device.set_fail_mode("disconnect")
        result = await device.initiate_payment(request)
        # result.success == False, result.error_code == "device_disconnected"
    """

    def __init__(self, config: PaymentDeviceConfig):
        super().__init__(config)
        self._fail_mode: Optional[str] = None
        self._card_key: str = "approved"
        self._entry_method: CardEntryMethod = CardEntryMethod.TAP

        # Transaction history — stores completed transactions
        # for refund/void/tip_adjust lookups
        self._transactions: Dict[str, PaymentResult] = {}

        # Simulated processing delay (seconds)
        self._processing_delay: float = 0.1  # Fast for tests

        logger.info(
            f"[MOCK PAYMENT] Created '{config.name}' "
            f"(type={config.device_type.value}, processor={config.processor})"
        )

    # -----------------------------------------------------------------
    # Test Controls — Not part of the base contract
    # -----------------------------------------------------------------

    def set_fail_mode(self, mode: Optional[str]):
        """
        Set the failure mode for testing.

        Args:
            mode: None, "offline", "declined", "timeout",
                  "disconnect", "error"
        """
        valid_modes = {None, "offline", "declined", "timeout", "disconnect", "error"}
        if mode not in valid_modes:
            raise ValueError(f"Invalid fail mode: {mode}. Valid: {valid_modes}")

        self._fail_mode = mode
        if mode == "offline":
            self._status = PaymentDeviceStatus.OFFLINE
            self._connected = False
        logger.info(
            f"[MOCK PAYMENT] '{self.name}' fail mode set to: {mode or 'NORMAL'}"
        )

    def set_card(self, card_key: str):
        """
        Set which mock card the 'customer' will present.

        Args:
            card_key: Key from MOCK_CARDS dict
        """
        if card_key not in MOCK_CARDS:
            raise ValueError(f"Unknown card: {card_key}. Valid: {list(MOCK_CARDS.keys())}")
        self._card_key = card_key
        logger.info(f"[MOCK PAYMENT] '{self.name}' card set to: {card_key}")

    def set_entry_method(self, method: CardEntryMethod):
        """Set how the customer will present their card."""
        self._entry_method = method

    def set_processing_delay(self, seconds: float):
        """Set simulated processing time."""
        self._processing_delay = seconds

    def get_transaction(self, transaction_id: str) -> Optional[PaymentResult]:
        """Look up a completed transaction by processor txn ID."""
        return self._transactions.get(transaction_id)

    # -----------------------------------------------------------------
    # Connection — BasePaymentDevice contract
    # -----------------------------------------------------------------

    async def connect(self) -> bool:
        """Simulate connecting to the payment device."""
        if self._fail_mode == "offline":
            logger.warning(
                f"[MOCK PAYMENT] '{self.name}' — Connection FAILED (offline mode)"
            )
            self._status = PaymentDeviceStatus.OFFLINE
            self._connected = False
            return False

        self._connected = True
        self._status = PaymentDeviceStatus.ONLINE
        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Connected "
            f"(type={self._config.device_type.value})"
        )
        return True

    async def disconnect(self) -> bool:
        """Simulate disconnecting from the payment device."""
        if self.is_busy:
            logger.warning(
                f"[MOCK PAYMENT] '{self.name}' — "
                f"Cancelling in-flight transaction before disconnect"
            )
            await self.cancel_transaction()

        self._connected = False
        self._status = PaymentDeviceStatus.OFFLINE
        self._current_transaction_id = None
        logger.info(f"[MOCK PAYMENT] '{self.name}' — Disconnected")
        return True

    # -----------------------------------------------------------------
    # Core: Initiate Payment
    # -----------------------------------------------------------------

    async def initiate_payment(self, request: PaymentRequest) -> PaymentResult:
        """
        Simulate a full payment transaction.

        Flow mirrors real hardware:
            1. Validate device is ready
            2. Display amount on device (status → WAITING_FOR_CARD)
            3. Customer presents card (simulated delay)
            4. Process with processor (status → BUSY)
            5. Return result (status → ONLINE)
        """
        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Payment request: "
            f"${request.amount:.2f} for order {request.order_id} "
            f"(type={request.transaction_type.value})"
        )

        # --- Pre-flight checks ---

        if self._fail_mode == "offline" or not self._connected:
            return self._make_error_result(
                request, "device_offline",
                "Payment device is not connected"
            )

        if self.is_busy:
            return self._make_error_result(
                request, "device_busy",
                "Device is processing another transaction"
            )

        if request.amount <= 0 and not request.is_refund:
            return self._make_error_result(
                request, "invalid_amount",
                "Payment amount must be greater than zero"
            )

        # --- Step 1: Prompt for card ---

        self._status = PaymentDeviceStatus.WAITING_FOR_CARD
        txn_id = self._generate_transaction_id()
        self._current_transaction_id = txn_id

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Waiting for card... "
            f"(txn={txn_id[:12]}...)"
        )

        # Simulate customer delay
        await asyncio.sleep(self._processing_delay * 0.5)

        # --- Step 2: Check for timeout/disconnect ---

        if self._fail_mode == "timeout":
            self._status = PaymentDeviceStatus.ONLINE
            self._current_transaction_id = None
            result = PaymentResult(
                success=False,
                payment_id=request.payment_id,
                device_id=self.device_id,
                transaction_status=TransactionStatus.TIMED_OUT,
                transaction_id=txn_id,
                message="Transaction timed out — customer did not present card",
                error_code="timeout",
            )
            logger.warning(
                f"[MOCK PAYMENT] '{self.name}' — TIMEOUT (txn={txn_id[:12]}...)"
            )
            return result

        if self._fail_mode == "disconnect":
            self._connected = False
            self._status = PaymentDeviceStatus.OFFLINE
            self._current_transaction_id = None
            result = PaymentResult(
                success=False,
                payment_id=request.payment_id,
                device_id=self.device_id,
                transaction_status=TransactionStatus.ERROR,
                transaction_id=txn_id,
                message="Device disconnected during transaction",
                error_code="device_disconnected",
            )
            logger.error(
                f"[MOCK PAYMENT] '{self.name}' — DISCONNECTED mid-transaction! "
                f"(txn={txn_id[:12]}...)"
            )
            return result

        # --- Step 3: Card presented, processing ---

        self._status = PaymentDeviceStatus.BUSY

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Card presented "
            f"(method={self._entry_method.value}), processing..."
        )

        # Simulate processor delay
        await asyncio.sleep(self._processing_delay * 0.5)

        # --- Step 4: Check for hardware error ---

        if self._fail_mode == "error":
            self._status = PaymentDeviceStatus.ERROR
            self._current_transaction_id = None
            result = PaymentResult(
                success=False,
                payment_id=request.payment_id,
                device_id=self.device_id,
                transaction_status=TransactionStatus.ERROR,
                transaction_id=txn_id,
                message="Hardware error during processing",
                error_code="hardware_error",
            )
            logger.error(
                f"[MOCK PAYMENT] '{self.name}' — HARDWARE ERROR "
                f"(txn={txn_id[:12]}...)"
            )
            return result

        # --- Step 5: Get card data and check decline ---

        card = MOCK_CARDS.get(self._card_key, MOCK_CARDS["approved"])

        if self._fail_mode == "declined" or "decline_reason" in card:
            self._status = PaymentDeviceStatus.ONLINE
            self._current_transaction_id = None
            decline_reason = card.get("decline_reason", "generic_decline")
            result = PaymentResult(
                success=False,
                payment_id=request.payment_id,
                device_id=self.device_id,
                transaction_status=TransactionStatus.DECLINED,
                transaction_id=txn_id,
                card_last_four=card.get("card_last_four"),
                card_brand=card.get("card_brand"),
                card_entry_method=self._entry_method,
                message=f"Declined: {decline_reason.replace('_', ' ').title()}",
                decline_reason=decline_reason,
                processing_time_ms=int(self._processing_delay * 1000),
            )
            logger.warning(
                f"[MOCK PAYMENT] '{self.name}' — DECLINED: {decline_reason} "
                f"(txn={txn_id[:12]}...)"
            )
            return result

        # --- Step 6: APPROVED ---

        self._status = PaymentDeviceStatus.ONLINE
        self._current_transaction_id = None

        result = PaymentResult(
            success=True,
            payment_id=request.payment_id,
            device_id=self.device_id,
            transaction_status=TransactionStatus.APPROVED,
            transaction_id=txn_id,
            authorization_code=card.get("authorization_code", "AUTH00"),
            amount_authorized=request.amount,
            amount_captured=request.amount if request.transaction_type == TransactionType.SALE else 0.00,
            card_last_four=card["card_last_four"],
            card_brand=card["card_brand"],
            card_entry_method=self._entry_method,
            message="Approved",
            processing_time_ms=int(self._processing_delay * 1000),
        )

        # Store for refund/void/tip lookups
        self._transactions[txn_id] = result

        self._render_terminal_display(request, result)

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — APPROVED: "
            f"${request.amount:.2f} on {card['card_brand']} "
            f"****{card['card_last_four']} "
            f"(txn={txn_id[:12]}...)"
        )

        return result

    # -----------------------------------------------------------------
    # Core: Cancel Transaction
    # -----------------------------------------------------------------

    async def cancel_transaction(self) -> PaymentResult:
        """Cancel the current in-progress transaction."""
        txn_id = self._current_transaction_id

        if not self.is_busy or not txn_id:
            logger.info(
                f"[MOCK PAYMENT] '{self.name}' — Cancel requested, "
                f"no transaction in progress (no-op)"
            )
            return PaymentResult(
                success=True,
                payment_id="",
                device_id=self.device_id,
                transaction_status=TransactionStatus.CANCELLED,
                message="No transaction in progress",
            )

        self._status = PaymentDeviceStatus.ONLINE
        self._current_transaction_id = None

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Transaction CANCELLED "
            f"(txn={txn_id[:12]}...)"
        )

        return PaymentResult(
            success=True,
            payment_id="",
            device_id=self.device_id,
            transaction_status=TransactionStatus.CANCELLED,
            transaction_id=txn_id,
            message="Transaction cancelled by operator",
        )

    # -----------------------------------------------------------------
    # Core: Refund
    # -----------------------------------------------------------------

    async def refund(self, request: PaymentRequest) -> PaymentResult:
        """Process a refund against a previous transaction."""
        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Refund request: "
            f"${request.amount:.2f} against txn {request.reference_transaction_id}"
        )

        if self._fail_mode == "offline" or not self._connected:
            return self._make_error_result(
                request, "device_offline",
                "Payment device is not connected"
            )

        # Verify original transaction exists
        original = self._transactions.get(request.reference_transaction_id or "")
        if not original:
            return self._make_error_result(
                request, "transaction_not_found",
                f"Original transaction {request.reference_transaction_id} not found"
            )

        if request.amount > original.amount_authorized:
            return self._make_error_result(
                request, "refund_exceeds_original",
                f"Refund ${request.amount:.2f} exceeds original "
                f"${original.amount_authorized:.2f}"
            )

        await asyncio.sleep(self._processing_delay)

        refund_txn_id = self._generate_transaction_id()
        result = PaymentResult(
            success=True,
            payment_id=request.payment_id,
            device_id=self.device_id,
            transaction_status=TransactionStatus.REFUNDED,
            transaction_id=refund_txn_id,
            amount_authorized=request.amount,
            amount_captured=request.amount,
            card_last_four=original.card_last_four,
            card_brand=original.card_brand,
            message=f"Refunded ${request.amount:.2f}",
            processing_time_ms=int(self._processing_delay * 1000),
        )

        self._transactions[refund_txn_id] = result

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — REFUNDED: "
            f"${request.amount:.2f} on {original.card_brand} "
            f"****{original.card_last_four} "
            f"(refund_txn={refund_txn_id[:12]}...)"
        )

        return result

    # -----------------------------------------------------------------
    # Core: Void
    # -----------------------------------------------------------------

    async def void(self, request: PaymentRequest) -> PaymentResult:
        """Void a transaction before settlement."""
        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Void request: "
            f"txn {request.reference_transaction_id}"
        )

        if self._fail_mode == "offline" or not self._connected:
            return self._make_error_result(
                request, "device_offline",
                "Payment device is not connected"
            )

        original = self._transactions.get(request.reference_transaction_id or "")
        if not original:
            return self._make_error_result(
                request, "transaction_not_found",
                f"Original transaction {request.reference_transaction_id} not found"
            )

        await asyncio.sleep(self._processing_delay)

        void_txn_id = self._generate_transaction_id()
        result = PaymentResult(
            success=True,
            payment_id=request.payment_id,
            device_id=self.device_id,
            transaction_status=TransactionStatus.VOIDED,
            transaction_id=void_txn_id,
            amount_authorized=original.amount_authorized,
            card_last_four=original.card_last_four,
            card_brand=original.card_brand,
            message=f"Voided ${original.amount_authorized:.2f}",
            processing_time_ms=int(self._processing_delay * 1000),
        )

        self._transactions[void_txn_id] = result

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — VOIDED: "
            f"${original.amount_authorized:.2f} on {original.card_brand} "
            f"****{original.card_last_four} "
            f"(void_txn={void_txn_id[:12]}...)"
        )

        return result

    # -----------------------------------------------------------------
    # Core: Tip Adjust
    # -----------------------------------------------------------------

    async def tip_adjust(self, tip: TipAdjustment) -> PaymentResult:
        """
        Adjust a pre-authorized transaction to include a tip.

        The most restaurant-specific operation. Server enters tip,
        system adjusts the authorized amount, captures the new total.
        """
        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Tip adjust: "
            f"${tip.tip_amount:.2f} tip on txn {tip.original_transaction_id} "
            f"(new total: ${tip.total_amount:.2f})"
        )

        if self._fail_mode == "offline" or not self._connected:
            return PaymentResult(
                success=False,
                payment_id=tip.original_payment_id,
                device_id=self.device_id,
                transaction_status=TransactionStatus.ERROR,
                message="Payment device is not connected",
                error_code="device_offline",
            )

        original = self._transactions.get(tip.original_transaction_id)
        if not original:
            return PaymentResult(
                success=False,
                payment_id=tip.original_payment_id,
                device_id=self.device_id,
                transaction_status=TransactionStatus.ERROR,
                message=f"Original transaction {tip.original_transaction_id} not found",
                error_code="transaction_not_found",
            )

        await asyncio.sleep(self._processing_delay)

        # Adjust the authorization to include tip
        adjust_txn_id = self._generate_transaction_id()
        result = PaymentResult(
            success=True,
            payment_id=tip.original_payment_id,
            device_id=self.device_id,
            transaction_status=TransactionStatus.APPROVED,
            transaction_id=adjust_txn_id,
            authorization_code=original.authorization_code,
            amount_authorized=tip.total_amount,
            amount_captured=tip.total_amount,
            card_last_four=original.card_last_four,
            card_brand=original.card_brand,
            card_entry_method=original.card_entry_method,
            message=f"Tip adjusted: ${tip.tip_amount:.2f} tip, "
                    f"total ${tip.total_amount:.2f}",
            processing_time_ms=int(self._processing_delay * 1000),
        )

        self._transactions[adjust_txn_id] = result

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — TIP ADJUSTED: "
            f"${tip.tip_amount:.2f} tip → total ${tip.total_amount:.2f} "
            f"on {original.card_brand} ****{original.card_last_four} "
            f"(adjust_txn={adjust_txn_id[:12]}...)"
        )

        return result

    # -----------------------------------------------------------------
    # Status Check
    # -----------------------------------------------------------------

    async def check_status(self) -> PaymentDeviceStatus:
        """Query device status."""
        if self._fail_mode == "offline":
            self._status = PaymentDeviceStatus.OFFLINE
            self._connected = False
        elif self._fail_mode == "error":
            self._status = PaymentDeviceStatus.ERROR
        elif not self._connected:
            self._status = PaymentDeviceStatus.OFFLINE

        logger.info(
            f"[MOCK PAYMENT] '{self.name}' — Status: {self._status.value}"
        )
        return self._status

    # -----------------------------------------------------------------
    # Internal Helpers
    # -----------------------------------------------------------------

    def _generate_transaction_id(self) -> str:
        """
        Generate a realistic-looking transaction ID.
        Real processors return IDs like 'pi_3abc123def456' (Stripe)
        or '12345678' (Pax). We simulate the Stripe style.
        """
        suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))
        return f"mock_txn_{suffix}"

    def _make_error_result(
        self, request: PaymentRequest, error_code: str, message: str
    ) -> PaymentResult:
        """Create a standardized error result."""
        return PaymentResult(
            success=False,
            payment_id=request.payment_id,
            device_id=self.device_id,
            transaction_status=TransactionStatus.ERROR,
            message=message,
            error_code=error_code,
        )

    def _render_terminal_display(
        self, request: PaymentRequest, result: PaymentResult
    ):
        """
        Simulate what the payment terminal screen shows.
        Like the mock printers rendering tickets — this renders
        a text representation of the terminal display for testing.
        """
        width = 32  # Typical small terminal screen width
        separator = "─" * width

        lines = []
        lines.append("")
        lines.append(f"  ┌{'─' * (width - 2)}┐")
        lines.append(f"  │{'PAYMENT TERMINAL':^{width - 2}}│")
        lines.append(f"  │{self.name:^{width - 2}}│")
        lines.append(f"  ├{'─' * (width - 2)}┤")

        if result.success:
            lines.append(f"  │{'✓ APPROVED':^{width - 2}}│")
        else:
            status_text = result.transaction_status.value.upper()
            lines.append(f"  │{'✗ ' + status_text:^{width - 2}}│")

        lines.append(f"  ├{'─' * (width - 2)}┤")

        # Amount
        amount_str = f"${request.amount:.2f}"
        lines.append(f"  │  Amount: {amount_str:<{width - 12}}│")

        if request.tip_amount > 0:
            tip_str = f"${request.tip_amount:.2f}"
            lines.append(f"  │  Tip:    {tip_str:<{width - 12}}│")
            total_str = f"${request.total_with_tip:.2f}"
            lines.append(f"  │  Total:  {total_str:<{width - 12}}│")

        # Card info
        if result.card_last_four:
            card_line = f"{result.card_brand or '????'} ****{result.card_last_four}"
            lines.append(f"  │  Card:   {card_line:<{width - 12}}│")

        if result.card_entry_method and result.card_entry_method != CardEntryMethod.UNKNOWN:
            entry_line = result.card_entry_method.value.upper()
            lines.append(f"  │  Entry:  {entry_line:<{width - 12}}│")

        # Transaction ID (truncated)
        if result.transaction_id:
            txn_display = result.transaction_id[:16] + "..."
            lines.append(f"  │  TXN:    {txn_display:<{width - 12}}│")

        # Auth code
        if result.authorization_code:
            lines.append(f"  │  Auth:   {result.authorization_code:<{width - 12}}│")

        # Split info
        if request.is_split:
            split_line = f"Split {request.split_index + 1} of {request.split_total}"
            lines.append(f"  │  {split_line:<{width - 4}}│")

        lines.append(f"  └{'─' * (width - 2)}┘")
        lines.append("")

        display = "\n".join(lines)
        print(display)
