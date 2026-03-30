// ──────────────────────────────────────────────────────────
//  KINDpos · Check Overview Scene  (Vz1.0)
//  Two-column live check management screen
// ──────────────────────────────────────────────────────────

import { registerScene, go } from '../scene-manager.js';
import { APP, $, fmtTime } from '../app.js';
import {
  T, chamfer, footerLogo, footerTerminalId,
} from '../theme-manager.js';

registerScene('check-overview', {
  onEnter(el, p) {
    // ── State ──
    const state = {
      checkId:      p.check_id || (p.check && p.check.id) || (p.order && p.order.id) || null,
      seats:        ['ALL', 'S1', 'S2'],
      activeSeat:   'S1',
      openDropdown: null,
      items:        [],
    };

    // Resolve check object from params or APP.orders
    let currentCheck = p.check || p.order || null;
    if (!currentCheck && state.checkId) {
      currentCheck = (APP.orders || []).find(o => o.id === state.checkId) || null;
    }

    // Ensure seats structure
    if (currentCheck && !currentCheck.seats) {
      currentCheck.seats = [{ items: [] }];
    }

    // Sync seat tabs from check data
    if (currentCheck && currentCheck.seats) {
      state.seats = ['ALL'];
      currentCheck.seats.forEach((_, i) => state.seats.push(`S${i + 1}`));
    }

    // Restore active seat from params
    if (p.seat !== undefined) {
      if (typeof p.seat === 'number') {
        state.activeSeat = p.seat === 0 ? 'ALL' : `S${p.seat}`;
      } else {
        state.activeSeat = p.seat;
      }
    }

    // If returning from add-items with staged items
    if (p.fromAddItems && p.stagedItems && p.stagedItems.length) {
      if (!currentCheck) {
        currentCheck = { id: state.checkId || 'C-NEW', seats: [{ items: [] }] };
        state.seats = ['ALL', 'S1'];
      }
      const seatIdx = seatIndex(state.activeSeat);
      if (!currentCheck.seats[seatIdx]) {
        currentCheck.seats[seatIdx] = { items: [] };
      }
      p.stagedItems.forEach(item => {
        currentCheck.seats[seatIdx].items.push({
          ...item,
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          state: 'unsent',
        });
      });
    }

    el.style.cssText = 'position:relative;height:100%;display:flex;flex-direction:column;';

    render();

    // Dismiss dropdown on outside click
    const dismissDropdown = (e) => {
      if (state.openDropdown !== null && !e.target.closest('.seat-dropdown') && !e.target.closest('.seat-tile')) {
        state.openDropdown = null;
        renderSeatZone();
      }
    };
    document.addEventListener('click', dismissDropdown);

    // Toast for added items
    if (p.fromAddItems && p.stagedItems && p.stagedItems.length) {
      showToast(`${p.stagedItems.length} item(s) added`);
    }

    return () => {
      document.removeEventListener('click', dismissDropdown);
    };

    // ═══════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════

    function seatIndex(label) {
      if (label === 'ALL') return -1;
      return parseInt(label.replace('S', ''), 10) - 1;
    }

    function getVisibleItems() {
      if (!currentCheck || !currentCheck.seats) return [];
      if (state.activeSeat === 'ALL') {
        return currentCheck.seats.flatMap(s => s.items || []).filter(i => i.state !== 'voided');
      }
      const idx = seatIndex(state.activeSeat);
      const seat = currentCheck.seats[idx];
      return seat ? (seat.items || []).filter(i => i.state !== 'voided') : [];
    }

    function seatTotal(label) {
      if (!currentCheck || !currentCheck.seats) return 0;
      if (label === 'ALL') {
        return currentCheck.seats.reduce((sum, s) =>
          sum + (s.items || []).filter(i => i.state !== 'voided').reduce((a, i) => a + (i.price || 0) * (i.qty || 1), 0), 0);
      }
      const idx = seatIndex(label);
      const seat = currentCheck.seats[idx];
      if (!seat) return 0;
      return (seat.items || []).filter(i => i.state !== 'voided').reduce((a, i) => a + (i.price || 0) * (i.qty || 1), 0);
    }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.style.cssText = `position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:200;
        background:rgba(0,0,0,0.85);color:${T.mint};font-family:${T.fb};font-size:18px;
        padding:8px 24px;clip-path:${chamfer('md')};pointer-events:none;`;
      toast.textContent = message;
      el.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    // ═══════════════════════════════════════════════════
    //  FULL RENDER
    // ═══════════════════════════════════════════════════

    function render() {
      const now = fmtTime();
      const checkLabel = state.checkId || 'NEW';

      el.innerHTML = `
        <!-- TOPBAR -->
        <div style="height:38px;background:${T.mint};display:flex;align-items:center;justify-content:space-between;padding:0 14px;flex-shrink:0;">
          <span style="color:${T.bg};font-family:${T.fh};font-size:20px;">
            ${now} &lt;&gt; ${checkLabel} // Check Overview
          </span>
        </div>

        <!-- BODY: two columns -->
        <div style="flex:1;display:flex;overflow:hidden;">
          <!-- LEFT: TICKET COLUMN 38% -->
          <div style="width:38%;display:flex;flex-direction:column;border-right:3px solid ${T.mint};">
            <div id="co-ticket-items" style="flex:1;overflow-y:auto;padding:8px 12px;"></div>
            <div id="co-totals" style="padding:8px 12px;border-top:2px solid rgba(198,255,187,0.15);flex-shrink:0;"></div>
          </div>

          <!-- RIGHT COLUMN -->
          <div style="flex:1;display:flex;flex-direction:column;">
            <!-- SEAT ZONE (top, flex:1) -->
            <div id="co-seat-zone" style="flex:1;padding:10px;overflow-y:auto;position:relative;"></div>

            <!-- ACTION CLUSTER (bottom, 160px) -->
            <div id="co-action-cluster" style="height:160px;flex-shrink:0;border-top:3px solid ${T.mint};"></div>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="height:38px;background:${T.bg2};border-top:3px solid ${T.mint};display:flex;align-items:center;padding:0;flex-shrink:0;">
          <div style="min-width:180px;padding:0 12px;border-right:3px solid ${T.mint};display:flex;gap:16px;align-items:center;height:100%;">
            <span style="font-family:${T.fb};font-size:12px;color:rgba(198,255,187,0.5);">Card</span>
            <span style="font-family:${T.fb};font-size:14px;color:${T.gold};">$0.00</span>
            <span style="font-family:${T.fb};font-size:12px;color:rgba(198,255,187,0.5);">Cash</span>
            <span style="font-family:${T.fb};font-size:14px;color:${T.gold};">$0.00</span>
          </div>
          <div style="flex:1;"></div>
          <div style="padding:0 12px;border-left:3px solid ${T.mint};display:flex;align-items:center;gap:8px;height:100%;">
            ${footerTerminalId()}
            <span style="background:${T.clockGold};color:${T.bg};padding:2px 8px;font-family:${T.fb};font-size:12px;font-weight:bold;clip-path:${chamfer('sm')};">[ mgr ]</span>
            ${footerLogo()}
          </div>
        </div>
      `;

      renderTicketPanel();
      renderTotals();
      renderSeatZone();
      renderActionCluster();
    }

    // ═══════════════════════════════════════════════════
    //  TICKET COLUMN (left)
    // ═══════════════════════════════════════════════════

    function renderTicketPanel() {
      const container = document.getElementById('co-ticket-items');
      if (!container) return;

      const items = getVisibleItems();

      if (items.length === 0) {
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(198,255,187,0.35);font-family:${T.fb};font-size:18px;user-select:none;">NO ITEMS</div>`;
        return;
      }

      container.innerHTML = items.map(item => {
        const stateColor = item.state === 'unsent' ? 'rgba(198,255,187,0.5)' : T.mint;
        let html = `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:18px;">
          <span style="color:${stateColor};font-family:${T.fb};">x${item.qty || 1} ${item.name}</span>
          <span style="color:${T.gold};font-family:${T.fb};">$${((item.price || 0) * (item.qty || 1)).toFixed(2)}</span>
        </div>`;
        if (item.modifiers && item.modifiers.length) {
          item.modifiers.forEach(mod => {
            html += `<div style="padding:1px 0 1px 16px;">
              <span style="color:${T.gold};font-family:${T.fb};font-size:13px;">${mod.prefix || ''} ${mod.name}</span>
              ${mod.price > 0 ? `<span style="color:${T.gold};font-family:${T.fb};font-size:13px;margin-left:6px;">$${mod.price.toFixed(2)}</span>` : ''}
            </div>`;
          });
        }
        return html;
      }).join('');
    }

    function renderTotals() {
      const container = document.getElementById('co-totals');
      if (!container) return;

      const items = getVisibleItems();
      const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
      const modTotal = items.reduce((s, i) => {
        if (!i.modifiers) return s;
        return s + i.modifiers.reduce((ms, m) => ms + (m.price || 0), 0);
      }, 0);
      const sub = subtotal + modTotal;
      const tax = sub * 0.08;

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:14px;">
          <span style="color:rgba(198,255,187,0.5);font-family:${T.fb};">Subtotal</span>
          <span style="color:${T.gold};font-family:${T.fb};">$${sub.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:14px;">
          <span style="color:rgba(198,255,187,0.5);font-family:${T.fb};">Tax</span>
          <span style="color:${T.gold};font-family:${T.fb};">$${tax.toFixed(2)}</span>
        </div>
      `;
    }

    // ═══════════════════════════════════════════════════
    //  SEAT ZONE (right top)
    // ═══════════════════════════════════════════════════

    function renderSeatZone() {
      const zone = document.getElementById('co-seat-zone');
      if (!zone) return;

      // Seat tiles row
      let tilesHtml = '';
      state.seats.forEach(label => {
        const isActive = label === state.activeSeat;
        const total = seatTotal(label);
        const border = isActive ? `7px solid ${T.mint}` : '3px solid #555';
        const bg = isActive ? '#1a2e1a' : T.bg2;

        tilesHtml += `<div class="seat-tile" data-seat="${label}" style="
          width:110px;height:100px;
          border:${border};background:${bg};
          display:flex;flex-direction:column;align-items:center;justify-content:center;
          cursor:pointer;user-select:none;flex-shrink:0;
        ">
          <span style="font-family:${T.fb};font-size:18px;color:${T.mint};font-weight:900;letter-spacing:2px;">${label}</span>
          <span style="font-family:${T.fb};font-size:14px;color:${T.gold};margin-top:4px;">$${total.toFixed(2)}</span>
        </div>`;
      });

      // Add seat tile (+)
      tilesHtml += `<div id="co-add-seat-tile" style="
        width:110px;height:100px;
        border:3px dashed #555;background:${T.bg2};
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;user-select:none;flex-shrink:0;
        color:rgba(198,255,187,0.4);font-family:${T.fb};font-size:32px;
      ">+</div>`;

      zone.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${tilesHtml}
        </div>
        <div id="co-dropdown-anchor" style="position:relative;"></div>
      `;

      // Bind tile clicks
      zone.querySelectorAll('.seat-tile').forEach(tile => {
        tile.addEventListener('click', (e) => {
          e.stopPropagation();
          const label = tile.dataset.seat;
          if (state.activeSeat !== label) {
            state.activeSeat = label;
            renderTicketPanel();
            renderTotals();
          }
          state.openDropdown = state.openDropdown === label ? null : label;
          renderSeatZone();
        });
      });

      // Add seat
      document.getElementById('co-add-seat-tile')?.addEventListener('click', () => {
        if (!currentCheck) return;
        if (!currentCheck.seats) currentCheck.seats = [];
        currentCheck.seats.push({ items: [] });
        const newLabel = `S${currentCheck.seats.length}`;
        state.seats.push(newLabel);
        state.activeSeat = newLabel;
        state.openDropdown = null;
        renderSeatZone();
        renderTicketPanel();
        renderTotals();
      });

      // Render dropdown if open
      if (state.openDropdown !== null) {
        renderDropdownCard(state.openDropdown);
      }
    }

    function renderDropdownCard(seatLabel) {
      const anchor = document.getElementById('co-dropdown-anchor');
      if (!anchor) return;

      const isAll = seatLabel === 'ALL';

      const buttons = isAll
        ? [
            { label: 'PRINT',    border: T.mint,     color: T.mint,     bg: T.bg2 },
            { label: 'TRANSFER', border: '#8a5eba',   color: T.bg2,      bg: T.lavender },
            { label: 'COMP',     border: T.gold,      color: T.gold,     bg: T.bg2 },
            { label: 'VOID',     border: '#900',      color: '#fff',     bg: T.red },
          ]
        : [
            { label: 'PRINT',       border: T.mint,     color: T.mint,     bg: T.bg2 },
            { label: 'TRANSFER',    border: '#8a5eba',   color: T.bg2,      bg: T.lavender },
            { label: 'MOVE ITEMS',  border: T.cyan,      color: T.cyan,     bg: T.bg2 },
            { label: 'COMP',        border: T.gold,      color: T.gold,     bg: T.bg2 },
            { label: 'VOID',        border: '#900',      color: '#fff',     bg: T.red },
            { label: 'REMOVE SEAT', border: T.red,       color: T.red,      bg: T.bg2 },
          ];

      const btnHtml = buttons.map(b => `
        <div class="dropdown-action" data-action="${b.label}" style="
          width:100%;padding:9px 0;
          border:2px solid ${b.border};
          color:${b.color};background:${b.bg};
          font-family:${T.fb};font-size:12px;font-weight:900;letter-spacing:2px;
          text-align:center;cursor:pointer;user-select:none;
        ">${b.label}</div>
      `).join('');

      anchor.innerHTML = `
        <div class="seat-dropdown" style="
          background:${T.bg2};border:2px solid ${T.mint};padding:8px;
          margin-top:8px;max-width:260px;
          display:flex;flex-direction:column;gap:6px;
        ">
          <div style="background:${T.mint};color:${T.bg};font-family:${T.fb};font-size:12px;font-weight:900;letter-spacing:2px;padding:4px 8px;text-align:center;">
            ${seatLabel} OPTIONS
          </div>
          ${btnHtml}
        </div>
      `;

      // Bind dropdown actions
      anchor.querySelectorAll('.dropdown-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          state.openDropdown = null;

          if (action === 'REMOVE SEAT') {
            const idx = seatIndex(seatLabel);
            if (currentCheck && currentCheck.seats && idx >= 0) {
              currentCheck.seats.splice(idx, 1);
              state.seats = ['ALL'];
              currentCheck.seats.forEach((_, i) => state.seats.push(`S${i + 1}`));
              if (state.activeSeat === seatLabel) {
                state.activeSeat = state.seats.length > 1 ? state.seats[1] : 'ALL';
              }
            }
            renderSeatZone();
            renderTicketPanel();
            renderTotals();
          } else {
            showToast(`${action} — ${seatLabel}`);
            renderSeatZone();
          }
        });
      });
    }

    // ═══════════════════════════════════════════════════
    //  ACTION CLUSTER (right bottom, 160px)
    // ═══════════════════════════════════════════════════

    function renderActionCluster() {
      const cluster = document.getElementById('co-action-cluster');
      if (!cluster) return;

      cluster.innerHTML = `
        <div style="display:grid;grid-template-columns:2fr 1.2fr 2fr;height:100%;">
          <!-- ADD ITEM (left, spans both rows) -->
          <div id="co-btn-add-item" style="
            background:${T.mint};color:${T.bg};
            font-family:${T.fb};font-size:16px;font-weight:900;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;user-select:none;
            border-right:3px solid ${T.mint};
          ">ADD ITEM</div>

          <!-- CENTER: HOLD + FIRE stacked -->
          <div style="display:flex;flex-direction:column;border-right:3px solid ${T.mint};">
            <div id="co-btn-hold" style="
              flex:1;background:${T.cyan};color:${T.bg};
              font-family:${T.fb};font-size:15px;font-weight:900;
              display:flex;align-items:center;justify-content:center;
              cursor:pointer;user-select:none;
              border-bottom:2px solid ${T.mint};
            ">HOLD</div>
            <div id="co-btn-fire" style="
              flex:1;background:${T.red};color:#fff;
              font-family:${T.fb};font-size:15px;font-weight:900;
              display:flex;align-items:center;justify-content:center;
              cursor:pointer;user-select:none;
            ">FIRE</div>
          </div>

          <!-- SEND (right, spans both rows) -->
          <div id="co-btn-send" style="
            background:#3a9a3a;color:${T.mint};
            font-family:${T.fb};font-size:22px;font-weight:900;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;user-select:none;
          ">SEND</div>
        </div>
      `;

      // Bind action buttons
      document.getElementById('co-btn-add-item')?.addEventListener('click', () => {
        const seatIdx = state.activeSeat === 'ALL' ? 0 : seatIndex(state.activeSeat);
        go('add-items', { check: currentCheck, seat: seatIdx, mode: 'items' });
      });

      document.getElementById('co-btn-hold')?.addEventListener('click', () => {
        showToast('Hold applied');
      });

      document.getElementById('co-btn-fire')?.addEventListener('click', () => {
        showToast('Fire sent');
      });

      document.getElementById('co-btn-send')?.addEventListener('click', () => {
        handleSend();
      });
    }

    function handleSend() {
      if (!currentCheck || !currentCheck.seats) return;
      const allUnsent = currentCheck.seats.flatMap(s => (s.items || []).filter(i => i.state === 'unsent'));
      if (allUnsent.length === 0) {
        showToast('No unsent items');
        return;
      }
      allUnsent.forEach(i => { i.state = 'sent'; });
      renderTicketPanel();
      renderTotals();
      showToast(`${allUnsent.length} item(s) sent`);
    }
  }
});
