import { registerScene, go } from '../scene-manager.js';
import { T, chamfer, overlayCloseBtn, btnWrap } from '../theme-manager.js';
import { FALLBACK_MENU, MODIFIERS, MOD_PREFIXES } from '../config.js';
import { APP, apiFetch } from '../app.js';
import { HexNav } from '../hex-nav.js';

// ── Menu Data Transformers ──

const CATEGORY_COLORS = {
  Food: 'var(--mint)', Drinks: 'var(--cyan)', Desserts: 'var(--lavender)',
  Produce: 'var(--mint)', Protein: 'var(--gold)', Sauce: 'var(--cyan)',
};

function buildHexMenuData(menu) {
  const children = [];
  for (const [catName, catVal] of Object.entries(menu)) {
    const color = CATEGORY_COLORS[catName] || 'var(--mint)';
    const cat = { id: catName.toLowerCase(), label: catName.toUpperCase(), color };
    cat.children = transformNode(catVal, color);
    children.push(cat);
  }
  return children;
}

function transformNode(val, color) {
  if (Array.isArray(val)) {
    return val.map(item => ({
      id: item.name.toLowerCase().replace(/\s+/g, '-'),
      label: item.name, price: item.price, color,
      is86: item.is86 || false,
    }));
  }
  return Object.entries(val).map(([key, sub]) => ({
    id: key.toLowerCase().replace(/\s+/g, '-'),
    label: key.toUpperCase(), color,
    children: transformNode(sub, color),
  }));
}

// ── Modifier Data Transformer ──
// Builds hex data for MODIFIERS config, adding PREP and TEMPS virtual categories

function buildHexModData(modifiers) {
  const children = [];

  // PREP category — prefix-only actions (no real item, just sets prefix)
  children.push({
    id: 'prep', label: 'PREP', color: 'var(--gold)',
    children: MOD_PREFIXES.map(p => ({
      id: `prefix-${p.toLowerCase().replace(/\s+/g, '-')}`,
      label: p, color: 'var(--gold)', isPrefix: true,
    })),
  });

  // TEMPS category
  const temps = ['Rare', 'Med Rare', 'Medium', 'Med Well', 'Well Done'];
  children.push({
    id: 'temps', label: 'TEMPS', color: 'var(--cyan)',
    children: temps.map(t => ({
      id: `temp-${t.toLowerCase().replace(/\s+/g, '-')}`,
      label: t, price: 0, color: 'var(--cyan)',
    })),
  });

  // Standard modifier categories from config
  for (const [catName, catVal] of Object.entries(modifiers)) {
    const color = CATEGORY_COLORS[catName] || 'var(--mint)';
    children.push({
      id: catName.toLowerCase(), label: catName.toUpperCase(), color,
      children: catVal.map(item => ({
        id: item.name.toLowerCase().replace(/\s+/g, '-'),
        label: item.name, price: item.price, color,
      })),
    });
  }

  return children;
}

// ── Unique ID generator ──
function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

