// ──────────────────────────────────────────────────────────
//  KINDpos · Check Editing Scene (Vz1.0)
//  Primary work screen for order entry and editing
// ──────────────────────────────────────────────────────────

import { APP, $, fmtTime, greeting, calcOrder } from '../app.js';
import { registerScene, go } from '../scene-manager.js';
import { CFG, FALLBACK_MENU, MODIFIERS, MOD_PREFIXES } from '../config.js';

registerScene('check-editing', {
  onEnter(el, params) {
    const check = params.check || {
      id: `C-${Math.floor(Math.random() * 900) + 100}`,
      seats: [{ id: 1, items: [] }],
      activeSeat: 1
    };

    let activeSeatId = check.activeSeat || 1;
    let selectedItems = new Set();
    let isAllSeats = !check.activeSeat;

    const hasUnsentItems = () => check.seats.some(s => s.items.some(i => i.state === 'unsent'));

    window.onBackRequested = () => {
      if (hasUnsentItems()) {
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

    function draw() {
      el.innerHTML = `
        <div style="display:flex; height:100%; font-family:var(--fb);">
          <!-- Left Panel: Item Summary (Ticket) -->
          <div id="ticket-panel" style="width:340px; border-right:2px solid #444; display:flex; flex-direction:column; background:#1a1a1a;">
            <div style="padding:10px; border-bottom:1px solid #444; display:flex; align-items:center; gap:10px;">
              <div id="all-seats-btn" class="btn-s" style="flex:1; font-size:14px; padding:6px; ${isAllSeats ? 'background:var(--mint); color:var(--bg);' : ''}">All Seats</div>
            </div>
            <div id="ticket-items" style="flex:1; overflow-y:auto; padding:10px;">
              ${renderTicketItems()}
            </div>
            <div id="ticket-totals" style="padding:10px; border-top:2px solid #444; background:#1a1a1a;">
              ${renderTotals()}
            </div>
          </div>

          <!-- Right Panel -->
          <div id="right-panel" style="flex:1; display:flex; flex-direction:column; background:var(--bg2);">
            <!-- Seat Cards -->
            <div id="seat-cards" style="height:70px; border-bottom:1px solid #444; display:flex; align-items:center; padding:0 10px; gap:10px; overflow-x:auto;">
              ${renderSeatCards()}
            </div>

            <!-- Action Row & Main Area -->
            <div style="flex:1; display:flex; flex-direction:column;">
              <!-- Action Row -->
              <div style="height:50px; border-bottom:1px solid #444; display:flex; align-items:center; padding:0 10px; gap:10px;">
                <div class="btn-s" id="pay-btn" style="padding:8px 16px; font-size:16px;">Pay</div>
                <div class="btn-s" id="print-btn" style="padding:8px 16px; font-size:16px;">Print</div>
                <div class="btn-s" id="transfer-btn" style="padding:8px 16px; font-size:16px;">Transfer</div>
                <div style="flex:1"></div>
                <div id="add-item-btn" class="btn-p" style="padding:8px 24px; font-size:16px;">Add Item</div>
              </div>

              <!-- Right Panel Buttons (Persistent) -->
              <div style="flex:1; display:flex;">
                <div style="width:140px; display:flex; flex-direction:column; gap:8px; padding:10px; border-right:1px solid #444;">
                  <div class="btn-s" id="void-btn" style="color:var(--red); border-color:var(--red);">VOID</div>
                  <div class="btn-s" id="discount-btn">DISCOUNT</div>
                  <div class="btn-s" id="hold-btn" style="color:var(--yellow); border-color:var(--yellow);">HOLD</div>
                  <div class="btn-s" id="fire-btn" style="color:var(--cyan); border-color:var(--cyan);">FIRE</div>
                  <div class="btn-s" id="resend-btn">RESEND</div>
                </div>
                <div style="flex:1; display:flex; align-items:flex-end; justify-content:flex-end; padding:20px;">
                   <div id="send-btn" class="btn-p" style="width:180px; height:80px; font-size:24px; background:#39b54a; color:#fff;">SEND</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      bindEvents();
    }

    function renderTicketItems() {
      const seatsToShow = isAllSeats ? check.seats : check.seats.filter(s => s.id === activeSeatId);
      let html = '';

      if (check.seats.every(s => s.items.length === 0)) {
        return `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:#666; font-size:18px; letter-spacing:1px;">NO ITEMS YET</div>`;
      }

      seatsToShow.forEach(seat => {
        if (seat.items.length > 0 || !isAllSeats) {
          html += `<div style="color:var(--mint); font-size:12px; margin:10px 0 5px 0; border-bottom:1px solid var(--mint-dim);">SEAT ${seat.id}</div>`;
          const seatItems = seat.items;
          seatItems.forEach((item, idx) => {
            const isSelected = selectedItems.has(item.id);
            const color = getItemColor(item.state);
            
            // Calculate item total including modifiers
            let itemTotal = item.price;
            if (item.mods) {
              item.mods.forEach(m => { if (m.price) itemTotal += m.price; });
            }

            html += `
              <div class="ticket-item" data-id="${item.id}" style="padding:4px 8px; cursor:pointer; display:flex; justify-content:space-between; ${isSelected ? 'background:var(--mint); color:#222;' : `color:${color};`}">
                <div style="flex:1;">
                  <div style="font-size:16px; ${item.state === 'voided' ? 'text-decoration:line-through;' : ''}">${item.name}</div>
                  ${item.mods ? item.mods.map(m => `
                    <div style="display:flex; justify-content:space-between; font-size:12px; opacity:0.8; margin-left:15px; margin-top:2px;">
                      <span>${m.prefix} ${m.name}</span>
                      ${m.price > 0 ? `<span style="color:#fcbe40;">$${m.price.toFixed(2)}</span>` : ''}
                    </div>
                  `).join('') : ''}
                  ${item.note ? `<div style="font-size:12px; font-style:italic; opacity:0.8; margin-left:10px; color:var(--mint);">* ${item.note}</div>` : ''}
                </div>
                <div style="font-size:16px; margin-left:10px; min-width:60px; text-align:right;">$${itemTotal.toFixed(2)}</div>
              </div>
            `;
          });
        }
      });

      if (selectedItems.size > 0) {
        html += renderContextMenu();
      }

      return html;
    }

    function renderContextMenu() {
      const selectedArr = Array.from(selectedItems).map(id => {
        for (const s of check.seats) {
          const found = s.items.find(i => i.id === id);
          if (found) return found;
        }
      }).filter(Boolean);

      const allUnsent = selectedArr.every(i => i.state === 'unsent' || i.state === 'held');

      return `
        <div id="context-menu" style="margin-top:10px; background:var(--bg3); border:1px solid var(--mint); padding:5px; display:flex; flex-wrap:wrap; gap:5px; position:sticky; bottom:0;">
          <div class="btn-s" id="ctx-move" style="font-size:12px; padding:4px 8px;">Move to Seat \u2192</div>
          <div class="btn-s" id="ctx-repeat" style="font-size:12px; padding:4px 8px;">Repeat</div>
          <div class="btn-s" id="ctx-note" style="font-size:12px; padding:4px 8px;">Add Note</div>
          ${allUnsent ? `<div class="btn-s" id="ctx-mods" style="font-size:12px; padding:4px 8px;">Edit Mods</div>` : ''}
        </div>
      `;
    }

    function getItemColor(state) {
      switch (state) {
        case 'unsent': return '#33ffff';
        case 'sent': return '#666';
        case 'held': return '#ffff00';
        case 'voided': return '#ff3355';
        case 'paid': return '#fcbe40';
        default: return '#33ffff';
      }
    }

      const renderTotals = () => {
        const allItems = check.seats.flatMap(s => s.items).filter(i => i.state !== 'voided');
        const totals = calcOrder({ items: allItems });

        return `
          <div style="display:flex; justify-content:space-between; color:var(--mint); font-size:14px; margin-bottom:4px;">
            <span>Subtotal</span><span>$${totals.sub.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:var(--mint); font-size:14px; margin-bottom:4px;">
            <span>Tax</span><span>$${totals.tax.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; color:#fcbe40; font-size:22px; font-weight:bold; margin-top:8px;">
            <span>Total</span><span>$${totals.card.toFixed(2)}</span>
          </div>
        `;
      }

    function renderSeatCards() {
      let html = '';
      check.seats.forEach(seat => {
        const isActive = !isAllSeats && activeSeatId === seat.id;
        const sub = seat.items.filter(i => i.state !== 'voided').reduce((sum, i) => sum + i.price, 0);
        html += `
          <div class="seat-card" data-id="${seat.id}" style="flex:0 0 100px; height:50px; border:2px solid ${isActive ? '#39b54a' : '#444'}; border-radius:5px; background:var(--bg); display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; position:relative;">
            <div style="font-size:12px; font-weight:bold; color:${isActive ? '#39b54a' : 'var(--mint)'};">SEAT ${seat.id}</div>
            <div style="font-size:10px; color:#888;">${seat.items.length} items</div>
            <div style="font-size:10px; color:#fcbe40;">$${sub.toFixed(2)}</div>
          </div>
        `;
      });
      html += `
        <div id="add-seat-btn" style="flex:0 0 100px; height:50px; border:2px dashed #666; border-radius:5px; display:flex; align-items:center; justify-content:center; color:#666; cursor:pointer; font-size:14px;">+ SEAT</div>
      `;
      return html;
    }

    function bindEvents() {
      $('all-seats-btn').onclick = () => {
        isAllSeats = true;
        activeSeatId = null;
        selectedItems.clear();
        draw();
      };

      el.querySelectorAll('.seat-card').forEach(card => {
        card.onclick = () => {
          const id = parseInt(card.dataset.id);
          if (!isAllSeats && activeSeatId === id) {
            isAllSeats = true;
            activeSeatId = null;
          } else {
            isAllSeats = false;
            activeSeatId = id;
          }
          selectedItems.clear();
          draw();
        };
      });

      $('add-seat-btn').onclick = () => {
        const nextId = check.seats.length + 1;
        check.seats.push({ id: nextId, items: [] });
        activeSeatId = nextId;
        isAllSeats = false;
        selectedItems.clear();
        draw();
      };

      el.querySelectorAll('.ticket-item').forEach(itemEl => {
        itemEl.onclick = (e) => {
          const id = itemEl.dataset.id;
          if (selectedItems.has(id)) selectedItems.delete(id);
          else selectedItems.add(id);
          draw();
        };
      });

      // Clear selection when tapping ticket-items area (but not items themselves)
      $('ticket-items').onclick = (e) => {
        if (e.target.id === 'ticket-items') {
          selectedItems.clear();
          draw();
        }
      };

      $('add-item-btn').onclick = () => {
        showAddItemOverlay();
      };

      $('staged-list')?.querySelectorAll('.staged-item').forEach(el => {
        el.onclick = () => {
          const idx = parseInt(el.dataset.idx);
          if (selectedStaged.has(idx)) selectedStaged.delete(idx);
          else selectedStaged.add(idx);
          renderOverlay();
        };
      });

      const modifyBtn = $('staged-modify');
      if (modifyBtn) {
        modifyBtn.onclick = (e) => {
          e.stopPropagation();
          const items = Array.from(selectedStaged).map(idx => stagedItems[idx]);
          showModifierModal(items, () => {
            selectedStaged.clear();
            renderOverlay();
          });
        };
      }

      if ($('context-menu')) {
        $('ctx-move').onclick = (e) => {
          e.stopPropagation();
          showMoveToSeatMenu();
        };
        $('ctx-repeat').onclick = (e) => {
          e.stopPropagation();
          repeatSelectedItems();
        };
        $('ctx-note').onclick = (e) => {
          e.stopPropagation();
          addNoteToSelectedItems();
        };
        const modsBtn = $('ctx-mods');
        if (modsBtn) modsBtn.onclick = (e) => {
          e.stopPropagation();
          showModifierModal(selectedArr, () => {
            selectedItems.clear();
          });
        };
      }

      const selectedArr = Array.from(selectedItems).map(id => {
        for (const s of check.seats) {
          const found = s.items.find(i => i.id === id);
          if (found) return found;
        }
      }).filter(Boolean);

      const anyUnsent = selectedArr.some(i => i.state === 'unsent');
      const anySent = selectedArr.some(i => i.state === 'sent');
      const anyHeld = selectedArr.some(i => i.state === 'held');

      // VOID
      const voidBtn = $('void-btn');
      if (selectedArr.length === 0) voidBtn.classList.add('btn-off');
      else {
        voidBtn.onclick = () => {
          if (anySent) {
            // Manager gate
            showPinGate("VOID SENT ITEMS", (approved) => {
              if (approved) {
                selectedArr.forEach(i => i.state = 'voided');
                selectedItems.clear();
                draw();
              }
            });
          } else {
            selectedArr.forEach(i => {
              if (i.state === 'unsent' || i.state === 'held') {
                check.seats.forEach(s => {
                  s.items = s.items.filter(it => it.id !== i.id);
                });
              } else {
                i.state = 'voided';
              }
            });
            selectedItems.clear();
            draw();
          }
        };
      }

      // DISCOUNT
      const discountBtn = $('discount-btn');
      if (selectedArr.length === 0) discountBtn.classList.add('btn-off');
      else {
        discountBtn.onclick = () => {
           showPinGate("APPLY DISCOUNT", (approved) => {
             if (approved) {
               const pct = prompt("Discount %:", "20");
               if (pct) {
                 selectedArr.forEach(i => {
                   i.price *= (1 - (parseInt(pct) / 100));
                   i.mods = i.mods || [];
                   i.mods.push(`DISC ${pct}%`);
                 });
                 selectedItems.clear();
                 draw();
               }
             }
           });
        };
      }

      // HOLD
      const holdBtn = $('hold-btn');
      if (!anyUnsent) holdBtn.classList.add('btn-off');
      else {
        holdBtn.onclick = () => {
          selectedArr.forEach(i => { if (i.state === 'unsent') i.state = 'held'; });
          selectedItems.clear();
          draw();
        };
      }

      // FIRE
      const fireBtn = $('fire-btn');
      if (!anyHeld) fireBtn.classList.add('btn-off');
      else {
        fireBtn.onclick = () => {
          selectedArr.forEach(i => { if (i.state === 'held') i.state = 'unsent'; });
          selectedItems.clear();
          draw();
        };
      }

      // RESEND
      const resendBtn = $('resend-btn');
      resendBtn.onclick = async () => {
        if (confirm("Resend all items to kitchen?")) {
          const byRole = getItemsByRole();
          if (byRole.kitchen.length > 0) {
              await printToRole('kitchen', { header: '*** RESEND ***' }, byRole.kitchen);
          }
          if (byRole.bar.length > 0) {
              await printToRole('bar', { header: '*** RESEND ***' }, byRole.bar);
          }
          showToast("Sent items RESENT to kitchen", true);
        }
      };

      // SEND
      const sendBtn = $('send-btn');
      const unsentNonHeld = check.seats.flatMap(s => s.items).filter(i => i.state === 'unsent');
      if (unsentNonHeld.length === 0) sendBtn.classList.add('btn-off');
      else {
        sendBtn.onclick = async () => {
          const routingData = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"savedPrinters":[],"categoryRouting":{}}');
          const mapping = routingData.categoryRouting;
          const itemsToPrint = unsentNonHeld;

          const toKitchen = itemsToPrint.filter(i => (mapping[i.category_id] || 'kitchen') === 'kitchen');
          const toBar = itemsToPrint.filter(i => (mapping[i.category_id] || 'kitchen') === 'bar');

          if (toKitchen.length > 0) await printToRole('kitchen', { type: 'SEND' }, toKitchen);
          if (toBar.length > 0) await printToRole('bar', { type: 'SEND' }, toBar);

          unsentNonHeld.forEach(i => i.state = 'sent');
          showToast("Order SENT to kitchen", true);
          selectedItems.clear();
          draw();
        };
      }

      // PAY
      $('pay-btn').onclick = () => showPaymentPanel();

      // PRINT
      $('print-btn').onclick = async () => {
        const items = check.seats.flatMap(s => s.items);
        await printToRole('receipt', { 
            type: 'GUEST_CHECK',
            check_number: check.id,
            server: APP.staff.name,
            subtotal: totals.subtotal,
            tax: totals.tax,
            total: totals.total,
            dual_pricing: {
                cash: totals.cash,
                card: totals.card
            }
        }, items);
        showToast("Guest Check PRINTED", true);
      };

      // TRANSFER
      const transferBtn = $('transfer-btn');
      if (selectedArr.length === 0) transferBtn.classList.add('btn-off');
      else {
        transferBtn.onclick = () => showTransferModal(selectedArr);
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

    function showAddItemOverlay() {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed; inset:0; background:var(--bg); z-index:150; display:flex; flex-direction:column; font-family:var(--fb);';

      let stagedItems = [];
      let selectedStaged = new Set();
      let navPath = []; // [category, subcategory]
      let navPositions = {}; // stores {name: {x, y}} for anchoring
      let currentLevel = 'categories'; // categories, subcategories, items

      const renderOverlay = () => {
        const activeSeatLabel = isAllSeats ? 'Seat 1' : `Seat ${activeSeatId}`;
        ov.innerHTML = `
          <!-- TBar -->
          <div style="height:var(--bar-h); background:var(--mint); color:var(--bg); font-family:var(--fh); display:flex; align-items:center; justify-content:space-between; padding:0 10px; font-size:20px;">
            <div style="display:flex; align-items:center; gap:10px;">
               <div id="add-cancel" class="btn-s" style="height:24px; font-size:14px; background:var(--bg); color:var(--mint);">CANCEL</div>
               <span>Adding Items \u2014 ${activeSeatLabel}</span>
            </div>
          </div>
          
          <div style="flex:1; display:flex; overflow:hidden;">
            <!-- Left: Running List -->
            <div style="width:300px; border-right:2px solid #444; background:#1a1a1a; display:flex; flex-direction:column;">
              <div id="staged-list" style="flex:1; overflow-y:auto; padding:10px;">
                ${stagedItems.map((item, idx) => {
                  let itemTotal = item.price;
                  if (item.mods) item.mods.forEach(m => { if (m.price) itemTotal += m.price; });
                  return `
                    <div class="staged-item" data-idx="${idx}" style="padding:4px 8px; border-bottom:1px solid #333; cursor:pointer; ${selectedStaged.has(idx) ? 'background:var(--mint); color:#222;' : 'color:var(--cyan);'}">
                      <div style="display:flex; justify-content:space-between;">
                        <span style="font-size:14px;">${idx + 1}. ${item.name}</span>
                        <span style="font-size:14px;">$${itemTotal.toFixed(2)}</span>
                      </div>
                      ${item.mods ? item.mods.map(m => `
                        <div style="display:flex; justify-content:space-between; font-size:11px; opacity:0.7; margin-left:15px; margin-top:1px;">
                          <span>${m.prefix} ${m.name}</span>
                          ${m.price > 0 ? `<span style="color:#fcbe40;">$${m.price.toFixed(2)}</span>` : ''}
                        </div>
                      `).join('') : ''}
                    </div>
                  `;
                }).join('')}
              </div>
              <div style="padding:10px; border-top:1px solid #444; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:14px; color:var(--mint);">Items: ${stagedItems.length}</span>
                ${selectedStaged.size > 0 ? `<div id="staged-modify" class="btn-s" style="font-size:12px; padding:4px 8px;">MODIFY</div>` : ''}
              </div>
            </div>

            <!-- Right: Hex Nav Panel -->
            <div style="flex:1; display:flex; flex-direction:column;">
              <div id="hex-panel" style="flex:1; position:relative; overflow:hidden; background:var(--bg2);">
                <svg id="hex-svg" width="100%" height="100%" style="display:block;"></svg>
              </div>
              <!-- Bottom action bar -->
              <div style="height:50px; border-top:2px solid #444; background:var(--bg); display:flex; align-items:center; justify-content:flex-end; gap:10px; padding:0 10px;">
                <div id="clr-btn" class="btn-s" style="padding:8px 24px; font-size:16px; border:2px solid var(--red); color:var(--red); ${stagedItems.length === 0 ? 'opacity:0.5; pointer-events:none;' : ''}">CLR</div>
                <div id="add-confirm" class="btn-p" style="padding:8px 24px; font-size:16px; ${stagedItems.length === 0 ? 'opacity:0.5; pointer-events:none;' : ''}">CONFIRM</div>
              </div>
            </div>
          </div>
        `;

        renderHexGrid();
        bindOverlayEvents();
      };

      const bindOverlayEvents = () => {
        $('add-confirm').onclick = (e) => {
          e.stopPropagation();
          const targetSeatId = isAllSeats ? 1 : activeSeatId;
          const targetSeat = check.seats.find(s => s.id === targetSeatId);
          stagedItems.forEach(item => {
            item.id = `item-${Date.now()}-${Math.random()}`;
            item.state = 'unsent';
            targetSeat.items.push(item);
          });
          ov.remove();
          draw();
        };

        $('add-cancel').onclick = (e) => {
          e.stopPropagation();
          if (stagedItems.length > 0) {
            if (confirm(`Discard ${stagedItems.length} items?`)) ov.remove();
          } else {
            ov.remove();
          }
        };

        $('clr-btn').onclick = (e) => {
          e.stopPropagation();
          stagedItems.pop();
          selectedStaged.clear();
          renderOverlay();
        };

        ov.querySelectorAll('.staged-item').forEach(el => {
          el.onclick = () => {
            const idx = parseInt(el.dataset.idx);
            if (selectedStaged.has(idx)) selectedStaged.delete(idx);
            else selectedStaged.add(idx);
            renderOverlay();
          };
        });

        const modifyBtn = $('staged-modify');
        if (modifyBtn) {
          modifyBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const items = Array.from(selectedStaged).map(idx => stagedItems[idx]);
            const hexPanel = ov.querySelector('#hex-panel');
            showModifierModal(items, null, {
              container: hexPanel,
              closeMod: () => {
                selectedStaged.clear();
                renderOverlay();
              }
            });
          };
        }
      };

      const renderHexGrid = () => {
        const svg = ov.querySelector('#hex-svg');
        if (!svg) return;
        svg.innerHTML = '';

        const GAP = 1.05;
        const CAT_R = 55;   // category radius
        const SUB_R = 42;   // subcategory radius
        const ITEM_R = 32;  // item radius
        const categories = Object.keys(FALLBACK_MENU);
        const colors = ['#FF8C00', '#00CED1', '#39b54a', '#E84040', '#fcbe40', '#b48efa'];

        // ── Ring positions (pointy-top, starting at 3 o'clock) ──
        // Places children around a parent, skipping occupied faces
        function getChildPositions(px, py, parentR, childR, count, occupiedAngles) {
          const dist = (parentR + childR) * GAP;
          const positions = [];
          // 6 face positions at 60° intervals starting at 0° (3 o'clock)
          for (let face = 0; face < 6 && positions.length < count; face++) {
            const angle = (Math.PI / 3) * face;
            // Check if face is occupied
            let skip = false;
            if (occupiedAngles) {
              for (const oa of occupiedAngles) {
                const diff = Math.abs(angle - oa);
                if (diff < 0.3 || Math.abs(diff - 2 * Math.PI) < 0.3) { skip = true; break; }
              }
            }
            if (!skip) {
              positions.push({
                x: px + dist * Math.cos(angle),
                y: py + dist * Math.sin(angle)
              });
            }
          }
          // Ring 2 if needed (12 positions at 30° intervals)
          if (positions.length < count) {
            const dist2 = (parentR + childR) * 2.1;
            for (let i = 0; i < 12 && positions.length < count; i++) {
              const angle = (Math.PI / 6) * i;
              positions.push({
                x: px + dist2 * Math.cos(angle),
                y: py + dist2 * Math.sin(angle)
              });
            }
          }
          return positions.slice(0, count);
        }

        // ── Compute angle from parent to child (for face occupancy) ──
        function angleBetween(px, py, cx, cy) {
          let a = Math.atan2(cy - py, cx - px);
          if (a < 0) a += 2 * Math.PI;
          return a;
        }

        // ── Category honeycomb (pointy-top, starts at 3 o'clock) ──
        function catPositions(sx, sy, r, count) {
          const pos = [{ x: sx, y: sy }];
          const dist = r * 2 * GAP;
          for (let i = 0; i < Math.min(count - 1, 6); i++) {
            const angle = (Math.PI / 3) * i;
            pos.push({ x: sx + dist * Math.cos(angle), y: sy + dist * Math.sin(angle) });
          }
          return pos.slice(0, count);
        }

        const startX = 180, startY = 180;

        // ═════════════════════════════
        //  LEVEL: Categories
        // ═════════════════════════════
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
              renderOverlay();
            });
          });
        }

        // ═════════════════════════════
        //  LEVEL: Subcategories
        // ═════════════════════════════
        else if (currentLevel === 'subcategories') {
          const catName = navPath[0];
          const catIdx = categories.indexOf(catName);
          const catColor = colors[catIdx % colors.length];
          const ax = navPositions[catName]?.x || startX;
          const ay = navPositions[catName]?.y || startY;

          // Draw category ancestor (filled)
          drawHex(svg, ax, ay, CAT_R, catName, catColor, () => {
            currentLevel = 'categories';
            navPath = [];
            renderOverlay();
          }, true);

          // Bloom subcategories around category (no occupied faces at this level)
          const subcats = Object.keys(FALLBACK_MENU[catName]);
          const subPositions = getChildPositions(ax, ay, CAT_R, SUB_R, subcats.length, null);

          subcats.forEach((sub, i) => {
            const p = subPositions[i];
            navPositions[sub] = { x: p.x, y: p.y };
            drawHex(svg, p.x, p.y, SUB_R, sub, catColor, () => {
              navPath = [catName, sub];
              currentLevel = 'items';
              renderOverlay();
            });
          });
        }

        // ═════════════════════════════
        //  LEVEL: Items
        // ═════════════════════════════
        else if (currentLevel === 'items') {
          const catName = navPath[0];
          const catIdx = categories.indexOf(catName);
          const catColor = colors[catIdx % colors.length];
          const catData = FALLBACK_MENU[catName];
          const ax = navPositions[catName]?.x || startX;
          const ay = navPositions[catName]?.y || startY;

          // Draw category ancestor (filled)
          drawHex(svg, ax, ay, CAT_R, catName, catColor, () => {
            currentLevel = 'categories';
            navPath = [];
            renderOverlay();
          }, true);

          let items, parentX, parentY, parentR, occupiedAngles;

          if (Array.isArray(catData)) {
            // Flat category — items bloom directly around category
            items = catData;
            parentX = ax; parentY = ay; parentR = CAT_R;
            occupiedAngles = null;
          } else {
            // Has subcategories — draw subcat ancestor (filled), items bloom around it
            const subName = navPath[1];
            const sx = navPositions[subName]?.x || ax + 120;
            const sy = navPositions[subName]?.y || ay + 80;

            drawHex(svg, sx, sy, SUB_R, subName, catColor, () => {
              currentLevel = 'subcategories';
              navPath = [catName];
              renderOverlay();
            }, true);

            items = catData[subName] || [];
            parentX = sx; parentY = sy; parentR = SUB_R;
            // The face toward the category ancestor is occupied
            occupiedAngles = [angleBetween(sx, sy, ax, ay)];
          }

          // Bloom items around parent, avoiding occupied faces
          const itemPositions = getChildPositions(parentX, parentY, parentR, ITEM_R, items.length, occupiedAngles);

          items.forEach((item, i) => {
            const p = itemPositions[i];
            const is86 = item.is86 || false;
            const isSpecial = item.isSpecial || false;

            drawHex(svg, p.x, p.y, ITEM_R, item.name,
              is86 ? '#666' : (isSpecial ? '#fcbe40' : catColor),
              () => {
                if (is86) return;
                const newItem = {...item};
                if (item.requiresMod) {
                  const hexPanel = ov.querySelector('#hex-panel');
                  showModifierModal([newItem], null, {
                    container: hexPanel,
                    closeMod: (isCancel) => {
                      if (!isCancel) stagedItems.push(newItem);
                      renderOverlay();
                    }
                  });
                } else {
                  stagedItems.push(newItem);
                  renderOverlay();
                }
              }, false, is86, isSpecial);
          });
        }
      };

      el.appendChild(ov);
      renderOverlay();
    }

    function showPaymentPanel() {
      const rightPanel = $('right-panel');
      const originalHTML = rightPanel.innerHTML;

      const allItems = check.seats.flatMap(s => s.items).filter(i => i.state !== 'voided');
      const subtotal = allItems.reduce((sum, i) => sum + i.price, 0);
      const tax = subtotal * CFG.TAX;
      const total = subtotal + tax;

      rightPanel.innerHTML = `
        <div style="flex:1; display:flex; flex-direction:column; background:var(--bg2); padding:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <div style="font-family:var(--fh); font-size:24px; color:var(--mint);">PAYMENT</div>
            <div id="pay-cancel" class="btn-s" style="padding:10px 20px;">BACK</div>
          </div>
          
          <div style="flex:1; display:flex; flex-direction:column; gap:20px;">
            <div style="background:var(--bg); border:2px solid #444; padding:20px; display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:18px; color:var(--mint);">TOTAL DUE</span>
              <span style="font-size:32px; color:#fcbe40; font-weight:bold;">$${total.toFixed(2)}</span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; flex:1;">
               <div class="btn-p" id="pay-cash" style="font-size:20px;">CASH</div>
               <div class="btn-p" id="pay-card" style="font-size:20px;">CARD</div>
            </div>
          </div>
        </div>
      `;

      $('pay-cancel').onclick = () => {
        rightPanel.innerHTML = originalHTML;
        bindEvents();
      };

      $('pay-cash').onclick = async () => {
        const items = check.seats.flatMap(s => s.items);
        await printToRole('receipt', { 
            type: 'FINAL_RECEIPT',
            method: 'CASH',
            check_number: check.id,
            server: APP.staff.name,
            subtotal: totals.subtotal,
            tax: totals.tax,
            total: totals.cash, // Emphasize total matching actual payment method
            dual_pricing: {
                cash: totals.cash,
                card: totals.card
            },
            change: 0 // Assume exact for now
        }, items);
        allItems.forEach(i => i.state = 'paid');
        showToast("Payment Successful", true);
        rightPanel.innerHTML = originalHTML;
        bindEvents();
        draw();
      };

      $('pay-card').onclick = () => {
        showToast("Processing Card...");
        setTimeout(async () => {
          const items = check.seats.flatMap(s => s.items);
          await printToRole('receipt', { 
              type: 'FINAL_RECEIPT',
              method: 'CARD',
              check_number: check.id,
              server: APP.staff.name,
              subtotal: totals.subtotal,
              tax: totals.tax,
              total: totals.card,
              dual_pricing: {
                  cash: totals.cash,
                  card: totals.card
              }
          }, items);
          allItems.forEach(i => i.state = 'paid');
          showToast("Payment Successful", true);
          rightPanel.innerHTML = originalHTML;
          bindEvents();
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