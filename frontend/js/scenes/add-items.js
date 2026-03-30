import { registerScene, go } from '../scene-manager.js';
import { T, chamfer, overlayCloseBtn, btnWrap } from '../theme-manager.js';
import { HexEngine } from '../hex-engine.js';
import { FALLBACK_MENU, MODIFIERS, MOD_PREFIXES } from '../config.js';

const CAT_COLORS = ['#FF8C00', '#00CED1', '#E84040', '#7ac943', '#fcbe40', '#b48efa'];

function menuToHexData(menu) {
  return Object.entries(menu).map(([catName, catValue], i) => {
    const color = CAT_COLORS[i % CAT_COLORS.length];
    if (Array.isArray(catValue)) {
      return {
        id: catName.toLowerCase(),
        label: catName,
        color,
        children: catValue.map(item => ({
          id: item.name.toLowerCase().replace(/\s+/g, '-'),
          label: item.name,
          price: item.price,
          color,
          disabled: !!item.is86
        }))
      };
    } else {
      return {
        id: catName.toLowerCase(),
        label: catName,
        color,
        children: Object.entries(catValue).map(([subName, items]) => ({
          id: subName.toLowerCase().replace(/\s+/g, '-'),
          label: subName,
          color,
          children: items.map(item => ({
            id: item.name.toLowerCase().replace(/\s+/g, '-'),
            label: item.name,
            price: item.price,
            color,
            disabled: !!item.is86
          }))
        }))
      };
    }
  });
}

const MOD_COLORS = ['#fcbe40', '#b48efa', '#00CED1'];

function modifiersToHexData(modifiers) {
  return Object.entries(modifiers).map(([catName, items], i) => {
    const color = MOD_COLORS[i % MOD_COLORS.length];
    return {
      id: catName.toLowerCase().replace(/\s+/g, '-'),
      label: catName,
      color,
      children: items.map(mod => ({
        id: mod.name.toLowerCase().replace(/\s+/g, '-'),
        label: mod.name,
        price: mod.price,
        color,
      }))
    };
  });
}

registerScene('add-items', {
  onEnter(el, p) {
    const currentCheck = p.check || null;
    const currentSeat = p.seat || 0;
    let stagedItems = [];
    let activeMode = p.mode || 'items';
    let activePrefix = 'ADD';
    let hexEngine = null;

    // If editing modifiers on a specific existing item, pre-load it
    if (p.targetItem) {
      stagedItems.push({ ...p.targetItem, modifiers: p.targetItem.modifiers || [] });
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

    const ITEM_SIZES = {
      category: { w: 140, h: 158 },
      item:     { w: 90, h: 102 },
      modifier: { w: 80, h: 90 },
    };
    const MOD_SIZES = {
      category: { w: 90, h: 102 },
      item:     { w: 60, h: 68 },
      modifier: { w: 60, h: 68 },
    };

    function initHexEngine(mode) {
      const container = document.getElementById('hex-workspace');
      if (!container) return;
      if (hexEngine) { hexEngine.destroy(); hexEngine = null; }
      hexEngine = new HexEngine({
        container,
        data: mode === 'items' ? menuToHexData(FALLBACK_MENU) : modifiersToHexData(MODIFIERS),
        sizes: mode === 'items' ? ITEM_SIZES : MOD_SIZES,
        onSelect: handleItemSelected,
        onBack: () => {},
      });
    }

    // Instantiate HexEngine after DOM laid out
    requestAnimationFrame(() => initHexEngine(activeMode));

    bindActionBar();
    updateToggleStyles();
    if (activeMode === 'modifiers') showPrefixRow(); else hidePrefixRow();

    // Back navigation
    window.onBackRequested = () => {
      if (stagedItems.length === 0) {
        go('check-overview', { check: currentCheck, seat: currentSeat });
      } else {
        showDiscardDialog();
      }
    };

    return () => {
      if (hexEngine) { hexEngine.destroy(); hexEngine = null; }
      window.onBackRequested = null;
      stagedItems = [];
    };

    // ═══════════════════════════════════════
    //  LAYOUT BUILDERS
    // ═══════════════════════════════════════

    function buildTicketPanel() {
      return `<div style="width:310px;flex-shrink:0;background:${T.bg2};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};display:flex;flex-direction:column;overflow:hidden;margin:8px 0 8px 8px;">
        <div id="add-ticket-panel" style="flex:1;overflow-y:auto;padding:8px 10px;"></div>
      </div>`;
    }

    function buildRightArea() {
      return `<div style="flex:1;display:flex;flex-direction:column;gap:0;padding:8px 8px 8px 8px;">
        <div id="prefix-row" style="display:none;height:48px;align-items:center;gap:10px;padding:4px 12px;flex-shrink:0;"></div>
        <div id="hex-workspace" style="flex:1;background:${T.bg};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('lg')};position:relative;overflow:hidden;"></div>
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
      initHexEngine(mode);
      if (mode === 'items') {
        hidePrefixRow();
      } else {
        showPrefixRow();
      }
      updateToggleStyles();
    }

    // ═══════════════════════════════════════
    //  ITEM SELECTION
    // ═══════════════════════════════════════

    function handleItemSelected(item) {
      if (activeMode === 'items') {
        const existing = stagedItems.find(si => si.id === item.id && (!si.modifiers || si.modifiers.length === 0));
        if (existing) {
          existing.qty++;
        } else {
          stagedItems.push({
            id: item.id,
            name: item.label,
            price: item.price,
            qty: 1,
            modifiers: []
          });
        }
        renderTicketPanel();
      } else if (activeMode === 'modifiers') {
        const lastItem = stagedItems[stagedItems.length - 1];
        if (!lastItem) return;
        lastItem.modifiers = lastItem.modifiers || [];
        lastItem.modifiers.push({
          name: item.label,
          price: item.price || 0,
          prefix: activePrefix,
        });
        renderTicketPanel();
      }
    }

    // ═══════════════════════════════════════
    //  TICKET PANEL RENDER
    // ═══════════════════════════════════════

    function renderTicketPanel() {
      const panel = document.getElementById('add-ticket-panel');
      if (!panel) return;
      if (stagedItems.length === 0) {
        panel.innerHTML = '';
        return;
      }
      panel.innerHTML = stagedItems.map(item => {
        let html = `<div style="display:flex;justify-content:space-between;padding:4px 0;font-family:${T.fb};font-size:22px;">
          <span style="color:${T.mint};">x${item.qty} ${item.name}</span>
          <span style="color:${T.gold};">$${(item.price * item.qty).toFixed(2)}</span>
        </div>`;
        if (item.modifiers && item.modifiers.length) {
          item.modifiers.forEach(mod => {
            html += `<div style="padding:2px 0 2px 16px;">
              <span style="background:${T.gold};color:${T.bg};font-family:${T.fb};font-size:18px;padding:1px 6px;clip-path:${chamfer('sm')};">
                ${mod.prefix || ''} ${mod.name}
              </span>
              ${mod.price > 0 ? `<span style="color:${T.gold};font-family:${T.fb};font-size:18px;margin-left:6px;">$${mod.price.toFixed(2)}</span>` : ''}
            </div>`;
          });
        }
        return html;
      }).join('');
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
        if (hexEngine) hexEngine.back();
      });

      document.getElementById('btn-confirm')?.addEventListener('click', () => {
        if (stagedItems.length === 0) return;
        go('check-overview', {
          check: currentCheck,
          seat: currentSeat,
          fromAddItems: true,
          stagedItems: [...stagedItems]
        });
      });

    }
  }
});
