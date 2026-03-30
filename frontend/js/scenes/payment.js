// ──────────────────────────────────────────────────────────
//  KINDpos · Payment Scene
//  3-column layout: Tender │ Denominations │ Numpad
// ──────────────────────────────────────────────────────────

import { APP, $, calcOrder, apiFetch } from '../app.js';
import { CFG } from '../config.js';
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
    let tendered = 0;        // current numpad/denom accumulation (cents int for precision)
    let numpadCents = 0;     // raw digit accumulation in cents
    let cashApplied = 0;     // cash already confirmed on this check
    let cardApplied = 0;     // card already confirmed on this check
    let hasPartialPayment = false;
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
      setTimeout(() => t.remove(), 1200);
    }

    // ── Remaining balance ──
    function remainingCard() { return round2(totals.card - cardApplied - cashApplied); }
    function remainingCash() { return round2(totals.cash - cashApplied - cardApplied); }
    function round2(v) { return Math.round(v * 100) / 100; }
    function isFullyPaid() { return remainingCard() <= 0.004; }

    // ── Display updates ──
    function updateDisplay() {
      const disp = $('pay-amount-display');
      if (disp) disp.innerHTML = amountDisplay(tendered);
    }

    function updateSummary() {
      const panel = $('pay-summary');
      if (panel) {
        panel.innerHTML = tenderSummary(
          totals.sub, totals.tax,
          round2(totals.card - cardApplied - cashApplied),
          round2(totals.cash - cashApplied - cardApplied)
        );
      }
    }

    // ── Denomination buttons (global for inline onclick) ──
    window.addCashAmount = (amt) => {
      tendered = round2(tendered + amt);
      numpadCents = 0;
      updateDisplay();
    };

    // ── Numpad: digits accumulate as cents (last 2 digits = cents) ──
    function numpadPress(key) {
      if (key === 'CLR') {
        numpadCents = 0;
        tendered = 0;
        updateDisplay();
        return;
      }
      if (key === '>>>') {
        submitPayment();
        return;
      }
      // Digit: shift left and append
      const digit = parseInt(key);
      if (isNaN(digit)) return;
      // Cap at $99999.99
      if (numpadCents > 999999) return;
      numpadCents = numpadCents * 10 + digit;
      tendered = round2(numpadCents / 100);
      updateDisplay();
    }

    // ── EXACT: set tendered = remaining cash due, auto-select cash ──
    function setExact() {
      const due = remainingCash();
      if (due <= 0) {
        showToast('Already fully paid');
        return;
      }
      tendered = due;
      numpadCents = 0;
      selectMethod('cash');
      updateDisplay();
    }

    // ── Method selection ──
    function selectMethod(method) {
      paymentMethod = method;
      const cardEl = $('pm-card');
      const cashEl = $('pm-cash');
      if (cardEl) cardEl.style.opacity = method === 'card' ? '1' : '0.4';
      if (cashEl) cashEl.style.opacity = method === 'cash' ? '1' : '0.4';
    }

    // ── Submit payment ──
    async function submitPayment() {
      if (!paymentMethod) {
        showToast('Select CARD or CASH first');
        return;
      }

      if (isFullyPaid()) {
        showToast('Already fully paid');
        return;
      }

      if (paymentMethod === 'cash') {
        await submitCash();
      } else {
        await submitCard();
      }
    }

    // ── CASH SUBMIT ──
    async function submitCash() {
      const due = remainingCash();
      if (tendered <= 0) {
        showToast('Enter an amount');
        return;
      }
      if (tendered < due && !isFullyPaid()) {
        // Partial cash — allowed for split payments
      }

      const applied = Math.min(tendered, due);
      const change = round2(tendered - due);

      // Record via backend
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

      // Print receipt
      await printToRole('receipt', {
        type: 'FINAL_RECEIPT', method: 'CASH', check_number: order.id,
        server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
        total: applied, dual_pricing: { cash: totals.cash, card: totals.card },
        change: change > 0 ? change : 0
      }, allItems);

      // Reset tendered for next entry
      tendered = 0;
      numpadCents = 0;
      updateDisplay();
      updateSummary();

      if (change > 0) {
        showToast(`Change: $${change.toFixed(2)}`, true);
      } else {
        showToast(`Cash $${applied.toFixed(2)} applied`, true);
      }

      if (isFullyPaid()) {
        allItems.forEach(i => i.state = 'paid');
        showToast('Payment Complete', true);
        setTimeout(() => go('snapshot'), 1200);
      }
    }

    // ── CARD SUBMIT ──
    async function submitCard() {
      const remaining = remainingCard();
      if (remaining <= 0) {
        showToast('Already fully paid');
        return;
      }

      showToast('Processing Card...');

      try {
        const result = await apiFetch('/api/v1/payments/sale', {
          method: 'POST',
          body: JSON.stringify({
            order_id: order.id,
            amount: remaining.toString(),
            tip_amount: '0.00',
            payment_type: 'SALE',
            terminal_id: CFG.TID,
            server_id: APP.staff?.id || 'unknown',
          })
        });

        // Check if SPIN returned a declined/error
        if (result.status && result.status !== 'APPROVED') {
          showToast(`Card ${result.status}: ${result.processor_message || result.reason || 'Declined'}` );
          return;
        }

        // If validation needs approval (PIN entry), show message
        if (result.status === 'NEEDS_APPROVAL') {
          showToast(`Approval needed: ${result.reason || 'Manager PIN required'}`);
          return;
        }

        cardApplied = round2(cardApplied + remaining);
        hasPartialPayment = true;

        // Print receipt
        await printToRole('receipt', {
          type: 'FINAL_RECEIPT', method: 'CARD', check_number: order.id,
          server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
          total: remaining, dual_pricing: { cash: totals.cash, card: totals.card },
          card_brand: result.card_brand || '',
          last_four: result.last_four || '',
          auth_code: result.authorization_code || '',
        }, allItems);

        tendered = 0;
        numpadCents = 0;
        updateDisplay();
        updateSummary();

        showToast('Card Approved', true);

        if (isFullyPaid()) {
          allItems.forEach(i => i.state = 'paid');
          showToast('Payment Complete', true);
          setTimeout(() => go('snapshot'), 1200);
        }

      } catch (e) {
        console.error('Card payment failed', e);
        showToast('Card payment failed — check device');
      }
    }

    // ── Back navigation with partial-payment warning ──
    function navigateBack() {
      if (hasPartialPayment) {
        showBackWarning();
      } else {
        go('snapshot');
      }
    }

    function showBackWarning() {
      const ov = document.createElement('div');
      ov.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,0.7);z-index:300;display:flex;align-items:center;justify-content:center;`;
      ov.innerHTML = `
        <div style="
          background:${T.bg};border:${T.borderW} solid ${T.yellow};
          clip-path:${chamfer('lg')};padding:24px;
          display:flex;flex-direction:column;gap:16px;width:380px;
        ">
          <div style="font-family:${T.fb};font-size:22px;color:${T.yellow};text-align:center;">
            PARTIAL PAYMENT APPLIED
          </div>
          <div style="font-family:${T.fb};font-size:15px;color:${T.mint};text-align:center;">
            Cash: $${cashApplied.toFixed(2)} + Card: $${cardApplied.toFixed(2)}<br>
            Remaining: $${remainingCard().toFixed(2)}
          </div>
          <div style="display:flex;gap:12px;">
            ${btnWrap(`<div id="warn-stay" style="
              flex:1;background:${T.mint};color:${T.bg};
              font-family:${T.fb};font-size:18px;height:48px;
              display:flex;align-items:center;justify-content:center;
              cursor:pointer;clip-path:${chamfer('md')};
            ">STAY</div>`)}
            ${btnWrap(`<div id="warn-leave" style="
              flex:1;background:${T.clrRed};color:${T.bg};
              font-family:${T.fb};font-size:18px;height:48px;
              display:flex;align-items:center;justify-content:center;
              cursor:pointer;clip-path:${chamfer('md')};
            ">LEAVE</div>`)}
          </div>
        </div>
      `;
      el.appendChild(ov);

      const stayBtn = ov.querySelector('#warn-stay');
      const leaveBtn = ov.querySelector('#warn-leave');
      if (stayBtn) stayBtn.addEventListener('click', () => ov.remove());
      if (leaveBtn) leaveBtn.addEventListener('click', () => go('snapshot'));
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
      return `<div id="pay-numpad" style="
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
          <div id="pay-summary">
            ${tenderSummary(totals.sub, totals.tax, totals.card, totals.cash)}
          </div>
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
    if (backEl) backEl.addEventListener('click', navigateBack);

    // EXACT button
    const exactEl = $('pay-exact');
    if (exactEl) exactEl.addEventListener('click', setExact);

    // Method selection (global for inline onclick)
    window._paySelectMethod = selectMethod;

    // Numpad — wire via children of the grid
    const numpadContainer = $('pay-numpad');
    if (numpadContainer) {
      const keys = ['7','8','9','4','5','6','1','2','3','CLR','0','>>>'];
      const cells = numpadContainer.children;
      for (let i = 0; i < cells.length && i < keys.length; i++) {
        const key = keys[i];
        cells[i].addEventListener('click', () => numpadPress(key));
      }
    }

    // Cleanup
    return () => {
      delete window.addCashAmount;
      delete window._paySelectMethod;
    };
  }
});
