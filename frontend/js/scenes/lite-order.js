// ═══════════════════════════════════════════════════
//  KINDpos/lite — Order Entry Scene
//  Hex-nav item selection + running ticket panel.
// ═══════════════════════════════════════════════════

import { APP, $ } from '../app.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { HexNav } from '../hex-nav.js';
import { CFG, FALLBACK_MENU, MODIFIERS, MOD_PREFIXES } from '../config.js';

// ── Data Transforms ──────────────────────────────────────────────────────────

/** Transform FALLBACK_MENU config into HexNav data shape. */
function buildHexMenuData(menu) {
  const cats = [];
  const colors = ['#C6FFBB', '#33ffff', '#fcbe40', '#b48efa', '#ff8c00', '#33CC88'];
  let ci = 0;

  for (const [catName, catVal] of Object.entries(menu)) {
    const color = colors[ci++ % colors.length];
    const catNode = { id: `cat-${catName}`, label: catName, color, children: [] };

    if (Array.isArray(catVal)) {
      for (const item of catVal) {
        catNode.children.push({
          id: `item-${catName}-${item.name}`,
          label: item.name,
          color,
          price: item.price,
        });
      }
    } else {
      for (const [subName, subVal] of Object.entries(catVal)) {
        if (Array.isArray(subVal)) {
          const subNode = { id: `sub-${catName}-${subName}`, label: subName, color, children: [] };
          for (const item of subVal) {
            subNode.children.push({
              id: `item-${catName}-${subName}-${item.name}`,
              label: item.name,
              color,
              price: item.price,
            });
          }
          catNode.children.push(subNode);
        } else {
          const subNode = { id: `sub-${catName}-${subName}`, label: subName, color, children: [] };
          for (const [leafCat, leafItems] of Object.entries(subVal)) {
            if (Array.isArray(leafItems)) {
              const leafNode = { id: `leaf-${catName}-${subName}-${leafCat}`, label: leafCat, color, children: [] };
              for (const item of leafItems) {
                leafNode.children.push({
                  id: `item-${catName}-${subName}-${leafCat}-${item.name}`,
                  label: item.name,
                  color,
                  price: item.price,
                });
              }
              subNode.children.push(leafNode);
            }
          }
          catNode.children.push(subNode);
        }
      }
    }
    cats.push(catNode);
  }
  return cats;
}

/** Transform MODIFIERS config into HexNav data shape — flat leaves, prefix applied from bar. */
function buildHexModData(mods) {
  const groups = [];
  for (const [groupName, items] of Object.entries(mods)) {
    groups.push({
      id: `mod-group-${groupName}`,
      label: groupName,
      color: '#fcbe40',
      children: items.map(item => ({
        id: `mod-${groupName}-${item.name}`,
        label: item.name,
        color: '#fcbe40',
        price: item.price,
      })),
    });
  }
  return groups;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n) { return '$' + n.toFixed(2); }

