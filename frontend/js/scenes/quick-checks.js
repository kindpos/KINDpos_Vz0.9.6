// ──────────────────────────────────────────────────────────
//  KINDpos · Quick Checks Scene  (Vz1.0)
//  Simplified check management for food trucks & dive bars
// ──────────────────────────────────────────────────────────

import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { APP, $ } from '../app.js';
import {
  T, chamfer, btnWrap,
} from '../theme-manager.js';

const MOCK_CHECKS = [
  { id: 1, name: 'Bar 1', items: 3, total: 27.50, time: '2:14p', status: 'open' },
  { id: 2, name: 'Walk-up', items: 1, total: 12.00, time: '2:18p', status: 'open' },
  { id: 3, name: 'Bar 2', items: 5, total: 48.75, time: '2:22p', status: 'open' },
  { id: 4, name: 'Window', items: 2, total: 19.00, time: '2:31p', status: 'open' },
  { id: 5, name: 'Tab: Mike', items: 4, total: 36.00, time: '1:45p', status: 'open' },
  { id: 6, name: 'Tab: Sarah', items: 7, total: 63.25, time: '12:50p', status: 'open' },
  { id: 100, name: 'Walk-up', items: 2, total: 18.50, time: '1:02p', status: 'closed', closedAt: '1:15p', paidWith: 'CASH' },
  { id: 101, name: 'Bar 1', items: 3, total: 31.00, time: '12:30p', status: 'closed', closedAt: '12:55p', paidWith: 'VISA' },
  { id: 102, name: 'Window', items: 1, total: 9.50, time: '11:44a', status: 'closed', closedAt: '11:50a', paidWith: 'CASH' },
  { id: 103, name: 'Tab: Joe', items: 6, total: 72.00, time: '11:10a', status: 'closed', closedAt: '12:40p', paidWith: 'MC' },
  { id: 104, name: 'Walk-up', items: 2, total: 22.00, time: '10:55a', status: 'closed', closedAt: '11:05a', paidWith: 'VISA' },
];

