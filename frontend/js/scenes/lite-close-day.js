// ═══════════════════════════════════════════════════
//  KINDpos Lite — Close Day Scene
//  Tip adjustment / batch close placeholder.
// ═══════════════════════════════════════════════════

import { APP, $ } from '../app.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T } from '../theme-manager.js';

const PANEL = `background:var(--bg2);border:var(--border-w) solid var(--mint);border-radius:0;`;
const SUNKEN = `background:var(--bg2);border:2px inset #1a1a1a;border-radius:0;`;
const HEADER_BAR = `background:var(--mint);color:var(--bg);font-family:var(--fh);font-size:16px;padding:6px 12px;border-radius:0;`;

registerLiteScene('lite-close-day', {
  onEnter(el) {
    // Closed checks for tip adjustment — populated from APP state at runtime
    const checks = (APP.closedChecks || []).map(c => ({ id: c.id, total: c.total || 0, tip: c.tip || 0 }));

    function calcCashExpected() {
      return checks.reduce((sum, c) => sum + c.total + c.tip, 0);
    }

    function render() {
      el.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:8px;gap:8px;';
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 280px;gap:8px;flex:1;min-height:0;">
          <!-- TIP ADJUSTMENT LIST -->
          <div style="${PANEL}display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_BAR}">TIP ADJUSTMENT</div>
            <div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;">
              ${checks.map((c, i) => `
                <div style="${SUNKEN}padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div style="font-family:var(--fh);font-size:14px;color:var(--mint);">${c.id}</div>
                    <div style="font-family:var(--fb);font-size:16px;color:var(--gold);">$${c.total.toFixed(2)}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-family:var(--fb);font-size:13px;color:var(--mint);">Tip $</span>
                    <input type="number" data-tip="${i}" value="${c.tip.toFixed(2)}"
                      style="width:80px;padding:6px 8px;font-size:14px;border-radius:0;text-align:right;" step="0.01" min="0">
                  </div>
                </div>`).join('')}
            </div>
          </div>

          <!-- CASH EXPECTED + BATCH -->
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="${PANEL}display:flex;flex-direction:column;">
              <div style="${HEADER_BAR}">CASH EXPECTED</div>
              <div style="padding:20px;text-align:center;">
                <div id="lite-cash-expected" style="font-family:var(--fb);font-size:36px;color:var(--gold);">$${calcCashExpected().toFixed(2)}</div>
                <div style="font-family:var(--fb);font-size:12px;opacity:0.4;margin-top:8px;">Totals + Tips</div>
              </div>
            </div>

            <div style="${PANEL}padding:12px;display:flex;flex-direction:column;gap:8px;">
              <div style="font-family:var(--fb);font-size:12px;opacity:0.4;text-align:center;"></div>
              <button id="lite-batch-submit"
                style="width:100%;padding:14px;cursor:pointer;font-family:var(--fb);font-size:16px;border-radius:0;border:var(--border-w) solid var(--go-green);background:var(--go-green);color:var(--bg);">
                Submit Batch
              </button>
              <button id="lite-closeday-back" class="btn-s"
                style="width:100%;border:1px solid var(--mint);padding:8px;cursor:pointer;font-family:var(--fb);font-size:12px;border-radius:0;text-align:center;">
                ← Back to Snapshot
              </button>
            </div>
          </div>
        </div>
      `;

      // Bind tip input changes
      el.querySelectorAll('[data-tip]').forEach(input => {
        input.addEventListener('input', () => {
          const idx = parseInt(input.dataset.tip);
          checks[idx].tip = parseFloat(input.value) || 0;
          const cashEl = $('lite-cash-expected');
          if (cashEl) cashEl.textContent = `$${calcCashExpected().toFixed(2)}`;
        });
      });

      // Batch submit
      $('lite-batch-submit').addEventListener('click', () => {
        console.log('[Lite] Batch submitted');
        console.log('[Lite] Tips:', checks.map(c => `${c.id}: $${c.tip.toFixed(2)}`).join(', '));
        liteGo('quick-checks');
      });

      // Back
      $('lite-closeday-back').addEventListener('click', () => liteGo('quick-checks'));
    }

    render();
  }
});
