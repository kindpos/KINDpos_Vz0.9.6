import httpx
import xml.etree.ElementTree as ET
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from decimal import Decimal

from .base_payment import (
    BasePaymentDevice,
    PaymentDeviceConfig,
    PaymentDeviceStatus,
    TransactionRequest,
    TransactionResult,
    TransactionStatus,
    BatchResult,
    BatchStatus,
    PaymentType,
    EntryMethod,
    PaymentError,
    PaymentErrorCategory
)

logger = logging.getLogger("kindpos.payment.dejavoo")

class DejavooSPInAdapter(BasePaymentDevice):
    """
    Real hardware adapter for Dejavoo SPIn.
    Translates KINDpos operations into SPIn XML over HTTP on local LAN.
    """

    def __init__(self):
        self._status = PaymentDeviceStatus.OFFLINE
        self._config: Optional[PaymentDeviceConfig] = None
        self._client = httpx.AsyncClient(timeout=95.0) # Long timeout for transactions

    @property
    def status(self) -> PaymentDeviceStatus:
        return self._status

    @property
    def config(self) -> Optional[PaymentDeviceConfig]:
        return self._config

    async def connect(self, config: PaymentDeviceConfig) -> bool:
        self._config = config
        # Initial health check to verify connectivity
        status = await self.check_status()
        return status != PaymentDeviceStatus.OFFLINE

    async def disconnect(self) -> bool:
        await self._client.aclose()
        self._status = PaymentDeviceStatus.OFFLINE
        return True

    async def check_status(self) -> PaymentDeviceStatus:
        if self.in_sacred_state:
            return self._status

        try:
            xml = self._build_xml("GetStatus")
            response = await self._send_request(xml)
            if response:
                root = ET.fromstring(response)
                resp_msg = root.findtext("RespMSG")
                # Map Dejavoo status to KINDpos status
                if resp_msg == "Ready":
                    self._status = PaymentDeviceStatus.IDLE
                elif resp_msg == "Busy":
                    # If we aren't the ones who made it busy, we just know it's busy
                    if not self.in_sacred_state:
                         self._status = PaymentDeviceStatus.PROCESSING
                else:
                    self._status = PaymentDeviceStatus.ONLINE # Reachable but unknown state
            else:
                self._status = PaymentDeviceStatus.OFFLINE
        except Exception as e:
            logger.error(f"Dejavoo health check failed: {e}")
            self._status = PaymentDeviceStatus.OFFLINE

        return self._status

    async def initiate_sale(self, request: TransactionRequest) -> TransactionResult:
        xml = self._build_xml("Sale", {
            "Amount": f"{request.amount:.2f}",
            "InvNum": request.transaction_id,
            "ExtData": "TipRequest=No"
        })
        
        self._status = PaymentDeviceStatus.AWAITING_CARD
        try:
            response = await self._send_request(xml)
            return self._parse_response(response, request.transaction_id)
        finally:
            self._status = PaymentDeviceStatus.IDLE

    async def initiate_refund(self, request: TransactionRequest) -> TransactionResult:
        # Dejavoo calls it 'Return'
        xml = self._build_xml("Return", {
            "Amount": f"{request.amount:.2f}",
            "InvNum": request.transaction_id,
            # For refunds we might need the original token if available in request
            # "Token": request.ext_data.get('token')
        })
        try:
            response = await self._send_request(xml)
            return self._parse_response(response, request.transaction_id)
        finally:
             self._status = PaymentDeviceStatus.IDLE

    async def initiate_void(self, request: TransactionRequest) -> TransactionResult:
        xml = self._build_xml("Void", {
            "InvNum": request.transaction_id,
        })
        try:
            response = await self._send_request(xml)
            return self._parse_response(response, request.transaction_id)
        finally:
             self._status = PaymentDeviceStatus.IDLE

    async def cancel_transaction(self) -> bool:
        xml = self._build_xml("Cancel")
        try:
            response = await self._send_request(xml)
            if response:
                root = ET.fromstring(response)
                return root.findtext("RespMSG") == "Cancelled"
        except:
            pass
        return False

    async def close_batch(self) -> BatchResult:
        xml = self._build_xml("BatchClose")
        try:
            response = await self._send_request(xml)
            if response:
                root = ET.fromstring(response)
                success = root.findtext("RespMSG") == "Approved"
                return BatchResult(
                    batch_id=root.findtext("BatchID", "UNKNOWN"),
                    transaction_count=int(root.findtext("BatchCount", "0")),
                    total_amount=Decimal(root.findtext("BatchAmount", "0.00")),
                    status=BatchStatus.SUCCESS if success else BatchStatus.FAILED,
                    timestamp=datetime.now()
                )
        except Exception as e:
             return BatchResult(
                batch_id="ERROR",
                transaction_count=0,
                total_amount=Decimal("0.00"),
                status=BatchStatus.FAILED,
                error=PaymentError(
                    category=PaymentErrorCategory.SYSTEM,
                    error_code="BATCH_ERR",
                    message=str(e),
                    source="DejavooSPInAdapter"
                )
            )

    async def get_device_info(self) -> Dict[str, Any]:
        return {
            "adapter": "DejavooSPInAdapter",
            "protocol": "SPIn XML over HTTP",
            "config": self._config.dict() if self._config else None
        }

    async def get_capabilities(self) -> List[PaymentType]:
        return [PaymentType.SALE, PaymentType.REFUND, PaymentType.VOID]

    def _build_xml(self, function: str, params: Dict[str, str] = None) -> str:
        root = ET.Element("POSXML")
        func = ET.SubElement(root, "Function")
        func.text = function
        if params:
            for k, v in params.items():
                child = ET.SubElement(root, k)
                child.text = v
        return ET.tostring(root, encoding="unicode")

    async def _send_request(self, xml_body: str) -> Optional[str]:
        if not self._config:
            return None
        
        url = f"http://{self._config.ip_address}:{self._config.port}/api/"
        try:
            logger.debug(f"Sending Dejavoo Request: {xml_body}")
            response = await self._client.post(url, content=xml_body, headers={"Content-Type": "application/xml"})
            response.raise_for_status()
            logger.debug(f"Received Dejavoo Response: {response.text}")
            return response.text
        except httpx.RequestError as e:
            logger.error(f"HTTP Request to Dejavoo failed: {e}")
            return None

    def _parse_response(self, response: Optional[str], expected_inv: str) -> TransactionResult:
        if not response:
            return TransactionResult(
                transaction_id=expected_inv,
                status=TransactionStatus.ERROR,
                error=PaymentError(
                    category=PaymentErrorCategory.NETWORK,
                    error_code="CONN_FAIL",
                    message="Could not reach payment device",
                    source="DejavooSPInAdapter"
                )
            )

        try:
            root = ET.fromstring(response)
            resp_msg = root.findtext("RespMSG")
            inv_num = root.findtext("InvNum")

            if inv_num != expected_inv:
                return TransactionResult(
                    transaction_id=expected_inv,
                    status=TransactionStatus.ERROR,
                    error=PaymentError(
                        category=PaymentErrorCategory.SYSTEM,
                        error_code="INV_MISMATCH",
                        message=f"Invoice mismatch: expected {expected_inv}, got {inv_num}",
                        source="DejavooSPInAdapter"
                    )
                )

            status = TransactionStatus.ERROR
            if resp_msg == "Approved":
                status = TransactionStatus.APPROVED
            elif resp_msg == "Declined":
                status = TransactionStatus.DECLINED
            elif resp_msg == "Cancelled":
                status = TransactionStatus.CANCELLED
            
            # Map entry mode
            entry_map = {
                "Swipe": EntryMethod.SWIPE,
                "Chip": EntryMethod.CHIP,
                "Contactless": EntryMethod.TAP,
                "Manual": EntryMethod.MANUAL
            }
            entry_mode = entry_map.get(root.findtext("EntryMode"), EntryMethod.TAP)

            return TransactionResult(
                transaction_id=inv_num,
                status=status,
                authorization_code=root.findtext("AuthCode"),
                reference_number=root.findtext("Token"), # Dejavoo Token is usually the ref
                card_brand=root.findtext("CardBrand"),
                last_four=root.findtext("LastFour"),
                entry_method=entry_mode,
                processor_response_code=root.findtext("ResultCode"),
                processor_message=root.findtext("RespMSG"),
                timestamp=datetime.now()
            )

        except Exception as e:
             return TransactionResult(
                transaction_id=expected_inv,
                status=TransactionStatus.ERROR,
                error=PaymentError(
                    category=PaymentErrorCategory.SYSTEM,
                    error_code="PARSE_FAIL",
                    message=f"Failed to parse Dejavoo response: {e}",
                    source="DejavooSPInAdapter"
                )
            )
