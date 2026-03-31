// ═══════════════════════════════════════════════════
//  KINDpos/lite — Order Entry Scene
//  Hex-nav item selection + running ticket panel.
//  Standalone variant — no imports from other scenes.
// ═══════════════════════════════════════════════════

import { HexNav } from '../hex-nav.js';
import { CFG, FALLBACK_MENU, MODIFIERS, MOD_PREFIXES } from '../config.js';

// Detect standalone mode (lite-order.html) vs SPA mode (lite.html)
const STANDALONE = !!document.getElementById('lite-app');

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
      // Flat array of items — no subcategory level
      for (const item of catVal) {
        catNode.children.push({
          id: `item-${catName}-${item.name}`,
          label: item.name,
          color,
          price: item.price,
        });
      }
    } else {
      // Nested subcategories
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
          // Another nesting level (subcategory → sub-subcategory)
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

/** Transform MODIFIERS config into HexNav data shape with prefix children. */
function buildHexModData(mods) {
  const groups = [];
  for (const [groupName, items] of Object.entries(mods)) {
    const groupNode = {
      id: `mod-group-${groupName}`,
      label: groupName,
      color: '#fcbe40',
      children: [],
    };
    for (const item of items) {
      // Each modifier shows prefix options as children
      groupNode.children.push({
        id: `mod-${groupName}-${item.name}`,
        label: item.name,
        color: '#fcbe40',
        children: MOD_PREFIXES.map(pfx => ({
          id: `mod-${groupName}-${item.name}-${pfx}`,
          label: `${pfx} ${item.name}`,
          color: '#fcbe40',
          modName: item.name,
          prefix: pfx,
        })),
      });
    }
    groups.push(groupNode);
  }
  return groups;
}


// ── Ticket State ─────────────────────────────────────────────────────────────

const ticket = {
  lines: [],
  selectedId: null,
  orderId: `LO-${Date.now().toString(36)}`,
};

function addTicketLine(item) {
  // If same item exists and is not sent, increment quantity
  const existing = ticket.lines.find(l => l.itemId === item.id && !l.sent);
  if (existing) {
    existing.quantity++;
    existing.lineTotal = existing.unitPrice * existing.quantity;
    renderTicket();
    updateTotals();
    return;
  }

  ticket.lines.push({
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
  });
  renderTicket();
  updateTotals();
}

function addModifierToSelected(item) {
  if (!ticket.selectedId) return;
  const line = ticket.lines.find(l => l.id === ticket.selectedId);
  if (!line || line.sent) return;

  line.modifiers.push({
    id: item.id,
    name: item.modName || item.label,
    prefix: item.prefix || 'ADD',
  });
  renderTicket();
}

function getSelectedTicketLine() {
  if (!ticket.selectedId) return null;
  return ticket.lines.find(l => l.id === ticket.selectedId) || null;
}

function calcTotals() {
  const subtotal = ticket.lines.reduce((s, l) => s + l.lineTotal, 0);
  const tax = subtotal * CFG.TAX;
  const cardPrice = subtotal + tax;
  const cashPrice = subtotal + tax;
  return { subtotal, tax, cardPrice, cashPrice };
}

function fmt(n) {
  return '$' + n.toFixed(2);
}


// ── Rendering ────────────────────────────────────────────────────────────────

function renderTicket() {
  const el = document.getElementById('ticket-scroll');
  if (!el) return;

  if (ticket.lines.length === 0) {
    el.innerHTML = '<div style="text-align:center;opacity:0.35;padding:24px;font-size:12px;">No items</div>';
    return;
  }

  let html = '';
  for (const line of ticket.lines) {
    const selected = line.id === ticket.selectedId;
    const classes = ['ticket-line'];
    if (selected) classes.push('selected');
    if (line.sent) classes.push('sent');

    html += `<div class="${classes.join(' ')}" data-line-id="${line.id}">`;
    html += `<span>${line.quantity > 1 ? line.quantity + '× ' : ''}${line.name}</span>`;
    html += `<span style="color:#fcbe40">${fmt(line.lineTotal)}</span>`;
    html += `</div>`;

    // Render modifiers
    for (const mod of line.modifiers) {
      html += `<div class="modifier-line${line.sent ? ' sent' : ''}">${mod.prefix} ${mod.name}</div>`;
    }
  }
  el.innerHTML = html;

  // Bind click handlers for selection
  el.querySelectorAll('.ticket-line').forEach(div => {
    div.addEventListener('click', () => {
      const id = div.dataset.lineId;
      if (ticket.selectedId === id) {
        ticket.selectedId = null; // deselect
      } else {
        ticket.selectedId = id;
      }
      renderTicket();
    });
  });
}

function updateTotals() {
  const t = calcTotals();

  // Totals panel (left column)
  const tpSub = document.getElementById('tp-subtotal');
  const tpTax = document.getElementById('tp-tax');
  const tpCard = document.getElementById('tp-card');
  const tpCash = document.getElementById('tp-cash');
  if (tpSub) tpSub.textContent = fmt(t.subtotal);
  if (tpTax) tpTax.textContent = fmt(t.tax);
  if (tpCard) tpCard.textContent = fmt(t.cardPrice);
  if (tpCash) tpCash.textContent = fmt(t.cashPrice);

  // Financial display (bottom bar)
  const fdSub = document.getElementById('fd-subtotal');
  const fdTax = document.getElementById('fd-tax');
  const fdCard = document.getElementById('fd-card');
  const fdCash = document.getElementById('fd-cash');
  if (fdSub) fdSub.textContent = fmt(t.subtotal);
  if (fdTax) fdTax.textContent = fmt(t.tax);
  if (fdCard) fdCard.textContent = fmt(t.cardPrice);
  if (fdCash) fdCash.textContent = fmt(t.cashPrice);
}


// ── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, duration = 1500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, duration);
}


