// ──────────────────────────────────────────────────────────
//  KINDpos · Payment Overlay
//  Overlay panel: CARD/CASH + Denominations + Numpad
//  Expands over the order screen when PAY is tapped
// ──────────────────────────────────────────────────────────

import { APP, $, calcOrder, apiFetch } from '../app.js';
import { CFG } from '../config.js';
import { liteGo } from '../lite-scene-manager.js';
import { chamfer } from '../theme-manager.js';

/* ── Chamfer shortcuts ── */
const cSm = chamfer('sm');
const cMd = chamfer('md');
const cLg = chamfer('lg');

/* ── Color constants ── */
const BG_MINT     = 'var(--bg-mint, #c8f7c5)';
const BORDER_MINT = 'var(--border-mint, #66cc66)';
const DARK        = '#1a1a1a';
const VALUE_GOLD  = 'var(--clock-gold, #fcbe40)';
const TEXT_CYAN   = 'var(--text-cyan, #33ffff)';
const DENOM_BG    = '#ddfcdb';
const CASH_GREEN  = '#8bc34a';
const CLR_RED     = '#da331c';

/**
 * Show the payment overlay on top of the current scene.
 * @param {object} opts - { order, onClose }
 *   order: check/order object with seats/items
 *   onClose: callback when overlay is dismissed
 */
