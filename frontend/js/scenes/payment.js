// ──────────────────────────────────────────────────────────
//  KINDpos · Payment Scene
//  3-column layout: Tender │ Denominations │ Numpad
// ──────────────────────────────────────────────────────────

import { APP, $, calcOrder, apiFetch } from '../app.js';
import { registerScene, go } from '../scene-manager.js';
import {
  T, chamfer, btnWrap,
  tenderSummary, amountDisplay, denomBtn, paymentMethodBtn,
} from '../theme-manager.js';

registerScene('payment', {
  onEnter(el, params) {
    // ── Receive check data ──
    const order = params.order || params.check || { id: 'C-000', seats: [{ id: 1, items: [] }], items: [] };
    const allItems = order.seats
      ? order.seats.flatMap(s => s.items).filter(i => i.state !== 'voided')
      : (order.items || []).filter(i => i.state !== 'voided');
    const totals = calcOrder({ items: allItems });

    // ── State ──
    let tendered = 0;
    let numpadBuf = '';
    let paymentMethod = null; // 'cash' or 'card'

    // ── Printer routing (mirrors check-editing) ──
    async function printToRole(role, payload, items = []) {
      const routingData = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"savedPrinters":[],"categoryRouting":{}}');
      const printers = routingData.savedPrinters.filter(p => p.role === role);
      if (printers.length === 0) {
        console.warn(`No printers assigned for role: ${role}`);
        showToast(`No ${role} printer assigned!`);
        return;
      }
      for (const p of printers) {
        try {
          await apiFetch('/api/v1/hardware/test-print', {
            method: 'POST',
            body: JSON.stringify({ ip: p.ip, port: 9100, payload, items })
          });
        } catch (e) {
          console.error(`Failed to print to ${p.name}`, e);
          showToast(`Print failed on ${p.name}`);
        }
      }
    }

    function showToast(msg, isGreen = false) {
      const t = document.createElement('div');
      t.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:${isGreen ? '#39b54a' : 'var(--mint)'};color:#222;padding:20px 40px;font-size:24px;font-weight:bold;z-index:200;box-shadow:0 0 20px rgba(0,0,0,0.5);pointer-events:none;`;
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1000);
    }

    // ── Global for denomBtn inline handlers ──
    window.addCashAmount = (amt) => {
      tendered += amt;
      numpadBuf = '';
      updateDisplay();
    };

    function updateDisplay() {
      const disp = $('pay-amount-display');
      if (disp) disp.innerHTML = amountDisplay(tendered);
    }

    function numpadPress(key) {
      if (key === 'CLR') {
        numpadBuf = '';
        tendered = 0;
        updateDisplay();
        return;
      }
      if (key === '>>>') {
        submitPayment();
        return;
      }
      if (key === '.') {
        if (numpadBuf.includes('.')) return;
        numpadBuf += '.';
      } else {
        // Limit to 2 decimal places
        const dotIdx = numpadBuf.indexOf('.');
        if (dotIdx !== -1 && numpadBuf.length - dotIdx > 2) return;
        numpadBuf += key;
      }
      tendered = parseFloat(numpadBuf) || 0;
      updateDisplay();
    }

    function setExact() {
      tendered = totals.cash;
      numpadBuf = '';
      updateDisplay();
    }

    async function submitPayment() {
      if (!paymentMethod) {
        showToast('Select CARD or CASH first');
        return;
      }
      const due = paymentMethod === 'card' ? totals.card : totals.cash;

      if (paymentMethod === 'cash') {
        if (tendered < due) {
          showToast('Insufficient amount');
          return;
        }
        const change = Math.round((tendered - due) * 100) / 100;
        await printToRole('receipt', {
          type: 'FINAL_RECEIPT', method: 'CASH', check_number: order.id,
          server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
          total: totals.cash, dual_pricing: { cash: totals.cash, card: totals.card }, change
        }, allItems);
        allItems.forEach(i => i.state = 'paid');
        showToast(change > 0 ? `Change: $${change.toFixed(2)}` : 'Payment Successful', true);
        setTimeout(() => go('snapshot'), 1200);
      } else {
        // Card — fake processing delay (no SPIN integration yet)
        showToast('Processing Card...');
        setTimeout(async () => {
          await printToRole('receipt', {
            type: 'FINAL_RECEIPT', method: 'CARD', check_number: order.id,
            server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
            total: totals.card, dual_pricing: { cash: totals.cash, card: totals.card }
          }, allItems);
          allItems.forEach(i => i.state = 'paid');
          showToast('Payment Successful', true);
          setTimeout(() => go('snapshot'), 1200);
        }, 1500);
      }
    }

    function selectMethod(method) {
      paymentMethod = method;
      const cardEl = $('pm-card');
      const cashEl = $('pm-cash');
      if (cardEl) cardEl.style.opacity = method === 'card' ? '1' : '0.4';
      if (cashEl) cashEl.style.opacity = method === 'cash' ? '1' : '0.4';
    }

    // ── Numpad key builder ──
    function numKey(label) {
      const isCLR = label === 'CLR';
      const isGo = label === '>>>';
      const bg = isCLR ? T.clrRed : isGo ? T.goGreen : T.bg;
      const color = (isCLR || isGo) ? T.bg : T.mint;
      const fs = (isCLR || isGo) ? '22px' : '36px';
      return btnWrap(`<div style="
        background:${bg};color:${color};
        font-family:${T.fb};font-size:${fs};
        display:flex;align-items:center;justify-content:center;
        height:100%;width:100%;
        cursor:pointer;user-select:none;
        clip-path:${chamfer('sm')};
      ">${label}</div>`);
    }

    // ── Denomination cascade grid ──
    // Row 1: $5 (small) | $10 (small) | $15 (larger) — because 5+10=15
    // Row 2: $50 | $20 — these plus row 1 = $100
    // Row 3: $100 full-width — the sum of everything above
    function denomGrid() {
      return `<div style="
        display:grid;
        grid-template-columns:1fr 1fr 1.4fr;
        grid-template-rows:1fr 1fr 1fr;
        gap:8px;
        height:100%;
      ">
        ${btnWrap(denomBtn(5, { width: '100%', height: '100%' }))}
        ${btnWrap(denomBtn(10, { width: '100%', height: '100%' }))}
        ${btnWrap(denomBtn(15, { width: '100%', height: '100%' }))}
        <div style="grid-column:1/2;">${btnWrap(denomBtn(50, { width: '100%', height: '100%' }))}</div>
        <div style="grid-column:2/4;">${btnWrap(denomBtn(20, { width: '100%', height: '100%' }))}</div>
        <div style="grid-column:1/-1;">${btnWrap(denomBtn(100, { width: '100%', height: '100%' }))}</div>
      </div>`;
    }

    // ── Numpad grid ──
    function numpadGrid() {
      const keys = ['7','8','9','4','5','6','1','2','3','CLR','0','>>>'];
      const cells = keys.map(k => `<div style="min-height:0;">${numKey(k)}</div>`).join('');
      return `<div style="
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:6px;
        flex:1;
        min-height:0;
      ">${cells}</div>`;
    }

    // ── Back button (red <<<, top-right of scene) ──
    const backBtn = btnWrap(`<div id="pay-back" style="
      background:${T.clrRed};color:${T.bg};
      font-family:${T.fb};font-size:22px;
      width:56px;height:36px;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;user-select:none;
      clip-path:${chamfer('sm')};
    ">&lt;&lt;&lt;</div>`);

    // ── EXACT button ──
    const exactBtn = btnWrap(`<div id="pay-exact" style="
      background:${T.mint};color:${T.bg};
      font-family:${T.fb};font-size:18px;
      writing-mode:vertical-lr;text-orientation:upright;letter-spacing:-2px;
      width:100%;height:64px;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;user-select:none;
      clip-path:${chamfer('md')};
    ">EXACT</div>`);

    // ══════════════════════════════════════════════
    //  RENDER
    // ══════════════════════════════════════════════

    el.style.position = 'relative';
    el.innerHTML = `
      <div style="
        display:grid;
        grid-template-columns:200px 1fr 280px;
        gap:12px;
        height:100%;
        padding:10px 12px;
        font-family:${T.fb};
        box-sizing:border-box;
      ">
        <!-- LEFT COLUMN: Tender summary + method buttons -->
        <div style="display:flex;flex-direction:column;gap:10px;min-height:0;">
          ${tenderSummary(totals.sub, totals.tax, totals.card, totals.cash)}
          <div id="pm-card" style="opacity:0.4;">
            ${paymentMethodBtn('card', { id: 'pay-card-btn', onClick: "window._paySelectMethod('card')" })}
          </div>
          ${exactBtn}
          <div id="pm-cash" style="opacity:0.4;">
            ${paymentMethodBtn('cash', { id: 'pay-cash-btn', onClick: "window._paySelectMethod('cash')" })}
          </div>
        </div>

        <!-- CENTER COLUMN: Denomination cascade grid -->
        <div style="
          border:${T.borderW} solid ${T.mint};
          clip-path:${chamfer('lg')};
          padding:10px;
          display:flex;
          flex-direction:column;
          min-height:0;
        ">
          ${denomGrid()}
        </div>

        <!-- RIGHT COLUMN: Amount display + numpad -->
        <div style="display:flex;flex-direction:column;gap:8px;min-height:0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div id="pay-amount-display" style="flex:1;">
              ${amountDisplay(tendered)}
            </div>
            ${backBtn}
          </div>
          <div style="
            border:${T.borderW} solid ${T.mint};
            clip-path:${chamfer('lg')};
            padding:8px;
            flex:1;
            display:flex;
            flex-direction:column;
            min-height:0;
          ">
            ${numpadGrid()}
          </div>
        </div>
      </div>
    `;

    // ── Wire up events ──

    // Back button
    const backEl = $('pay-back');
    if (backEl) backEl.addEventListener('click', () => go('snapshot'));

    // EXACT button
    const exactEl = $('pay-exact');
    if (exactEl) exactEl.addEventListener('click', setExact);

    // Method selection (global for inline onclick)
    window._paySelectMethod = selectMethod;

    // Numpad keys — attach via event delegation on the numpad grid
    el.querySelectorAll('[data-numkey]').forEach(k => {
      k.addEventListener('click', () => numpadPress(k.dataset.numkey));
    });

    // Numpad — wire via direct query since we built with numKey()
    const numpadContainer = el.querySelector('[style*="grid-template-columns:repeat(3"]');
    if (numpadContainer) {
      const keys = ['7','8','9','4','5','6','1','2','3','CLR','0','>>>'];
      const cells = numpadContainer.children;
      for (let i = 0; i < cells.length && i < keys.length; i++) {
        const cell = cells[i];
        cell.style.cursor = 'pointer';
        const key = keys[i];
        cell.addEventListener('click', () => numpadPress(key));
      }
    }

    // Cleanup
    return () => {
      delete window.addCashAmount;
      delete window._paySelectMethod;
    };
  }
});
