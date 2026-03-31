// ═══════════════════════════════════════════════════
//  KINDpos Lite — Payment Scene
//  Payment type selection placeholder.
// ═══════════════════════════════════════════════════

import { APP, $ } from '../app.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T } from '../theme-manager.js';

const PANEL = `background:var(--bg2);border:var(--border-w) solid var(--mint);border-radius:0;`;
const HEADER_BAR = `background:var(--mint);color:var(--bg);font-family:var(--fh);font-size:16px;padding:6px 12px;border-radius:0;`;

registerLiteScene('lite-payment', {
  onEnter(el, p) {
    const check = p.check || { id: 'C-???', total: 0 };
    const total = check.total || 0;
    let selectedMethod = null;

    function render() {
      el.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;padding:16px;';
      el.innerHTML = `
        <div style="${PANEL}width:480px;display:flex;flex-direction:column;overflow:hidden;">
          <div style="${HEADER_BAR}">PAYMENT — ${check.id} <span style="opacity:0.5;font-size:11px;">PLACEHOLDER</span></div>

          <div style="padding:24px;display:flex;flex-direction:column;align-items:center;gap:20px;">
            <!-- TOTAL -->
            <div style="text-align:center;">
              <div style="font-family:var(--fh);font-size:14px;color:var(--mint);margin-bottom:4px;">TOTAL DUE</div>
              <div style="font-family:var(--fb);font-size:48px;color:var(--gold);">$${total.toFixed(2)}</div>
            </div>

            <!-- PAYMENT METHODS -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;">
              <button id="lite-pay-cash" class="btn-s"
                style="border:var(--border-w) solid var(--gold);padding:20px;cursor:pointer;font-family:var(--fb);font-size:20px;color:var(--gold);border-radius:0;text-align:center;${selectedMethod === 'cash' ? 'background:var(--bg3);' : ''}">
                CASH
              </button>
              <button id="lite-pay-card" class="btn-s"
                style="border:var(--border-w) solid var(--cyan);padding:20px;cursor:pointer;font-family:var(--fb);font-size:20px;color:var(--cyan);border-radius:0;text-align:center;${selectedMethod === 'card' ? 'background:var(--bg3);' : ''}">
                CREDIT CARD
              </button>
            </div>

            <div style="font-family:var(--fb);font-size:13px;opacity:0.4;text-align:center;">PLACEHOLDER — No payment processing</div>

            <!-- CONFIRM -->
            <button id="lite-pay-confirm"
              style="width:100%;padding:14px;cursor:pointer;font-family:var(--fb);font-size:18px;border-radius:0;border:var(--border-w) solid var(--go-green);background:var(--go-green);color:var(--bg);${!selectedMethod ? 'opacity:0.4;' : ''}">
              Confirm Payment
            </button>

            <!-- BACK -->
            <button id="lite-pay-back" class="btn-s"
              style="border:1px solid var(--mint);padding:8px 16px;cursor:pointer;font-family:var(--fb);font-size:12px;border-radius:0;">
              ← Back to Order
            </button>
          </div>
        </div>
      `;

      // Bind
      $('lite-pay-cash').addEventListener('click', () => { selectedMethod = 'cash'; render(); });
      $('lite-pay-card').addEventListener('click', () => { selectedMethod = 'card'; render(); });
      $('lite-pay-confirm').addEventListener('click', () => {
        if (!selectedMethod) return;
        console.log(`[Lite] Payment confirmed: ${selectedMethod} for ${check.id} — $${total.toFixed(2)} — PLACEHOLDER`);
        liteGo('lite-snapshot');
      });
      $('lite-pay-back').addEventListener('click', () => liteGo('lite-order', { check }));
    }

    render();
  }
});