function showToast(msg, duration = 1500) {
  const el = $('lo-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, duration);
}

function flashTicketBorder() {
  const panel = $('lo-ticket-panel');
  if (!panel) return;
  panel.style.borderColor = '#fcbe40';
  setTimeout(() => { panel.style.borderColor = ''; }, 450);
}

// ── Scene Registration ──────────────────────────────────────────────────────

registerLiteScene('lite-order', {
  onEnter(el, p) {
    const check = p.check || p.order || { id: `C-${APP.nextNum++}`, items: [], server: APP.staff ? APP.staff.name : 'Server' };

    // ── Ticket State (scoped to this scene entry) ──
    const ticket = {
      lines: [],
      selectedId: null,
      orderId: check.id || `LO-${Date.now().toString(36)}`,
    };

    // Hydrate from passed check
    if (Array.isArray(check.items) && check.items.length) {
      ticket.lines = check.items.map(item => ({
        id: crypto.randomUUID(),
        itemId: item.name,
        name: item.name,
        category: '',
        quantity: item.qty || 1,
        modifiers: item.mods ? item.mods.map(m => ({ id: m.name, name: m.name, prefix: 'ADD' })) : [],
        unitPrice: item.price || 0,
        lineTotal: (item.price || 0) * (item.qty || 1),
        sent: false,
        seat: null,
      }));
    }

    let activeTab = 'items';
    let activePrefix = 'ADD';
    let hexNav = null;
    let clockInterval = null;

    // ── Totals ──
    function calcTotals() {
      const subtotal = ticket.lines.reduce((s, l) => s + l.lineTotal, 0);
      const tax = subtotal * CFG.TAX;
      const cardPrice = subtotal + tax;
      const cashPrice = subtotal + tax;
      return { subtotal, tax, cardPrice, cashPrice };
    }

    function updateTotals() {
      const t = calcTotals();
      const ids = [
        ['lo-tp-sub', t.subtotal], ['lo-tp-tax', t.tax], ['lo-tp-card', t.cardPrice], ['lo-tp-cash', t.cashPrice],
        ['lo-fd-sub', t.subtotal], ['lo-fd-tax', t.tax], ['lo-fd-card', t.cardPrice], ['lo-fd-cash', t.cashPrice],
      ];
      for (const [id, val] of ids) {
        const e = $(id);
        if (e) e.textContent = fmt(val);
      }
    }

    // ── Ticket Rendering ──
    function renderTicket() {
      const scrollEl = $('lo-ticket-scroll');
      if (!scrollEl) return;

      if (ticket.lines.length === 0) {
        scrollEl.innerHTML = '<div style="text-align:center;opacity:0.35;padding:24px;font-size:12px;">No items</div>';
        return;
      }

      let html = '';
      for (const line of ticket.lines) {
        const sel = line.id === ticket.selectedId;
        const sentCls = line.sent ? 'opacity:0.45;' : '';
        const selBg = sel ? 'background:rgba(252,190,64,0.12);border-left:3px solid #fcbe40;padding-left:7px;' : '';
        html += `<div data-lid="${line.id}" style="display:flex;justify-content:space-between;padding:4px 0;color:#fff;font-size:13px;cursor:pointer;user-select:none;${sentCls}${selBg}">`;
        html += `<span>${line.quantity > 1 ? line.quantity + '× ' : ''}${line.name}</span>`;
        html += `<span style="color:#fcbe40">${fmt(line.lineTotal)}</span>`;
        html += `</div>`;
        for (const mod of line.modifiers) {
          html += `<div style="color:#fcbe40;font-size:11px;padding-left:12px;${sentCls}">${mod.prefix} ${mod.name}</div>`;
        }
      }
      scrollEl.innerHTML = html;

      scrollEl.querySelectorAll('[data-lid]').forEach(div => {
        div.addEventListener('click', () => {
          const id = div.dataset.lid;
          ticket.selectedId = ticket.selectedId === id ? null : id;
          renderTicket();
        });
      });
    }

    // ── Item / Modifier Actions ──
    function addTicketLine(item) {
      const existing = ticket.lines.find(l => l.itemId === item.id && !l.sent);
      if (existing) {
        existing.quantity++;
        existing.lineTotal = existing.unitPrice * existing.quantity;
        ticket.selectedId = existing.id;
        renderTicket();
        updateTotals();
        return;
      }

      const line = {
        id: crypto.randomUUID(),
        itemId: item.id,
        name: item.label,
        category: '',
        quantity: 1,
        modifiers: [],
        unitPrice: item.price || 0,
        lineTotal: item.price || 0,
        sent: false,
        seat: null,
        backendItemId: null,
      };
      ticket.lines.push(line);
      ticket.selectedId = line.id;
      renderTicket();
      updateTotals();

      // POST /api/orders/{order_id}/items — AddItemRequest
      fetch((CFG.API_BASE || '') + `/api/orders/${ticket.orderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menu_item_id: item.id,
          name: item.label,
          price: item.price || 0,
          quantity: 1,
          category: item.category || null,
        }),
      }).then(r => r.json()).then(data => {
        // Capture backend item_id from the response for void
        if (data && data.items) {
          const added = data.items[data.items.length - 1];
          if (added) line.backendItemId = added.item_id;
        }
      }).catch(() => {
        const sr = $('lo-status-right');
        if (sr) sr.textContent = '\u26A0 OFFLINE';
      });
    }

    function addModifierToSelected(item) {
      if (!ticket.selectedId) return;
      const line = ticket.lines.find(l => l.id === ticket.selectedId);
      if (!line || line.sent) return;
      line.modifiers.push({
        id: item.id,
        name: item.label,
        prefix: activePrefix,
      });
      renderTicket();
    }

    // ── Tab Switching ──
    function setActiveTab(tab) {
      activeTab = tab;
      const itemsBtn = $('lo-tab-items');
      const modsBtn = $('lo-tab-mods');
      const prefixBar = $('lo-prefix-bar');
      if (itemsBtn) itemsBtn.style.background = tab === 'items' ? 'rgba(255,255,255,0.06)' : 'transparent';
      if (modsBtn) modsBtn.style.background = tab === 'modifiers' ? 'rgba(255,255,255,0.06)' : 'transparent';
      if (prefixBar) {
        prefixBar.style.display = tab === 'modifiers' ? 'flex' : 'none';
        if (tab === 'modifiers') renderPrefixBar();
      }
    }

    function renderPrefixBar() {
      const bar = $('lo-prefix-bar');
      if (!bar) return;
      bar.innerHTML = MOD_PREFIXES.map(pfx => {
        const active = activePrefix === pfx;
        const bg = active ? '#fcbe40' : 'transparent';
        const color = active ? '#1a1a1a' : '#fcbe40';
        return `<div data-pfx="${pfx}" style="background:${bg};color:${color};border:2px solid #fcbe40;border-radius:0;font-family:var(--fb);font-size:12px;padding:4px 10px;cursor:pointer;letter-spacing:1px;user-select:none;">${pfx}</div>`;
      }).join('');

      bar.querySelectorAll('[data-pfx]').forEach(btn => {
        btn.addEventListener('click', () => {
          activePrefix = btn.dataset.pfx;
          renderPrefixBar();
        });
      });
    }

    // ── Button Handlers ──
    function handleSend() {
      const unsent = ticket.lines.filter(l => !l.sent);
      if (unsent.length === 0) {
        const btn = $('lo-btn-send');
        if (btn) { btn.style.borderColor = '#fcbe40'; setTimeout(() => { btn.style.borderColor = '#228833'; }, 300); }
        return;
      }
      unsent.forEach(l => { l.sent = true; });
      renderTicket();
      showToast('Order sent', 1200);

      // POST /api/orders/{id}/send — marks unsent items as sent on backend
      fetch((CFG.API_BASE || '') + `/api/orders/${ticket.orderId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        const sr = $('lo-status-right');
        if (sr) sr.textContent = '\u26A0 QUEUED';
      });
    }

    function handlePrint() {
      // POST /api/print/receipt/{order_id}
      fetch((CFG.API_BASE || '') + `/api/print/receipt/${ticket.orderId}`, {
        method: 'POST',
      }).then(() => showToast('Receipt printing', 1200)).catch(() => showToast('Print failed — check printer', 2000));
    }

    function handleVoid() {
      if (!ticket.selectedId) { flashTicketBorder(); return; }
      const line = ticket.lines.find(l => l.id === ticket.selectedId);
      if (!line) return;
      const idx = ticket.lines.indexOf(line);
      ticket.lines.splice(idx, 1);
      ticket.selectedId = null;
      renderTicket();
      updateTotals();

      // DELETE /api/orders/{order_id}/items/{item_id}
      if (line.backendItemId) {
        fetch((CFG.API_BASE || '') + `/api/orders/${ticket.orderId}/items/${line.backendItemId}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
    }

    function handleDisc() {
      console.log('[KINDpos/lite] DISC — not yet implemented in lite');
      showToast('DISC — not yet implemented in lite', 1500);
    }

    function handleSave() {
      // Sync check object with current ticket state
      check.items = ticket.lines.map(l => ({ name: l.name, price: l.unitPrice, qty: l.quantity, mods: l.modifiers }));
      const t = calcTotals();
      check.total = t.cardPrice;
      check.status = 'open';

      // Ensure check is in APP.orders so quick-checks can see it
      if (!APP.orders.find(o => o.id === check.id)) {
        APP.orders.push(check);
      }

      // Create order on backend (best-effort)
      fetch((CFG.API_BASE || '') + '/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_id: APP.staff ? APP.staff.id : null,
          server_name: APP.staff ? APP.staff.name : 'Server',
          order_type: 'quick_service',
          guest_count: check.guest_count || 1,
        }),
      }).then(r => r.json()).then(data => {
        // Update local ID to match backend
        if (data && data.order_id) {
          ticket.orderId = data.order_id;
          check.backendId = data.order_id;
        }
      }).catch(() => {});

      showToast('Order saved', 1200);
      liteGo('quick-checks');
    }

    function handlePay() {
      const t = calcTotals();
      check.items = ticket.lines.map(l => ({ name: l.name, price: l.unitPrice, qty: l.quantity, mods: l.modifiers }));
      check.total = t.cardPrice;
      liteGo('lite-payment', { check, cardPrice: t.cardPrice, cashPrice: t.cashPrice });
    }

    // ── Clock ──
    function updateClock() {
      const now = new Date();
      const date = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const e = $('lo-status-clock');
      if (e) e.textContent = `${date} <> ${time} <> QS-001`;
    }

    // ── Build DOM ──
    el.style.cssText = 'display:flex;flex-direction:column;height:100%;';
    el.innerHTML = `
      <style>
        @keyframes lo-flash { 0%,100%{border-color:#C6FFBB} 50%{border-color:#fcbe40} }
        #lo-ticket-scroll::-webkit-scrollbar{width:4px}
        #lo-ticket-scroll::-webkit-scrollbar-thumb{background:#C6FFBB;border-radius:0}
        #lo-ticket-scroll::-webkit-scrollbar-track{background:#222}
      </style>

      <!-- Status Bar -->
      <div style="height:28px;width:100%;background:#222;border-bottom:2px solid #C6FFBB;padding:0 10px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#C6FFBB;flex-shrink:0;">
        <span id="lo-status-clock"></span>
        <span id="lo-status-right"></span>
      </div>

      <!-- Main Content Box -->
      <div style="flex:1;margin:2px 8px 0 8px;border:2px solid #C6FFBB;display:flex;overflow:hidden;min-height:0;">

        <!-- Left Column: Ticket Panel -->
        <div id="lo-ticket-panel" style="width:293px;flex-shrink:0;border-right:2px solid #C6FFBB;display:flex;flex-direction:column;">
          <div id="lo-ticket-scroll" style="flex:1;overflow-y:auto;padding:8px 10px;min-height:0;"></div>
          <div style="border-top:2px solid #C6FFBB;padding:6px 10px;font-size:12px;flex-shrink:0;">
            <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#fff">Subtotal:</span><span style="color:#fcbe40" id="lo-tp-sub">$0.00</span></div>
            <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#fff">Tax:</span><span style="color:#fcbe40" id="lo-tp-tax">$0.00</span></div>
            <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#33ffff">Card Price:</span><span style="color:#33ffff" id="lo-tp-card">$0.00</span></div>
            <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#33ffff">Cash Price:</span><span style="color:#33ffff" id="lo-tp-cash">$0.00</span></div>
          </div>
        </div>

        <!-- Right Column: Hex Nav Panel -->
        <div style="flex:1;display:flex;flex-direction:column;min-width:0;">
          <div id="lo-prefix-bar" style="display:none;gap:6px;padding:6px 10px;background:#1a1a1a;border-bottom:2px solid #fcbe40;flex-shrink:0;flex-wrap:wrap;align-items:center;"></div>
          <div id="lo-hex-canvas" style="flex:1;position:relative;overflow:hidden;background:#222;min-height:0;"></div>
          <div style="height:44px;border-top:2px solid #C6FFBB;display:flex;align-items:center;justify-content:center;gap:16px;background:#1a1a1a;flex-shrink:0;">
            <button id="lo-tab-items" style="width:120px;height:28px;border:2px solid #C6FFBB;color:#C6FFBB;background:rgba(255,255,255,0.06);font-family:var(--fb);font-size:13px;letter-spacing:1px;cursor:pointer;border-radius:0;">Items</button>
            <button id="lo-tab-mods" style="width:160px;height:28px;border:2px solid #fcbe40;color:#fcbe40;background:transparent;font-family:var(--fb);font-size:13px;letter-spacing:1px;cursor:pointer;border-radius:0;">modifiers</button>
          </div>
        </div>
      </div>

      <!-- Bottom Action Bar -->
      <div style="height:78px;width:100%;background:#1a1a1a;display:flex;flex-shrink:0;">
        <div style="width:293px;height:78px;background:#1a1a1a;font-size:11px;padding:4px 8px;display:flex;flex-direction:column;justify-content:center;flex-shrink:0;">
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#fff">Subtotal:</span><span style="color:#fcbe40" id="lo-fd-sub">$0.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#fff">Tax:</span><span style="color:#fcbe40" id="lo-fd-tax">$0.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#33ffff">Card Price:</span><span style="color:#33ffff" id="lo-fd-card">$0.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0"><span style="color:#33ffff">Cash Price:</span><span style="color:#33ffff" id="lo-fd-cash">$0.00</span></div>
        </div>
        <div style="display:flex;flex-direction:column;flex-shrink:0;">
          <button id="lo-btn-void" style="width:110px;height:37px;background:#cc2200;color:#fff;border:2px solid #cc2200;border-radius:0;font-family:var(--fb);font-size:14px;cursor:pointer;letter-spacing:1px;">VOID</button>
          <button id="lo-btn-disc" style="width:110px;height:37px;background:#33CC88;color:#1a1a1a;border:2px solid #33CC88;border-radius:0;font-family:var(--fb);font-size:14px;cursor:pointer;letter-spacing:1px;">DISC</button>
        </div>
        <button id="lo-btn-send" style="width:176px;height:78px;background:#228833;color:#fff;border:2px solid #228833;border-radius:0;font-family:var(--fb);font-size:22px;cursor:pointer;letter-spacing:1px;flex-shrink:0;">SEND</button>
        <button id="lo-btn-print" style="width:176px;height:78px;background:#E8A080;color:#1a1a1a;border:2px solid #E8A080;border-radius:0;font-family:var(--fb);font-size:22px;cursor:pointer;letter-spacing:1px;flex-shrink:0;">PRINT</button>
        <div style="display:flex;flex-direction:column;flex-shrink:0;">
          <button id="lo-btn-save" style="width:197px;height:37px;background:#1a1a1a;color:#C6FFBB;border:2px solid #C6FFBB;border-radius:0;font-family:var(--fb);font-size:14px;cursor:pointer;letter-spacing:1px;">Save Order</button>
          <button id="lo-btn-pay" style="width:197px;height:37px;background:#fcbe40;color:#1a1a1a;border:2px solid #fcbe40;border-radius:0;font-family:var(--fb);font-size:14px;cursor:pointer;letter-spacing:1px;">&lt;&lt;PAY&gt;&gt;</button>
        </div>
      </div>

      <!-- Toast -->
      <div id="lo-toast" style="position:absolute;top:40px;left:50%;transform:translateX(-50%);background:#222;color:#C6FFBB;border:2px solid #C6FFBB;padding:8px 24px;font-family:var(--fb);font-size:13px;z-index:999;display:none;"></div>
    `;

    // ── Wire hex-nav ──
    const hexContainer = $('lo-hex-canvas');
    if (hexContainer) {
      hexNav = new HexNav(hexContainer, {
        data: buildHexMenuData(FALLBACK_MENU),
        onSelect: (item) => {
          if (activeTab === 'modifiers') {
            addModifierToSelected(item);
          } else {
            addTicketLine(item);
          }
        },
        onBack: () => {},
      });
    }

    // ── Wire tabs ──
    const tabItems = $('lo-tab-items');
    const tabMods = $('lo-tab-mods');
    if (tabItems) tabItems.addEventListener('click', () => { activePrefix = 'ADD'; hexNav.setData(buildHexMenuData(FALLBACK_MENU)); setActiveTab('items'); });
    if (tabMods) tabMods.addEventListener('click', () => {
      if (!ticket.selectedId || !ticket.lines.find(l => l.id === ticket.selectedId)) { flashTicketBorder(); return; }
      hexNav.setData(buildHexModData(MODIFIERS));
      setActiveTab('modifiers');
    });

    // ── Wire buttons ──
    const btns = { 'lo-btn-send': handleSend, 'lo-btn-print': handlePrint, 'lo-btn-void': handleVoid, 'lo-btn-disc': handleDisc, 'lo-btn-save': handleSave, 'lo-btn-pay': handlePay };
    for (const [id, fn] of Object.entries(btns)) { const b = $(id); if (b) b.addEventListener('click', fn); }

    // ── Boot ──
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
    renderTicket();
    updateTotals();

    // ── Cleanup on exit ──
    return () => {
      if (hexNav) { hexNav.destroy(); hexNav = null; }
      if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
    };
  },
});
