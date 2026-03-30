import { registerScene, go } from '../scene-manager.js';
import { T, chamfer, seatTab, btnWrap } from '../theme-manager.js';

registerScene('check-overview', {
  onEnter(el, p) {
    // ── State ──
    let currentCheck = p.check || p.order || null;
    let currentSeat = p.seat || 0;

    // Ensure check has a seats structure
    if (currentCheck && !currentCheck.seats) {
      currentCheck.seats = [{ items: [] }];
    }

    // If returning from add-items with staged items
    if (p.fromAddItems && p.stagedItems && p.stagedItems.length) {
      if (!currentCheck) {
        currentCheck = { id: 'C-NEW', seats: [{ items: [] }] };
      }
      if (!currentCheck.seats[currentSeat]) {
        currentCheck.seats[currentSeat] = { items: [] };
      }
      p.stagedItems.forEach(item => {
        currentCheck.seats[currentSeat].items.push({
          ...item,
          id: crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          state: 'unsent',
        });
      });
    }

    el.style.position = 'relative';

    // ── Build Layout ──
    el.innerHTML = `
      <div style="display:flex;height:100%;gap:8px;padding:8px;font-family:${T.fb};">
        ${buildLeftPanel()}
        ${buildCenterPanel()}
        ${buildRightPanel()}
      </div>
    `;

    renderSeatTabs();
    renderTicketPanel();
    renderTotals();

    if (p.fromAddItems && p.stagedItems && p.stagedItems.length) {
      showToast(`${p.stagedItems.length} item(s) added`);
    }

    bindButtons();

    // ── Back navigation ──
    window.onBackRequested = () => {
      const hasUnsent = currentCheck && currentCheck.seats &&
        currentCheck.seats.some(s => s.items && s.items.some(i => i.state === 'unsent'));
      if (hasUnsent) {
        // TODO (Chunk 3): showExitDialog()
        go('snapshot');
      } else {
        go('snapshot');
      }
    };

    return () => {
      window.onBackRequested = null;
    };

    // ═══════════════════════════════════════
    //  LEFT PANEL (~280px)
    // ═══════════════════════════════════════

    function buildLeftPanel() {
      return `<div style="width:280px;display:flex;flex-direction:column;gap:0;">
        <div style="background:${T.bg2};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};display:flex;flex-direction:column;flex:1;overflow:hidden;">
          <div id="co-seat-tabs" style="display:flex;gap:4px;padding:6px 8px;flex-shrink:0;overflow-x:auto;"></div>
          <div id="co-ticket-items" style="flex:1;overflow-y:auto;padding:6px 10px;"></div>
          <div id="co-totals" style="padding:8px 10px;border-top:2px solid rgba(198,255,187,0.15);flex-shrink:0;"></div>
        </div>
      </div>`;
    }

    // ═══════════════════════════════════════
    //  CENTER PANEL (flex:1)
    // ═══════════════════════════════════════

    function buildCenterPanel() {
      return `<div style="flex:1;background:${T.bg};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};display:flex;align-items:center;justify-content:center;">
        <span style="color:${T.mintDim};font-family:${T.fb};font-size:20px;user-select:none;">Select action or add items</span>
      </div>`;
    }

    // ═══════════════════════════════════════
    //  RIGHT PANEL (~280px)
    // ═══════════════════════════════════════

    function buildRightPanel() {
      return `<div style="width:280px;display:flex;flex-direction:column;gap:8px;">
        ${buildBtn('co-btn-send', 'SEND', T.mint, T.bg, '56px')}
        <div style="display:flex;gap:8px;">
          ${buildBtn('co-btn-hold', 'HOLD', T.yellow, T.bg, '48px', 'flex:1;')}
          ${buildBtn('co-btn-fire', 'FIRE', T.cyan, T.bg, '48px', 'flex:1;')}
        </div>
        ${buildBtn('co-btn-add-item', 'ADD ITEM', T.mint, T.bg, '56px')}
        <div style="flex:1;"></div>
        <div style="display:flex;gap:8px;">
          ${buildBtn('co-btn-pay', 'PAY', T.gold, T.bg, '48px', 'flex:1;')}
          ${buildBtn('co-btn-print', 'PRINT', T.mint, T.bg, '48px', 'flex:1;')}
        </div>
        <div style="display:flex;gap:8px;">
          ${buildBtn('co-btn-void', 'VOID', T.clrRed, T.mint, '48px', 'flex:1;')}
          ${buildBtn('co-btn-disc', 'DISC', T.gold, T.bg, '48px', 'flex:1;')}
        </div>
      </div>`;
    }

    function buildBtn(id, label, bg, color, height, extra) {
      return `<div class="btn-wrap" style="${extra || ''}">
        <div id="${id}" style="background:${bg};color:${color};font-family:${T.fb};font-size:28px;height:${height};display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;clip-path:${chamfer('md')};">${label}</div>
      </div>`;
    }

    // ═══════════════════════════════════════
    //  TARGETED RENDERS
    // ═══════════════════════════════════════

    function renderSeatTabs() {
      const container = document.getElementById('co-seat-tabs');
      if (!container) return;

      let html = seatTab('ALL', null, { active: currentSeat === 0, data: 'all' });

      if (currentCheck && currentCheck.seats) {
        currentCheck.seats.forEach((seat, i) => {
          const isActive = currentSeat === i + 1;
          const itemCount = seat.items ? seat.items.filter(it => it.state !== 'voided').length : 0;
          const sub = seat.items ? seat.items.filter(it => it.state !== 'voided').reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0) : 0;
          html += seatTab(`S${i + 1}`, `${itemCount} · $${sub.toFixed(2)}`, { active: isActive, data: i + 1 });
        });
      }

      html += `<div id="co-add-seat" style="
        flex:0 0 auto;padding:6px 12px;
        background:${T.bg};color:rgba(198,255,187,0.4);
        font-family:${T.fb};font-size:13px;cursor:pointer;
        clip-path:${chamfer('sm')};border:2px dashed rgba(198,255,187,0.3);
        text-align:center;user-select:none;
      ">+</div>`;

      container.innerHTML = html;

      // Bind seat tab clicks
      container.querySelectorAll('.seat-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const d = tab.dataset.id;
          currentSeat = d === 'all' ? 0 : parseInt(d, 10);
          renderSeatTabs();
          renderTicketPanel();
          renderTotals();
        });
      });

      const addSeatBtn = document.getElementById('co-add-seat');
      if (addSeatBtn) {
        addSeatBtn.addEventListener('click', () => {
          if (!currentCheck) return;
          if (!currentCheck.seats) currentCheck.seats = [];
          currentCheck.seats.push({ items: [] });
          currentSeat = currentCheck.seats.length;
          renderSeatTabs();
          renderTicketPanel();
          renderTotals();
        });
      }
    }

    function renderTicketPanel() {
      const container = document.getElementById('co-ticket-items');
      if (!container) return;

      const items = getVisibleItems();

      if (items.length === 0) {
        container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:${T.mintDim};font-family:${T.fb};font-size:18px;user-select:none;">NO ITEMS</div>`;
        return;
      }

      container.innerHTML = items.map(item => {
        const stateColor = item.state === 'unsent' ? 'rgba(198,255,187,0.5)' : T.mint;
        let html = `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:22px;">
          <span style="color:${stateColor};">x${item.qty || 1} ${item.name}</span>
          <span style="color:${T.gold};">$${((item.price || 0) * (item.qty || 1)).toFixed(2)}</span>
        </div>`;
        if (item.modifiers && item.modifiers.length) {
          item.modifiers.forEach(mod => {
            html += `<div style="padding:1px 0 1px 16px;">
              <span style="background:${T.gold};color:${T.bg};font-size:18px;padding:1px 6px;clip-path:${chamfer('sm')};">
                ${mod.prefix || ''} ${mod.name}
              </span>
              ${mod.price > 0 ? `<span style="color:${T.gold};font-size:18px;margin-left:6px;">$${mod.price.toFixed(2)}</span>` : ''}
            </div>`;
          });
        }
        return html;
      }).join('');
    }

    function renderTotals() {
      const container = document.getElementById('co-totals');
      if (!container) return;

      const items = getVisibleItems();
      const subtotal = items.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
      const modTotal = items.reduce((s, i) => {
        if (!i.modifiers) return s;
        return s + i.modifiers.reduce((ms, m) => ms + (m.price || 0), 0);
      }, 0);
      const sub = subtotal + modTotal;
      const tax = sub * 0.08;
      const total = sub + tax;

      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:16px;">
          <span style="color:${T.mint};">Subtotal</span>
          <span style="color:${T.gold};">$${sub.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:16px;">
          <span style="color:${T.mint};">Tax</span>
          <span style="color:${T.gold};">$${tax.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:20px;font-weight:bold;margin-top:4px;">
          <span style="color:${T.mint};">Total</span>
          <span style="color:${T.gold};">$${total.toFixed(2)}</span>
        </div>
        <div style="margin-top:6px;border-top:1px solid rgba(198,255,187,0.1);padding-top:4px;">
          <div style="display:flex;justify-content:space-between;font-size:14px;">
            <span style="color:${T.mint};">Card Total</span>
            <span style="color:${T.gold};">$0.00</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:14px;">
            <span style="color:${T.mint};">Cash Total</span>
            <span style="color:${T.gold};">$0.00</span>
          </div>
        </div>
      `;
    }

    // ═══════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════

    function getVisibleItems() {
      if (!currentCheck || !currentCheck.seats) return [];
      if (currentSeat === 0) {
        // ALL seats
        return currentCheck.seats.flatMap(s => s.items || []).filter(i => i.state !== 'voided');
      }
      const seat = currentCheck.seats[currentSeat - 1];
      return seat ? (seat.items || []).filter(i => i.state !== 'voided') : [];
    }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.style.cssText = `position:absolute;top:16px;left:50%;transform:translateX(-50%);z-index:200;
        background:rgba(0,0,0,0.8);color:${T.mint};font-family:${T.fb};font-size:20px;
        padding:8px 24px;clip-path:${chamfer('md')};pointer-events:none;`;
      toast.textContent = message;
      el.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    function bindButtons() {
      const addItemBtn = document.getElementById('co-btn-add-item');
      if (addItemBtn) {
        addItemBtn.addEventListener('click', () => {
          go('add-items', { check: currentCheck, seat: currentSeat, mode: 'items' });
        });
      }

      const sendBtn = document.getElementById('co-btn-send');
      if (sendBtn) {
        sendBtn.addEventListener('click', () => {
          console.log('SEND tapped');
        });
      }

      const holdBtn = document.getElementById('co-btn-hold');
      if (holdBtn) {
        holdBtn.addEventListener('click', () => {
          console.log('HOLD tapped');
        });
      }

      const fireBtn = document.getElementById('co-btn-fire');
      if (fireBtn) {
        fireBtn.addEventListener('click', () => {
          console.log('FIRE tapped');
        });
      }

      const payBtn = document.getElementById('co-btn-pay');
      if (payBtn) {
        payBtn.addEventListener('click', () => {
          console.log('PAY tapped');
        });
      }

      const printBtn = document.getElementById('co-btn-print');
      if (printBtn) {
        printBtn.addEventListener('click', () => {
          console.log('PRINT tapped');
        });
      }

      const voidBtn = document.getElementById('co-btn-void');
      if (voidBtn) {
        voidBtn.addEventListener('click', () => {
          console.log('VOID tapped');
        });
      }

      const discBtn = document.getElementById('co-btn-disc');
      if (discBtn) {
        discBtn.addEventListener('click', () => {
          console.log('DISC tapped');
        });
      }
    }
  }
});
