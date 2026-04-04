// ═══════════════════════════════════════════════════
//  KINDpos Lite — Snapshot Scene (Manager Screen)
//  Open/Closed check columns + action bar.
// ═══════════════════════════════════════════════════

import { APP, $ } from '../app.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T } from '../theme-manager.js';

// Panel style constants
const PANEL = `background:var(--bg2);border:var(--border-w) solid var(--mint);border-radius:0;`;
const SUNKEN = `background:var(--bg2);border:2px inset #1a1a1a;border-radius:0;`;
const HEADER_BAR = `background:var(--mint);color:var(--bg);font-family:var(--fh);font-size:16px;padding:6px 12px;border-radius:0;`;

registerLiteScene('lite-snapshot', {
  onEnter(el) {
    // Checks populated from APP state at runtime
    let openChecks = (APP.orders || []).filter(o => o.status === 'open').map(o => ({
      id: o.id, server: o.server || '', total: o.total || (o.items || []).reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0), items: o.items || [],
    }));
    let closedChecks = (APP.orders || []).filter(o => o.status === 'closed').map(o => ({
      id: o.id, server: o.server || '', total: o.total || 0, items: o.items || [],
    }));

    function render() {
      el.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:8px;gap:8px;';
      el.innerHTML = `
        <!-- COLUMNS -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1;min-height:0;">
          <!-- OPEN CHECKS -->
          <div style="${PANEL}display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_BAR}">OPEN CHECKS</div>
            <div id="lite-open-list" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;">
              ${openChecks.map((c, i) => checkCard(c, 'open', i)).join('')}
              ${openChecks.length === 0 ? emptyMsg('No open checks') : ''}
            </div>
          </div>

          <!-- CLOSED CHECKS -->
          <div style="${PANEL}display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_BAR}">CLOSED CHECKS</div>
            <div id="lite-closed-list" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;">
              ${closedChecks.map((c, i) => checkCard(c, 'closed', i)).join('')}
              ${closedChecks.length === 0 ? emptyMsg('No closed checks') : ''}
            </div>
          </div>
        </div>

        <!-- ACTION BAR -->
        <div style="${PANEL}display:flex;align-items:center;gap:8px;padding:8px 12px;">
          <div style="${HEADER_BAR}flex:0 0 auto;">ACTIONS</div>
          <button class="btn-s" style="border:var(--border-w) solid var(--mint);padding:8px 16px;cursor:pointer;font-family:var(--fb);border-radius:0;"
                  onclick="window._liteOpenItem()">Open Item</button>
          <button class="btn-s" style="border:var(--border-w) solid var(--lavender);padding:8px 16px;cursor:pointer;font-family:var(--fb);color:var(--lavender);border-radius:0;"
                  onclick="window._liteDiscount()">Discount</button>
          <div style="flex:1;"></div>
          <button class="btn-p" style="padding:8px 20px;cursor:pointer;font-family:var(--fb);border-radius:0;border:var(--border-w) solid var(--mint);"
                  onclick="window.go('lite-close-day')">Batch / Tip Adjust</button>
        </div>
      `;

      bindCardListeners();
    }

    function checkCard(check, type, idx) {
      const totalColor = 'var(--gold)';
      const borderColor = type === 'open' ? 'var(--cyan)' : 'var(--mint)';
      return `
        <div style="${SUNKEN}padding:10px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-left:4px solid ${borderColor};"
             data-type="${type}" data-idx="${idx}">
          <div>
            <div style="font-family:var(--fh);font-size:14px;color:var(--mint);">${check.id}</div>
            <div style="font-family:var(--fb);font-size:12px;opacity:0.6;">${check.server}</div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-family:var(--fb);font-size:18px;color:${totalColor};">$${check.total.toFixed(2)}</span>
            ${type === 'closed' ? `<button class="btn-s" style="border:1px solid var(--cyan);padding:4px 10px;cursor:pointer;font-family:var(--fb);font-size:11px;color:var(--cyan);border-radius:0;" data-reopen="${idx}">Reopen</button>` : ''}
          </div>
        </div>`;
    }

    function emptyMsg(text) {
      return `<div style="text-align:center;opacity:0.4;font-family:var(--fb);padding:24px;">${text}</div>`;
    }

    function bindCardListeners() {
      // Open check cards → navigate to lite-order
      el.querySelectorAll('[data-type="open"]').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-reopen]')) return;
          const idx = parseInt(card.dataset.idx);
          const check = openChecks[idx];
          if (check) liteGo('lite-order', { check });
        });
      });

      // Reopen buttons on closed checks
      el.querySelectorAll('[data-reopen]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.reopen);
          const check = closedChecks.splice(idx, 1)[0];
          if (check) {
            check.status = 'open';
            openChecks.push(check);
            render();
          }
        });
      });
    }

    // Global stubs for action bar
    window._liteOpenItem = () => console.log('[Lite] Open Item — PLACEHOLDER');
    window._liteDiscount = () => console.log('[Lite] Discount — PLACEHOLDER');

    render();

    return () => {
      delete window._liteOpenItem;
      delete window._liteDiscount;
    };
  }
});