export function showPaymentOverlay(opts = {}) {
  const order = opts.order || { id: 'C-000', seats: [{ id: 1, items: [] }], items: [] };
  const onClose = opts.onClose || (() => {});

  const allItems = order.seats
    ? order.seats.flatMap(s => s.items).filter(i => i.state !== 'voided')
    : (order.items || []).filter(i => i.state !== 'voided');
  const totals = calcOrder({ items: allItems });

  // ── State ──
  let tendered     = 0;
  let numpadCents  = 0;
  let cashApplied  = 0;
  let cardApplied  = 0;
  let hasPartialPayment = false;
  let paymentMethod = 'card';

  // ── Helpers ──
  function round2(v) { return Math.round(v * 100) / 100; }
  function remainingCard() { return round2(totals.card - cardApplied - cashApplied); }
  function remainingCash() { return round2(totals.cash - cashApplied - cardApplied); }
  function isFullyPaid() { return remainingCard() <= 0.004; }
  function fmtMoney(v) { return '$' + v.toFixed(2); }

  // ── Printer routing ──
  async function printToRole(role, payload, items = []) {
    const routingData = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"savedPrinters":[],"categoryRouting":{}}');
    const printers = routingData.savedPrinters.filter(p => p.role === role);
    if (printers.length === 0) return;
    for (const p of printers) {
      try {
        await apiFetch('/api/v1/hardware/test-print', {
          method: 'POST',
          body: JSON.stringify({ ip: p.ip, port: 9100, payload, items })
        });
      } catch (e) {
        console.error(`Failed to print to ${p.name}`, e);
      }
    }
  }

  function showToast(msg, isGreen = false) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:${isGreen ? '#39b54a' : '#c8f7c5'};color:#222;padding:20px 40px;
      font-family:var(--fb);font-size:24px;font-weight:bold;z-index:400;
      box-shadow:0 0 20px rgba(0,0,0,0.5);pointer-events:none;clip-path:${cMd};`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1200);
  }

  // ── Display updates ──
  function updateAmountDisplay() {
    const disp = overlay.querySelector('#ps-amount');
    if (disp) disp.textContent = fmtMoney(tendered);
  }

  // ── Method selection ──
  function selectMethod(method) {
    paymentMethod = method;
    const cardBtn = overlay.querySelector('#ps-card-btn');
    const cashBtn = overlay.querySelector('#ps-cash-btn');
    if (cardBtn) {
      if (method === 'card') {
        cardBtn.style.border = 'var(--border-w) solid #00ccff';
        cardBtn.style.boxShadow = '0 0 12px rgba(0, 204, 255, 0.4)';
      } else {
        cardBtn.style.border = 'var(--border-w) solid #66cc66';
        cardBtn.style.boxShadow = 'none';
      }
    }
    if (cashBtn) {
      if (method === 'cash') {
        cashBtn.style.border = 'var(--border-w) solid #00ccff';
        cashBtn.style.boxShadow = '0 0 12px rgba(0, 204, 255, 0.4)';
      } else {
        cashBtn.style.border = 'none';
        cashBtn.style.boxShadow = 'none';
      }
    }
  }

  // ── Denomination add ──
  function addCashAmount(amt) {
    tendered = round2(tendered + amt);
    numpadCents = 0;
    updateAmountDisplay();
  }

  // ── Numpad press ──
  function numpadPress(key) {
    if (key === 'CLR') {
      numpadCents = 0;
      tendered = 0;
      updateAmountDisplay();
      return;
    }
    if (key === '>>>') {
      submitPayment();
      return;
    }
    const digit = parseInt(key);
    if (isNaN(digit)) return;
    if (numpadCents > 999999) return;
    numpadCents = numpadCents * 10 + digit;
    tendered = round2(numpadCents / 100);
    updateAmountDisplay();
  }

  // ── EXACT shortcut ──
  function setExact() {
    const due = remainingCash();
    if (due <= 0) { showToast('Already fully paid'); return; }
    tendered = due;
    numpadCents = 0;
    selectMethod('cash');
    updateAmountDisplay();
    submitPayment();
  }

  // ── SPLIT placeholder ──
  function handleSplit() {
    showToast('Split — coming soon');
  }

  // ── Submit payment ──
  async function submitPayment() {
    if (!paymentMethod) { showToast('Select CARD or CASH first'); return; }
    if (isFullyPaid()) { showToast('Already fully paid'); return; }
    if (paymentMethod === 'cash') { await submitCash(); }
    else { await submitCard(); }
  }

  // ── CASH SUBMIT ──
  async function submitCash() {
    const due = remainingCash();
    if (tendered <= 0) { showToast('Enter an amount'); return; }

    const applied = Math.min(tendered, due);
    const change = round2(tendered - due);

    try {
      await apiFetch('/api/v1/payments/cash', {
        method: 'POST',
        body: JSON.stringify({
          order_id: order.id,
          amount: applied,
          tip: 0,
          payment_method: 'cash',
        })
      });
    } catch (e) {
      console.error('Cash payment API failed, recording locally', e);
    }

    cashApplied = round2(cashApplied + applied);
    hasPartialPayment = true;

    await printToRole('receipt', {
      type: 'FINAL_RECEIPT', method: 'CASH', check_number: order.id,
      server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
      total: applied, dual_pricing: { cash: totals.cash, card: totals.card },
      change: change > 0 ? change : 0
    }, allItems);

    tendered = 0;
    numpadCents = 0;
    updateAmountDisplay();

    if (change > 0) {
      showToast(`Change: ${fmtMoney(change)}`, true);
    } else {
      showToast(`Cash ${fmtMoney(applied)} applied`, true);
    }

    if (isFullyPaid()) {
      allItems.forEach(i => i.state = 'paid');
      showToast('Payment Complete', true);
      setTimeout(() => { closeOverlay(); liteGo('quick-checks'); }, 1200);
    }
  }

  // ── CARD SUBMIT ──
  async function submitCard() {
    const remaining = remainingCard();
    if (remaining <= 0) { showToast('Already fully paid'); return; }

    const amount = (tendered > 0) ? Math.min(tendered, remaining) : remaining;

    showToast('Processing Card...');

    try {
      const result = await apiFetch('/api/v1/payments/sale', {
        method: 'POST',
        body: JSON.stringify({
          order_id: order.id,
          amount: amount.toString(),
          tip_amount: '0.00',
          payment_type: 'SALE',
          terminal_id: CFG.TID,
          server_id: APP.staff?.id || 'unknown',
        })
      });

      if (result.status && result.status !== 'APPROVED') {
        showToast(`Card ${result.status}: ${result.processor_message || result.reason || 'Declined'}`);
        return;
      }

      cardApplied = round2(cardApplied + amount);
      hasPartialPayment = true;

      await printToRole('receipt', {
        type: 'FINAL_RECEIPT', method: 'CARD', check_number: order.id,
        server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
        total: amount, dual_pricing: { cash: totals.cash, card: totals.card },
        card_brand: result.card_brand || '',
        last_four: result.last_four || '',
        auth_code: result.authorization_code || '',
      }, allItems);

      tendered = 0;
      numpadCents = 0;
      updateAmountDisplay();

      showToast('Card Approved', true);

      if (isFullyPaid()) {
        allItems.forEach(i => i.state = 'paid');
        showToast('Payment Complete', true);
        setTimeout(() => { closeOverlay(); liteGo('quick-checks'); }, 1200);
      }

    } catch (e) {
      console.error('Card payment failed', e);
      showToast('Card payment failed \u2014 check device');
    }
  }

  // ── Close overlay ──
  function closeOverlay() {
    // Restore tbar/sbar
    const tbar = $('tbar');
    const sbar = $('sbar');
    if (tbar) tbar.style.display = '';
    if (sbar) sbar.style.display = '';

    // Remove style injection
    const s = document.getElementById('ps-active-styles');
    if (s) s.remove();

    // Remove overlay
    overlay.remove();
    onClose();
  }

  // ══════════════════════════════════════════════════
  //  BUILD OVERLAY
  // ══════════════════════════════════════════════════

  // Inject :active styles
  let styleEl = document.getElementById('ps-active-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ps-active-styles';
    styleEl.textContent = `
      .payment-overlay .btn-wrap:active > div {
        transform: translate(2px, 2px) !important;
        box-shadow: none !important;
      }
    `;
    document.head.appendChild(styleEl);
  }

  // Hide tbar/sbar
  const tbar = $('tbar');
  const sbar = $('sbar');
  if (tbar) tbar.style.display = 'none';
  if (sbar) sbar.style.display = 'none';

  const dropShadow = 'filter:drop-shadow(4px 6px 0 rgba(0,0,0,0.5));';

  // Create overlay element
  const overlay = document.createElement('div');
  overlay.className = 'payment-overlay';
  overlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:200;
    display:grid;
    grid-template-columns:250px 1fr 280px;
    grid-template-rows:1fr;
    background:#333333;
    overflow:hidden;
  `;

  overlay.innerHTML = `
    <!-- ═══ LEFT COLUMN: CARD / EXACT / SPLIT / CASH ═══ -->
    <div style="
      display:flex;
      flex-direction:column;
      gap:8px;
      padding:12px;
      min-height:0;
    ">
      <!-- CARD Button -->
      <div class="btn-wrap" style="flex:1;min-height:0;${dropShadow}">
        <div id="ps-card-btn" style="
          width:100%;height:100%;
          background:${DARK};
          border:var(--border-w) solid #00ccff;
          box-shadow:0 0 12px rgba(0, 204, 255, 0.4);
          clip-path:${cLg};
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;user-select:none;
        ">
          <span style="font-family:var(--fh);font-size:48px;color:${TEXT_CYAN};">CARD</span>
        </div>
      </div>

      <!-- EXACT / SPLIT row -->
      <div style="display:flex;gap:8px;flex-shrink:0;height:80px;">
        <div class="btn-wrap" style="flex:1;">
          <div id="ps-exact-btn" style="
            width:100%;height:100%;
            background:${DENOM_BG};
            border:2px solid ${BORDER_MINT};
            clip-path:${cMd};
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;user-select:none;
          ">
            <span style="font-family:var(--fh);font-size:24px;color:#333333;letter-spacing:4px;">EXACT</span>
          </div>
        </div>
        <div class="btn-wrap" style="flex:1;">
          <div id="ps-split-btn" style="
            width:100%;height:100%;
            background:${DENOM_BG};
            border:2px solid ${BORDER_MINT};
            clip-path:${cMd};
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;user-select:none;
          ">
            <span style="font-family:var(--fh);font-size:24px;color:#333333;letter-spacing:4px;">SPLIT</span>
          </div>
        </div>
      </div>

      <!-- CASH Button -->
      <div class="btn-wrap" style="flex:1;min-height:0;${dropShadow}">
        <div id="ps-cash-btn" style="
          width:100%;height:100%;
          background:${CASH_GREEN};
          border:none;
          clip-path:${cLg};
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;user-select:none;
        ">
          <span style="font-family:var(--fh);font-size:48px;color:${DARK};">CASH</span>
        </div>
      </div>

      <!-- Back Button -->
      <div class="btn-wrap" style="flex-shrink:0;">
        <div id="ps-back" style="
          width:100%;height:42px;
          background:${CLR_RED};color:${TEXT_CYAN};
          font-family:var(--fh);font-size:24px;
          display:flex;align-items:center;justify-content:center;
          cursor:pointer;user-select:none;
          clip-path:${cSm};
        ">&lt;&lt;&lt;</div>
      </div>
    </div>

    <!-- ═══ CENTER COLUMN: Denomination Grid ═══ -->
    <div style="padding:12px 4px;min-height:0;">
      <div class="denom-grid" style="
        display:grid;
        grid-template-columns:1fr 1fr;
        grid-template-rows:1fr 1fr 1fr 1fr;
        grid-template-areas:
          'five    fifteen'
          'ten     fifteen'
          'fifty   twenty'
          'hundred hundred';
        gap:8px;
        height:100%;
      ">
        ${denomButton(5,   'five',    '42px')}
        ${denomButton(10,  'ten',     '42px')}
        ${denomButton(15,  'fifteen', '52px')}
        ${denomButton(20,  'twenty',  '48px')}
        ${denomButton(50,  'fifty',   '48px')}
        ${denomButton(100, 'hundred', '48px')}
      </div>
    </div>

    <!-- ═══ RIGHT COLUMN: Amount + Numpad ═══ -->
    <div style="
      display:flex;
      flex-direction:column;
      gap:8px;
      padding:12px 12px 12px 4px;
      min-height:0;
    ">
      <!-- Amount Display -->
      <div style="
        background:${DARK};
        border:var(--border-w) solid ${BORDER_MINT};
        clip-path:${cMd};
        padding:8px 16px;
        height:56px;
        display:flex;
        align-items:center;
        justify-content:flex-end;
        flex-shrink:0;
      ">
        <span id="ps-amount" style="
          font-family:var(--fh);font-size:48px;color:${VALUE_GOLD};
        ">${fmtMoney(tendered)}</span>
      </div>

      <!-- Numpad -->
      <div id="ps-numpad" style="
        display:grid;
        grid-template-columns:repeat(3, 1fr);
        grid-template-rows:repeat(4, 1fr);
        gap:6px;
        padding:8px;
        flex:1;
        min-height:0;
        background:var(--mint);
        clip-path:${cLg};
      ">
        ${numpadKeys()}
      </div>
    </div>
  `;

  // Add to DOM
  document.body.appendChild(overlay);

  // ── Wire up events ──
  overlay.querySelector('#ps-back')?.addEventListener('click', () => {
    if (hasPartialPayment) {
      showToast('Partial payment applied — cannot go back');
    } else {
      closeOverlay();
    }
  });

  overlay.querySelector('#ps-card-btn')?.addEventListener('click', () => selectMethod('card'));
  overlay.querySelector('#ps-cash-btn')?.addEventListener('click', () => selectMethod('cash'));
  overlay.querySelector('#ps-exact-btn')?.addEventListener('click', setExact);
  overlay.querySelector('#ps-split-btn')?.addEventListener('click', handleSplit);

  // Numpad keys
  const numpadEl = overlay.querySelector('#ps-numpad');
  if (numpadEl) {
    const keys = ['7','8','9','4','5','6','1','2','3','CLR','0','>>>'];
    const cells = numpadEl.children;
    for (let i = 0; i < cells.length && i < keys.length; i++) {
      const key = keys[i];
      cells[i].addEventListener('click', () => numpadPress(key));
    }
  }

  // Denomination buttons
  overlay.querySelectorAll('[data-denom]').forEach(btn => {
    btn.addEventListener('click', () => {
      const amt = parseInt(btn.getAttribute('data-denom'));
      if (!isNaN(amt)) addCashAmount(amt);
    });
  });

  // Set initial state
  selectMethod('card');
}