registerScene('add-items', {
  onEnter(el, p) {
    const currentCheck = p.check || null;
    const currentSeat = p.seat || 0;
    let stagedItems = [];       // array of line item objects
    let selectedLineId = null;  // id of the currently selected ticket line
    let activeMode = p.mode || 'items';
    let activePrefix = 'ADD';
    let offlineQueue = [];      // queued API calls for offline mode

    // If editing modifiers on a specific existing item, pre-load it
    if (p.targetItem) {
      const line = createLineItem(p.targetItem, currentSeat);
      line.modifiers = p.targetItem.modifiers || [];
      stagedItems.push(line);
      selectedLineId = line.id;
      activeMode = 'modifiers';
    }

    el.style.position = 'relative';

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;">
        <div style="display:flex;flex:1;gap:0;overflow:hidden;">
          ${buildTicketPanel()}
          ${buildRightArea()}
        </div>
      </div>
    `;

    bindActionBar();
    updateToggleStyles();
    if (activeMode === 'modifiers') showPrefixRow(); else hidePrefixRow();

    // Mount hex navigation in workspace
    const workspace = document.getElementById('menu-workspace');
    const hexNav = new HexNav(workspace, {
      data: activeMode === 'modifiers'
        ? buildHexModData(MODIFIERS)
        : buildHexMenuData(FALLBACK_MENU),
      onSelect: (item) => handleItemSelected(item),
      onBack: () => {},
    });

    renderTicketPanel();

    // Back navigation
    window.onBackRequested = () => {
      if (stagedItems.length === 0) {
        go('check-overview', { check: currentCheck, seat: currentSeat });
      } else {
        showDiscardDialog();
      }
    };

    return () => {
      hexNav.destroy();
      window.onBackRequested = null;
      stagedItems = [];
    };

    // ═══════════════════════════════════════
    //  LINE ITEM FACTORY
    // ═══════════════════════════════════════

    function createLineItem(item, seat) {
      return {
        id: genId(),
        itemId: item.id,
        name: item.label || item.name,
        category: findCategory(item.id),
        quantity: 1,
        modifiers: [],
        unitPrice: item.price || 0,
        lineTotal: item.price || 0,
        seat: seat === 0 ? null : seat,
      };
    }

    function findCategory(itemId) {
      // Walk FALLBACK_MENU to find parent category
      for (const [cat, catVal] of Object.entries(FALLBACK_MENU)) {
        if (containsItem(catVal, itemId)) return cat;
      }
      return null;
    }

    function containsItem(node, itemId) {
      if (Array.isArray(node)) {
        return node.some(i => i.name.toLowerCase().replace(/\s+/g, '-') === itemId);
      }
      for (const sub of Object.values(node)) {
        if (containsItem(sub, itemId)) return true;
      }
      return false;
    }

    function recalcLineTotal(line) {
      line.lineTotal = line.unitPrice * line.quantity;
    }

    // ═══════════════════════════════════════
    //  LAYOUT BUILDERS
    // ═══════════════════════════════════════

    function buildTicketPanel() {
      return `<div style="width:310px;flex-shrink:0;background:${T.bg2};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};display:flex;flex-direction:column;overflow:hidden;margin:8px 0 8px 8px;">
        <div id="add-ticket-panel" style="flex:1;overflow-y:auto;padding:8px 10px;"></div>
        <div id="add-ticket-total" style="padding:6px 10px;border-top:2px solid rgba(198,255,187,0.15);flex-shrink:0;"></div>
      </div>`;
    }

    function buildRightArea() {
      return `<div style="flex:1;display:flex;flex-direction:column;gap:0;padding:8px 8px 8px 8px;">
        <div id="prefix-row" style="display:none;height:48px;align-items:center;gap:10px;padding:4px 12px;flex-shrink:0;"></div>
        <div id="menu-workspace" style="flex:1;background:${T.bg};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};position:relative;overflow:hidden;">
        </div>
        ${buildActionBar()}
      </div>`;
    }

    function buildActionBar() {
      return `<div id="add-action-bar" style="height:50px;display:flex;align-items:center;gap:12px;padding:0 12px;flex-shrink:0;">
        <div class="btn-wrap">
          <div id="toggle-items" style="font-family:${T.fb};font-size:26px;height:40px;padding:0 16px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('sm')};">+ Items</div>
        </div>
        <div class="btn-wrap">
          <div id="toggle-mods" style="font-family:${T.fb};font-size:26px;height:40px;padding:0 16px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('sm')};">+ Modifiers</div>
        </div>
        <div style="flex:1;"></div>
        <div class="btn-wrap">
          <div id="btn-back" style="width:44px;height:44px;background:${T.clrRed};color:${T.mint};font-family:${T.fb};font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('md')};">&larr;</div>
        </div>
        <div class="btn-wrap">
          <div id="btn-confirm" style="width:44px;height:44px;background:${T.goGreen};color:${T.bg};font-family:${T.fb};font-size:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('md')};">&gt;&gt;&gt;</div>
        </div>
      </div>`;
    }

    // ═══════════════════════════════════════
    //  TOGGLE & PREFIX
    // ═══════════════════════════════════════

    function updateToggleStyles() {
      const itemsBtn = document.getElementById('toggle-items');
      const modsBtn = document.getElementById('toggle-mods');
      if (itemsBtn) {
        if (activeMode === 'items') {
          itemsBtn.style.background = T.mint;
          itemsBtn.style.color = T.bg;
          itemsBtn.style.border = 'none';
        } else {
          itemsBtn.style.background = 'transparent';
          itemsBtn.style.color = T.mint;
          itemsBtn.style.border = 'none';
        }
      }
      if (modsBtn) {
        if (activeMode === 'modifiers') {
          modsBtn.style.background = T.gold;
          modsBtn.style.color = T.bg;
          modsBtn.style.border = 'none';
        } else {
          modsBtn.style.background = 'transparent';
          modsBtn.style.color = T.gold;
          modsBtn.style.border = `3px solid ${T.gold}`;
        }
      }
    }

    function showPrefixRow() {
      const row = document.getElementById('prefix-row');
      if (!row) return;
      row.style.display = 'flex';
      renderPrefixRow();
    }

    function hidePrefixRow() {
      const row = document.getElementById('prefix-row');
      if (row) row.style.display = 'none';
    }

    function renderPrefixRow() {
      const row = document.getElementById('prefix-row');
      if (!row) return;
      row.innerHTML = MOD_PREFIXES.map(prefix => {
        const isActive = activePrefix === prefix;
        const bg = isActive ? T.mint : 'transparent';
        const color = isActive ? T.bg : T.mint;
        const border = isActive ? 'none' : `2px solid ${T.mint}`;
        return `<div class="btn-wrap"><div class="prefix-pick" data-prefix="${prefix}" style="background:${bg};color:${color};border:${border};font-family:${T.fb};font-size:24px;height:40px;padding:0 16px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('sm')};">${prefix}</div></div>`;
      }).join('');

      row.querySelectorAll('.prefix-pick').forEach(btn => {
        btn.addEventListener('click', () => {
          activePrefix = btn.dataset.prefix;
          renderPrefixRow();
        });
      });
    }

    function setMode(mode) {
      activeMode = mode;
      if (mode === 'items') {
        hidePrefixRow();
        hexNav.setData(buildHexMenuData(FALLBACK_MENU));
      } else {
        // If no line selected, auto-select the last added item
        if (!selectedLineId && stagedItems.length > 0) {
          selectedLineId = stagedItems[stagedItems.length - 1].id;
          renderTicketPanel();
        }
        // If still no items, flash the ticket panel border to indicate
        if (stagedItems.length === 0) {
          flashTicketBorder();
          activeMode = 'items'; // revert
          updateToggleStyles();
          return;
        }
        showPrefixRow();
        hexNav.setData(buildHexModData(MODIFIERS));
      }
      updateToggleStyles();
    }

    function flashTicketBorder() {
      const panel = document.getElementById('add-ticket-panel')?.parentElement;
      if (!panel) return;
      const orig = panel.style.borderColor;
      panel.style.borderColor = T.gold;
      setTimeout(() => { panel.style.borderColor = orig; }, 400);
    }

    // ═══════════════════════════════════════
    //  ITEM SELECTION
    // ═══════════════════════════════════════

    function handleItemSelected(item) {
      if (activeMode === 'items') {
        addItemToTicket(item);
      } else if (activeMode === 'modifiers') {
        addModifierToSelected(item);
      }
    }

    function addItemToTicket(item) {
      // Check if same item already exists (without modifiers) — increment qty
      const existing = stagedItems.find(
        si => si.itemId === item.id && si.modifiers.length === 0
      );
      if (existing) {
        existing.quantity++;
        recalcLineTotal(existing);
        selectedLineId = existing.id;
      } else {
        const line = createLineItem(item, currentSeat);
        stagedItems.push(line);
        selectedLineId = line.id;
      }
      renderTicketPanel();
    }

    function addModifierToSelected(item) {
      // Handle prefix-only items (from PREP category)
      if (item.isPrefix) {
        activePrefix = item.label;
        renderPrefixRow();
        return;
      }

      const target = stagedItems.find(si => si.id === selectedLineId);
      if (!target) {
        // Auto-select last item if nothing selected
        if (stagedItems.length > 0) {
          selectedLineId = stagedItems[stagedItems.length - 1].id;
          addModifierToSelected(item);
        }
        return;
      }

      target.modifiers.push({
        id: genId(),
        name: item.label,
        prefix: activePrefix,
      });
      renderTicketPanel();
    }

    // ═══════════════════════════════════════
    //  TICKET PANEL RENDER
    // ═══════════════════════════════════════

    function renderTicketPanel() {
      const panel = document.getElementById('add-ticket-panel');
      if (!panel) return;

      if (stagedItems.length === 0) {
        panel.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(198,255,187,0.35);font-family:${T.fb};font-size:18px;user-select:none;">Tap an item to begin</div>`;
        renderTicketTotal();
        return;
      }

      panel.innerHTML = stagedItems.map(line => {
        const isSelected = line.id === selectedLineId;
        const selBg = isSelected ? 'rgba(255,215,0,0.12)' : 'transparent';
        const selBorder = isSelected ? `2px solid ${T.mint}` : '2px solid transparent';

        let html = `<div class="ticket-line" data-line-id="${line.id}" style="background:${selBg};border:${selBorder};padding:4px 6px;margin-bottom:2px;cursor:pointer;position:relative;">`;

        // Main item row
        html += `<div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="color:${T.mint};font-family:${T.fb};font-size:22px;">x${line.quantity} ${line.name}</span>
          <span style="color:${T.gold};font-family:${T.fb};font-size:22px;">$${line.lineTotal.toFixed(2)}</span>
        </div>`;

        // Modifiers
        if (line.modifiers.length > 0) {
          line.modifiers.forEach(mod => {
            html += `<div style="padding:2px 0 2px 16px;">
              <span style="background:${T.gold};color:${T.bg};font-family:${T.fb};font-size:18px;padding:1px 6px;clip-path:${chamfer('sm')};">
                ${mod.prefix} ${mod.name}
              </span>
            </div>`;
          });
        }

        // Remove button (visible when selected)
        if (isSelected) {
          html += `<div class="line-remove-btn" data-remove-id="${line.id}" style="position:absolute;top:4px;right:-2px;width:28px;height:28px;background:${T.clrRed};color:#fff;font-family:${T.fb};font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('sm')};">&minus;</div>`;
        }

        html += `</div>`;
        return html;
      }).join('');

      // Bind line click events
      panel.querySelectorAll('.ticket-line').forEach(lineEl => {
        lineEl.addEventListener('click', (e) => {
          // Don't toggle selection when clicking remove
          if (e.target.closest('.line-remove-btn')) return;
          const lineId = lineEl.dataset.lineId;
          if (selectedLineId === lineId) {
            selectedLineId = null; // deselect
          } else {
            selectedLineId = lineId;
          }
          renderTicketPanel();
        });
      });

      // Bind remove buttons
      panel.querySelectorAll('.line-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const removeId = btn.dataset.removeId;
          const line = stagedItems.find(si => si.id === removeId);
          if (!line) return;

          if (line.quantity > 1) {
            line.quantity--;
            recalcLineTotal(line);
          } else {
            stagedItems = stagedItems.filter(si => si.id !== removeId);
            if (selectedLineId === removeId) {
              selectedLineId = stagedItems.length > 0
                ? stagedItems[stagedItems.length - 1].id
                : null;
            }
          }
          renderTicketPanel();
        });
      });

      renderTicketTotal();
    }

    function renderTicketTotal() {
      const totalEl = document.getElementById('add-ticket-total');
      if (!totalEl) return;
      if (stagedItems.length === 0) {
        totalEl.innerHTML = '';
        return;
      }
      const total = stagedItems.reduce((s, l) => s + l.lineTotal, 0);
      totalEl.innerHTML = `<div style="display:flex;justify-content:space-between;font-family:${T.fb};font-size:20px;">
        <span style="color:${T.mint};">${stagedItems.length} item${stagedItems.length !== 1 ? 's' : ''}</span>
        <span style="color:${T.gold};">$${total.toFixed(2)}</span>
      </div>`;
    }

    // ═══════════════════════════════════════
    //  CHECK PERSISTENCE (>>> button)
    // ═══════════════════════════════════════

    async function confirmAndSave() {
      if (stagedItems.length === 0) return;

      const checkId = currentCheck?.id || null;
      let saved = false;

      if (checkId) {
        try {
          // POST each line item to the API
          for (const line of stagedItems) {
            await apiFetch(`/api/orders/${checkId}/items`, {
              method: 'POST',
              body: JSON.stringify({
                item_id: line.itemId,
                name: line.name,
                quantity: line.quantity,
                modifiers: line.modifiers.map(m => ({ name: m.name, prefix: m.prefix })),
                unit_price: line.unitPrice,
                seat: line.seat,
                category: line.category,
              }),
            });
          }
          saved = true;
        } catch (_err) {
          // API unavailable — queue locally
          offlineQueue.push(...stagedItems.map(line => ({
            checkId,
            item_id: line.itemId,
            name: line.name,
            quantity: line.quantity,
            modifiers: line.modifiers.map(m => ({ name: m.name, prefix: m.prefix })),
            unit_price: line.unitPrice,
            seat: line.seat,
            category: line.category,
          })));
          saved = true; // treat as success for UX, items are queued
        }
      } else {
        saved = true; // no API target, pass through to check-overview
      }

      if (saved) {
        showConfirmationFlash();
        // Navigate back after brief confirmation
        setTimeout(() => {
          go('check-overview', {
            check: currentCheck,
            seat: currentSeat,
            fromAddItems: true,
            stagedItems: stagedItems.map(line => ({
              id: line.itemId,
              name: line.name,
              price: line.unitPrice,
              qty: line.quantity,
              modifiers: line.modifiers.map(m => ({ name: m.name, prefix: m.prefix, price: 0 })),
            })),
          });
        }, 600);
      }
    }

    function showConfirmationFlash() {
      const panel = document.getElementById('add-ticket-panel')?.parentElement;
      if (!panel) return;
      const orig = panel.style.borderColor;
      panel.style.borderColor = T.goGreen;
      // Show "Items Added" text
      const flash = document.createElement('div');
      flash.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100;
        background:rgba(0,0,0,0.85);color:${T.goGreen};font-family:${T.fb};font-size:24px;
        padding:12px 28px;clip-path:${chamfer('md')};pointer-events:none;`;
      flash.textContent = offlineQueue.length > 0 ? 'Items Queued' : 'Items Added';
      el.appendChild(flash);
      setTimeout(() => {
        panel.style.borderColor = orig;
        flash.remove();
      }, 600);
    }

    // ═══════════════════════════════════════
    //  DISCARD DIALOG
    // ═══════════════════════════════════════

    function showDiscardDialog() {
      const overlay = document.createElement('div');
      overlay.style.cssText = `position:absolute;inset:0;z-index:150;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);`;

      const inner = `
        <div style="color:${T.mint};font-family:${T.fb};font-size:22px;text-align:center;padding:12px 20px;">
          Discard ${stagedItems.length} staged item(s)?
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;padding:0 20px 16px;">
          ${btnWrap(`<div id="discard-yes" style="background:${T.clrRed};color:${T.mint};font-family:${T.fb};font-size:24px;height:48px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('md')};">Discard</div>`)}
          ${btnWrap(`<div id="discard-no" style="background:${T.mint};color:${T.bg};font-family:${T.fb};font-size:24px;height:48px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('md')};">Keep Editing</div>`)}
        </div>
      `;

      const closeDiv = document.createElement('div');
      closeDiv.style.cssText = `position:absolute;top:12px;right:12px;z-index:160;`;
      closeDiv.innerHTML = overlayCloseBtn();
      closeDiv.addEventListener('click', () => overlay.remove());

      overlay.innerHTML = `<div style="position:relative;">${inner}</div>`;
      overlay.appendChild(closeDiv);

      el.appendChild(overlay);

      overlay.querySelector('#discard-yes')?.addEventListener('click', () => {
        stagedItems = [];
        overlay.remove();
        go('check-overview', { check: currentCheck, seat: currentSeat });
      });
      overlay.querySelector('#discard-no')?.addEventListener('click', () => {
        overlay.remove();
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
      });
    }

    // ═══════════════════════════════════════
    //  ACTION BAR BINDINGS
    // ═══════════════════════════════════════

    function bindActionBar() {
      document.getElementById('toggle-items')?.addEventListener('click', () => {
        setMode('items');
      });

      document.getElementById('toggle-mods')?.addEventListener('click', () => {
        setMode('modifiers');
      });

      document.getElementById('btn-back')?.addEventListener('click', () => {
        if (stagedItems.length === 0) {
          go('check-overview', { check: currentCheck, seat: currentSeat });
        } else {
          showDiscardDialog();
        }
      });

      document.getElementById('btn-confirm')?.addEventListener('click', () => {
        confirmAndSave();
      });
    }
  }
});
