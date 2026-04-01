// ──────────────────────────────────────────────────────────
//  KINDpos · Payment Scene (Replacement)
//  3-column layout: Totals+Methods │ Denominations │ Numpad
//  1024×600 · CSS Grid · Chamfered UI · No border-radius
// ──────────────────────────────────────────────────────────

import { APP, $, calcOrder, apiFetch } from '../app.js';
import { CFG } from '../config.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { chamfer } from '../theme-manager.js';

/* ── Chamfer shortcuts ── */
const cSm = chamfer('sm');
const cMd = chamfer('md');
const cLg = chamfer('lg');

/* ── Color constants (spec-defined) ── */
const BG_MINT     = 'var(--bg-mint, #c8f7c5)';
const BORDER_MINT = 'var(--border-mint, #66cc66)';
const DARK        = '#1a1a1a';
const LABEL_GREEN = '#88ee88';
const VALUE_GOLD  = 'var(--clock-gold, #fcbe40)';
const TEXT_CYAN   = 'var(--text-cyan, #33ffff)';
const DENOM_BG    = '#ddfcdb';
const DENOM_FG    = '#3a5a3a';
const NUMPAD_BG   = '#2a2a2a';
const NUMPAD_BD   = '#333333';
const CASH_GREEN  = '#8bc34a';
const CLR_RED     = '#da331c';