// ── Helper: denomination button HTML ──
function denomButton(amount, area, fontSize) {
  return `
    <div class="btn-wrap" data-denom="${amount}" style="
      grid-area:${area};
      min-height:0;
      cursor:pointer;
    ">
      <div style="
        width:100%;height:100%;
        background:#ddfcdb;
        border:2px solid #66cc66;
        clip-path:${chamfer('md')};
        display:flex;align-items:center;justify-content:center;
        font-family:var(--fh);font-size:${fontSize};color:#3a5a3a;
        user-select:none;
        transition:transform 0.05s, box-shadow 0.05s;
        box-shadow:2px 3px 0 rgba(0,0,0,0.3);
      ">$${amount}</div>
    </div>
  `;
}

// ── Helper: numpad keys HTML ──
function numpadKeys() {
  const keys = ['7','8','9','4','5','6','1','2','3','CLR','0','>>>'];
  return keys.map(k => {
    const isCLR = k === 'CLR';
    const isGo  = k === '>>>';
    const bg    = isCLR ? '#da331c' : isGo ? '#8bc34a' : '#2a2a2a';
    const color = isCLR ? 'white'   : isGo ? '#1a1a1a' : 'var(--clock-gold, #fcbe40)';
    const bd    = (isCLR || isGo) ? 'none' : '2px solid #333333';
    const fs    = (isCLR || isGo) ? '24px' : '32px';
    return `
      <div class="btn-wrap" style="min-height:0;cursor:pointer;">
        <div style="
          width:100%;height:100%;
          background:${bg};
          border:${bd};
          clip-path:${chamfer('sm')};
          display:flex;align-items:center;justify-content:center;
          font-family:var(--fh);font-size:${fs};color:${color};
          user-select:none;
          box-shadow:2px 3px 0 rgba(0,0,0,0.3);
          transition:transform 0.05s, box-shadow 0.05s;
        ">${k}</div>
      </div>
    `;
  }).join('');
}