registerLiteScene('quick-checks', {
  onEnter(el, p) {
    // ── State ──
    const state = {
      checks: JSON.parse(JSON.stringify(MOCK_CHECKS)),
      selectedIds: new Set(),
      closedDrawerOpen: false,
      nextId: 200,
    };

    el.style.cssText = 'position:relative;height:100%;display:flex;flex-direction:column;';

    render();

    // ── Event delegation ──
    function handleClick(e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      const id = target.dataset.id ? Number(target.dataset.id) : null;

      switch (action) {
        case 'toggle-check':
          if (id !== null) {
            if (state.selectedIds.has(id)) state.selectedIds.delete(id);
            else state.selectedIds.add(id);
            render();
          }
          break;
        case 'new-check':
          addNewCheck();
          break;
        case 'toggle-closed':
          state.closedDrawerOpen = !state.closedDrawerOpen;
          render();
          break;
        case 'clear-selection':
          state.selectedIds.clear();
          render();
          break;
        case 'action-open':
          doAction('OPEN');
          break;
        case 'action-pay':
          doAction('PAY');
          break;
        case 'action-print':
          doAction('PRINT');
          break;
        case 'action-disc':
          doAction('DISC');
          break;
        case 'action-void':
          doAction('VOID');
          break;
        case 'action-merge':
          doAction('MERGE');
          break;
        case 'action-reopen':
          doAction('REOPEN');
          break;
      }
    }

    el.addEventListener('click', handleClick);

    return () => {
      el.removeEventListener('click', handleClick);
    };

    // ═══════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════

    function openChecks() {
      return state.checks.filter(c => c.status === 'open');
    }

    function closedChecks() {
      return state.checks.filter(c => c.status === 'closed');
    }

    function selectedChecks() {
      return state.checks.filter(c => state.selectedIds.has(c.id));
    }

    function hasSelection() {
      return state.selectedIds.size > 0;
    }

    function selectedOpen() {
      return selectedChecks().filter(c => c.status === 'open');
    }

    function selectedClosed() {
      return selectedChecks().filter(c => c.status === 'closed');
    }

    function allSelectedAreClosed() {
      const sel = selectedChecks();
      return sel.length > 0 && sel.every(c => c.status === 'closed');
    }

    function anySelectedOpen() {
      return selectedOpen().length > 0;
    }

    function fmtMoney(n) {
      return '$' + n.toFixed(2);
    }

    function nowTime() {
      const d = new Date();
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'p' : 'a';
      h = h % 12 || 12;
      return h + ':' + m + ampm;
    }

    // ── Actions ──

    function addNewCheck() {
      const n = state.nextId++;
      state.checks.push({
        id: n,
        name: 'Check ' + (openChecks().length + 1),
        items: 0,
        total: 0,
        time: nowTime(),
        status: 'open',
      });
      render();
    }

    function doAction(action) {
      const count = state.selectedIds.size;
      showToast(action + ' \u2192 ' + count + ' check(s)');

      switch (action) {
        case 'OPEN': {
          const openSel = selectedOpen();
          if (openSel.length === 1) {
            const c = openSel[0];
            state.selectedIds.clear();
            liteGo('lite-order', { check: c });
            return;
          }
          state.selectedIds.clear();
          break;
        }
        case 'PAY':
          selectedOpen().forEach(c => {
            c.status = 'closed';
            c.closedAt = nowTime();
            c.paidWith = 'CARD';
          });
          state.selectedIds.clear();
          break;
        case 'VOID':
          state.checks = state.checks.filter(c => !state.selectedIds.has(c.id));
          state.selectedIds.clear();
          break;
        case 'REOPEN':
          selectedClosed().forEach(c => {
            c.status = 'open';
            delete c.closedAt;
            delete c.paidWith;
          });
          state.selectedIds.clear();
          break;
        default:
          // PRINT, DISC, MERGE — stub
          break;
      }
      render();
    }

    function showToast(message) {
      const existing = el.querySelector('.qc-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.className = 'qc-toast';
      toast.style.cssText = `position:absolute;bottom:50px;left:50%;transform:translateX(-50%);z-index:200;
        background:${T.bg2};border:2px solid ${T.cyan};color:${T.cyan};
        font-family:${T.fb};font-size:13px;font-weight:bold;
        padding:8px 20px;clip-path:${chamfer('md')};pointer-events:none;
        transition:opacity 0.3s ease,transform 0.3s ease;`;
      toast.textContent = message;
      el.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(10px)';
        setTimeout(() => toast.remove(), 300);
      }, 1400);
    }

    // ═══════════════════════════════════════════════════
    //  RENDERING
    // ═══════════════════════════════════════════════════

    function renderCheckCard(check) {
      const isSelected = state.selectedIds.has(check.id);
      const isOpen = check.status === 'open';

      // Border & name colors
      const borderColor = isSelected ? T.cyan : (isOpen ? T.mint : T.bg3);
      const nameBg = isSelected ? 'rgba(51,255,255,0.08)' : T.bg;
      const nameColor = isSelected ? T.cyan : (isOpen ? T.mint : T.bg3);
      const totalColor = isOpen ? T.gold : '#888';

      // Selected badge
      const badge = isSelected
        ? `<div style="position:absolute;top:4px;right:4px;width:14px;height:14px;background:${T.cyan};clip-path:${chamfer('2px')};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:bold;color:#1a1a1a;">\u2713</div>`
        : '';

      // Closed info row
      let closedRow = '';
      if (!isOpen) {
        const paidColor = check.paidWith === 'CASH' ? T.goGreen : T.cyan;
        closedRow = `<div style="border-top:1px solid ${T.bg3};margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-family:${T.fb};font-size:11px;color:#666;">\u2192 ${check.closedAt}</span>
          <span style="font-family:${T.fb};font-size:11px;color:${paidColor};font-weight:bold;">${check.paidWith}</span>
        </div>`;
      }

      const inner = `<div style="background:${nameBg};border:3px solid ${borderColor};clip-path:${chamfer('lg')};min-width:140px;padding:10px 12px;cursor:pointer;position:relative;transition:border-color 0.15s ease,background 0.15s ease;">
        ${badge}
        <div style="font-family:${T.fb};font-size:15px;font-weight:bold;text-transform:uppercase;color:${nameColor};">${check.name}</div>
        <div style="font-family:${T.fb};font-size:22px;font-weight:bold;color:${totalColor};margin:2px 0;">${fmtMoney(check.total)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-family:${T.fb};font-size:11px;color:${T.mintDim};">${check.time}</span>
          <span style="font-family:${T.fb};font-size:11px;color:${T.mintDim};">${check.items} item${check.items !== 1 ? 's' : ''}</span>
        </div>
        ${closedRow}
      </div>`;

      return `<div data-action="toggle-check" data-id="${check.id}">${btnWrap(inner)}</div>`;
    }

    function renderNewButton() {
      const inner = `<div style="background:${T.bg2};border:3px dashed ${T.mint};clip-path:${chamfer('lg')};min-width:140px;min-height:72px;padding:10px 12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <div style="font-family:${T.fb};font-size:32px;font-weight:bold;color:${T.mint};line-height:1;">+</div>
        <div style="font-family:${T.fb};font-size:13px;font-weight:bold;text-transform:uppercase;color:${T.mint};">NEW</div>
      </div>`;

      return `<div data-action="new-check">${btnWrap(inner)}</div>`;
    }

    function renderActionButton(icon, label, color, actionName) {
      const inner = `<div style="background:${T.bg};border:3px solid ${color};clip-path:${chamfer('lg')};padding:6px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;">
        <span style="font-size:22px;line-height:1;">${icon}</span>
        <span style="font-family:${T.fb};font-size:11px;font-weight:bold;text-transform:uppercase;color:${color};">${label}</span>
      </div>`;

      return `<div data-action="action-${actionName.toLowerCase()}">${btnWrap(inner)}</div>`;
    }

    function renderActionBar() {
      if (!hasSelection()) return '';

      const sel = selectedChecks();
      const combinedTotal = sel.reduce((s, c) => s + c.total, 0);
      const count = sel.length;
      const hasOpen = anySelectedOpen();
      const onlyOneOpen = selectedOpen().length === 1 && selectedOpen().length === count;
      const multipleOpen = selectedOpen().length >= 2;
      const onlyClosed = allSelectedAreClosed();

      let buttons = '';

      // OPEN: exactly 1 open check selected
      if (onlyOneOpen) {
        buttons += renderActionButton('\u25B6', 'OPEN', T.mint, 'open');
      }
      // PAY: any open check selected
      if (hasOpen) {
        buttons += renderActionButton('\uD83D\uDCB3', 'PAY', T.goGreen, 'pay');
      }
      // PRINT: always
      buttons += renderActionButton('\uD83D\uDDA8', 'PRINT', T.cyan, 'print');
      // DISC: any open check selected
      if (hasOpen) {
        buttons += renderActionButton('\uFF05', 'DISC', T.kindGold, 'disc');
      }
      // VOID: any open check selected
      if (hasOpen) {
        buttons += renderActionButton('\u2715', 'VOID', T.red, 'void');
      }
      // MERGE: 2+ open checks selected
      if (multipleOpen) {
        buttons += renderActionButton('\u2295', 'MERGE', T.lavender, 'merge');
      }
      // REOPEN: only closed checks selected
      if (onlyClosed) {
        buttons += renderActionButton('\u21A9', 'REOPEN', T.orange, 'reopen');
      }

      return `<div style="width:90px;background:${T.bg2};border-left:${T.borderW} solid ${T.cyan};display:flex;flex-direction:column;flex-shrink:0;overflow:hidden;">
        <div style="padding:8px 6px;text-align:center;border-bottom:2px solid ${T.bg3};">
          <div style="font-family:${T.fb};font-size:24px;font-weight:bold;color:${T.cyan};">${count}</div>
          <div style="font-family:${T.fb};font-size:9px;color:${T.cyan};text-transform:uppercase;">SELECTED</div>
          <div style="font-family:${T.fb};font-size:13px;font-weight:bold;color:${T.gold};margin-top:2px;">${fmtMoney(combinedTotal)}</div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:6px;">
          ${buttons}
        </div>
        <div data-action="clear-selection" style="padding:8px 6px;text-align:center;border-top:2px solid ${T.bg3};cursor:pointer;">
          <span style="font-family:${T.fb};font-size:10px;font-weight:bold;text-transform:uppercase;color:#999;">CLEAR</span>
        </div>
      </div>`;
    }

    function render() {
      const open = openChecks();
      const closed = closedChecks();
      const openTotal = open.reduce((s, c) => s + c.total, 0);
      const closedTotal = closed.reduce((s, c) => s + c.total, 0);
      const selected = hasSelection();
      const borderColor = selected ? T.cyan : T.mint;

      // Open checks grid
      let openCards = open.map(c => renderCheckCard(c)).join('');
      openCards += renderNewButton();

      // Closed checks grid
      let closedCards = closed.map(c => renderCheckCard(c)).join('');

      // Closed drawer
      const drawerOpen = state.closedDrawerOpen;
      const drawerBg = drawerOpen ? T.bg2 : T.bg3;
      const drawerBorder = drawerOpen ? `2px solid ${T.lavender}` : '2px solid #555';
      const arrowColor = drawerOpen ? T.lavender : '#999';
      const arrowRotate = drawerOpen ? 'rotate(90deg)' : 'rotate(0deg)';
      const labelColor = drawerOpen ? T.lavender : '#aaa';
      const closedTotalColor = drawerOpen ? T.gold : '#777';

      const closedPanel = drawerOpen
        ? `<div style="background:#1a1a1a;border:2px solid ${T.bg3};border-top:none;box-shadow:inset 1px 1px 0 #111,inset -1px -1px 0 #555;max-height:200px;overflow-y:auto;padding:10px;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;">${closedCards}</div>`
        : '';

      const closedDrawer = `<div>
        <div data-action="toggle-closed" style="background:${drawerBg};border:${drawerBorder};${drawerOpen ? 'border-bottom:none;' : ''}padding:8px 12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:12px;color:${arrowColor};display:inline-block;transform:${arrowRotate};transition:transform 0.2s ease;">\u25B6</span>
            <span style="font-family:${T.fb};font-size:14px;font-weight:bold;letter-spacing:2px;color:${labelColor};">CLOSED</span>
            <span style="font-family:${T.fb};font-size:14px;color:${labelColor};">(${closed.length})</span>
          </div>
          <span style="font-family:${T.fb};font-size:14px;font-weight:bold;color:${closedTotalColor};">${fmtMoney(closedTotal)}</span>
        </div>
        ${closedPanel}
      </div>`;

      el.innerHTML = `
        <div style="flex:1;display:flex;flex-direction:column;border:${T.borderW} solid ${borderColor};transition:border-color 0.2s ease;">

          <!-- TOP BAR -->
          <div style="background:${T.bg2};padding:8px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:${T.borderW} solid ${selected ? T.cyan : T.mint};transition:border-color 0.2s ease;flex-shrink:0;">
            <div>
              <span style="font-family:${T.fb};font-size:18px;font-weight:bold;color:${T.mint};letter-spacing:3px;">KINDpos</span>
              <span style="font-family:${T.fb};font-size:10px;color:${T.mintDim};margin-left:6px;">QUICK</span>
            </div>
            <div style="display:flex;align-items:baseline;gap:8px;">
              <span style="font-family:${T.fb};font-size:12px;color:${T.cyan};">${open.length} OPEN</span>
              <span style="font-family:${T.fb};font-size:18px;font-weight:bold;color:${T.gold};">${fmtMoney(openTotal)}</span>
            </div>
          </div>

          <!-- BODY -->
          <div style="flex:1;display:flex;overflow:hidden;">

            <!-- MAIN CONTENT -->
            <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">

              <!-- SUNKEN PANEL: OPEN CHECKS -->
              <div style="flex:1;background:#1a1a1a;border:2px solid ${T.bg3};box-shadow:inset 1px 1px 0 #111,inset -1px -1px 0 #555;margin:8px;padding:10px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;">
                ${openCards}
              </div>

              <!-- CLOSED DRAWER -->
              <div style="margin:0 8px 8px 8px;flex-shrink:0;">
                ${closedDrawer}
              </div>
            </div>

            <!-- ACTION BAR (right side) -->
            ${renderActionBar()}
          </div>
        </div>
      `;
    }
  },
});