registerLiteScene('lite-payment', {
  onEnter(el, params) {
    // ── Receive check data ──
    const order = params.order || params.check || { id: 'C-000', seats: [{ id: 1, items: [] }], items: [] };
    const allItems = order.seats
      ? order.seats.flatMap(s => s.items).filter(i => i.state !== 'voided')
      : (order.items || []).filter(i => i.state !== 'voided');
    const totals = calcOrder({ items: allItems });

    // Seat label
    const seatLabel = order.seats
      ? order.seats.map(s => `s${s.id}`).join(', ')
      : 's1';

    // ── State ──
    let tendered     = 0;     // current amount in dollars
    let numpadCents  = 0;     // raw digit accumulation in cents
    let cashApplied  = 0;
    let cardApplied  = 0;
    let hasPartialPayment = false;
    let paymentMethod = 'card'; // default to CARD

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
      t.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        background:${isGreen ? '#39b54a' : '#c8f7c5'};color:#222;padding:20px 40px;
        font-family:var(--fb);font-size:24px;font-weight:bold;z-index:200;
        box-shadow:0 0 20px rgba(0,0,0,0.5);pointer-events:none;clip-path:${cMd};`;
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1200);
    }

    // ── Display updates ──
    function updateAmountDisplay() {
      const disp = $('ps-amount');
      if (disp) disp.textContent = fmtMoney(tendered);
    }

    function updateTotals() {
      const subEl   = $('ps-subtotal-val');
      const taxEl   = $('ps-tax-val');
      const cardEl  = $('ps-card-total-val');
      const cashEl  = $('ps-cash-total-val');
      if (subEl) subEl.textContent = fmtMoney(totals.sub);
      if (taxEl) taxEl.textContent = fmtMoney(totals.tax);
      if (cardEl) cardEl.textContent = fmtMoney(cardApplied);
      if (cashEl) cashEl.textContent = fmtMoney(cashApplied);
    }

    // ── Method selection ──
    function selectMethod(method) {
      paymentMethod = method;
      const cardBtn = $('ps-card-btn');
      const cashBtn = $('ps-cash-btn');
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
    window.addCashAmount = (amt) => {
      tendered = round2(tendered + amt);
      numpadCents = 0;
      updateAmountDisplay();
    };

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
      updateTotals();

      if (change > 0) {
        showToast(`Change: ${fmtMoney(change)}`, true);
      } else {
        showToast(`Cash ${fmtMoney(applied)} applied`, true);
      }

      if (isFullyPaid()) {
        allItems.forEach(i => i.state = 'paid');
        showToast('Payment Complete', true);
        setTimeout(() => liteGo('quick-checks'), 1200);
      }
    }

    // ── CARD SUBMIT ──
    async function submitCard() {
      const remaining = remainingCard();
      if (remaining <= 0) { showToast('Already fully paid'); return; }

      // Use tendered amount if entered, otherwise remaining balance
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

        if (result.status === 'NEEDS_APPROVAL') {
          showToast(`Approval needed: ${result.reason || 'Manager PIN required'}`);
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
        updateTotals();

        showToast('Card Approved', true);

        if (isFullyPaid()) {
          allItems.forEach(i => i.state = 'paid');
          showToast('Payment Complete', true);
          setTimeout(() => liteGo('quick-checks'), 1200);
        }

      } catch (e) {
        console.error('Card payment failed', e);
        showToast('Card payment failed \u2014 check device');
      }
    }

    // ── Back navigation with partial-payment warning ──
    function navigateBack() {
      if (hasPartialPayment) { showBackWarning(); }
      else { liteGo('quick-checks'); }
    }

    function showBackWarning() {
      const ov = document.createElement('div');
      ov.style.cssText = `position:absolute;inset:0;background:rgba(0,0,0,0.7);z-index:300;
        display:flex;align-items:center;justify-content:center;`;
      ov.innerHTML = `
        <div style="
          background:${DARK};border:var(--border-w) solid var(--yellow, #ffff00);
          clip-path:${cLg};padding:24px;
          display:flex;flex-direction:column;gap:16px;width:380px;
        ">
          <div style="font-family:var(--fb);font-size:22px;color:var(--yellow, #ffff00);text-align:center;">
            PARTIAL PAYMENT APPLIED
          </div>
          <div style="font-family:var(--fb);font-size:15px;color:${TEXT_CYAN};text-align:center;">
            Cash: ${fmtMoney(cashApplied)} + Card: ${fmtMoney(cardApplied)}<br>
            Remaining: ${fmtMoney(remainingCard())}
          </div>
          <div style="display:flex;gap:12px;">
            <div class="btn-wrap" style="flex:1;">
              <div id="ps-warn-stay" style="
                background:${CASH_GREEN};color:${DARK};
                font-family:var(--fb);font-size:18px;height:48px;
                display:flex;align-items:center;justify-content:center;
                cursor:pointer;clip-path:${cMd};
              ">STAY</div>
            </div>
            <div class="btn-wrap" style="flex:1;">
              <div id="ps-warn-leave" style="
                background:${CLR_RED};color:white;
                font-family:var(--fb);font-size:18px;height:48px;
                display:flex;align-items:center;justify-content:center;
                cursor:pointer;clip-path:${cMd};
              ">LEAVE</div>
            </div>
          </div>
        </div>
      `;
      el.querySelector('.payment-scene').appendChild(ov);
      ov.querySelector('#ps-warn-stay')?.addEventListener('click', () => ov.remove());
      ov.querySelector('#ps-warn-leave')?.addEventListener('click', () => liteGo('quick-checks'));
    }

    // ── Format header date/time ──
    function headerTimeStr() {
      const n = new Date();
      const dd = String(n.getDate()).padStart(2, '0');
      const mm = String(n.getMonth() + 1).padStart(2, '0');
      const yy = String(n.getFullYear()).slice(-2);
      let hh = n.getHours();
      const min = String(n.getMinutes()).padStart(2, '0');
      const ampm = hh >= 12 ? 'pm' : 'am';
      hh = hh % 12 || 12;
      return `${dd}/${mm}/${yy} // ${hh}:${min}${ampm}`;
    }

    // ══════════════════════════════════════════════════
    //  RENDER
    // ══════════════════════════════════════════════════

    // ── Inject :active tap animation styles ──
    let styleEl = document.getElementById('ps-active-styles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ps-active-styles';
      styleEl.textContent = `
        .payment-scene .btn-wrap:active > div {
          transform: translate(2px, 2px) !important;
          box-shadow: none !important;
        }
        .payment-scene .denom-grid .btn-wrap:active > div {
          transform: translate(2px, 2px) !important;
          box-shadow: none !important;
        }
      `;
      document.head.appendChild(styleEl);
    }

    // Hide app chrome (tbar/sbar) — payment scene takes over full screen
    const tbar = $('tbar');
    const sbar = $('sbar');
    const sceneEl = $('scene');
    if (tbar) tbar.style.display = 'none';
    if (sbar) sbar.style.display = 'none';
    if (sceneEl) sceneEl.style.cssText = 'height:600px;';

    el.style.cssText = 'position:relative;width:1024px;height:600px;overflow:hidden;';

    const dropShadow = 'filter:drop-shadow(4px 6px 0 rgba(0,0,0,0.5));';

    el.innerHTML = `
      <div class="payment-scene" style="
        display:grid;
        grid-template-rows:50px 1fr;
        grid-template-columns:330px 1fr 330px;
        grid-template-areas:
          'header header header'
          'left   center right';
        width:1024px;
        height:600px;
        background:#333333;
        overflow:hidden;
        position:relative;
      ">

        <!-- ═══ HEADER ═══ -->
        <div style="
          grid-area:header;
          background:${BG_MINT};
          border-bottom:2px solid ${BORDER_MINT};
          display:flex;
          align-items:center;
          justify-content:space-between;
          padding:0 12px;
        ">
          <div style="font-family:var(--fb);font-size:20px;color:${DARK};white-space:nowrap;flex:1;margin-right:8px;">
            ${headerTimeStr()} // ${order.id} // ${seatLabel} // Payment
          </div>
          <div class="btn-wrap">
            <div id="ps-back" style="
              width:80px;height:38px;
              background:${CLR_RED};color:${TEXT_CYAN};
              font-family:var(--fh);font-size:28px;
              display:flex;align-items:center;justify-content:center;
              cursor:pointer;user-select:none;
              clip-path:${cSm};
            ">&lt;&lt;&lt;</div>
          </div>
        </div>

        <!-- ═══ LEFT COLUMN ═══ -->
        <div style="
          grid-area:left;
          display:flex;
          flex-direction:column;
          gap:8px;
          padding:10px 10px 10px 12px;
          min-height:0;
        ">
          <!-- Subtotal / Tax Panel -->
          <div style="
            background:${DARK};
            border:var(--border-w) solid ${BORDER_MINT};
            clip-path:${cMd};
            padding:10px 14px;
          ">
            <div style="display:grid;grid-template-columns:1fr auto;row-gap:4px;">
              <span style="font-family:var(--fb);font-size:22px;color:${LABEL_GREEN};">Subtotal:</span>
              <span id="ps-subtotal-val" style="font-family:var(--fb);font-size:22px;color:${VALUE_GOLD};text-align:right;">${fmtMoney(totals.sub)}</span>
              <span style="font-family:var(--fb);font-size:22px;color:${LABEL_GREEN};">Tax:</span>
              <span id="ps-tax-val" style="font-family:var(--fb);font-size:22px;color:${VALUE_GOLD};text-align:right;">${fmtMoney(totals.tax)}</span>
            </div>
          </div>

          <!-- Card Total / Cash Total Panel -->
          <div style="
            background:${DARK};
            border:var(--border-w) solid ${BORDER_MINT};
            clip-path:${cMd};
            padding:10px 14px;
          ">
            <div style="display:grid;grid-template-columns:1fr auto;row-gap:4px;">
              <span style="font-family:var(--fb);font-size:24px;font-weight:bold;color:${TEXT_CYAN};">Card Total:</span>
              <span id="ps-card-total-val" style="font-family:var(--fb);font-size:24px;font-weight:bold;color:${VALUE_GOLD};text-align:right;">${fmtMoney(cardApplied)}</span>
              <span style="font-family:var(--fb);font-size:24px;font-weight:bold;color:${TEXT_CYAN};">Cash Total:</span>
              <span id="ps-cash-total-val" style="font-family:var(--fb);font-size:24px;font-weight:bold;color:${VALUE_GOLD};text-align:right;">${fmtMoney(cashApplied)}</span>
            </div>
          </div>

          <!-- CARD / EXACT / CASH Button Group -->
          <div style="
            flex:1;
            display:grid;
            grid-template-columns:1fr 60px;
            grid-template-rows:1fr 1fr;
            grid-template-areas:
              'card  exact'
              'cash  exact';
            gap:6px;
            min-height:0;
          ">
            <!-- CARD Button -->
            <div class="btn-wrap" style="grid-area:card;min-height:0;${dropShadow}">
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

            <!-- EXACT Button (spans 2 rows) -->
            <div class="btn-wrap" style="grid-area:exact;min-height:0;">
              <div id="ps-exact-btn" style="
                width:100%;height:100%;
                background:${DENOM_BG};
                border:2px solid ${BORDER_MINT};
                clip-path:${cMd};
                display:flex;align-items:center;justify-content:center;
                writing-mode:vertical-lr;
                text-orientation:upright;
                cursor:pointer;user-select:none;
              ">
                <span style="font-family:var(--fh);font-size:28px;color:${VALUE_GOLD};letter-spacing:-2px;">EXACT</span>
              </div>
            </div>

            <!-- CASH Button -->
            <div class="btn-wrap" style="grid-area:cash;min-height:0;${dropShadow}">
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
          </div>
        </div>

        <!-- ═══ CENTER COLUMN (Denomination Grid) ═══ -->
        <div style="
          grid-area:center;
          padding:10px 4px;
          min-height:0;
        ">
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

        <!-- ═══ RIGHT COLUMN ═══ -->
        <div style="
          grid-area:right;
          display:flex;
          flex-direction:column;
          gap:8px;
          padding:10px 12px 10px 4px;
          min-height:0;
        ">
          <!-- Amount Display -->
          <div style="
            background:${DARK};
            border:var(--border-w) solid ${BORDER_MINT};
            clip-path:${cMd};
            padding:8px 16px;
            height:60px;
            display:flex;
            align-items:center;
            justify-content:flex-end;
            flex-shrink:0;
          ">
            <span id="ps-amount" style="
              font-family:var(--fh);font-size:52px;color:${VALUE_GOLD};
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

      </div>
    `;

    // ── Wire up events ──

    // Back button
    $('ps-back')?.addEventListener('click', navigateBack);

    // CARD / CASH toggle
    $('ps-card-btn')?.addEventListener('click', () => selectMethod('card'));
    $('ps-cash-btn')?.addEventListener('click', () => selectMethod('cash'));

    // EXACT
    $('ps-exact-btn')?.addEventListener('click', setExact);

    // Numpad keys
    const numpadEl = $('ps-numpad');
    if (numpadEl) {
      const keys = ['7','8','9','4','5','6','1','2','3','CLR','0','>>>'];
      const cells = numpadEl.children;
      for (let i = 0; i < cells.length && i < keys.length; i++) {
        const key = keys[i];
        cells[i].addEventListener('click', () => numpadPress(key));
      }
    }

    // Denomination buttons
    document.querySelectorAll('[data-denom]').forEach(btn => {
      btn.addEventListener('click', () => {
        const amt = parseInt(btn.getAttribute('data-denom'));
        if (!isNaN(amt)) window.addCashAmount(amt);
      });
    });

    // Set initial method state (CARD active)
    selectMethod('card');

    // Global for inline onclick compatibility
    window._paySelectMethod = selectMethod;

    // Cleanup — restore app chrome
    return () => {
      delete window.addCashAmount;
      delete window._paySelectMethod;
      const s = document.getElementById('ps-active-styles');
      if (s) s.remove();
      if (tbar) tbar.style.display = '';
      if (sbar) sbar.style.display = '';
      if (sceneEl) sceneEl.style.cssText = '';
    };
  }
});

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