// ── Flash border visual guard ────────────────────────────────────────────────

function flashTicketBorder() {
  const panel = document.getElementById('ticket-panel');
  if (!panel) return;
  panel.classList.remove('flash-border');
  void panel.offsetWidth; // force reflow
  panel.classList.add('flash-border');
  panel.addEventListener('animationend', () => panel.classList.remove('flash-border'), { once: true });
}


// ── Clock ────────────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const el = document.getElementById('status-clock');
  if (el) el.textContent = `${date} <> ${time} <> QS-001`;
}


// ── Tab Management ───────────────────────────────────────────────────────────

let activeTab = 'items';
let hexNav = null;

function setActiveTab(tab) {
  activeTab = tab;
  const itemsBtn = document.getElementById('tab-items');
  const modsBtn = document.getElementById('tab-modifiers');
  if (itemsBtn) itemsBtn.classList.toggle('active', tab === 'items');
  if (modsBtn) modsBtn.classList.toggle('active', tab === 'modifiers');
}


// ── Button Handlers ──────────────────────────────────────────────────────────

function handleSend() {
  const unsent = ticket.lines.filter(l => !l.sent);
  if (unsent.length === 0) {
    // Flash SEND button border
    const btn = document.getElementById('btn-send');
    if (btn) {
      btn.style.borderColor = '#fcbe40';
      setTimeout(() => { btn.style.borderColor = '#228833'; }, 300);
    }
    return;
  }

  // Mark sent locally
  unsent.forEach(l => { l.sent = true; });
  renderTicket();
  showToast('Order sent', 1200);

  // Fire to kitchen (best-effort POST)
  const payload = {
    orderId: ticket.orderId,
    items: unsent.map(l => ({
      id: l.id,
      itemId: l.itemId,
      name: l.name,
      quantity: l.quantity,
      modifiers: l.modifiers,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
  };

  fetch((CFG.API_BASE || '') + `/api/orders/${ticket.orderId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Queue failed — show indicator
    const statusRight = document.getElementById('status-right');
    if (statusRight) statusRight.textContent = '⚠ QUEUED';
  });
}

function handlePrint() {
  const t = calcTotals();
  const payload = {
    orderId: ticket.orderId,
    lines: ticket.lines.map(l => ({
      name: l.name,
      quantity: l.quantity,
      modifiers: l.modifiers,
      lineTotal: l.lineTotal,
    })),
    subtotal: t.subtotal,
    tax: t.tax,
    cardPrice: t.cardPrice,
    cashPrice: t.cashPrice,
    stationId: 'QS-001',
    dateTime: new Date().toISOString(),
  };

  fetch((CFG.API_BASE || '') + '/api/print/receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(() => {
    showToast('Receipt printing', 1200);
  }).catch(() => {
    showToast('Print failed — check printer', 2000);
  });
}

function handleVoid() {
  if (!ticket.selectedId) {
    flashTicketBorder();
    return;
  }
  const idx = ticket.lines.findIndex(l => l.id === ticket.selectedId);
  if (idx === -1) return;
  ticket.lines.splice(idx, 1);
  ticket.selectedId = null;
  renderTicket();
  updateTotals();
}

function handleDisc() {
  console.log('[KINDpos/lite] DISC — not yet implemented in lite');
  showToast('DISC — not yet implemented in lite', 1500);
}

function handleSave() {
  const t = calcTotals();
  const payload = {
    orderId: ticket.orderId,
    lines: ticket.lines,
    totals: t,
    stationId: 'QS-001',
    savedAt: new Date().toISOString(),
  };

  fetch((CFG.API_BASE || '') + `/api/orders/${ticket.orderId}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silent fail — toast still shows
  });

  showToast('Order saved', 1500);
}

function handlePay() {
  const t = calcTotals();
  // Navigate to payment — try lite scene manager if available, else direct
  if (typeof window.go === 'function') {
    window.go('lite-payment', {
      orderId: ticket.orderId,
      check: { id: ticket.orderId, items: ticket.lines, total: t.cardPrice },
      cardPrice: t.cardPrice,
      cashPrice: t.cashPrice,
    });
  } else {
    showToast('Payment scene not available', 1500);
  }
}


// ── SPA Mode (lite.html) Registration ────────────────────────────────────────

if (!STANDALONE) {
  // Dynamically import lite-scene-manager only in SPA context
  import('../lite-scene-manager.js').then(({ registerLiteScene }) => {
    registerLiteScene('lite-order', {
      onEnter(el, p) {
        // Build the full lite-order UI inside the SPA scene container
        el.style.cssText = 'display:flex;flex-direction:column;height:100%;';
        el.innerHTML = buildSceneHTML();

        // Use passed check or create a working ticket
        if (p && p.check) {
          ticket.orderId = p.check.id || ticket.orderId;
          if (p.check.items) {
            ticket.lines = p.check.items.map(item => ({
              id: crypto.randomUUID(),
              itemId: item.name,
              name: item.name,
              category: '',
              quantity: item.qty || 1,
              modifiers: [],
              unitPrice: item.price || 0,
              lineTotal: (item.price || 0) * (item.qty || 1),
              sent: false,
              seat: null,
            }));
          }
        }

        initScene();

        return () => {
          // Cleanup: destroy hex nav on scene exit
          if (hexNav) { hexNav.destroy(); hexNav = null; }
          if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
        };
      },
    });
  }).catch(() => {
    // lite-scene-manager not available — standalone mode fallback
  });
}

function buildSceneHTML() {
  return `
    <div id="status-bar" style="height:28px;width:100%;background:#222222;border-bottom:2px solid #C6FFBB;padding:0 10px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#C6FFBB;flex-shrink:0;">
      <span id="status-clock"></span>
      <span id="status-right"></span>
    </div>
    <div id="main-content" style="flex:1;margin:2px 8px 0 8px;border:2px solid #C6FFBB;display:flex;overflow:hidden;min-height:0;">
      <div id="ticket-panel" style="width:293px;flex-shrink:0;border-right:2px solid #C6FFBB;display:flex;flex-direction:column;">
        <div id="ticket-scroll" style="flex:1;overflow-y:auto;padding:8px 10px;min-height:0;"></div>
        <div id="totals-panel" style="border-top:2px solid #C6FFBB;padding:6px 10px;font-size:12px;flex-shrink:0;">
          <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#fff">Subtotal:</span><span style="color:#fcbe40" id="tp-subtotal">$0.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#fff">Tax:</span><span style="color:#fcbe40" id="tp-tax">$0.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#33ffff">Card Price:</span><span style="color:#33ffff" id="tp-card">$0.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#33ffff">Cash Price:</span><span style="color:#33ffff" id="tp-cash">$0.00</span></div>
        </div>
      </div>
      <div id="hex-panel" style="flex:1;display:flex;flex-direction:column;min-width:0;">
        <div id="hex-canvas" style="flex:1;position:relative;overflow:hidden;background:#222222;min-height:0;"></div>
        <div id="tab-row" style="height:44px;border-top:2px solid #C6FFBB;display:flex;align-items:center;justify-content:center;gap:16px;background:#1a1a1a;flex-shrink:0;">
          <button id="tab-items" style="width:120px;height:28px;border:2px solid #C6FFBB;color:#C6FFBB;background:rgba(255,255,255,0.06);font-family:'Sevastopol Interface',monospace;font-size:13px;letter-spacing:1px;cursor:pointer;border-radius:0;">Items</button>
          <button id="tab-modifiers" style="width:160px;height:28px;border:2px solid #fcbe40;color:#fcbe40;background:transparent;font-family:'Sevastopol Interface',monospace;font-size:13px;letter-spacing:1px;cursor:pointer;border-radius:0;">modifiers</button>
        </div>
      </div>
    </div>
    <div id="action-bar" style="height:78px;width:100%;background:#1a1a1a;display:flex;flex-shrink:0;">
      <div id="financial-display" style="width:293px;height:78px;background:#1a1a1a;font-size:11px;padding:4px 8px;display:flex;flex-direction:column;justify-content:center;flex-shrink:0;">
        <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#fff">Subtotal:</span><span style="color:#fcbe40" id="fd-subtotal">$0.00</span></div>
        <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#fff">Tax:</span><span style="color:#fcbe40" id="fd-tax">$0.00</span></div>
        <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#33ffff">Card Price:</span><span style="color:#33ffff" id="fd-card">$0.00</span></div>
        <div style="display:flex;justify-content:space-between;padding:1px 0;"><span style="color:#33ffff">Cash Price:</span><span style="color:#33ffff" id="fd-cash">$0.00</span></div>
      </div>
      <div style="display:flex;flex-direction:column;flex-shrink:0;">
        <button id="btn-void" style="width:110px;height:37px;background:#cc2200;color:#fff;border:2px solid #cc2200;border-radius:0;font-family:'Sevastopol Interface',monospace;font-size:14px;cursor:pointer;letter-spacing:1px;">VOID</button>
        <button id="btn-disc" style="width:110px;height:37px;background:#33CC88;color:#1a1a1a;border:2px solid #33CC88;border-radius:0;font-family:'Sevastopol Interface',monospace;font-size:14px;cursor:pointer;letter-spacing:1px;">DISC</button>
      </div>
      <button id="btn-send" style="width:176px;height:78px;background:#228833;color:#fff;border:2px solid #228833;border-radius:0;font-family:'Sevastopol Interface',monospace;font-size:22px;cursor:pointer;letter-spacing:1px;flex-shrink:0;">SEND</button>
      <button id="btn-print" style="width:176px;height:78px;background:#E8A080;color:#1a1a1a;border:2px solid #E8A080;border-radius:0;font-family:'Sevastopol Interface',monospace;font-size:22px;cursor:pointer;letter-spacing:1px;flex-shrink:0;">PRINT</button>
      <div style="display:flex;flex-direction:column;flex-shrink:0;">
        <button id="btn-save" style="width:197px;height:37px;background:#1a1a1a;color:#C6FFBB;border:2px solid #C6FFBB;border-radius:0;font-family:'Sevastopol Interface',monospace;font-size:14px;cursor:pointer;letter-spacing:1px;">Save Order</button>
        <button id="btn-pay" style="width:197px;height:37px;background:#fcbe40;color:#1a1a1a;border:2px solid #fcbe40;border-radius:0;font-family:'Sevastopol Interface',monospace;font-size:14px;cursor:pointer;letter-spacing:1px;">&lt;&lt;PAY&gt;&gt;</button>
      </div>
    </div>
    <div id="toast" style="position:absolute;top:40px;left:50%;transform:translateX(-50%);background:#222;color:#C6FFBB;border:2px solid #C6FFBB;padding:8px 24px;font-family:'Sevastopol Interface',monospace;font-size:13px;z-index:999;display:none;"></div>
  `;
}

// Shared init for both modes
function initScene() {
  updateClock();
  clockInterval = setInterval(updateClock, 1000);

  const hexContainer = document.getElementById('hex-canvas');
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

  // Tab switching
  const tabItems = document.getElementById('tab-items');
  const tabMods = document.getElementById('tab-modifiers');
  if (tabItems) {
    tabItems.addEventListener('click', () => {
      hexNav.setData(buildHexMenuData(FALLBACK_MENU));
      setActiveTab('items');
    });
  }
  if (tabMods) {
    tabMods.addEventListener('click', () => {
      if (!getSelectedTicketLine()) { flashTicketBorder(); return; }
      hexNav.setData(buildHexModData(MODIFIERS));
      setActiveTab('modifiers');
    });
  }

  // Button handlers
  const handlers = {
    'btn-send': handleSend,
    'btn-print': handlePrint,
    'btn-void': handleVoid,
    'btn-disc': handleDisc,
    'btn-save': handleSave,
    'btn-pay': handlePay,
  };
  for (const [id, fn] of Object.entries(handlers)) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  renderTicket();
  updateTotals();
}

let clockInterval = null;

// ── Standalone Boot (lite-order.html) ────────────────────────────────────────

if (STANDALONE) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScene);
  } else {
    initScene();
  }
}
