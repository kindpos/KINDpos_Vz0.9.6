"""
KINDpos Kitchen Ticket Template — Five-Zone Model v1.1

Implements the complete kitchen ticket spec:
  Zone 1: Header Block  — Check #, Order Type, Table/Name, Time  (double-height/width)
  Zone 2: Context Line   — Server, Seats, Order Source             (normal bold)
  Zone 3: Item Block     — Items, quantities, modifiers, alerts    (normal weight)
  Zone 4: Alert Block    — Allergy summary strip, RUSH, VIP flags  (inverted / red)
  Zone 5: Footer         — Terminal ID, Ticket X of Y, type label  (small font)

Ticket types: ORIGINAL, REPRINT, VOID, REFIRE
"""

from typing import List, Dict, Any, Optional, Tuple
from collections import Counter
from .base_template import BaseTemplate


class KitchenTicketTemplate(BaseTemplate):

    # Ticket type constants
    ORIGINAL = "ORIGINAL"
    REPRINT = "REPRINT"
    VOID = "VOID"
    REFIRE = "REFIRE"

    def render(self, context: Dict[str, Any]) -> List[Dict[str, Any]]:
        commands = super().render(context)
        ticket_type = context.get('ticket_type', self.ORIGINAL).upper()
        supports_red = context.get('supports_red', False)

        # Zone 1 — Header Block
        commands.extend(self._render_zone1(context, ticket_type, supports_red))

        # Zone 2 — Context Line
        commands.extend(self._render_zone2(context))

        # Zone 3 — Item Block
        zone3_cmds, allergies = self._render_zone3(context, ticket_type, supports_red)
        commands.extend(zone3_cmds)

        # Zone 4 — Alert Block
        commands.extend(self._render_zone4(context, allergies, supports_red))

        # Zone 5 — Footer
        commands.extend(self._render_zone5(context, ticket_type))

        commands.append({'type': 'feed', 'lines': 3})
        commands.append({'type': 'cut', 'partial': False})
        return commands

    # ------------------------------------------------------------------
    # Zone 1 — Header Block (readable from 3-4 feet)
    # ------------------------------------------------------------------

    def _render_zone1(self, ctx: Dict, ticket_type: str, supports_red: bool) -> List[Dict]:
        cmds: List[Dict] = []
        divider = {'type': 'divider', 'char': '='}

        cmds.append(divider)

        # Line 1 — Check number (largest element)
        check = ctx.get('check_number') or ctx.get('ticket_number', 'N/A')
        cmds.append({
            'type': 'text', 'content': f"CHECK {check}",
            'bold': True, 'double_width': True, 'double_height': True, 'align': 'center',
        })

        # Ticket-type header additions (REPRINT / VOID / REFIRE)
        if ticket_type == self.REPRINT:
            cmds.append({
                'type': 'text', 'content': 'REPRINT',
                'bold': True, 'align': 'center',
            })
        elif ticket_type == self.VOID:
            cmds.append({
                'type': 'text', 'content': '  VOID  ',
                'bold': True, 'align': 'center',
                'reverse': True, 'red': supports_red,
            })
        elif ticket_type == self.REFIRE:
            cmds.append({
                'type': 'text', 'content': '** REFIRE **',
                'bold': True, 'align': 'center', 'red': supports_red,
            })

        # Line 2 — Order Type + Destination
        order_type = (ctx.get('order_type') or 'dine_in').lower().replace('-', '_')
        customer_name = ctx.get('customer_name', '')
        table = ctx.get('table')

        if order_type == 'dine_in':
            line2 = f"TABLE {table} — DINE IN" if table else "DINE IN"
        elif order_type in ('to_go', 'togo', 'takeout'):
            line2 = f"TOGO — {customer_name}" if customer_name else "TOGO"
        elif order_type == 'delivery':
            line2 = f"DELIVERY — {customer_name}" if customer_name else "DELIVERY"
        elif order_type == 'bar_tab':
            line2 = f"BAR TAB — {customer_name}" if customer_name else "BAR TAB"
        else:
            display = ctx.get('order_type_display', order_type).upper()
            line2 = f"{display} — {customer_name}" if customer_name else display

        cmds.append({
            'type': 'text', 'content': line2,
            'bold': True, 'double_width': True, 'align': 'center',
        })

        # Line 3 (conditional) — Pickup time for togo/delivery
        pickup_time = ctx.get('pickup_time')
        if pickup_time and order_type in ('to_go', 'togo', 'takeout', 'delivery'):
            cmds.append({
                'type': 'text', 'content': f"Pickup: {self._format_time(pickup_time)}",
                'align': 'center',
            })

        # Line 4 — Time Ordered (event ledger time, NOT print time)
        fired_at = ctx.get('fired_at') or ctx.get('ordered_at')
        if fired_at:
            cmds.append({
                'type': 'text', 'content': self._format_time(fired_at),
                'align': 'center',
            })

        cmds.append(divider)
        return cmds

    # ------------------------------------------------------------------
    # Zone 2 — Context Line (pipe-separated)
    # ------------------------------------------------------------------

    def _render_zone2(self, ctx: Dict) -> List[Dict]:
        parts: List[str] = []

        server = ctx.get('server') or ctx.get('server_name')
        if server:
            parts.append(f"Server: {server}")

        seats = ctx.get('seats')
        if seats:
            if isinstance(seats, list):
                if len(seats) == 1:
                    parts.append(f"Seat: {seats[0]}")
                else:
                    parts.append(f"Seats: {','.join(str(s) for s in seats)}")
            else:
                parts.append(f"Seat: {seats}")

        source = ctx.get('order_source') or ctx.get('source')
        if source:
            parts.append(source)

        if not parts:
            return []

        return [
            {'type': 'text', 'content': ' | '.join(parts), 'bold': True},
            {'type': 'divider'},
        ]

    # ------------------------------------------------------------------
    # Zone 3 — Item Block (the work list)
    # ------------------------------------------------------------------

    def _render_zone3(
        self, ctx: Dict, ticket_type: str, supports_red: bool,
    ) -> Tuple[List[Dict], List[str]]:
        """Returns (commands, allergy_types_collected)."""
        cmds: List[Dict] = []
        allergies: List[str] = []
        items = ctx.get('items', [])

        # Consolidate identical items (same name + same modifier set)
        if ticket_type == self.ORIGINAL:
            items = self._consolidate_items(items)

        for i, item in enumerate(items):
            qty = item.get('qty', item.get('quantity', 1))
            name = item.get('kitchen_text') or item.get('name', '')
            modifiers = item.get('modifiers', [])
            special = item.get('special_instructions', '')
            allergy = item.get('allergy') or item.get('allergy_type', '')
            reason = item.get('reason', '')

            # Item line: quantity-first
            prefix = ""
            if ticket_type == self.VOID:
                prefix = "[VOID] "
            item_line = f"{prefix}{qty}x {name}"

            cmds.append({'type': 'text', 'content': item_line, 'bold': True})

            # Modifiers — 6-space indent, prefix in red/bold
            for mod in modifiers:
                mod_cmds = self._render_modifier(mod, supports_red)
                cmds.extend(mod_cmds)

            # Special instructions (italic/quoted, below modifiers)
            if special and not self._is_allergy_instruction(special):
                cmds.append({'type': 'text', 'content': f'      "{special}"'})

            # Refire reason
            if ticket_type == self.REFIRE and reason:
                cmds.append({'type': 'text', 'content': f'      Reason: {reason}'})

            # Inline allergy flag (Zone 3 placement)
            if allergy:
                allergy_upper = allergy.upper()
                allergies.append(allergy_upper)
                cmds.append({
                    'type': 'text',
                    'content': f"  {allergy_upper} ALLERGY  ",
                    'bold': True, 'reverse': True, 'red': supports_red, 'align': 'center',
                })
            elif self._is_allergy_instruction(special):
                # Extract allergy type from special instructions like "!! ALLERGY: NO PEANUTS !!"
                allergy_type = self._extract_allergy_type(special)
                if allergy_type:
                    allergies.append(allergy_type)
                    cmds.append({
                        'type': 'text',
                        'content': f"  {allergy_type} ALLERGY  ",
                        'bold': True, 'reverse': True, 'red': supports_red, 'align': 'center',
                    })

            # Item separator
            if i < len(items) - 1:
                cmds.append({'type': 'divider'})

        return cmds, allergies

    def _render_modifier(self, mod: Any, supports_red: bool) -> List[Dict]:
        """Render a single modifier line with prefix formatting."""
        # Modifier can be a string or a dict with type/prefix/text
        if isinstance(mod, dict):
            prefix = mod.get('prefix', '')
            text = mod.get('text') or mod.get('kitchen_text') or mod.get('name', '')
            mod_type = mod.get('type', '')
            if not prefix and mod_type:
                prefix = self._default_prefix(mod_type)
        else:
            # Plain string modifier — try to detect prefix from known patterns
            prefix, text = self._parse_modifier_string(str(mod))

        cmds: List[Dict] = []
        if prefix:
            # [{prefix} in red/bold] + [{text} in normal]
            # Since we render line-by-line, combine on one line with formatting hint
            cmds.append({
                'type': 'text',
                'content': f"      [{prefix}] {text}",
                'bold': True if not supports_red else False,
                'red': supports_red,
            })
        else:
            cmds.append({'type': 'text', 'content': f"      {text}"})

        return cmds

    def _parse_modifier_string(self, mod: str) -> Tuple[str, str]:
        """Try to extract a prefix from a plain string modifier."""
        known_prefixes = {
            'no ': 'NO', 'add ': 'ADD', 'sub ': 'SUB',
            'extra ': 'EXTRA', 'light ': 'LIGHT', 'side ': 'SIDE',
            'ots ': 'OTS', 'on the side ': 'OTS',
            '86 ': '86',
        }
        mod_lower = mod.lower()
        for pattern, prefix in known_prefixes.items():
            if mod_lower.startswith(pattern):
                return prefix, mod[len(pattern):]
        return '', mod

    def _default_prefix(self, mod_type: str) -> str:
        """Map modifier type to default prefix per spec section 12.2."""
        return {
            'remove': 'NO', 'add': 'ADD', 'substitute': 'SUB',
            'extra': 'EXTRA', 'light': 'LIGHT', 'side': 'SIDE',
            'on_the_side': 'OTS',
        }.get(mod_type.lower(), '')

    def _consolidate_items(self, items: List[Dict]) -> List[Dict]:
        """
        Consolidation rule (spec section 10):
        Identical items with identical modifiers collapse into a single {qty}x line.
        Modifier match is order-independent.
        """
        groups: List[Tuple[str, frozenset, Dict]] = []

        for item in items:
            name = item.get('kitchen_text') or item.get('name', '')
            mods = item.get('modifiers', [])
            # Normalize modifiers to frozenset for order-independent matching
            mod_key = frozenset(str(m) for m in mods)
            allergy = item.get('allergy') or item.get('allergy_type', '')
            special = item.get('special_instructions', '')

            # Find existing group
            matched = False
            for i, (g_name, g_mods, g_item) in enumerate(groups):
                if g_name == name and g_mods == mod_key:
                    # Same allergy and special instructions required for consolidation
                    g_allergy = g_item.get('allergy') or g_item.get('allergy_type', '')
                    g_special = g_item.get('special_instructions', '')
                    if g_allergy == allergy and g_special == special:
                        g_item['qty'] = g_item.get('qty', 1) + 1
                        matched = True
                        break

            if not matched:
                consolidated = dict(item)
                consolidated.setdefault('qty', 1)
                groups.append((name, mod_key, consolidated))

        return [g[2] for g in groups]

    def _is_allergy_instruction(self, text: str) -> bool:
        if not text:
            return False
        upper = text.upper()
        return 'ALLERGY' in upper

    def _extract_allergy_type(self, text: str) -> str:
        """Extract allergy type from strings like '!! ALLERGY: NO PEANUTS !!'."""
        upper = text.upper().strip('! ').strip()
        if ':' in upper:
            after_colon = upper.split(':', 1)[1].strip()
            # Remove leading "NO " if present
            if after_colon.startswith('NO '):
                after_colon = after_colon[3:]
            return after_colon
        return upper.replace('ALLERGY', '').strip()

    # ------------------------------------------------------------------
    # Zone 4 — Alert Block (safety-critical)
    # ------------------------------------------------------------------

    def _render_zone4(
        self, ctx: Dict, allergies: List[str], supports_red: bool,
    ) -> List[Dict]:
        cmds: List[Dict] = []

        # Allergy summary strip (only if at least one allergy on the ticket)
        if allergies:
            cmds.append({'type': 'divider'})
            unique_allergies = sorted(set(allergies))
            allergy_text = ', '.join(unique_allergies)
            cmds.append({
                'type': 'text',
                'content': f"  ALLERGY: {allergy_text}  ",
                'bold': True, 'reverse': True, 'red': supports_red, 'align': 'center',
            })
            cmds.append({'type': 'divider'})

        # RUSH flag — bold, red if available, NOT inverted
        if ctx.get('rush'):
            cmds.append({
                'type': 'text', 'content': '** RUSH **',
                'bold': True, 'red': supports_red, 'align': 'center',
            })

        # VIP flag — bold, red if available, NOT inverted
        if ctx.get('vip'):
            cmds.append({
                'type': 'text', 'content': '** VIP TABLE **',
                'bold': True, 'red': supports_red, 'align': 'center',
            })

        # 86 warnings — bold, red if available, NOT inverted
        for warning in ctx.get('warnings_86', []):
            cmds.append({
                'type': 'text', 'content': f"** 86 {warning} AFTER THIS **",
                'bold': True, 'red': supports_red, 'align': 'center',
            })

        return cmds

    # ------------------------------------------------------------------
    # Zone 5 — Footer (small font, metadata)
    # ------------------------------------------------------------------

    def _render_zone5(self, ctx: Dict, ticket_type: str) -> List[Dict]:
        cmds: List[Dict] = []
        cmds.append({'type': 'divider'})

        # Terminal ID and Ticket X of Y
        terminal_id = ctx.get('terminal_id', '')
        ticket_index = ctx.get('ticket_index', 1)
        ticket_total = ctx.get('ticket_total', 1)

        footer_parts = []
        if terminal_id:
            footer_parts.append(f"Terminal: {terminal_id}")
        footer_parts.append(f"Ticket {ticket_index} of {ticket_total}")

        cmds.append({
            'type': 'text', 'content': ' | '.join(footer_parts),
            'font': 'b', 'align': 'center',
        })

        # Ticket type label
        if ticket_type == self.ORIGINAL:
            label = 'ORIGINAL'
        elif ticket_type == self.REPRINT:
            label = '*** REPRINT ***'
        elif ticket_type == self.VOID:
            label = '*** VOID ***'
        elif ticket_type == self.REFIRE:
            label = '*** REFIRE ***'
        else:
            label = ticket_type

        cmds.append({
            'type': 'text', 'content': label,
            'font': 'b', 'align': 'center',
        })

        cmds.append({'type': 'divider'})
        return cmds
