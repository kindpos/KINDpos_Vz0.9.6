// ═══════════════════════════════════════════════════
//  KINDpos Lite — Order Entry Scene
//  Flat menu grid + running ticket panel.
// ═══════════════════════════════════════════════════

import { APP, $ } from '../app.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T } from '../theme-manager.js';

const PANEL = `background:var(--bg2);border:var(--border-w) solid var(--mint);border-radius:0;`;
const SUNKEN = `background:var(--bg2);border:2px inset #1a1a1a;border-radius:0;`;
const HEADER_BAR = `background:var(--mint);color:var(--bg);font-family:var(--fh);font-size:16px;padding:6px 12px;border-radius:0;`;

const MENU_ITEMS = [
  { name: 'Burger',     price: 8.00 },
  { name: 'Cheeseburger', price: 9.00 },
  { name: 'Hot Dog',    price: 5.00 },
  { name: 'Fries',      price: 3.50 },
  { name: 'Onion Rings', price: 4.50 },
  { name: 'Wings',      price: 7.00 },
  { name: 'Nachos',     price: 9.00 },
  { name: 'Taco',       price: 6.00 },
  { name: 'Soda',       price: 2.50 },
  { name: 'Iced Tea',   price: 2.50 },
  { name: 'Beer',       price: 5.00 },
  { name: 'Margarita',  price: 9.75 },
];

registerLiteScene('lite-order', {
  onEnter(el, p) {
    // Use passed check or create a working ticket
    const check = p.check || p.order || { id: `C-${APP.nextNum++}`, items: [], server: APP.staff ? APP.staff.name : 'Server' };
    const ticket = [...(check.items || [])];

    function calcTotal() {
      return ticket.reduce((sum, i) => sum + i.price * (i.qty || 1), 0);
    }

    function render() {
      el.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:8px;gap:8px;';
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 340px;gap:8px;flex:1;min-height:0;">
          <!-- MENU GRID -->
          <div style="${PANEL}display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_BAR}">MENU <span style="opacity:0.5;font-size:11px;">PLACEHOLDER</span></div>
            <div style="flex:1;overflow-y:auto;padding:8px;">
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;" id="lite-menu-grid">
                ${MENU_ITEMS.map((item, i) => `
                  <button class="btn-s" data-menu="${i}"
                    style="border:var(--border-w) solid var(--mint);padding:12px 8px;cursor:pointer;font-family:var(--fb);text-align:center;border-radius:0;display:flex;flex-direction:column;align-items:center;gap:4px;">
                    <span>${item.name}</span>
                    <span style="color:var(--gold);font-size:13px;">$${item.price.toFixed(2)}</span>
                  </button>`).join('')}
              </div>
            </div>

            <!-- OPEN ITEM ROW -->
            <div style="border-top:2px solid var(--mint);padding:8px;display:flex;gap:6px;align-items:center;">
              <span style="font-family:var(--fb);font-size:12px;color:var(--mint);white-space:nowrap;">Open Item <span style="opacity:0.5;font-size:10px;">PLACEHOLDER</span></span>
              <input type="text" id="lite-oi-name" placeholder="Name" style="flex:1;padding:4px 8px;font-size:13px;border-radius:0;">
              <input type="number" id="lite-oi-price" placeholder="$0.00" style="width:70px;padding:4px 8px;font-size:13px;border-radius:0;" step="0.01" min="0">
              <button class="btn-p" id="lite-oi-add" style="padding:4px 12px;cursor:pointer;font-family:var(--fb);border-radius:0;">Add</button>
            </div>
          </div>

          <!-- RUNNING TICKET -->
          <div style="${PANEL}display:flex;flex-direction:column;overflow:hidden;">
            <div style="${HEADER_BAR}">CHECK ${check.id || 'NEW'}</div>
            <div style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:4px;" id="lite-ticket-list">
              ${ticket.length === 0 ? '<div style="text-align:center;opacity:0.4;font-family:var(--fb);padding:24px;">No items yet</div>' : ''}
              ${ticket.map((item, i) => `
                <div style="${SUNKEN}padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">
                  <div style="font-family:var(--fb);font-size:14px;color:var(--mint);">${item.qty || 1}× ${item.name}</div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-family:var(--fb);color:var(--gold);">$${(item.price * (item.qty || 1)).toFixed(2)}</span>
                    <button class="btn-d" data-remove="${i}" style="padding:2px 8px;cursor:pointer;font-family:var(--fb);font-size:11px;border-radius:0;">×</button>
                  </div>
                </div>`).join('')}
            </div>

            <!-- TOTAL + ACTIONS -->
            <div style="border-top:2px solid var(--mint);padding:8px;display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
                <span style="font-family:var(--fh);font-size:18px;color:var(--mint);">TOTAL</span>
                <span style="font-family:var(--fb);font-size:24px;color:var(--gold);">$${calcTotal().toFixed(2)}</span>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="btn-s" id="lite-discount-btn"
                  style="flex:1;border:var(--border-w) solid var(--lavender);padding:8px;cursor:pointer;font-family:var(--fb);color:var(--lavender);border-radius:0;">
                  Discount <span style="opacity:0.5;font-size:10px;">PLACEHOLDER</span>
                </button>
                <button class="btn-p" id="lite-pay-btn"
                  style="flex:1;padding:8px;cursor:pointer;font-family:var(--fb);border-radius:0;border:var(--border-w) solid var(--mint);">
                  Pay →
                </button>
              </div>
              <button class="btn-s" id="lite-back-btn"
                style="border:1px solid var(--mint);padding:6px;cursor:pointer;font-family:var(--fb);font-size:12px;border-radius:0;text-align:center;">
                ← Back to Snapshot
              </button>
            </div>
          </div>
        </div>
      `;

      bindListeners();
    }

    function bindListeners() {
      // Menu item buttons
      el.querySelectorAll('[data-menu]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.menu);
          const item = MENU_ITEMS[idx];
          // Check if already in ticket
          const existing = ticket.find(t => t.name === item.name);
          if (existing) {
            existing.qty = (existing.qty || 1) + 1;
          } else {
            ticket.push({ name: item.name, price: item.price, qty: 1 });
          }
          render();
        });
      });

      // Remove item buttons
      el.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.remove);
          ticket.splice(idx, 1);
          render();
        });
      });

      // Open Item add
      const oiAdd = $('lite-oi-add');
      if (oiAdd) {
        oiAdd.addEventListener('click', () => {
          const nameEl = $('lite-oi-name');
          const priceEl = $('lite-oi-price');
          const name = nameEl ? nameEl.value.trim() : '';
          const price = priceEl ? parseFloat(priceEl.value) : 0;
          if (name && price > 0) {
            ticket.push({ name, price, qty: 1 });
            render();
          }
        });
      }

      // Discount stub
      const discBtn = $('lite-discount-btn');
      if (discBtn) discBtn.addEventListener('click', () => console.log('[Lite] Discount — PLACEHOLDER'));

      // Pay button
      const payBtn = $('lite-pay-btn');
      if (payBtn) payBtn.addEventListener('click', () => {
        check.items = [...ticket];
        check.total = calcTotal();
        liteGo('lite-payment', { check });
      });

      // Back button
      const backBtn = $('lite-back-btn');
      if (backBtn) backBtn.addEventListener('click', () => liteGo('lite-snapshot'));
    }

    render();
  }
});
