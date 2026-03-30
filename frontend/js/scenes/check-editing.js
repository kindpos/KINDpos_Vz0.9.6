// ──────────────────────────────────────────────────────────
//  KINDpos · Check Editing Scene (Vz2.0)
//  3-column layout: Ticket │ Hex Nav │ Actions
// ──────────────────────────────────────────────────────────

import { APP, $, fmtTime, greeting, calcOrder, apiFetch } from '../app.js';
import { registerScene, go } from '../scene-manager.js';
import { CFG, FALLBACK_MENU, MODIFIERS, MOD_PREFIXES } from '../config.js';
import { T, chamfer, seatTab, actionsCard, btnWrap } from '../theme-manager.js';

registerScene('check-editing', {
  onEnter(el, params) {
    const check = params.check || {
      id: `C-${Math.floor(Math.random() * 900) + 100}`,
      seats: [{ id: 1, items: [] }],
      activeSeat: 1
    };

    // ── State ──
    let activeSeatId = check.activeSeat || 1;
    let selectedItems = new Set();
    let isAllSeats = !check.activeSeat;
    let actionsExpanded = false;

    // Hex nav state (inline, no overlay)
    let stagedItems = [];
    let navPath = [];
    let navPositions = {};
    let currentLevel = 'categories';

    const hasUnsentItems = () => check.seats.some(s => s.items.some(i => i.state === 'unsent'));

    window.onBackRequested = () => {
      if (stagedItems.length > 0) {
        stagedItems = [];
        navPath = [];
        currentLevel = 'categories';
        draw();
      } else if (hasUnsentItems()) {
        showExitDialog();
      } else {
        go('snapshot');
      }
    };

    function showExitDialog() {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `
        <div class="dialog">
          <div class="dlg-h">UNSENT ITEMS</div>
          <div class="dlg-b">
            <div style="font-size:16px;">You have unsent items. What would you like to do?</div>
          </div>
          <div class="dlg-f" style="flex-direction:column; align-items:stretch; gap:8px;">
            <div class="btn-p" id="exit-send" style="background:#39b54a; color:#fff;">Send All & Exit</div>
            <div class="btn-s" id="exit-discard" style="border:1px solid var(--red); color:var(--red);">Discard & Exit</div>
            <div class="btn-s" id="exit-cancel">Cancel</div>
          </div>
        </div>
      `;
      el.appendChild(ov);

      $('exit-send').onclick = async () => {
        // Send logic
        const byRole = getItemsByRole();
        const unsentNonHeld = check.seats.flatMap(s => s.items).filter(i => i.state === 'unsent' && !i.held);
        const categoryRouting = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"categoryRouting":{}}').categoryRouting;

        const toKitchen = unsentNonHeld.filter(i => (categoryRouting[i.category_id] || 'kitchen') === 'kitchen');
        const toBar = unsentNonHeld.filter(i => (categoryRouting[i.category_id] || 'kitchen') === 'bar');

        if (toKitchen.length > 0) await printToRole('kitchen', { type: 'SEND' }, toKitchen);
        if (toBar.length > 0) await printToRole('bar', { type: 'SEND' }, toBar);

        check.seats.forEach(s => s.items.forEach(i => {
          if (i.state === 'unsent') i.state = 'sent';
        }));
        ov.remove();
        go('snapshot');
      };
      $('exit-discard').onclick = () => {
        check.seats.forEach(s => {
          s.items = s.items.filter(i => i.state !== 'unsent');
        });
        ov.remove();
        go('snapshot');
      };
      $('exit-cancel').onclick = () => ov.remove();
    }

    // ── Printer Routing Helper ──
    async function printToRole(role, payload, items = []) {
      const routingData = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"savedPrinters":[],"categoryRouting":{}}');
      const printers = routingData.savedPrinters.filter(p => p.role === role);
      
      if (printers.length === 0) {
          console.warn(`No printers assigned for role: ${role}`);
          showToast(`No ${role} printer assigned!`, false);
          // In a real system, we'd queue for retry or log to Event Ledger
          return;
      }

      for (const p of printers) {
          try {
              await apiFetch('/api/v1/hardware/test-print', { // Reusing test-print for now, or a dedicated endpoint
                  method: 'POST',
                  body: JSON.stringify({ 
                      ip: p.ip, 
                      port: 9100,
                      payload,
                      items
                  })
              });
          } catch (e) {
              console.error(`Failed to print to ${p.name}`, e);
              showToast(`Print failed on ${p.name}`, false);
          }
      }
    }

    function getItemsByRole() {
        const routingData = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"savedPrinters":[],"categoryRouting":{}}');
        const mapping = routingData.categoryRouting;
        const items = check.seats.flatMap(s => s.items);
        
        const byRole = { kitchen: [], bar: [], receipt: [] };
        items.forEach(item => {
            const role = mapping[item.category_id] || 'kitchen';
            if (byRole[role]) byRole[role].push(item);
        });
        return byRole;
    }

    // ── Selection helper (used by rendering + events) ──
    function resolveSelected() {
      return Array.from(selectedItems).map(id => {
        for (const s of check.seats) {
          const found = s.items.find(i => i.id === id);
          if (found) return found;
        }
      }).filter(Boolean);
    }

    // ═══════════════════════════════════════
    //  MAIN DRAW
    // ═══════════════════════════════════════

    function draw() {
      const sel = resolveSelected();

      el.innerHTML = `
        <div style="display:flex;height:100%;gap:8px;padding:8px;font-family:${T.fb};">
          ${renderTicketPanel()}
          ${renderHexPanel()}
          ${renderActionsPanel(sel)}
        </div>
      `;

      populateHexGrid();
      bindEvents(sel);
    }

    // ═══════════════════════════════════════
    //  LEFT: TICKET PANEL (300px)
    // ═══════════════════════════════════════

    function renderTicketPanel() {
      return `<div style="width:300px;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;gap:4px;overflow-x:auto;flex-shrink:0;">
          ${renderSeatTabs()}
        </div>
        <div style="flex:1;background:${T.bg2};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};display:flex;flex-direction:column;overflow:hidden;">
          <div id="ticket-items" style="flex:1;overflow-y:auto;padding:8px 10px;">
            ${renderTicketItems()}
          </div>
          <div style="padding:8px 10px;border-top:2px solid rgba(198,255,187,0.15);">
            ${renderTotals()}
          </div>
        </div>
      </div>`;
    }

    function renderSeatTabs() {
      let html = seatTab('ALL', null, { active: isAllSeats, data: 'all' });

      check.seats.forEach(seat => {
        const isActive = !isAllSeats && activeSeatId === seat.id;
        const sub = seat.items.filter(i => i.state !== 'voided').reduce((sum, i) => sum + i.price, 0);
        html += seatTab(`S${seat.id}`, `${seat.items.length} · $${sub.toFixed(2)}`, { active: isActive, data: seat.id });
      });

      html += `<div id="add-seat-btn" style="
        flex:0 0 auto;padding:6px 12px;
        background:${T.bg};color:rgba(198,255,187,0.4);
        font-family:${T.fb};font-size:13px;cursor:pointer;
        clip-path:${chamfer('sm')};border:2px dashed rgba(198,255,187,0.3);
        text-align:center;user-select:none;
      ">+</div>`;

      return html;
    }

    function renderTicketItems() {
      const seatsToShow = isAllSeats ? check.seats : check.seats.filter(s => s.id === activeSeatId);

      if (check.seats.every(s => s.items.length === 0)) {
        return `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:rgba(198,255,187,0.3);font-size:16px;letter-spacing:2px;">NO ITEMS</div>`;
      }

      let html = '';
      seatsToShow.forEach(seat => {
        if (seat.items.length > 0 || !isAllSeats) {
          html += `<div style="color:${T.mintDim};font-size:11px;margin:8px 0 4px;border-bottom:1px solid rgba(198,255,187,0.1);padding-bottom:2px;letter-spacing:2px;">SEAT ${seat.id}</div>`;
          seat.items.forEach(item => {
            const isSelected = selectedItems.has(item.id);
            const color = getItemColor(item.state);
            let itemTotal = item.price;
            if (item.mods) item.mods.forEach(m => { if (m.price) itemTotal += m.price; });

            html += `<div class="ticket-item" data-id="${item.id}" style="
              padding:4px 6px;cursor:pointer;display:flex;justify-content:space-between;margin-bottom:2px;
              ${isSelected ? `background:${T.mint};color:${T.bg};` : `color:${color};`}
            ">
              <div style="flex:1;">
                <div style="font-size:15px;${item.state === 'voided' ? 'text-decoration:line-through;' : ''}">${item.name}</div>
                ${item.mods ? item.mods.map(m => `
                  <div style="display:flex;justify-content:space-between;font-size:11px;opacity:0.8;margin-left:12px;margin-top:1px;">
                    <span>${m.prefix} ${m.name}</span>
                    ${m.price > 0 ? `<span style="color:${T.gold};">$${m.price.toFixed(2)}</span>` : ''}
                  </div>
                `).join('') : ''}
                ${item.note ? `<div style="font-size:11px;font-style:italic;opacity:0.7;margin-left:10px;color:${T.mint};">* ${item.note}</div>` : ''}
              </div>
              <div style="font-size:15px;margin-left:8px;min-width:55px;text-align:right;">$${itemTotal.toFixed(2)}</div>
            </div>`;
          });
        }
      });

      return html;
    }

    function getItemColor(state) {
      switch (state) {
        case 'unsent': return T.cyan;
        case 'sent': return 'rgba(198,255,187,0.35)';
        case 'held': return T.yellow;
        case 'voided': return T.red;
        case 'paid': return T.gold;
        default: return T.cyan;
      }
    }

    function renderTotals() {
      const allItems = check.seats.flatMap(s => s.items).filter(i => i.state !== 'voided');
      const totals = calcOrder({ items: allItems });

      return `
        <div style="display:flex;justify-content:space-between;color:${T.mint};font-size:13px;margin-bottom:3px;">
          <span>Subtotal</span><span>$${totals.sub.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:${T.mint};font-size:13px;margin-bottom:3px;">
          <span>Tax</span><span>$${totals.tax.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:${T.gold};font-size:20px;font-weight:bold;margin-top:6px;">
          <span>Total</span><span>$${totals.card.toFixed(2)}</span>
        </div>
      `;
    }

    // ═══════════════════════════════════════
    //  CENTER: HEX NAV PANEL (flex:1)
    // ═══════════════════════════════════════

    function renderHexPanel() {
      const crumb = navPath.length === 0 ? 'MENU' : navPath.join(' \u203A ');
      const staged = stagedItems.length;

      return `<div style="flex:1;display:flex;flex-direction:column;background:${T.bg2};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('xl')};overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:2px solid rgba(198,255,187,0.15);flex-shrink:0;">
          <div style="display:flex;align-items:center;gap:8px;">
            ${navPath.length > 0 ? `<div id="hex-back" style="color:${T.mint};font-size:16px;cursor:pointer;padding:2px 8px;border:1px solid ${T.mint};clip-path:${chamfer('sm')};">\u2190</div>` : ''}
            <span style="font-size:15px;color:${T.mint};letter-spacing:2px;font-weight:bold;">${crumb}</span>
          </div>
        </div>
        <div id="hex-panel" style="flex:1;position:relative;overflow:hidden;">
          <svg id="hex-svg" width="100%" height="100%" style="display:block;"></svg>
        </div>
        <div style="padding:6px 14px;border-top:2px solid rgba(198,255,187,0.15);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <span style="font-size:13px;color:${staged > 0 ? T.cyan : 'rgba(198,255,187,0.3)'};">
            ${staged > 0 ? `${staged} item${staged > 1 ? 's' : ''} staged` : 'Tap items to add'}
          </span>
          <div style="display:flex;gap:6px;">
            ${staged > 0 ? `
              <div id="stage-clr" class="btn-s" style="padding:3px 12px;font-size:13px;border-color:${T.red};color:${T.red};">CLR</div>
              <div id="stage-confirm" class="btn-p" style="padding:3px 12px;font-size:13px;">CONFIRM</div>
            ` : ''}
          </div>
        </div>
      </div>`;
    }

    // ═══════════════════════════════════════
    //  RIGHT: ACTIONS PANEL (180px)
    // ═══════════════════════════════════════

    function renderActionsPanel(sel) {
      const anyUnsent = sel.some(i => i.state === 'unsent');
      const anyHeld = sel.some(i => i.state === 'held');
      const allUnsent = sel.every(i => i.state === 'unsent' || i.state === 'held');
      const unsentCount = check.seats.flatMap(s => s.items).filter(i => i.state === 'unsent').length;

      const toggleHeader = `<div id="actions-toggle" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
        <span style="font-size:13px;color:${T.mint};letter-spacing:2px;font-weight:bold;">ACTIONS</span>
        <span style="color:${T.mint};font-size:12px;">${actionsExpanded ? '\u25BC' : '\u25B2'}</span>
      </div>`;

      let body = '';
      if (actionsExpanded) {
        body = `<div style="padding:6px 8px;display:flex;flex-direction:column;gap:5px;overflow-y:auto;flex:1;">
          <div id="comp-btn" class="btn-s${sel.length === 0 ? ' btn-off' : ''}" style="font-size:13px;padding:7px;">COMP</div>
          <div id="void-btn" class="btn-s${sel.length === 0 ? ' btn-off' : ''}" style="font-size:13px;padding:7px;color:${T.red};border-color:${T.red};">VOID</div>
          <div id="hold-btn" class="btn-s${!anyUnsent ? ' btn-off' : ''}" style="font-size:13px;padding:7px;color:${T.yellow};border-color:${T.yellow};">HOLD</div>
          <div id="fire-btn" class="btn-s${!anyHeld ? ' btn-off' : ''}" style="font-size:13px;padding:7px;color:${T.cyan};border-color:${T.cyan};">FIRE</div>
          <div style="border-top:1px solid rgba(198,255,187,0.1);margin:2px 0;"></div>
          <div id="pay-btn" class="btn-s" style="font-size:13px;padding:7px;">PAY</div>
          <div id="print-btn" class="btn-s" style="font-size:13px;padding:7px;">PRINT</div>
          ${sel.length > 0 ? `
            <div style="border-top:1px solid rgba(198,255,187,0.1);margin:2px 0;"></div>
            <div style="font-size:10px;color:rgba(198,255,187,0.4);padding:0 2px;letter-spacing:1px;">${sel.length} SELECTED</div>
            <div id="ctx-move" class="btn-s" style="font-size:12px;padding:5px;">MOVE \u2192</div>
            <div id="ctx-repeat" class="btn-s" style="font-size:12px;padding:5px;">REPEAT</div>
            <div id="ctx-note" class="btn-s" style="font-size:12px;padding:5px;">NOTE</div>
            ${allUnsent ? `<div id="ctx-mods" class="btn-s" style="font-size:12px;padding:5px;">EDIT MODS</div>` : ''}
            <div id="transfer-btn" class="btn-s" style="font-size:12px;padding:5px;">TRANSFER</div>
          ` : ''}
        </div>`;
      }

      return `<div style="width:180px;display:flex;flex-direction:column;gap:6px;">
        ${btnWrap(`<div id="send-btn" ${unsentCount === 0 ? 'class="btn-off"' : ''} style="
          background:${T.goGreen};color:${T.bg};font-family:${T.fb};font-size:26px;
          height:76px;display:flex;align-items:center;justify-content:center;
          cursor:pointer;clip-path:${chamfer('lg')};user-select:none;
        ">SEND</div>`)}
        <div style="font-size:9px;color:rgba(198,255,187,0.3);text-align:center;margin-top:-4px;">hold to resend</div>
        ${actionsCard(toggleHeader + body, { expanded: actionsExpanded })}
      </div>`;
    }

    // ═══════════════════════════════════════
    //  EVENT BINDING
    // ═══════════════════════════════════════

    function bindEvents(sel) {
      const anySent = sel.some(i => i.state === 'sent');

      // ── Seat Tabs ──
      el.querySelectorAll('.seat-tab').forEach(tab => {
        tab.onclick = () => {
          const id = tab.dataset.id;
          if (id === 'all') {
            isAllSeats = true;
            activeSeatId = null;
          } else {
            const numId = parseInt(id);
            if (!isAllSeats && activeSeatId === numId) {
              isAllSeats = true;
              activeSeatId = null;
            } else {
              isAllSeats = false;
              activeSeatId = numId;
            }
          }
          selectedItems.clear();
          draw();
        };
      });

      const addSeatBtn = $('add-seat-btn');
      if (addSeatBtn) addSeatBtn.onclick = () => {
        const nextId = check.seats.length + 1;
        check.seats.push({ id: nextId, items: [] });
        activeSeatId = nextId;
        isAllSeats = false;
        selectedItems.clear();
        draw();
      };

      // ── Ticket Item Selection ──
      el.querySelectorAll('.ticket-item').forEach(itemEl => {
        itemEl.onclick = () => {
          const id = itemEl.dataset.id;
          if (selectedItems.has(id)) selectedItems.delete(id);
          else selectedItems.add(id);
          draw();
        };
      });

      const ticketArea = $('ticket-items');
      if (ticketArea) ticketArea.onclick = (e) => {
        if (e.target.id === 'ticket-items') {
          selectedItems.clear();
          draw();
        }
      };

      // ── Hex Nav Back ──
      const hexBack = $('hex-back');
      if (hexBack) hexBack.onclick = () => {
        if (currentLevel === 'items' && navPath.length === 2) {
          navPath.pop();
          const catData = FALLBACK_MENU[navPath[0]];
          currentLevel = Array.isArray(catData) ? 'categories' : 'subcategories';
        } else {
          navPath = [];
          currentLevel = 'categories';
        }
        draw();
      };

      // ── Staging: CLR + CONFIRM ──
      const stageClr = $('stage-clr');
      if (stageClr) stageClr.onclick = () => { stagedItems.pop(); draw(); };

      const stageConfirm = $('stage-confirm');
      if (stageConfirm) stageConfirm.onclick = () => {
        const targetSeatId = isAllSeats ? 1 : activeSeatId;
        const targetSeat = check.seats.find(s => s.id === targetSeatId);
        stagedItems.forEach(item => {
          item.id = `item-${Date.now()}-${Math.random()}`;
          item.state = 'unsent';
          targetSeat.items.push(item);
        });
        stagedItems = [];
        draw();
      };

      // ── Actions Card Toggle ──
      const actToggle = $('actions-toggle');
      if (actToggle) actToggle.onclick = () => { actionsExpanded = !actionsExpanded; draw(); };

      // ── SEND (tap) + RESEND (long-press 800ms) ──
      const sendBtn = $('send-btn');
      if (sendBtn && !sendBtn.classList.contains('btn-off')) {
        let holdTimer = null;
        let didLongPress = false;

        const startHold = () => {
          didLongPress = false;
          holdTimer = setTimeout(async () => {
            didLongPress = true;
            // RESEND
            const byRole = getItemsByRole();
            if (byRole.kitchen.length > 0) await printToRole('kitchen', { header: '*** RESEND ***' }, byRole.kitchen);
            if (byRole.bar.length > 0) await printToRole('bar', { header: '*** RESEND ***' }, byRole.bar);
            showToast('RESENT to kitchen', true);
          }, 800);
        };
        const endHold = () => { clearTimeout(holdTimer); };

        sendBtn.addEventListener('mousedown', startHold);
        sendBtn.addEventListener('touchstart', startHold);
        sendBtn.addEventListener('mouseup', endHold);
        sendBtn.addEventListener('mouseleave', endHold);
        sendBtn.addEventListener('touchend', endHold);

        sendBtn.addEventListener('click', async () => {
          if (didLongPress) return;
          // SEND unsent items
          const unsent = check.seats.flatMap(s => s.items).filter(i => i.state === 'unsent');
          if (unsent.length === 0) return;
          const routing = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"savedPrinters":[],"categoryRouting":{}}');
          const mapping = routing.categoryRouting;
          const toKitchen = unsent.filter(i => (mapping[i.category_id] || 'kitchen') === 'kitchen');
          const toBar = unsent.filter(i => (mapping[i.category_id] || 'kitchen') === 'bar');
          if (toKitchen.length > 0) await printToRole('kitchen', { type: 'SEND' }, toKitchen);
          if (toBar.length > 0) await printToRole('bar', { type: 'SEND' }, toBar);
          unsent.forEach(i => i.state = 'sent');
          showToast('Order SENT', true);
          selectedItems.clear();
          draw();
        });
      }

      // ── COMP (replaces DISCOUNT) ──
      const compBtn = $('comp-btn');
      if (compBtn && sel.length > 0) {
        compBtn.onclick = () => {
          showPinGate('COMP ITEMS', (approved) => {
            if (!approved) return;
            showCompDialog(sel);
          });
        };
      }

      // ── VOID ──
      const voidBtn = $('void-btn');
      if (voidBtn && sel.length > 0) {
        voidBtn.onclick = () => {
          if (anySent) {
            showPinGate('VOID SENT ITEMS', (approved) => {
              if (approved) {
                sel.forEach(i => i.state = 'voided');
                selectedItems.clear();
                draw();
              }
            });
          } else {
            sel.forEach(i => {
              if (i.state === 'unsent' || i.state === 'held') {
                check.seats.forEach(s => { s.items = s.items.filter(it => it.id !== i.id); });
              } else {
                i.state = 'voided';
              }
            });
            selectedItems.clear();
            draw();
          }
        };
      }

      // ── HOLD ──
      const holdBtn = $('hold-btn');
      if (holdBtn && sel.some(i => i.state === 'unsent')) {
        holdBtn.onclick = () => {
          sel.forEach(i => { if (i.state === 'unsent') i.state = 'held'; });
          selectedItems.clear();
          draw();
        };
      }

      // ── FIRE ──
      const fireBtn = $('fire-btn');
      if (fireBtn && sel.some(i => i.state === 'held')) {
        fireBtn.onclick = () => {
          sel.forEach(i => { if (i.state === 'held') i.state = 'unsent'; });
          selectedItems.clear();
          draw();
        };
      }

      // ── PAY ──
      const payBtn = $('pay-btn');
      if (payBtn) payBtn.onclick = () => showPaymentOverlay();

      // ── PRINT ──
      const printBtn = $('print-btn');
      if (printBtn) printBtn.onclick = async () => {
        const allItems = check.seats.flatMap(s => s.items).filter(i => i.state !== 'voided');
        const totals = calcOrder({ items: allItems });
        await printToRole('receipt', {
          type: 'GUEST_CHECK', check_number: check.id, server: APP.staff?.name,
          subtotal: totals.sub, tax: totals.tax, total: totals.card,
          dual_pricing: { cash: totals.cash, card: totals.card }
        }, allItems);
        showToast('Guest Check PRINTED', true);
      };

      // ── Context Actions (in actions card) ──
      const ctxMove = $('ctx-move');
      if (ctxMove) ctxMove.onclick = () => showMoveToSeatMenu();

      const ctxRepeat = $('ctx-repeat');
      if (ctxRepeat) ctxRepeat.onclick = () => repeatSelectedItems();

      const ctxNote = $('ctx-note');
      if (ctxNote) ctxNote.onclick = () => addNoteToSelectedItems();

      const ctxMods = $('ctx-mods');
      if (ctxMods) ctxMods.onclick = () => {
        showModifierModal(sel, () => { selectedItems.clear(); draw(); });
      };

      const transferBtn = $('transfer-btn');
      if (transferBtn && sel.length > 0) {
        transferBtn.onclick = () => showTransferModal(sel);
      }
    }

    function showTransferModal(selectedItemsArr) {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      let destinations = new Set();
      let mode = 'DUPLICATE';

      const renderModal = () => {
        ov.innerHTML = `
          <div class="dialog" style="min-width:350px;">
            <div class="dlg-h">TRANSFER ${selectedItemsArr.length} ITEM(S)</div>
            <div class="dlg-b">
              <div style="font-size:12px; color:var(--mint); opacity:0.6; margin-bottom:10px;">SELECT DESTINATIONS:</div>
              <div style="max-height:200px; overflow-y:auto; display:flex; flex-direction:column; gap:5px;">
                ${check.seats.map(s => `
                  <div class="btn-s" data-seat="${s.id}" style="justify-content:flex-start; font-size:16px; ${destinations.has(s.id) ? 'background:var(--mint); color:#222;' : ''}">
                    <input type="checkbox" ${destinations.has(s.id) ? 'checked' : ''} style="margin-right:10px; pointer-events:none;"> Seat ${s.id}
                  </div>
                `).join('')}
                <div class="btn-s" data-seat="new" style="justify-content:flex-start; font-size:16px; ${destinations.has('new') ? 'background:var(--mint); color:#222;' : ''}">
                  <input type="checkbox" ${destinations.has('new') ? 'checked' : ''} style="margin-right:10px; pointer-events:none;"> New Check
                </div>
              </div>

              ${destinations.size >= 2 ? `
                <div style="margin-top:15px;">
                  <div style="font-size:12px; color:var(--mint); opacity:0.6; margin-bottom:5px;">MODE:</div>
                  <div style="display:flex; border:1px solid var(--mint);">
                    <div id="mode-dup" style="flex:1; padding:8px; text-align:center; cursor:pointer; font-size:14px; ${mode === 'DUPLICATE' ? 'background:var(--mint); color:#222;' : ''}">DUPLICATE</div>
                    <div id="mode-split" style="flex:1; padding:8px; text-align:center; cursor:pointer; font-size:14px; ${mode === 'SPLIT' ? 'background:var(--mint); color:#222;' : ''}">SPLIT</div>
                  </div>
                </div>
              ` : ''}
            </div>
            <div class="dlg-f">
              <div class="btn-s" id="transfer-cancel">Cancel</div>
              <div class="btn-p" id="transfer-confirm" ${destinations.size === 0 ? 'style="opacity:0.5; pointer-events:none;"' : ''}>Confirm</div>
            </div>
          </div>
        `;

        ov.querySelectorAll('[data-seat]').forEach(el => {
          el.onclick = () => {
            const sid = el.dataset.seat === 'new' ? 'new' : parseInt(el.dataset.seat);
            if (destinations.has(sid)) destinations.delete(sid);
            else destinations.add(sid);
            renderModal();
          };
        });

        if ($('mode-dup')) $('mode-dup').onclick = () => { mode = 'DUPLICATE'; renderModal(); };
        if ($('mode-split')) $('mode-split').onclick = () => { mode = 'SPLIT'; renderModal(); };

        $('transfer-cancel').onclick = () => ov.remove();
        $('transfer-confirm').onclick = () => {
          performTransfer(selectedItemsArr, Array.from(destinations), mode);
          ov.remove();
        };
      };

      el.appendChild(ov);
      renderModal();
    }

    function performTransfer(items, destinationIds, mode) {
      destinationIds.forEach(did => {
        let targetSeat;
        if (did === 'new') {
          const newCheck = {
            id: `C-${APP.nextNum++}`,
            seats: [{ id: 1, items: [] }],
            server: APP.staff.name,
            label: 'Table TBD',
            guest_count: 1,
            elapsed: '0m',
            status: 'open'
          };
          APP.orders.push(newCheck);
          targetSeat = newCheck.seats[0];
        } else {
          targetSeat = check.seats.find(s => s.id === did);
        }

        items.forEach(item => {
          const newItem = JSON.parse(JSON.stringify(item));
          newItem.id = `item-${Date.now()}-${Math.random()}`;
          if (mode === 'SPLIT') {
            newItem.price = item.price / destinationIds.length;
          }
          targetSeat.items.push(newItem);
        });
      });

      // If it wasn't a duplicate to other seats on SAME check, we'd usually remove originals
      // But DUPLICATE mode in spec says "Selected items are copied to ALL checked destinations."
      // SPLIT mode says "Selected items' prices are divided evenly across checked destinations."
      // Usually, transferring implies they leave the current seat if it's not one of the destinations.
      // For now, I'll follow "copy/split" logic which sounds like it might keep them or redistribute.
      // Re-reading: "Selected items are moved/copied to the chosen seat(s)/check(s)"
      // I'll assume if it's a transfer to different seats, they leave the current selection.

      // If we are transferring to seats on the same check, and those seats don't include the current seat,
      // the items should be removed from the current seat.
      // If the current seat IS one of the destinations, it already got a new copy above, so we must remove the old one anyway.

      items.forEach(item => {
        check.seats.forEach(s => {
          s.items = s.items.filter(i => i.id !== item.id);
        });
      });

      selectedItems.clear();
      draw();
    }

    function showToast(msg, isGreen = false) {
      const t = document.createElement('div');
      t.style.cssText = `position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:${isGreen ? '#39b54a' : 'var(--mint)'}; color:#222; padding:20px 40px; font-size:24px; font-weight:bold; z-index:200; box-shadow:0 0 20px rgba(0,0,0,0.5); pointer-events:none;`;
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1000);
    }

    // ── Shared drawHex — used by both Add Item overlay and Modifier Modal ──
    // ── Pointy-top hex vertex generation: angle = (π/3)×i − π/2 ──
    function drawHex(svg, x, y, size, label, color, onClick, filled = false, is86 = false, isSpecial = false) {
      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2; // pointy-top
        points.push(`${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`);
      }
      const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      hex.setAttribute('points', points.join(' '));
      hex.setAttribute('fill', filled ? color : 'transparent');
      hex.setAttribute('stroke', isSpecial ? '#fcbe40' : color);
      hex.setAttribute('stroke-width', filled ? '10' : '5');
      if (is86) hex.setAttribute('opacity', '0.5');
      hex.style.cursor = is86 ? 'default' : 'pointer';
      if (!is86) hex.onclick = onClick;
      svg.appendChild(hex);

      if (is86) {
        const strike = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        strike.setAttribute('x1', x - size);
        strike.setAttribute('y1', y - size);
        strike.setAttribute('x2', x + size);
        strike.setAttribute('y2', y + size);
        strike.setAttribute('stroke', '#ff3355');
        strike.setAttribute('stroke-width', '4');
        svg.appendChild(strike);
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badge.setAttribute('x', x + size / 2);
        badge.setAttribute('y', y - size / 2);
        badge.setAttribute('fill', '#ff3355');
        badge.setAttribute('font-size', '12px');
        badge.setAttribute('font-weight', 'bold');
        badge.textContent = '86';
        svg.appendChild(badge);
      }

      if (isSpecial) {
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badge.setAttribute('x', x);
        badge.setAttribute('y', y - size - 5);
        badge.setAttribute('fill', '#fcbe40');
        badge.setAttribute('font-size', '10px');
        badge.setAttribute('font-weight', 'bold');
        badge.setAttribute('text-anchor', 'middle');
        badge.textContent = 'SPECIAL';
        svg.appendChild(badge);
      }

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y + (size / 10)); // Slight adjustment for vertical centering
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', filled ? '#222' : (is86 ? '#666' : color));
      text.setAttribute('font-size', Math.max(12, size / 2.5)); // Increased font size
      text.setAttribute('font-weight', 'bold');
      text.style.pointerEvents = 'none';
      text.textContent = label;
      svg.appendChild(text);
    }

    function showModifierModal(items, callback, embeddedIn = null) {
      let currentPrefix = MOD_PREFIXES[0] || 'ADD';
      const modifiers = MODIFIERS;

      const renderInside = (container) => {
        // Applied Status Bar
        const displayMods = items[0].mods && items[0].mods.length 
          ? items[0].mods.map(m => `${m.prefix} ${m.name}`).join(', ') 
          : 'None';

        container.innerHTML = `
          <div style="display:flex; flex-direction:column; height:100%; font-family:var(--fb);">
            <!-- dlg-h style header but flat -->
            <div style="background:var(--mint); color:var(--bg); padding:6px 10px; font-family:var(--fh); font-size:20px; flex-shrink:0;">
              MODIFYING: ${items.length === 1 ? items[0].name : items.length + ' ITEMS'}
            </div>
            
            <div style="flex:1; display:flex; flex-direction:column; padding:10px; overflow:hidden; gap:10px;">
              <!-- Prefix Row -->
              <div style="display:flex; gap:5px; flex-shrink:0;">
                ${MOD_PREFIXES.map(p => `
                  <div class="btn-s prefix-btn" data-prefix="${p}" style="flex:1; font-size:14px; padding:8px; ${currentPrefix === p ? 'background:var(--mint); color:#222;' : ''}">${p}</div>
                `).join('')}
              </div>

              <!-- Modifier Hex Grid -->
              <div id="mod-hex-grid" style="flex:1; position:relative; overflow-x:hidden; overflow-y:auto; background:var(--bg2); border:2px solid #1a1a1a;">
                 <svg id="mod-svg" width="100%" height="400" style="display:block;"></svg>
              </div>

              <!-- Applied Status Bar -->
              <div style="padding:8px; background:#1a1a1a; border:1px solid #444; font-size:14px; color:var(--mint); min-height:34px; overflow-y:auto;">
                APPLIED: ${displayMods}
              </div>
            </div>

            <!-- Action Buttons -->
            <div style="height:50px; border-top:2px solid #444; background:var(--bg); display:flex; align-items:center; justify-content:flex-end; gap:10px; padding:0 10px; flex-shrink:0;">
              <div class="btn-s" id="mod-cancel" style="padding:8px 24px; font-size:16px;">CANCEL</div>
              <div class="btn-p" id="mod-done" style="padding:8px 24px; font-size:16px;">DONE</div>
            </div>
          </div>
        `;

        renderModHexes(container);

        container.querySelectorAll('.prefix-btn').forEach(b => {
          b.onclick = () => { currentPrefix = b.dataset.prefix; renderInside(container); };
        });

        const modCancel = container.querySelector('#mod-cancel'); 
        if (modCancel) modCancel.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (embeddedIn) {
            embeddedIn.closeMod(true); // pass true to indicate cancel
          } else {
            container.closest('.overlay').remove();
          }
        };

        const modDone = container.querySelector('#mod-done'); 
        if (modDone) modDone.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (embeddedIn) {
            embeddedIn.closeMod();
          } else {
            container.closest('.overlay').remove();
            if (callback) callback(); // standalone mode needs callback to refresh state
            draw();
          }
        };
      };

      const renderModHexes = (container) => {
        const svg = container.querySelector('#mod-svg');
        if (!svg) return;
        
        const width = svg.clientWidth || 500;
        const height = svg.clientHeight || 400;
        
        // --- Shared Hex Math Logic ---
        // Pointy-top hexes
        // Width of one hex = sqrt(3) * size
        // Height of one hex = 2 * size
        // Horizontal spacing = Width
        // Vertical spacing = 3/4 * Height = 1.5 * size
        
        const count = modifiers.length;
        // Estimate N columns to fit well
        const cols = Math.ceil(Math.sqrt(count * (width/height)));
        const padding = 20;
        const availableW = width - padding * 2;
        
        // width = sqrt(3) * size. Spacing = width * gap
        const GAP = 1.05;
        // Increased modifier hex size
        const MIN_R = 45;
        const MOD_R = Math.max(MIN_R, Math.min(55, (availableW / (cols + 0.5)) / (Math.sqrt(3) * GAP)));
        const hexW = Math.sqrt(3) * MOD_R;
        const hexH = 2 * MOD_R;
        const vertSpacing = hexH * 0.75 * GAP;
        const horizSpacing = hexW * GAP;

        // Calculate rows
        const rows = Math.ceil(count / cols);
        const gridH = (rows - 1) * vertSpacing + hexH;
        
        // Update SVG height if content exceeds container
        if (gridH + padding * 2 > height) {
           svg.setAttribute('height', (gridH + padding * 2).toString());
        }

        const startY = Math.max(MOD_R + padding, (height - gridH) / 2 + MOD_R);

        modifiers.forEach((mod, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;
          
          // Let's use a standard grid approach for "pointy-top" stagger:
          const gridStartX = (width - (cols + 0.5) * horizSpacing) / 2 + horizSpacing/2;
          const x = gridStartX + col * horizSpacing + (row % 2 ? horizSpacing / 2 : 0);
          const y = startY + row * vertSpacing;

          const isApplied = items[0].mods && items[0].mods.some(m => m.name === mod.name);
          const color = isApplied ? '#39b54a' : 'var(--mint)';

          drawHex(svg, x, y, MOD_R, mod.name, color, () => {
            items.forEach(item => {
              item.mods = item.mods || [];
              const existingIdx = item.mods.findIndex(m => m.name === mod.name);
              if (existingIdx !== -1) {
                item.mods.splice(existingIdx, 1);
              } else {
                // If prefix is NO, clear any ADD version, etc (optional but good)
                if (currentPrefix === 'NO') item.mods = item.mods.filter(m => m.name !== mod.name);
                item.mods.push({ prefix: currentPrefix, name: mod.name, price: currentPrefix === 'NO' ? 0 : mod.price });
              }
            });
            renderInside(container);
          }, isApplied);
        });
      };

      if (embeddedIn) {
        renderInside(embeddedIn.container);
      } else {
        const ov = document.createElement('div');
        ov.className = 'overlay';
        ov.style.zIndex = '400';
        const dlg = document.createElement('div');
        dlg.className = 'dialog';
        dlg.style.cssText = 'width:700px; max-width:90vw; height:600px; max-height:90vh;';
        ov.appendChild(dlg);
        el.appendChild(ov);
        renderInside(dlg);
      }
    }

    function showPinGate(title, callback) {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.zIndex = '300';
      ov.innerHTML = `
        <div class="dialog" style="width:280px;">
          <div class="dlg-h">${title}</div>
          <div class="dlg-b" style="align-items:center;">
            <div style="font-size:12px; margin-bottom:10px;">ENTER MANAGER PIN</div>
            <input type="password" id="gate-pin" style="text-align:center; font-size:24px; letter-spacing:8px; background:var(--bg2); color:var(--mint); border:1px solid var(--mint);" readonly>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:15px; width:100%;">
              ${[1,2,3,4,5,6,7,8,9,'C',0,'OK'].map(v => `<div class="btn-num" data-val="${v}" style="height:50px; font-size:18px; border:1px solid var(--mint);">${v}</div>`).join('')}
            </div>
          </div>
          <div class="dlg-f">
            <div class="btn-s" id="gate-cancel">Cancel</div>
          </div>
        </div>
      `;
      el.appendChild(ov);

      const pinInp = ov.querySelector('#gate-pin');
      let pin = '';
      ov.querySelectorAll('.btn-num').forEach(b => {
        b.onclick = () => {
          const v = b.dataset.val;
          if (v === 'C') pin = '';
          else if (v === 'OK') {
            if (pin === '0000') {
              showToast("APPROVED", true);
              ov.remove();
              callback(true);
            } else {
              showToast("DENIED", false);
              pin = '';
            }
          } else {
            if (pin.length < 4) pin += v;
          }
          pinInp.value = pin;
        };
      });
      $('gate-cancel').onclick = () => { ov.remove(); callback(false); };
    }

    // ═══════════════════════════════════════
    //  HEX GRID POPULATION (inline center panel)
    // ═══════════════════════════════════════

    function populateHexGrid() {
      const svg = el.querySelector('#hex-svg');
      if (!svg) return;
      svg.innerHTML = '';

      const GAP = 1.05;
      const CAT_R = 55;
      const SUB_R = 42;
      const ITEM_R = 32;
      const categories = Object.keys(FALLBACK_MENU);
      const colors = ['#FF8C00', '#00CED1', '#39b54a', '#E84040', '#fcbe40', '#b48efa'];

      function getChildPositions(px, py, parentR, childR, count, occupiedAngles) {
        const dist = (parentR + childR) * GAP;
        const positions = [];
        for (let face = 0; face < 6 && positions.length < count; face++) {
          const angle = (Math.PI / 3) * face;
          let skip = false;
          if (occupiedAngles) {
            for (const oa of occupiedAngles) {
              const diff = Math.abs(angle - oa);
              if (diff < 0.3 || Math.abs(diff - 2 * Math.PI) < 0.3) { skip = true; break; }
            }
          }
          if (!skip) positions.push({ x: px + dist * Math.cos(angle), y: py + dist * Math.sin(angle) });
        }
        if (positions.length < count) {
          const dist2 = (parentR + childR) * 2.1;
          for (let i = 0; i < 12 && positions.length < count; i++) {
            const angle = (Math.PI / 6) * i;
            positions.push({ x: px + dist2 * Math.cos(angle), y: py + dist2 * Math.sin(angle) });
          }
        }
        return positions.slice(0, count);
      }

      function angleBetween(px, py, cx, cy) {
        let a = Math.atan2(cy - py, cx - px);
        if (a < 0) a += 2 * Math.PI;
        return a;
      }

      function catPositions(sx, sy, r, count) {
        const pos = [{ x: sx, y: sy }];
        const dist = r * 2 * GAP;
        for (let i = 0; i < Math.min(count - 1, 6); i++) {
          const angle = (Math.PI / 3) * i;
          pos.push({ x: sx + dist * Math.cos(angle), y: sy + dist * Math.sin(angle) });
        }
        return pos.slice(0, count);
      }

      const panel = el.querySelector('#hex-panel');
      const startX = (panel?.clientWidth || 400) / 2;
      const startY = (panel?.clientHeight || 400) / 2;

      // ── Categories ──
      if (currentLevel === 'categories') {
        const positions = catPositions(startX, startY, CAT_R, categories.length);
        navPositions = {};
        categories.forEach((cat, i) => {
          const p = positions[i];
          navPositions[cat] = { x: p.x, y: p.y };
          drawHex(svg, p.x, p.y, CAT_R, cat, colors[i % colors.length], () => {
            navPath = [cat];
            const catData = FALLBACK_MENU[cat];
            currentLevel = Array.isArray(catData) ? 'items' : 'subcategories';
            draw();
          });
        });
      }

      // ── Subcategories ──
      else if (currentLevel === 'subcategories') {
        const catName = navPath[0];
        const catIdx = categories.indexOf(catName);
        const catColor = colors[catIdx % colors.length];
        const ax = navPositions[catName]?.x || startX;
        const ay = navPositions[catName]?.y || startY;

        drawHex(svg, ax, ay, CAT_R, catName, catColor, () => {
          currentLevel = 'categories'; navPath = []; draw();
        }, true);

        const subcats = Object.keys(FALLBACK_MENU[catName]);
        const subPositions = getChildPositions(ax, ay, CAT_R, SUB_R, subcats.length, null);
        subcats.forEach((sub, i) => {
          const p = subPositions[i];
          navPositions[sub] = { x: p.x, y: p.y };
          drawHex(svg, p.x, p.y, SUB_R, sub, catColor, () => {
            navPath = [catName, sub]; currentLevel = 'items'; draw();
          });
        });
      }

      // ── Items ──
      else if (currentLevel === 'items') {
        const catName = navPath[0];
        const catIdx = categories.indexOf(catName);
        const catColor = colors[catIdx % colors.length];
        const catData = FALLBACK_MENU[catName];
        const ax = navPositions[catName]?.x || startX;
        const ay = navPositions[catName]?.y || startY;

        drawHex(svg, ax, ay, CAT_R, catName, catColor, () => {
          currentLevel = 'categories'; navPath = []; draw();
        }, true);

        let items, parentX, parentY, parentR, occupiedAngles;
        if (Array.isArray(catData)) {
          items = catData; parentX = ax; parentY = ay; parentR = CAT_R; occupiedAngles = null;
        } else {
          const subName = navPath[1];
          const sx = navPositions[subName]?.x || ax + 120;
          const sy = navPositions[subName]?.y || ay + 80;
          drawHex(svg, sx, sy, SUB_R, subName, catColor, () => {
            currentLevel = 'subcategories'; navPath = [catName]; draw();
          }, true);
          items = catData[subName] || [];
          parentX = sx; parentY = sy; parentR = SUB_R;
          occupiedAngles = [angleBetween(sx, sy, ax, ay)];
        }

        const itemPositions = getChildPositions(parentX, parentY, parentR, ITEM_R, items.length, occupiedAngles);
        items.forEach((item, i) => {
          const p = itemPositions[i];
          const is86 = item.is86 || false;
          const isSpecial = item.isSpecial || false;

          drawHex(svg, p.x, p.y, ITEM_R, item.name,
            is86 ? '#666' : (isSpecial ? '#fcbe40' : catColor),
            () => {
              if (is86) return;
              const newItem = { ...item };
              if (item.requiresMod) {
                showModifierModal([newItem], (cancelled) => {
                  if (!cancelled) stagedItems.push(newItem);
                  draw();
                });
              } else {
                stagedItems.push(newItem);
                draw();
              }
            }, false, is86, isSpecial);
        });
      }
    }

    // ── Comp Dialog (replaces DISCOUNT) ──
    function showCompDialog(sel) {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.zIndex = '300';
      ov.innerHTML = `
        <div class="dialog" style="width:320px;">
          <div class="dlg-h" style="background:${T.mint};color:${T.bg};">COMP ${sel.length} ITEM(S)</div>
          <div class="dlg-b" style="display:flex;flex-direction:column;gap:10px;">
            <div class="btn-p" id="comp-full" style="font-size:18px;padding:12px;">FULL COMP (100%)</div>
            <div class="btn-s" id="comp-50" style="font-size:16px;padding:10px;">50% COMP</div>
            <div class="btn-s" id="comp-custom" style="font-size:16px;padding:10px;">CUSTOM %</div>
          </div>
          <div class="dlg-f">
            <div class="btn-s" id="comp-cancel">Cancel</div>
          </div>
        </div>
      `;
      el.appendChild(ov);

      const applyComp = (pct) => {
        sel.forEach(i => {
          i.price *= (1 - pct / 100);
          i.mods = i.mods || [];
          i.mods.push({ prefix: 'COMP', name: `${pct}%`, price: 0 });
        });
        selectedItems.clear();
        ov.remove();
        draw();
        showToast(`COMP ${pct}% applied`, true);
      };

      $('comp-full').onclick = () => applyComp(100);
      $('comp-50').onclick = () => applyComp(50);
      $('comp-custom').onclick = () => {
        const pct = prompt('Comp %:', '25');
        if (pct && !isNaN(parseInt(pct))) applyComp(parseInt(pct));
      };
      $('comp-cancel').onclick = () => ov.remove();
    }

    function showPaymentOverlay() {
      const allItems = check.seats.flatMap(s => s.items).filter(i => i.state !== 'voided');
      const totals = calcOrder({ items: allItems });

      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.style.zIndex = '200';
      ov.innerHTML = `
        <div class="dialog" style="width:400px;">
          <div class="dlg-h" style="background:${T.mint};color:${T.bg};">PAYMENT</div>
          <div class="dlg-b" style="display:flex;flex-direction:column;gap:16px;">
            <div style="background:${T.bg};border:2px solid ${T.mint};clip-path:${chamfer('lg')};padding:16px;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:18px;color:${T.mint};">TOTAL DUE</span>
              <span style="font-size:32px;color:${T.gold};font-weight:bold;">$${totals.card.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;color:${T.mint};font-size:13px;">
              <span>Cash price: $${totals.cash.toFixed(2)}</span>
              <span>Card price: $${totals.card.toFixed(2)}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div class="btn-p" id="pay-cash" style="font-size:20px;padding:16px;">CASH</div>
              <div class="btn-p" id="pay-card" style="font-size:20px;padding:16px;">CARD</div>
            </div>
          </div>
          <div class="dlg-f">
            <div class="btn-s" id="pay-cancel">Cancel</div>
          </div>
        </div>
      `;
      el.appendChild(ov);

      $('pay-cancel').onclick = () => ov.remove();

      $('pay-cash').onclick = async () => {
        await printToRole('receipt', {
          type: 'FINAL_RECEIPT', method: 'CASH', check_number: check.id,
          server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
          total: totals.cash, dual_pricing: { cash: totals.cash, card: totals.card }, change: 0
        }, allItems);
        allItems.forEach(i => i.state = 'paid');
        showToast('Payment Successful', true);
        ov.remove();
        draw();
      };

      $('pay-card').onclick = () => {
        showToast('Processing Card...');
        setTimeout(async () => {
          await printToRole('receipt', {
            type: 'FINAL_RECEIPT', method: 'CARD', check_number: check.id,
            server: APP.staff?.name, subtotal: totals.sub, tax: totals.tax,
            total: totals.card, dual_pricing: { cash: totals.cash, card: totals.card }
          }, allItems);
          allItems.forEach(i => i.state = 'paid');
          showToast('Payment Successful', true);
          ov.remove();
          draw();
        }, 1500);
      };
    }

    function showMoveToSeatMenu() {
      const menu = document.createElement('div');
      menu.style.cssText = 'position:fixed; background:var(--bg2); border:2px solid var(--mint); z-index:110; padding:10px; display:flex; flex-direction:column; gap:5px;';
      const ctxRect = $('ctx-move').getBoundingClientRect();
      menu.style.top = `${ctxRect.top - 10}px`;
      menu.style.left = `${ctxRect.left}px`;
      menu.style.transform = 'translateY(-100%)';

      check.seats.forEach(s => {
        const btn = document.createElement('div');
        btn.className = 'btn-s';
        btn.style.fontSize = '14px';
        btn.textContent = `Seat ${s.id}`;
        btn.onclick = () => {
          moveSelectedToSeat(s.id);
          menu.remove();
        };
        menu.appendChild(btn);
      });

      const cancel = document.createElement('div');
      cancel.className = 'btn-d';
      cancel.style.fontSize = '14px';
      cancel.textContent = 'Cancel';
      cancel.onclick = () => menu.remove();
      menu.appendChild(cancel);

      document.body.appendChild(menu);

      // Close on tap outside
      setTimeout(() => {
        const closer = (e) => {
          if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closer);
          }
        };
        document.addEventListener('click', closer);
      }, 0);
    }

    function moveSelectedToSeat(seatId) {
      const selectedIds = Array.from(selectedItems);
      selectedIds.forEach(id => {
        let foundItem, foundSeat;
        check.seats.forEach(s => {
          const idx = s.items.findIndex(i => i.id === id);
          if (idx !== -1) {
            foundItem = s.items.splice(idx, 1)[0];
            foundSeat = s;
          }
        });
        if (foundItem) {
          const targetSeat = check.seats.find(s => s.id === seatId);
          targetSeat.items.push(foundItem);
        }
      });
      selectedItems.clear();
      draw();
    }

    function repeatSelectedItems() {
      const selectedIds = Array.from(selectedItems);
      selectedIds.forEach(id => {
        check.seats.forEach(s => {
          const item = s.items.find(i => i.id === id);
          if (item) {
            const newItem = JSON.parse(JSON.stringify(item));
            newItem.id = `item-${Date.now()}-${Math.random()}`;
            newItem.state = 'unsent';
            s.items.push(newItem);
          }
        });
      });
      selectedItems.clear();
      draw();
    }

    function addNoteToSelectedItems() {
      const note = prompt('Enter note for selected items:');
      if (note === null) return;

      const selectedIds = Array.from(selectedItems);
      selectedIds.forEach(id => {
        check.seats.forEach(s => {
          const item = s.items.find(i => i.id === id);
          if (item) item.note = note;
        });
      });
      selectedItems.clear();
      draw();
    }

    draw();
    return () => {
      window.onBackRequested = null;
    };
  },

  onExit() {
  }
});