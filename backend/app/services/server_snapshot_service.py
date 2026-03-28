from typing import List, Dict, Any, Optional
from datetime import datetime
from app.config import settings
from app.core.event_ledger import EventLedger
from app.core.events import EventType, tip_adjusted
from app.core.projections import project_orders, Order
from app.models.config_events import TipoutRule

class ServerSnapshotService:
    def __init__(self, ledger: EventLedger):
        self.ledger = ledger
        self._orders_cache: Optional[Dict[str, Order]] = None

    async def _get_all_orders(self) -> Dict[str, Order]:
        """Fetch and project all orders once, then cache for reuse."""
        if self._orders_cache is None:
            events = await self.ledger.get_events_since(0, limit=10000)
            self._orders_cache = project_orders(events, tax_rate=settings.tax_rate)
        return self._orders_cache

    def invalidate_cache(self):
        """Clear the cached orders (call after writes like adjust_tip)."""
        self._orders_cache = None

    async def get_server_orders(self, server_id: str, since: Optional[datetime] = None) -> List[Order]:
        """Get all orders for a specific server since a given time."""
        orders_dict = await self._get_all_orders()

        server_orders = []
        for order in orders_dict.values():
            if order.server_id == server_id:
                created_at = order.created_at
                if isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    except ValueError:
                        pass

                if since is None or (isinstance(created_at, datetime) and created_at >= since):
                    server_orders.append(order)
        return server_orders

    async def get_server_sales(self, server_id: str, since: Optional[datetime] = None) -> Dict[str, Any]:
        orders = await self.get_server_orders(server_id, since)
        net_sales = sum(o.subtotal for o in orders if o.status != "voided")
        gross_sales = sum(o.total for o in orders if o.status != "voided")
        discount_total = sum(o.discount_total for o in orders if o.status != "voided")
        void_total = sum(o.total for o in orders if o.status == "voided")

        # Covers count
        covers = sum(o.guest_count for o in orders if o.status != "voided")

        return {
            "net_sales": net_sales,
            "gross_sales": gross_sales,
            "discount_total": discount_total,
            "void_total": void_total,
            "covers": covers,
            "per_cover_avg": net_sales / covers if covers > 0 else 0
        }

    async def get_server_checks(self, server_id: str, since: Optional[datetime] = None) -> Dict[str, Any]:
        orders = await self.get_server_orders(server_id, since)
        open_checks = [o for o in orders if o.status not in ("closed", "voided")]
        closed_checks = [o for o in orders if o.status == "closed"]

        # Tables turned: distinct tables in closed checks
        tables_turned = len(set(o.table for o in closed_checks if o.table))

        return {
            "open_count": len(open_checks),
            "closed_count": len(closed_checks),
            "tables_turned": tables_turned,
            "open_checks": open_checks,
            "closed_checks": closed_checks
        }

    async def get_server_tips(self, server_id: str, since: Optional[datetime] = None) -> Dict[str, Any]:
        orders = await self.get_server_orders(server_id, since)
        tips_earned = 0.0
        pending_tips = 0.0
        tip_list = []

        for o in orders:
            if o.status == "voided": continue

            order_tip = sum(p.tip_amount or 0.0 for p in o.payments)
            tip_info = {
                "order_id": o.order_id,
                "table": o.table,
                "subtotal": o.subtotal,
                "tip_amount": order_tip,
                "is_adjusted": any(p.tip_amount > 0 for p in o.payments),
                "payment_methods": [p.method for p in o.payments],
                "timestamp": o.created_at if isinstance(o.created_at, str) else o.created_at.isoformat() if o.created_at else None
            }

            if o.status == "closed":
                tips_earned += order_tip
                tip_list.append(tip_info)
            else:
                pending_tips += order_tip

        return {
            "tips_earned": tips_earned,
            "pending_tips": pending_tips,
            "tip_list": tip_list
        }

    async def calculate_tip_out(self, server_id: str, since: Optional[datetime] = None, rules: List[TipoutRule] = None) -> Dict[str, Any]:
        sales_data = await self.get_server_sales(server_id, since)
        tips_data = await self.get_server_tips(server_id, since)

        total_sales = sales_data["net_sales"]
        bev_sales = total_sales * 0.2 # Placeholder

        total_owed = 0.0
        breakdown = []

        if rules:
            for rule in rules:
                basis_val = total_sales if rule.basis == "totalSales" else bev_sales
                amount = basis_val * rule.percentage
                total_owed += amount
                breakdown.append({
                    "role": rule.role_name,
                    "amount": amount,
                    "pct": rule.percentage * 100,
                    "basis": rule.basis
                })

        walk_with = tips_data["tips_earned"] - total_owed

        return {
            "total_owed": total_owed,
            "breakdown": breakdown,
            "walk_with": walk_with
        }

    async def get_checkout_blockers(self, server_id: str, since: Optional[datetime] = None) -> Dict[str, Any]:
        checks = await self.get_server_checks(server_id, since)
        tips_data = await self.get_server_tips(server_id, since)

        open_checks = []
        for o in checks["open_checks"]:
            duration = 0
            created_at = o.created_at
            if isinstance(created_at, str):
                try:
                    created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                except ValueError:
                    created_at = None

            if isinstance(created_at, datetime):
                duration = int((datetime.now(created_at.tzinfo) - created_at).total_seconds() / 60)

            open_checks.append({
                "order_id": o.order_id,
                "table": o.table,
                "duration": max(0, duration),
                "amount": o.total
            })

        unadjusted_tips = [t for t in tips_data["tip_list"] if not t["is_adjusted"]]

        return {
            "open_checks": open_checks,
            "all_tips": tips_data["tip_list"],
            "unadjusted_count": len(unadjusted_tips),
            "blocker_count": len(open_checks) + len(unadjusted_tips),
            "is_ready": len(open_checks) == 0 and len(unadjusted_tips) == 0,
            "has_open_tables": len(open_checks) > 0
        }

    async def adjust_tip(self, terminal_id: str, order_id: str, payment_id: str, tip_amount: float):
        orders = await self._get_all_orders()
        order = orders.get(order_id)
        if not order:
            raise ValueError(f"Order {order_id} not found")

        # If payment_id is 'auto', find the first card payment or any payment
        if payment_id == 'auto':
            if not order.payments:
                raise ValueError(f"No payment found for order {order_id}")
            # Prefer card payments for tip adjustment
            card_payment = next((p for p in order.payments if p.method == 'card'), order.payments[0])
            payment_id = card_payment.payment_id

        payment = next((p for p in order.payments if p.payment_id == payment_id), None)
        previous_tip = payment.tip_amount if payment else 0.0

        event = tip_adjusted(
            terminal_id=terminal_id,
            order_id=order_id,
            payment_id=payment_id,
            tip_amount=tip_amount,
            previous_tip=previous_tip
        )
        await self.ledger.append(event)
        self.invalidate_cache()
        return event

    async def get_server_hourly_guest_pace(self, server_id: str, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        orders = await self.get_server_orders(server_id, since)
        hourly_data = {}

        for o in orders:
            if o.status == "voided" or not o.created_at: continue

            created_at = o.created_at
            if isinstance(created_at, str):
                try:
                    created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                except ValueError:
                    continue

            hour = created_at.hour
            hourly_data[hour] = hourly_data.get(hour, 0) + o.guest_count

        return [{"hour": h, "count": c} for h, c in sorted(hourly_data.items())]

    async def get_server_category_mix(self, server_id: str, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        orders = await self.get_server_orders(server_id, since)
        cat_mix = {}

        for o in orders:
            if o.status == "voided": continue
            for item in o.items:
                cat = item.category or "Other"
                if cat not in cat_mix:
                    cat_mix[cat] = {"revenue": 0.0, "items": {}}

                cat_mix[cat]["revenue"] += item.subtotal
                item_name = item.name
                cat_mix[cat]["items"][item_name] = cat_mix[cat]["items"].get(item_name, 0.0) + item.subtotal

        sorted_cats = sorted(cat_mix.items(), key=lambda x: x[1]["revenue"], reverse=True)
        result = []
        for cat, data in sorted_cats:
            top_items = sorted(data["items"].items(), key=lambda x: x[1], reverse=True)[:3]
            result.append({
                "category": cat,
                "total": data["revenue"],
                "top_items": [{"name": name, "total": total} for name, total in top_items]
            })
        return result
