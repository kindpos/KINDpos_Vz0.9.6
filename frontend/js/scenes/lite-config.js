// ═══════════════════════════════════════════════════
//  KINDpos Lite — Configuration Scene
//  Folder-tab connector navigation with tier-1/sub-tab system
// ═══════════════════════════════════════════════════

import { APP, $ } from '../app.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T, chamfer, overlayBox, overlayCloseBtn, overlayHeader } from '../theme-manager.js';

// ── Tab Configuration ──
const TABS = {
  terminal:   { color: '#C6FFBB', label: 'Terminal',   subs: ['Display', 'Network', 'About'] },
  operations: { color: '#33ffff', label: 'Operations', subs: ['Employees', 'Menu', 'Checkout', 'Floor'] },
  hardware:   { color: '#ffcba4', label: 'Hardware',   subs: ['Printers', 'CC Readers', 'Peripherals'] },
};
const TAB_KEYS = Object.keys(TABS);

// ── Scene State ──
let S = {};
function resetState() {
  S = {
    tier1: 'operations',
    subIdx: 0,
    overlay: null,

    // Operations > Employees
    empFilter: 'ALL',

    // Operations > Menu
    menuNav: 'Categories',
    sunburstSelected: null,
    sunburstBloom: 0,

    // Operations > Checkout
    checkoutSection: 'Tax',
    batchState: 'idle', // idle | running | done

    // Hardware
    hwFilter: 'ALL',
    hwScanning: false,
    hwScanStep: 0,
    hwRevealed: 0,

    // Toggle states (keyed by id)
    toggles: {},
  };
}

// ── Animation Tracking ──
let animFrames = [];
let intervals = [];
function trackRAF(id) { animFrames.push(id); }
function trackInterval(id) { intervals.push(id); }
function cancelAllAnimations() {
  animFrames.forEach(id => cancelAnimationFrame(id));
  intervals.forEach(id => clearInterval(id));
  animFrames = [];
  intervals = [];
}

// ══════════════════════════════════════════════════════
//  Component Helpers
// ══════════════════════════════════════════════════════

function badge(text, color) {
  return `<span style="clip-path:${chamfer('sm')};padding:2px 8px;font-family:${T.fb};font-size:12px;border:2px solid ${color};color:${color};text-transform:uppercase;letter-spacing:1px;white-space:nowrap;">${text}</span>`;
}

function toggleSwitch(id, on) {
  const checked = S.toggles[id] !== undefined ? S.toggles[id] : on;
  const trackBg = checked ? 'rgba(198,255,187,0.15)' : '#1a1a1a';
  const knobColor = checked ? '#C6FFBB' : '#888';
  const knobX = checked ? '24px' : '4px';
  const glow = checked ? 'box-shadow:0 0 6px #C6FFBB;' : '';
  return `<div data-toggle="${id}" style="width:46px;height:24px;background:${trackBg};border:2px solid #555;position:relative;cursor:pointer;flex-shrink:0;">
    <div style="width:16px;height:16px;background:${knobColor};position:absolute;top:2px;left:${knobX};transition:left 0.15s;${glow}"></div>
  </div>`;
}

function toggleRow(id, label, on) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;background:${T.bg2};border:2px solid #555;padding:8px 10px;min-height:42px;gap:8px;">
    <span style="font-family:${T.fb};font-size:0.75rem;color:${T.mint};text-transform:uppercase;letter-spacing:1px;">${label}</span>
    ${toggleSwitch(id, on)}
  </div>`;
}

function fieldInput(id, label, value, opts = {}) {
  const color = opts.color || '#33ffff';
  const readonly = opts.readonly ? 'readonly' : '';
  const type = opts.type || 'text';
  return `<div style="display:flex;flex-direction:column;gap:2px;">
    <label style="font-family:${T.fb};font-size:0.65rem;color:#fcbe40;text-transform:uppercase;letter-spacing:2px;">${label}</label>
    <input type="${type}" id="${id}" value="${value}" ${readonly} style="background:#1a1a1a;border:2px solid #555;color:${color};font-family:${T.fb};font-size:0.9rem;padding:6px 8px;outline:none;text-transform:uppercase;letter-spacing:1px;" onfocus="this.style.borderColor='#C6FFBB';this.style.boxShadow='0 0 4px rgba(198,255,187,0.3)'" onblur="this.style.borderColor='#555';this.style.boxShadow='none'">
  </div>`;
}

function itemRow(opts) {
  const { colorBar, icon, label, sublabel, right, badge: bdg, chevron = true, action, id } = opts;
  const colorBarHtml = colorBar ? `<div style="width:4px;background:${colorBar};align-self:stretch;flex-shrink:0;"></div>` : '';
  const iconHtml = icon ? `<div style="width:32px;text-align:center;font-size:16px;flex-shrink:0;">${icon}</div>` : '';
  const rightHtml = right ? `<div style="font-family:${T.fb};font-size:0.75rem;color:${T.mint};white-space:nowrap;">${right}</div>` : '';
  const badgeHtml = bdg || '';
  const chevronHtml = chevron ? `<div style="color:#666;font-size:14px;flex-shrink:0;">&#9656;</div>` : '';
  const dataAction = action ? `data-action="${action}"` : '';
  const dataId = id !== undefined ? `data-id="${id}"` : '';
  return `<div class="btn-wrap" style="margin-bottom:4px;">
    <div ${dataAction} ${dataId} style="background:${T.bg};border:3px solid ${TABS[S.tier1].color};clip-path:${chamfer('lg')};min-height:48px;padding:8px 12px;display:flex;align-items:center;gap:8px;cursor:pointer;font-family:${T.fb};font-size:0.8rem;color:${T.mint};text-transform:uppercase;letter-spacing:1px;">
      ${colorBarHtml}${iconHtml}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:bold;">${label}</div>
        ${sublabel ? `<div style="font-size:0.65rem;opacity:0.6;margin-top:2px;">${sublabel}</div>` : ''}
      </div>
      ${rightHtml}${badgeHtml}${chevronHtml}
    </div>
  </div>`;
}

function pillBtn(label, color, active, action) {
  const bg = active ? color : T.bg;
  const textColor = active ? '#222' : color;
  const border = active ? 'none' : `2px solid ${color}`;
  return `<div data-action="${action}" style="padding:4px 10px;background:${bg};color:${textColor};border:${border};clip-path:${chamfer('sm')};font-family:${T.fb};font-size:0.65rem;cursor:pointer;text-transform:uppercase;letter-spacing:1px;white-space:nowrap;user-select:none;">${label}</div>`;
}

function sunkenPanel(headerText, contentHtml, color) {
  const c = color || T.mint;
  return `<div style="background:${T.bg2};border:3px solid ${c};clip-path:${chamfer('lg')};overflow:hidden;margin-bottom:8px;">
    <div style="background:${c};color:${T.bg2};font-family:${T.fb};font-size:0.7rem;font-weight:bold;text-transform:uppercase;letter-spacing:2px;padding:4px 10px;">${headerText}</div>
    <div style="padding:8px 10px;">${contentHtml}</div>
  </div>`;
}

function showOverlay(html) {
  S.overlay = html;
  renderOverlay();
}

function closeOverlay() {
  S.overlay = null;
  const layer = $('cfg-overlay');
  if (layer) layer.innerHTML = '';
}

function renderOverlay() {
  const layer = $('cfg-overlay');
  if (!layer) return;
  if (!S.overlay) { layer.innerHTML = ''; return; }
  layer.innerHTML = `<div style="position:absolute;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:flex-start;justify-content:center;padding-top:20px;overflow-y:auto;">
    <div style="background:${T.bg};border:${T.borderW} solid ${T.mint};clip-path:${chamfer('12px')};filter:drop-shadow(4px 6px 0px #1a1a1a);width:90%;max-width:500px;max-height:85%;display:flex;flex-direction:column;position:relative;">
      ${S.overlay}
    </div>
  </div>`;

  // Wire close buttons
  layer.querySelectorAll('[data-action="close-overlay"]').forEach(b => {
    b.addEventListener('click', closeOverlay);
  });

  // Wire toggles inside overlay
  wireToggles(layer);
}

function overlayClose() {
  return `<div data-action="close-overlay" style="filter:drop-shadow(2px 3px 0px #1a1a1a);cursor:pointer;flex-shrink:0;">
    <div style="background:#da331c;color:${T.mint};font-family:${T.fb};font-size:20px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;clip-path:${chamfer('md')};">X</div>
  </div>`;
}

function overlayTitle(title) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:2px solid rgba(198,255,187,0.15);flex-shrink:0;">
    <span style="font-family:${T.fb};font-size:0.85rem;color:${T.mint};font-weight:bold;text-transform:uppercase;letter-spacing:2px;">${title}</span>
    ${overlayClose()}
  </div>`;
}

function overlayBody(html) {
  return `<div style="padding:12px 14px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px;">${html}</div>`;
}

function overlayFooter(buttons) {
  return `<div style="padding:8px 14px;border-top:2px solid rgba(198,255,187,0.15);display:flex;gap:8px;flex-shrink:0;">${buttons}</div>`;
}

function saveBtn(label = 'SAVE') {
  return `<div data-action="close-overlay" class="btn-wrap" style="flex:1;">
    <div style="background:${T.mint};color:${T.bg};font-family:${T.fb};font-size:0.8rem;padding:10px;text-align:center;cursor:pointer;clip-path:${chamfer('md')};text-transform:uppercase;letter-spacing:2px;">${label}</div>
  </div>`;
}

function deleteBtn() {
  return `<div data-action="close-overlay" class="btn-wrap">
    <div style="background:#ff3355;color:${T.bg};font-family:${T.fb};font-size:0.8rem;padding:10px 20px;text-align:center;cursor:pointer;clip-path:${chamfer('md')};text-transform:uppercase;letter-spacing:2px;">DELETE</div>
  </div>`;
}

// ══════════════════════════════════════════════════════
//  Time Helper
// ══════════════════════════════════════════════════════

function cfgTime() {
  const n = new Date();
  const mm = String(n.getMonth() + 1).padStart(2, '0');
  const dd = String(n.getDate()).padStart(2, '0');
  const yyyy = n.getFullYear();
  let h = n.getHours();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${mm}/${dd}/${yyyy} &#9671; ${String(h).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}${ampm} &#9671; Configuration`;
}

// ══════════════════════════════════════════════════════
//  Wire Toggles (event delegation for toggle switches)
// ══════════════════════════════════════════════════════

function wireToggles(root) {
  root.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.toggle;
      S.toggles[id] = !S.toggles[id];
      // Re-render just this toggle
      const on = S.toggles[id];
      const track = el;
      track.style.background = on ? 'rgba(198,255,187,0.15)' : '#1a1a1a';
      const knob = track.querySelector('div');
      knob.style.background = on ? '#C6FFBB' : '#888';
      knob.style.left = on ? '24px' : '4px';
      knob.style.boxShadow = on ? '0 0 6px #C6FFBB' : 'none';
    });
  });
}

// ══════════════════════════════════════════════════════
//  MAIN RENDER
// ══════════════════════════════════════════════════════

let sceneEl = null;

function render() {
  if (!sceneEl) return;
  cancelAllAnimations();

  const tab = TABS[S.tier1];
  const color = tab.color;

  // Override tbar
  const tbar = $('tbar');
  if (tbar) {
    tbar.innerHTML = `<span style="font-family:${T.fb};font-size:0.7rem;color:#aaa;letter-spacing:1px;">${cfgTime()}</span>`;
    tbar.style.background = T.bg;
  }

  // Hide sbar
  const sbar = $('sbar');
  if (sbar) sbar.style.display = 'none';

  // Build tier-1 tabs
  const tier1Html = TAB_KEYS.map(key => {
    const t = TABS[key];
    const isActive = key === S.tier1;
    return `<div data-action="tier1" data-key="${key}" style="
      padding:8px 14px;background:${t.color};color:${T.bg2};
      font-family:${T.fb};font-size:0.85rem;letter-spacing:2px;text-transform:uppercase;
      opacity:${isActive ? '1' : '0.45'};cursor:pointer;user-select:none;
      clip-path:${chamfer('lg')};font-weight:bold;
    ">${t.label}</div>`;
  }).join('');

  // Build sub-tabs
  const subHtml = tab.subs.map((name, i) => {
    const isActive = i === S.subIdx;
    const bg = isActive ? color : T.bg2;
    const textColor = isActive ? '#222' : color;
    const borderRight = isActive ? 'border-right:none;' : `border-right:3px solid ${color};`;
    const fw = isActive ? 'font-weight:bold;' : '';
    return `<div data-action="sub" data-idx="${i}" class="cfg-sub-tab" style="
      background:${bg};color:${textColor};
      border:3px solid ${color};${borderRight}
      padding:10px 8px;font-family:${T.fb};font-size:0.65rem;
      text-transform:uppercase;letter-spacing:1px;cursor:pointer;
      min-width:90px;text-align:center;user-select:none;${fw}
    ">${name}</div>`;
  }).join('');

  // Render content
  const contentHtml = renderContent();

  sceneEl.innerHTML = `
    <div id="cfg-root" style="display:flex;flex-direction:column;height:100%;position:relative;overflow:hidden;">
      <!-- Tier-1 Tabs -->
      <div id="cfg-tier1" style="display:flex;gap:8px;padding:6px 10px 0 10px;flex-shrink:0;">${tier1Html}</div>

      <!-- Body: connector + sub-tabs + panel -->
      <div id="cfg-body" style="flex:1;position:relative;overflow:hidden;margin:0 10px 6px 10px;">
        <!-- Connector lines -->
        <div id="cfg-conn-v" style="position:absolute;width:3px;background:${color};z-index:5;"></div>
        <div id="cfg-conn-h" style="position:absolute;height:3px;background:${color};z-index:5;"></div>

        <!-- Panel borders -->
        <div id="cfg-border-top" style="position:absolute;height:3px;background:${color};z-index:4;"></div>
        <div id="cfg-border-right" style="position:absolute;width:3px;background:${color};z-index:4;"></div>
        <div id="cfg-border-bottom" style="position:absolute;height:3px;background:${color};z-index:4;"></div>
        <div id="cfg-border-left-top" style="position:absolute;width:3px;background:${color};z-index:4;"></div>
        <div id="cfg-border-left-bot" style="position:absolute;width:3px;background:${color};z-index:4;"></div>

        <!-- Sub-tabs (left edge) -->
        <div id="cfg-subs" style="position:absolute;display:flex;flex-direction:column;gap:0;z-index:6;">${subHtml}</div>

        <!-- Saved button (top-right) -->
        <div id="cfg-saved" style="position:absolute;z-index:6;clip-path:${chamfer('sm')};background:${color};color:#222;font-family:${T.fb};font-size:0.65rem;padding:6px 16px;text-transform:uppercase;letter-spacing:2px;cursor:pointer;user-select:none;">Saved</div>

        <!-- Content area -->
        <div id="cfg-content" style="position:absolute;overflow-y:auto;overflow-x:hidden;z-index:3;background:${T.bg};">${contentHtml}</div>

        <!-- Back button -->
        <div id="cfg-back" data-action="back" style="position:absolute;bottom:8px;left:4px;z-index:10;cursor:pointer;filter:drop-shadow(2px 3px 0px #1a1a1a);">
          <div style="background:${T.bg2};border:2px solid ${color};color:${color};font-family:${T.fb};font-size:0.65rem;padding:4px 10px;clip-path:${chamfer('sm')};text-transform:uppercase;letter-spacing:1px;">&#8592; Back</div>
        </div>
      </div>

      <!-- Overlay layer -->
      <div id="cfg-overlay" style="position:absolute;inset:0;z-index:200;pointer-events:${S.overlay ? 'auto' : 'none'};"></div>
    </div>
  `;

  // Position connector and borders after DOM layout
  requestAnimationFrame(() => {
    positionNav();
    wireEvents();
    if (S.overlay) renderOverlay();
  });
}

// ══════════════════════════════════════════════════════
//  Position Navigation Elements
// ══════════════════════════════════════════════════════

function positionNav() {
  const body = $('cfg-body');
  if (!body) return;
  const bodyRect = body.getBoundingClientRect();

  // Measure active tier-1 tab
  const tier1El = document.querySelector(`[data-action="tier1"][data-key="${S.tier1}"]`);
  if (!tier1El) return;
  const t1Rect = tier1El.getBoundingClientRect();
  const t1CenterX = t1Rect.left + t1Rect.width / 2 - bodyRect.left;

  // Sub-tab column positioning
  const subCol = $('cfg-subs');
  const subTabW = 94; // fixed sub-tab width
  const panelLeft = subTabW - 3; // panel left edge (sub-tabs overlap by 3px border)
  const panelTop = 20; // gap below tier-1 for connector
  const panelRight = bodyRect.width;
  const panelBottom = bodyRect.height;

  subCol.style.left = '0px';
  subCol.style.top = `${panelTop}px`;
  subCol.style.width = `${subTabW}px`;

  // Measure active sub-tab position
  const activeSub = subCol.children[S.subIdx];
  if (!activeSub) return;
  const subRect = activeSub.getBoundingClientRect();
  const subTop = subRect.top - bodyRect.top;
  const subBot = subRect.bottom - bodyRect.top;

  // Connector vertical: from top of body to panel top
  const connV = $('cfg-conn-v');
  connV.style.left = `${t1CenterX - 1}px`;
  connV.style.top = '0px';
  connV.style.height = `${panelTop}px`;

  // Connector horizontal: from vertical line to panel left edge
  const connH = $('cfg-conn-h');
  const hLeft = Math.min(t1CenterX, panelLeft);
  const hRight = Math.max(t1CenterX, panelLeft);
  connH.style.left = `${hLeft}px`;
  connH.style.top = `${panelTop - 1}px`;
  connH.style.width = `${hRight - hLeft + 3}px`;

  // Panel borders
  const bt = $('cfg-border-top');
  bt.style.left = `${panelLeft}px`;
  bt.style.top = `${panelTop}px`;
  bt.style.width = `${panelRight - panelLeft}px`;

  const br = $('cfg-border-right');
  br.style.left = `${panelRight - 3}px`;
  br.style.top = `${panelTop}px`;
  br.style.height = `${panelBottom - panelTop}px`;

  const bb = $('cfg-border-bottom');
  bb.style.left = `${panelLeft}px`;
  bb.style.top = `${panelBottom - 3}px`;
  bb.style.width = `${panelRight - panelLeft}px`;

  // Left border with gap for active sub-tab
  const blt = $('cfg-border-left-top');
  blt.style.left = `${panelLeft}px`;
  blt.style.top = `${panelTop}px`;
  blt.style.height = `${Math.max(0, subTop - panelTop)}px`;

  const blb = $('cfg-border-left-bot');
  blb.style.left = `${panelLeft}px`;
  blb.style.top = `${subBot}px`;
  blb.style.height = `${Math.max(0, panelBottom - subBot)}px`;

  // Content area
  const content = $('cfg-content');
  content.style.left = `${panelLeft + 3}px`;
  content.style.top = `${panelTop + 3}px`;
  content.style.width = `${panelRight - panelLeft - 6}px`;
  content.style.height = `${panelBottom - panelTop - 6}px`;
  content.style.padding = '8px';

  // Saved button
  const saved = $('cfg-saved');
  saved.style.right = '4px';
  saved.style.top = `${panelTop - 20}px`;
}

// ══════════════════════════════════════════════════════
//  Event Wiring
// ══════════════════════════════════════════════════════

function wireEvents() {
  const root = $('cfg-root');
  if (!root) return;

  // Tier-1 tab clicks
  root.querySelectorAll('[data-action="tier1"]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      if (key !== S.tier1) {
        S.tier1 = key;
        S.subIdx = 0;
        S.overlay = null;
        render();
      }
    });
  });

  // Sub-tab clicks
  root.querySelectorAll('[data-action="sub"]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      if (idx !== S.subIdx) {
        S.subIdx = idx;
        S.overlay = null;
        render();
      }
    });
  });

  // Back button
  const backBtn = root.querySelector('[data-action="back"]');
  if (backBtn) {
    backBtn.addEventListener('click', () => { liteGo('lite-login'); });
  }

  // Wire all toggles in content area
  const content = $('cfg-content');
  if (content) wireToggles(content);

  // Wire content-specific events
  wireContentEvents();
}

// ══════════════════════════════════════════════════════
//  Content Router
// ══════════════════════════════════════════════════════

function renderContent() {
  const tab = TABS[S.tier1];
  const sub = tab.subs[S.subIdx];

  if (S.tier1 === 'terminal') {
    return renderPlaceholder(sub);
  }
  if (S.tier1 === 'operations') {
    if (sub === 'Employees') return renderEmployees();
    if (sub === 'Menu') return renderMenu();
    if (sub === 'Checkout') return renderCheckout();
    if (sub === 'Floor') return renderPlaceholder(sub);
  }
  if (S.tier1 === 'hardware') {
    if (sub === 'Printers') return renderPrinters();
    if (sub === 'CC Readers') return renderCCReaders();
    if (sub === 'Peripherals') return renderPeripherals();
  }
  return renderPlaceholder(sub);
}

function wireContentEvents() {
  // Subclasses wire their own events — called after render
  const tab = TABS[S.tier1];
  const sub = tab.subs[S.subIdx];

  if (S.tier1 === 'operations') {
    if (sub === 'Employees') wireEmployeeEvents();
    if (sub === 'Menu') wireMenuEvents();
    if (sub === 'Checkout') wireCheckoutEvents();
  }
  if (S.tier1 === 'hardware') {
    wireHardwareEvents();
  }
}

// ══════════════════════════════════════════════════════
//  TERMINAL — Placeholders
// ══════════════════════════════════════════════════════

function renderPlaceholder(name) {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;">
    <div style="font-family:${T.fb};font-size:1rem;color:${T.mint};text-transform:uppercase;letter-spacing:2px;">${name}</div>
    <div style="font-family:${T.fb};font-size:0.75rem;color:#fcbe40;text-transform:uppercase;letter-spacing:2px;">Coming Soon</div>
    <div style="font-family:${T.fb};font-size:0.65rem;color:#666;text-transform:uppercase;letter-spacing:1px;">v2.0</div>
  </div>`;
}

// ══════════════════════════════════════════════════════
//  OPERATIONS — Employees
// ══════════════════════════════════════════════════════

const EMPLOYEES = [
  { id: 0, first: 'Sarah', last: 'Mitchell', display: 'Sarah M.', role: 'Server',    pin: '9999', rate: '12.00', active: true, hired: '01/2025' },
  { id: 1, first: 'Marcus', last: 'Chen',    display: 'Marcus C.', role: 'Server',    pin: '1234', rate: '12.00', active: true, hired: '03/2025' },
  { id: 2, first: 'Dana',   last: 'Kim',     display: 'Dana K.',   role: 'Bartender', pin: '5678', rate: '14.00', active: true, hired: '06/2024' },
  { id: 3, first: 'Jake',   last: 'Torres',  display: 'Jake T.',   role: 'Bartender', pin: '4321', rate: '14.00', active: true, hired: '11/2024' },
  { id: 4, first: 'Alex',   last: 'Rivera',  display: 'Alex R.',   role: 'Manager',   pin: '0000', rate: '18.00', active: true, hired: '01/2024' },
  { id: 5, first: 'Pat',    last: 'Nguyen',  display: 'Pat N.',    role: 'Host',      pin: '7777', rate: '10.00', active: false, hired: '08/2025' },
];

const ROLE_COLORS = { Server: '#33ffff', Bartender: '#b48efa', Manager: '#fcbe40', Host: '#C6FFBB', Busser: '#ff8844', Expo: '#ff6699' };
const ROLE_FILTERS = [
  { label: 'SRV', role: 'Server', color: '#33ffff' },
  { label: 'BAR', role: 'Bartender', color: '#b48efa' },
  { label: 'MGR', role: 'Manager', color: '#fcbe40' },
  { label: 'ALL', role: 'ALL', color: '#C6FFBB' },
];

function renderEmployees() {
  const filtered = S.empFilter === 'ALL' ? EMPLOYEES : EMPLOYEES.filter(e => e.role === S.empFilter);

  const filterHtml = ROLE_FILTERS.map(f =>
    pillBtn(f.label, f.color, S.empFilter === f.role, `emp-filter-${f.role}`)
  ).join('') + pillBtn('+ ADD', '#44FF88', false, 'emp-add');

  const listHtml = filtered.map(e => {
    const rc = ROLE_COLORS[e.role] || '#C6FFBB';
    const statusBdg = e.active ? badge('ACTIVE', '#33ffff') : badge('INACT', '#666');
    return itemRow({
      colorBar: rc,
      label: e.display,
      sublabel: `${e.role} &middot; Hired ${e.hired}`,
      right: `PIN:****`,
      badge: statusBdg,
      action: 'emp-edit',
      id: e.id,
    });
  }).join('');

  return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${filterHtml}</div>
    <div style="overflow-y:auto;flex:1;">${listHtml}</div>`;
}

function showEmployeeOverlay(emp) {
  const isNew = !emp;
  const e = emp || { first: '', last: '', display: '', role: 'Server', pin: '', rate: '12.00', active: true };
  const rc = ROLE_COLORS[e.role] || '#C6FFBB';
  const isMgr = e.role === 'Manager';

  const roleSelector = ['Server', 'Bartender', 'Manager', 'Host', 'Busser', 'Expo'].map(r =>
    `<div data-action="emp-role" data-role="${r}" style="padding:4px 8px;background:${e.role === r ? ROLE_COLORS[r] : T.bg};color:${e.role === r ? '#222' : ROLE_COLORS[r]};border:2px solid ${ROLE_COLORS[r]};clip-path:${chamfer('sm')};font-family:${T.fb};font-size:0.6rem;cursor:pointer;text-transform:uppercase;">${r}</div>`
  ).join('');

  const permsHtml = isMgr ? `
    ${sunkenPanel('Manager Permissions', `
      ${toggleRow('perm-void', 'Can Void Items', true)}
      ${toggleRow('perm-disc', 'Can Apply Discounts', true)}
      ${toggleRow('perm-menu', 'Can Edit Menu', true)}
      ${toggleRow('perm-reports', 'Can View Reports', true)}
      ${toggleRow('perm-close', 'Can Close Day', true)}
      ${toggleRow('perm-emp', 'Can Edit Employees', true)}
    `, '#fcbe40')}
  ` : '';

  showOverlay(`
    ${overlayTitle(isNew ? 'New Employee' : 'Edit Employee')}
    ${overlayBody(`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${fieldInput('emp-first', 'First Name', e.first)}
        ${fieldInput('emp-last', 'Last Name', e.last)}
      </div>
      ${fieldInput('emp-display', 'Display Name', e.display)}
      <div>
        <label style="font-family:${T.fb};font-size:0.65rem;color:#fcbe40;text-transform:uppercase;letter-spacing:2px;">Role</label>
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${roleSelector}</div>
      </div>
      ${fieldInput('emp-pin', 'PIN (4-digit)', '****')}
      ${fieldInput('emp-rate', 'Hourly Rate ($)', e.rate)}
      ${toggleRow('emp-active', 'Active', e.active)}
      ${permsHtml}
    `)}
    ${overlayFooter(isNew ? saveBtn() : `${deleteBtn()}${saveBtn()}`)}
  `);
}

function wireEmployeeEvents() {
  const content = $('cfg-content');
  if (!content) return;

  // Filter pills
  content.querySelectorAll('[data-action^="emp-filter-"]').forEach(el => {
    el.addEventListener('click', () => {
      const role = el.dataset.action.replace('emp-filter-', '');
      S.empFilter = role;
      render();
    });
  });

  // Add button
  content.querySelectorAll('[data-action="emp-add"]').forEach(el => {
    el.addEventListener('click', () => showEmployeeOverlay(null));
  });

  // Edit rows
  content.querySelectorAll('[data-action="emp-edit"]').forEach(el => {
    el.addEventListener('click', () => {
      const emp = EMPLOYEES.find(e => e.id === parseInt(el.dataset.id));
      if (emp) showEmployeeOverlay(emp);
    });
  });
}

// ══════════════════════════════════════════════════════
//  OPERATIONS — Menu
// ══════════════════════════════════════════════════════

const MENU_CATEGORIES = [
  { id: 0, name: 'Appetizers', color: '#ff3355', items: 5, station: 'Kitchen' },
  { id: 1, name: 'Entrees',    color: '#fcbe40', items: 6, station: 'Kitchen' },
  { id: 2, name: 'Cocktails',  color: '#33ffff', items: 4, station: 'Bar' },
  { id: 3, name: 'Wine',       color: '#b48efa', items: 4, station: 'Bar' },
  { id: 4, name: 'Desserts',   color: '#ff8844', items: 3, station: 'Kitchen' },
  { id: 5, name: 'Non-Alc',    color: '#C6FFBB', items: 3, station: 'Bar' },
];

const MENU_ITEMS = [
  { id: 0, name: 'Wings',         price: 14.00, cat: 0, active: true },
  { id: 1, name: 'Calamari',      price: 12.00, cat: 0, active: true },
  { id: 2, name: 'Bruschetta',    price: 10.00, cat: 0, active: true },
  { id: 3, name: 'Nachos',        price: 13.00, cat: 0, active: true },
  { id: 4, name: 'Soup du Jour',  price: 8.00,  cat: 0, active: false },
  { id: 5, name: 'NY Strip',      price: 34.00, cat: 1, active: true },
  { id: 6, name: 'Salmon',        price: 28.00, cat: 1, active: true },
  { id: 7, name: 'Burger',        price: 18.00, cat: 1, active: true },
  { id: 8, name: 'Chicken Parm',  price: 22.00, cat: 1, active: true },
  { id: 9, name: 'Fish & Chips',  price: 20.00, cat: 1, active: true },
  { id:10, name: 'Pasta Primavera', price: 19.00, cat: 1, active: true },
  { id:11, name: 'Old Fashioned', price: 14.00, cat: 2, active: true },
  { id:12, name: 'Margarita',     price: 13.00, cat: 2, active: true },
  { id:13, name: 'Mojito',        price: 13.00, cat: 2, active: true },
  { id:14, name: 'Espresso Martini', price: 15.00, cat: 2, active: true },
  { id:15, name: 'Cab Sauv',      price: 12.00, cat: 3, active: true },
  { id:16, name: 'Pinot Grigio',  price: 11.00, cat: 3, active: true },
  { id:17, name: 'Merlot',        price: 11.00, cat: 3, active: true },
  { id:18, name: 'Prosecco',      price: 10.00, cat: 3, active: true },
  { id:19, name: 'Key Lime Pie',  price: 10.00, cat: 4, active: true },
  { id:20, name: 'Cheesecake',    price: 11.00, cat: 4, active: true },
  { id:21, name: 'Brownie Sundae', price: 12.00, cat: 4, active: true },
  { id:22, name: 'Iced Tea',      price: 4.00,  cat: 5, active: true },
  { id:23, name: 'Lemonade',      price: 4.00,  cat: 5, active: true },
  { id:24, name: 'Virgin Mojito', price: 8.00,  cat: 5, active: true },
];

const MOD_GROUPS = [
  { id: 0, name: 'Temperature', required: true, multi: false, max: 1, mods: [
    { name: 'Rare', adj: 0 }, { name: 'Med Rare', adj: 0 }, { name: 'Medium', adj: 0 }, { name: 'Med Well', adj: 0 }, { name: 'Well Done', adj: 0 },
  ]},
  { id: 1, name: 'Sides', required: true, multi: false, max: 1, mods: [
    { name: 'Fries', adj: 0 }, { name: 'Salad', adj: 2.00 }, { name: 'Soup', adj: 3.00 },
  ]},
];

const MOD_PREFIXES = ['ADD', 'NO', 'ON SIDE', 'LITE', 'EXTRA'];

const STATIONS = [
  { id: 0, name: 'Kitchen', cats: 3, printer: 'Epson TM-T88VI', color: '#ff8844' },
  { id: 1, name: 'Bar',     cats: 2, printer: 'Star SP700',      color: '#33ffff' },
  { id: 2, name: 'Expo',    cats: 0, printer: 'None',             color: '#C6FFBB' },
];

const MENU_NAVS = ['Categories', 'Items', 'Modifiers', 'Stations', 'Sunburst'];

function renderMenu() {
  const navHtml = MENU_NAVS.map(n =>
    pillBtn(n === 'Sunburst' ? '\u2600 Sunburst' : n, '#33ffff', S.menuNav === n, `menu-nav-${n}`)
  ).join('');

  let viewHtml = '';
  if (S.menuNav === 'Categories') viewHtml = renderMenuCategories();
  else if (S.menuNav === 'Items') viewHtml = renderMenuItems();
  else if (S.menuNav === 'Modifiers') viewHtml = renderMenuModifiers();
  else if (S.menuNav === 'Stations') viewHtml = renderMenuStations();
  else if (S.menuNav === 'Sunburst') viewHtml = '<canvas id="cfg-sunburst" style="width:100%;flex:1;"></canvas>';

  return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${navHtml}</div>
    <div style="overflow-y:auto;flex:1;">${viewHtml}</div>`;
}

function renderMenuCategories() {
  return MENU_CATEGORIES.map(c => {
    return itemRow({
      colorBar: c.color,
      label: c.name,
      sublabel: `${c.items} items &middot; ${c.station}`,
      right: `<div style="width:12px;height:12px;background:${c.color};flex-shrink:0;"></div>`,
      action: 'cat-edit',
      id: c.id,
    });
  }).join('');
}

function renderMenuItems() {
  return MENU_ITEMS.map(item => {
    const cat = MENU_CATEGORIES[item.cat];
    const statusBdg = item.active ? badge('ACTIVE', '#33ffff') : badge("86'D", '#ff3355');
    return itemRow({
      colorBar: cat.color,
      label: item.name,
      sublabel: `${cat.name} &middot; ${STATIONS.find(s => s.name === cat.station)?.name || ''}`,
      right: `$${item.price.toFixed(2)}`,
      badge: statusBdg,
      action: 'item-edit',
      id: item.id,
    });
  }).join('');
}

function renderMenuModifiers() {
  const prefixHtml = MOD_PREFIXES.map(p =>
    `<div style="padding:4px 10px;background:${T.bg};border:2px solid ${T.mint};color:${T.mint};clip-path:${chamfer('sm')};font-family:${T.fb};font-size:0.6rem;text-transform:uppercase;white-space:nowrap;">${p}</div>`
  ).join('');

  const groupsHtml = MOD_GROUPS.map(g => {
    const modsHtml = g.mods.map(m =>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #444;">
        <span style="font-size:0.7rem;">${m.name}</span>
        <span style="font-size:0.7rem;color:#fcbe40;">${m.adj > 0 ? '+$' + m.adj.toFixed(2) : '--'}</span>
      </div>`
    ).join('');
    return sunkenPanel(`${g.name} ${g.required ? '(REQ)' : '(OPT)'}`, modsHtml);
  }).join('');

  return `<div style="display:flex;gap:4px;overflow-x:auto;margin-bottom:8px;padding-bottom:4px;">${prefixHtml}</div>${groupsHtml}`;
}

function renderMenuStations() {
  return STATIONS.map(s => {
    return itemRow({
      colorBar: s.color,
      label: s.name,
      sublabel: `${s.cats} categories`,
      right: s.printer,
      action: 'station-edit',
      id: s.id,
    });
  }).join('');
}

// ── Menu Overlays ──

function showCategoryOverlay(cat) {
  const c = cat || { name: '', color: '#C6FFBB', station: 'Kitchen' };
  const swatches = ['#ff3355', '#fcbe40', '#33ffff', '#b48efa', '#ff8844', '#C6FFBB', '#ff6699', '#3388ff'];
  const swatchHtml = swatches.map(s =>
    `<div style="width:28px;height:28px;background:${s};border:${s === c.color ? '3px solid white' : '2px solid #555'};cursor:pointer;"></div>`
  ).join('');

  showOverlay(`
    ${overlayTitle(cat ? 'Edit Category' : 'New Category')}
    ${overlayBody(`
      ${fieldInput('cat-name', 'Name', c.name)}
      <div>
        <label style="font-family:${T.fb};font-size:0.65rem;color:#fcbe40;text-transform:uppercase;letter-spacing:2px;">Color</label>
        <div style="display:flex;gap:6px;margin-top:4px;">${swatchHtml}</div>
      </div>
      ${fieldInput('cat-station', 'Station', c.station)}
      ${fieldInput('cat-sort', 'Sort Order', '0')}
      ${toggleRow('cat-active', 'Active', true)}
    `)}
    ${overlayFooter(saveBtn())}
  `);
}

function showItemOverlay(item) {
  const i = item || { name: '', price: 0, cat: 0, active: true };
  const cat = MENU_CATEGORIES[i.cat];
  showOverlay(`
    ${overlayTitle(item ? 'Edit Item' : 'New Item')}
    ${overlayBody(`
      ${fieldInput('item-name', 'Name', i.name)}
      ${fieldInput('item-price', 'Price ($)', i.price.toFixed(2))}
      ${fieldInput('item-cat', 'Category', cat ? cat.name : '', { readonly: true })}
      ${fieldInput('item-tax', 'Tax Group', 'Default')}
      ${fieldInput('item-desc', 'Description', '')}
      ${toggleRow('item-active', 'Active', i.active)}
      ${toggleRow('item-mods', 'Allow Modifiers', true)}
    `)}
    ${overlayFooter(item ? `${deleteBtn()}${saveBtn()}` : saveBtn())}
  `);
}

function showStationOverlay(station) {
  const s = station || { name: '', printer: '', color: '#C6FFBB' };
  showOverlay(`
    ${overlayTitle(station ? 'Edit Station' : 'New Station')}
    ${overlayBody(`
      ${fieldInput('sta-name', 'Name', s.name)}
      ${fieldInput('sta-printer', 'Default Printer', s.printer)}
      ${fieldInput('sta-backup', 'Backup Printer', '')}
    `)}
    ${overlayFooter(saveBtn())}
  `);
}

// ── Menu Sunburst (Canvas) ──

function initSunburst() {
  const canvas = $('cfg-sunburst');
  if (!canvas) return;
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  drawSunburst(canvas);

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    handleSunburstClick(canvas, x, y);
  });
}

function drawSunburst(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const innerR = Math.min(w, h) * 0.18;
  const midR = Math.min(w, h) * 0.32;
  const outerR = Math.min(w, h) * 0.45;

  ctx.clearRect(0, 0, w, h);

  const total = MENU_CATEGORIES.reduce((s, c) => s + c.items, 0);
  let angle = -Math.PI / 2;

  // Draw inner ring (categories)
  MENU_CATEGORIES.forEach((cat, i) => {
    const sweep = (cat.items / total) * Math.PI * 2;
    const isSelected = S.sunburstSelected === i;
    const dimmed = S.sunburstSelected !== null && !isSelected;

    ctx.beginPath();
    ctx.arc(cx, cy, midR, angle, angle + sweep);
    ctx.arc(cx, cy, innerR, angle + sweep, angle, true);
    ctx.closePath();
    ctx.fillStyle = dimmed ? cat.color + '44' : cat.color;
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    const midAngle = angle + sweep / 2;
    const labelR = (innerR + midR) / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(midAngle) * labelR, cy + Math.sin(midAngle) * labelR);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 10px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cat.name.substring(0, 6), 0, -5);
    ctx.fillText(`(${cat.items})`, 0, 7);
    ctx.restore();

    // Outer ring (items) — only for selected category
    if (isSelected) {
      const catItems = MENU_ITEMS.filter(item => item.cat === i);
      const itemSweep = sweep / catItems.length;
      catItems.forEach((item, j) => {
        const iAngle = angle + j * itemSweep;
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, iAngle, iAngle + itemSweep);
        ctx.arc(cx, cy, midR + 2, iAngle + itemSweep, iAngle, true);
        ctx.closePath();
        ctx.fillStyle = cat.color + 'aa';
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Item label
        const imid = iAngle + itemSweep / 2;
        const iR = (midR + outerR) / 2;
        ctx.save();
        ctx.translate(cx + Math.cos(imid) * iR, cy + Math.sin(imid) * iR);
        ctx.rotate(imid + (imid > Math.PI / 2 && imid < Math.PI * 1.5 ? Math.PI : 0));
        ctx.fillStyle = '#222';
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.name.substring(0, 10), 0, 0);
        ctx.restore();
      });
    }

    angle += sweep;
  });

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, innerR * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = T.sunburstSelected !== null ? '#444' : '#333';
  ctx.fill();
  ctx.strokeStyle = '#C6FFBB';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#C6FFBB';
  ctx.font = 'bold 11px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MENU', cx, cy);
}

function handleSunburstClick(canvas, x, y) {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const innerR = Math.min(w, h) * 0.18;
  const midR = Math.min(w, h) * 0.32;
  const outerR = Math.min(w, h) * 0.45;

  // Click center → deselect
  if (dist < innerR * 0.6) {
    S.sunburstSelected = null;
    drawSunburst(canvas);
    return;
  }

  let clickAngle = Math.atan2(dy, dx);
  if (clickAngle < -Math.PI / 2) clickAngle += Math.PI * 2;
  const normAngle = clickAngle + Math.PI / 2;
  const total = MENU_CATEGORIES.reduce((s, c) => s + c.items, 0);

  // Inner ring hit → select category
  if (dist >= innerR && dist <= midR) {
    let a = 0;
    for (let i = 0; i < MENU_CATEGORIES.length; i++) {
      const sweep = (MENU_CATEGORIES[i].items / total) * Math.PI * 2;
      if (normAngle >= a && normAngle < a + sweep) {
        S.sunburstSelected = (S.sunburstSelected === i) ? null : i;
        drawSunburst(canvas);
        return;
      }
      a += sweep;
    }
  }

  // Outer ring hit → open item overlay
  if (dist > midR && dist <= outerR && S.sunburstSelected !== null) {
    const cat = MENU_CATEGORIES[S.sunburstSelected];
    const catItems = MENU_ITEMS.filter(item => item.cat === S.sunburstSelected);
    const sweep = (cat.items / total) * Math.PI * 2;
    let catStartAngle = 0;
    for (let i = 0; i < S.sunburstSelected; i++) {
      catStartAngle += (MENU_CATEGORIES[i].items / total) * Math.PI * 2;
    }
    const itemSweep = sweep / catItems.length;
    const relAngle = normAngle - catStartAngle;
    if (relAngle >= 0 && relAngle < sweep) {
      const idx = Math.floor(relAngle / itemSweep);
      if (idx >= 0 && idx < catItems.length) {
        showItemOverlay(catItems[idx]);
      }
    }
  }
}

function wireMenuEvents() {
  const content = $('cfg-content');
  if (!content) return;

  // Menu nav pills
  content.querySelectorAll('[data-action^="menu-nav-"]').forEach(el => {
    el.addEventListener('click', () => {
      S.menuNav = el.dataset.action.replace('menu-nav-', '');
      render();
    });
  });

  // Category edit
  content.querySelectorAll('[data-action="cat-edit"]').forEach(el => {
    el.addEventListener('click', () => {
      const cat = MENU_CATEGORIES.find(c => c.id === parseInt(el.dataset.id));
      if (cat) showCategoryOverlay(cat);
    });
  });

  // Item edit
  content.querySelectorAll('[data-action="item-edit"]').forEach(el => {
    el.addEventListener('click', () => {
      const item = MENU_ITEMS.find(i => i.id === parseInt(el.dataset.id));
      if (item) showItemOverlay(item);
    });
  });

  // Station edit
  content.querySelectorAll('[data-action="station-edit"]').forEach(el => {
    el.addEventListener('click', () => {
      const station = STATIONS.find(s => s.id === parseInt(el.dataset.id));
      if (station) showStationOverlay(station);
    });
  });

  // Init sunburst if on that view
  if (S.menuNav === 'Sunburst') {
    requestAnimationFrame(() => initSunburst());
  }
}

// ══════════════════════════════════════════════════════
//  OPERATIONS — Checkout
// ══════════════════════════════════════════════════════

const TAX_RULES = [
  { id: 0, name: 'State Sales Tax', rate: '6.000', items: 18, active: true },
  { id: 1, name: 'Liquor Tax',      rate: '3.000', items: 8,  active: true },
  { id: 2, name: 'Hospitality Surtax', rate: '1.000', items: 25, active: true },
];

const DISCOUNTS = [
  { id: 0, name: 'Employee Meal', amount: '50%', type: 'COMP', active: true },
  { id: 1, name: 'Happy Hour',    amount: '$3 off', type: 'DISC', active: true },
  { id: 2, name: 'VIP Comp',      amount: '100%', type: 'COMP', active: true },
  { id: 3, name: 'Military',      amount: '10%', type: 'DISC', active: true },
];

const TIP_ADJ_CHECKS = [];

const CHECKOUT_SECTIONS = ['Tax', 'Tips', 'Disc', 'Pay', 'Tip Adj', 'Batch'];

function renderCheckout() {
  const secHtml = CHECKOUT_SECTIONS.map(s =>
    pillBtn(s, '#33ffff', S.checkoutSection === s, `chk-sec-${s}`)
  ).join('');

  let viewHtml = '';
  if (S.checkoutSection === 'Tax') viewHtml = renderTax();
  else if (S.checkoutSection === 'Tips') viewHtml = renderTips();
  else if (S.checkoutSection === 'Disc') viewHtml = renderDisc();
  else if (S.checkoutSection === 'Pay') viewHtml = renderPay();
  else if (S.checkoutSection === 'Tip Adj') viewHtml = renderTipAdj();
  else if (S.checkoutSection === 'Batch') viewHtml = renderBatch();

  return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${secHtml}</div>
    <div style="overflow-y:auto;flex:1;">${viewHtml}</div>`;
}

function renderTax() {
  const rows = TAX_RULES.map(t => {
    const statusBdg = t.active ? badge('ACTIVE', '#33ffff') : badge('OFF', '#666');
    return itemRow({
      label: t.name,
      sublabel: `Applied to ${t.items} items`,
      right: `${t.rate}%`,
      badge: statusBdg,
      action: 'tax-edit',
      id: t.id,
    });
  }).join('');
  return rows + `<div class="btn-wrap" style="margin-top:8px;"><div data-action="tax-add" style="background:${T.bg};border:3px solid #33ffff;clip-path:${chamfer('lg')};padding:10px;text-align:center;color:#33ffff;font-family:${T.fb};font-size:0.75rem;cursor:pointer;text-transform:uppercase;letter-spacing:2px;">+ Add Tax Rule</div></div>`;
}

function renderTips() {
  return `
    ${sunkenPanel('Tip Prompt', `
      ${toggleRow('tip-enabled', 'Enabled', true)}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px;">
        ${fieldInput('tip-s1', 'Suggested 1', '18%')}
        ${fieldInput('tip-s2', 'Suggested 2', '20%')}
        ${fieldInput('tip-s3', 'Suggested 3', '25%')}
      </div>
      ${toggleRow('tip-custom', 'Custom Amount', true)}
    `)}
    ${sunkenPanel('Tip Pooling', `
      ${toggleRow('pool-enabled', 'Enabled', false)}
      ${fieldInput('pool-method', 'Pool Method', 'Even Split')}
      ${toggleRow('pool-bar', 'Include Bartenders', true)}
    `)}
    ${sunkenPanel('Tip-Out', `
      ${toggleRow('tipout-enabled', 'Enabled', true)}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px;">
        ${fieldInput('tipout-bus', 'Busser %', '3%')}
        ${fieldInput('tipout-bar', 'Barback %', '2%')}
        ${fieldInput('tipout-host', 'Host %', '1%')}
      </div>
    `)}
    ${sunkenPanel('CC Payout', `
      ${fieldInput('cc-payout', 'CC Tips Paid On', 'Next Payroll')}
      ${toggleRow('cc-sameday', 'Same-day Cash-out', false)}
    `)}
    <div class="btn-wrap" style="margin-top:8px;"><div data-action="close-overlay" style="background:${T.mint};color:${T.bg};font-family:${T.fb};font-size:0.75rem;padding:10px;text-align:center;cursor:pointer;clip-path:${chamfer('md')};text-transform:uppercase;letter-spacing:2px;">Save</div></div>
  `;
}

function renderDisc() {
  const rows = DISCOUNTS.map(d => {
    const typeBdg = d.type === 'COMP' ? badge('COMP', '#fcbe40') : badge('DISC', '#33ffff');
    const statusBdg = d.active ? badge('ACTIVE', '#33ffff') : badge('OFF', '#666');
    return itemRow({
      label: d.name,
      right: d.amount,
      badge: `${typeBdg} ${statusBdg}`,
      action: 'disc-edit',
      id: d.id,
    });
  }).join('');
  return rows + `<div class="btn-wrap" style="margin-top:8px;"><div data-action="disc-add" style="background:${T.bg};border:3px solid #33ffff;clip-path:${chamfer('lg')};padding:10px;text-align:center;color:#33ffff;font-family:${T.fb};font-size:0.75rem;cursor:pointer;text-transform:uppercase;letter-spacing:2px;">+ Add Discount</div></div>`;
}

function renderPay() {
  return `
    ${sunkenPanel('Accepted Methods', `
      ${toggleRow('pay-cc', 'Credit/Debit', true)}
      ${toggleRow('pay-cash', 'Cash', true)}
      ${toggleRow('pay-gift', 'Gift Card', false)}
      ${toggleRow('pay-house', 'House Account', false)}
      ${toggleRow('pay-split', 'Split Payment', true)}
      ${toggleRow('pay-preauth', 'Pre-Auth (Bar Tab)', true)}
    `)}
    ${sunkenPanel('Settings', `
      ${fieldInput('pay-preauth-amt', 'Pre-Auth Amount ($)', '50.00')}
      ${toggleRow('pay-autoclose', 'Auto-close Tabs', false)}
      ${fieldInput('pay-autoclose-hrs', 'Auto-close After', '4 hours')}
    `)}
    <div class="btn-wrap" style="margin-top:8px;"><div style="background:${T.mint};color:${T.bg};font-family:${T.fb};font-size:0.75rem;padding:10px;text-align:center;cursor:pointer;clip-path:${chamfer('md')};text-transform:uppercase;letter-spacing:2px;">Save</div></div>
  `;
}

function renderTipAdj() {
  const unadj = TIP_ADJ_CHECKS.filter(c => c.status === 'ADJ').length;
  const rows = TIP_ADJ_CHECKS.sort((a, b) => (a.status === 'ADJ' ? 0 : 1) - (b.status === 'ADJ' ? 0 : 1)).map(c => {
    const statusBdg = c.status === 'ADJ' ? badge('ADJ', '#fcbe40') : badge('DONE', '#33ffff');
    const tipInfo = c.tip !== null ? `Adjusted $${c.tip.toFixed(2)}` : `CC ****${c.cc}`;
    return itemRow({
      label: `#${c.id}  ${c.server}`,
      sublabel: `${c.table} &middot; ${c.guests} guests &middot; ${tipInfo}`,
      right: `$${c.total.toFixed(2)}`,
      badge: statusBdg,
      chevron: c.status === 'ADJ',
      action: c.status === 'ADJ' ? 'tipadj-edit' : '',
      id: c.id,
    });
  }).join('');

  return `<div style="font-family:${T.fb};font-size:0.7rem;color:#fcbe40;margin-bottom:8px;text-transform:uppercase;letter-spacing:2px;">${unadj} checks need tip adjustment</div>${rows}`;
}

function renderBatch() {
  const statusColor = S.batchState === 'done' ? '#44FF88' : '#33ffff';
  const statusText = S.batchState === 'done' ? 'CLOSED' : 'OPEN &middot; 14hrs';
  return `
    ${sunkenPanel('Batch Settings', `
      ${toggleRow('batch-auto', 'Auto-Batch', false)}
      ${fieldInput('batch-time', 'Auto-Batch Time', '2:00 AM')}
      ${toggleRow('batch-mgr', 'Require Mgr PIN', true)}
    `)}
    ${sunkenPanel('Pre-Batch Checks', `
      ${toggleRow('batch-warn-open', 'Warn Open Tabs', true)}
      ${toggleRow('batch-warn-tips', 'Warn Unadjusted Tips', true)}
      ${toggleRow('batch-force-tips', 'Force Tip Adjust Before Batch', false)}
      ${toggleRow('batch-print', 'Print Batch Report', true)}
    `)}
    ${sunkenPanel('Live Batch Status', `
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:0.7rem;">
        <span style="color:#fcbe40;">Transactions:</span><span>0</span>
        <span style="color:#fcbe40;">CC Total:</span><span>$0.00</span>
        <span style="color:#fcbe40;">Tips Total:</span><span>$0.00</span>
        <span style="color:#fcbe40;">Status:</span><span style="color:${statusColor};">${statusText}</span>
      </div>
    `)}
    <!-- Batch Dialing Box -->
    <div style="background:#008080;border:3px solid #555;padding:8px;margin-top:4px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-size:20px;">&#128187;</div>
        <canvas id="cfg-batch-canvas" width="200" height="30" style="flex:1;"></canvas>
        <div style="font-size:20px;">&#9634;</div>
      </div>
      <div id="cfg-batch-status" style="font-family:${T.fb};font-size:0.6rem;color:#C6FFBB;text-align:center;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">
        ${S.batchState === 'idle' ? 'Idle &mdash; tap Close Batch' : S.batchState === 'done' ? 'Batch accepted &#10003;' : 'Processing...'}
      </div>
    </div>
    <div class="btn-wrap" style="margin-top:8px;">
      <div data-action="batch-close" style="background:${S.batchState === 'done' ? '#44FF88' : '#ff3355'};color:${T.bg};font-family:${T.fb};font-size:0.75rem;padding:10px;text-align:center;cursor:pointer;clip-path:${chamfer('md')};text-transform:uppercase;letter-spacing:2px;">
        ${S.batchState === 'done' ? 'Batch Complete' : 'Close Batch'}
      </div>
    </div>
  `;
}

// ── Checkout Overlays ──

function showTaxOverlay(tax) {
  const t = tax || { name: '', rate: '0.000', active: true };
  showOverlay(`
    ${overlayTitle(tax ? 'Edit Tax Rule' : 'New Tax Rule')}
    ${overlayBody(`
      ${fieldInput('tax-name', 'Name', t.name)}
      ${fieldInput('tax-rate', 'Rate (3dp %)', t.rate)}
      ${fieldInput('tax-group', 'Tax Group Name', 'Default')}
      ${toggleRow('tax-active', 'Active', t.active)}
    `)}
    ${overlayFooter(tax ? `${deleteBtn()}${saveBtn()}` : saveBtn())}
  `);
}

function showDiscOverlay(disc) {
  const d = disc || { name: '', amount: '', type: 'DISC', active: true };
  showOverlay(`
    ${overlayTitle(disc ? 'Edit Discount' : 'New Discount')}
    ${overlayBody(`
      ${fieldInput('disc-name', 'Name', d.name)}
      ${fieldInput('disc-type', 'Type', d.type === 'COMP' ? 'Comp' : 'Discount')}
      ${fieldInput('disc-method', 'Method', d.amount)}
      ${toggleRow('disc-mgr', 'Requires Manager PIN', false)}
      ${toggleRow('disc-active', 'Active', d.active)}
    `)}
    ${overlayFooter(disc ? `${deleteBtn()}${saveBtn()}` : saveBtn())}
  `);
}

function showTipAdjOverlay(check) {
  const c = check;
  const t18 = (c.total * 0.18).toFixed(2);
  const t20 = (c.total * 0.20).toFixed(2);
  const t25 = (c.total * 0.25).toFixed(2);
  showOverlay(`
    ${overlayTitle('Tip Adjustment')}
    ${overlayBody(`
      ${fieldInput('ta-server', 'Server', c.server, { readonly: true })}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${fieldInput('ta-table', 'Table', c.table, { readonly: true })}
        ${fieldInput('ta-guests', 'Guests', String(c.guests), { readonly: true })}
      </div>
      ${fieldInput('ta-total', 'Total Charged', '$' + c.total.toFixed(2), { readonly: true })}
      <div>
        <label style="font-family:${T.fb};font-size:0.65rem;color:#fcbe40;text-transform:uppercase;letter-spacing:2px;">Suggested Tips</label>
        <div style="display:flex;gap:6px;margin-top:4px;">
          <div style="flex:1;background:${T.bg2};border:2px solid #fcbe40;color:#fcbe40;clip-path:${chamfer('sm')};padding:6px;text-align:center;font-family:${T.fb};font-size:0.65rem;cursor:pointer;">18%<br>$${t18}</div>
          <div style="flex:1;background:${T.bg2};border:2px solid #fcbe40;color:#fcbe40;clip-path:${chamfer('sm')};padding:6px;text-align:center;font-family:${T.fb};font-size:0.65rem;cursor:pointer;">20%<br>$${t20}</div>
          <div style="flex:1;background:${T.bg2};border:2px solid #fcbe40;color:#fcbe40;clip-path:${chamfer('sm')};padding:6px;text-align:center;font-family:${T.fb};font-size:0.65rem;cursor:pointer;">25%<br>$${t25}</div>
        </div>
      </div>
      ${fieldInput('ta-tip', 'Signed Tip', '')}
      ${fieldInput('ta-cash', 'Cash Tip Add', '$0.00')}
    `)}
    ${overlayFooter(`<div data-action="close-overlay" class="btn-wrap" style="flex:1;"><div style="background:#44FF88;color:${T.bg};font-family:${T.fb};font-size:0.8rem;padding:10px;text-align:center;cursor:pointer;clip-path:${chamfer('md')};text-transform:uppercase;letter-spacing:2px;">Confirm Tip</div></div>`)}
  `);
}

// ── Batch Dialing Animation ──

function runBatchAnimation() {
  if (S.batchState !== 'idle') return;
  S.batchState = 'running';

  const canvas = $('cfg-batch-canvas');
  const statusEl = $('cfg-batch-status');
  if (!canvas || !statusEl) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  const steps = [
    'Submitting 47 txns...',
    'Waiting for response...',
    'Verifying totals...',
    'Batch accepted \u2713',
  ];

  let dotProgress = 0;
  let stepIdx = 0;

  function drawDots() {
    ctx.clearRect(0, 0, w, h);

    // Draw dashed line
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw traveling dots
    const dotColor = stepIdx >= steps.length - 1 ? '#33ffff' : '#C6FFBB';
    for (let i = 0; i < 4; i++) {
      const pos = ((dotProgress + i * 0.25) % 1) * w;
      ctx.beginPath();
      ctx.arc(pos, h / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    }
  }

  const animId = setInterval(() => {
    dotProgress += 0.02;
    drawDots();
  }, 50);
  trackInterval(animId);

  const stepId = setInterval(() => {
    stepIdx++;
    if (stepIdx < steps.length) {
      statusEl.textContent = steps[stepIdx];
    }
    if (stepIdx >= steps.length - 1) {
      clearInterval(stepId);
      setTimeout(() => {
        S.batchState = 'done';
        clearInterval(animId);
        render();
      }, 1500);
    }
  }, 1200);
  trackInterval(stepId);

  statusEl.textContent = steps[0];
  drawDots();
}

function wireCheckoutEvents() {
  const content = $('cfg-content');
  if (!content) return;

  // Section tabs
  content.querySelectorAll('[data-action^="chk-sec-"]').forEach(el => {
    el.addEventListener('click', () => {
      S.checkoutSection = el.dataset.action.replace('chk-sec-', '');
      render();
    });
  });

  // Tax edit/add
  content.querySelectorAll('[data-action="tax-edit"]').forEach(el => {
    el.addEventListener('click', () => {
      const tax = TAX_RULES.find(t => t.id === parseInt(el.dataset.id));
      if (tax) showTaxOverlay(tax);
    });
  });
  content.querySelectorAll('[data-action="tax-add"]').forEach(el => {
    el.addEventListener('click', () => showTaxOverlay(null));
  });

  // Discount edit/add
  content.querySelectorAll('[data-action="disc-edit"]').forEach(el => {
    el.addEventListener('click', () => {
      const disc = DISCOUNTS.find(d => d.id === parseInt(el.dataset.id));
      if (disc) showDiscOverlay(disc);
    });
  });
  content.querySelectorAll('[data-action="disc-add"]').forEach(el => {
    el.addEventListener('click', () => showDiscOverlay(null));
  });

  // Tip adjustment edit
  content.querySelectorAll('[data-action="tipadj-edit"]').forEach(el => {
    el.addEventListener('click', () => {
      const check = TIP_ADJ_CHECKS.find(c => c.id === parseInt(el.dataset.id));
      if (check) showTipAdjOverlay(check);
    });
  });

  // Batch close button
  content.querySelectorAll('[data-action="batch-close"]').forEach(el => {
    el.addEventListener('click', () => runBatchAnimation());
  });

  // Init batch canvas idle state
  if (S.checkoutSection === 'Batch') {
    requestAnimationFrame(() => {
      const canvas = $('cfg-batch-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.lineTo(200, 15);
        ctx.stroke();
      }
    });
  }
}

// ══════════════════════════════════════════════════════
//  HARDWARE — Shared Topology Canvas System
// ══════════════════════════════════════════════════════

const HW_PRINTERS = [
  { id: 0, name: 'Epson TM-T88VI',  conn: 'WiFi', ip: '10.0.0.186', port: '9100', type: 'receipt', color: '#3388ff', status: 'online' },
  { id: 1, name: 'Star TSP143',      conn: 'WiFi', ip: '10.0.0.19',  port: '9100', type: 'kitchen', color: '#ff8844', status: 'online' },
  { id: 2, name: 'Epson TM-T20III',  conn: 'WiFi', ip: '10.0.0.31',  port: '9100', type: 'kitchen', color: '#ff8844', status: 'online' },
  { id: 3, name: 'Star SP700',       conn: 'USB',  ip: '',            port: '',     type: 'receipt', color: '#3388ff', status: 'online' },
];

const HW_READERS = [
  { id: 0, name: 'Dejavoo SPIN',    conn: 'USB',       ip: '',            port: '',    processor: 'Dejavoo', color: '#33ffff', status: 'online' },
  { id: 1, name: 'Dejavoo P8 (RELAY)', conn: 'WiFi',   ip: '10.0.0.55',  port: '443', processor: 'Dejavoo', color: '#33ffff', status: 'online' },
  { id: 2, name: 'Square Reader',   conn: 'Bluetooth', ip: '',            port: '',    processor: 'Square',  color: '#b48efa', status: 'online' },
];

const HW_PERIPHERALS = [
  { id: 0, name: 'APG Vasario',    conn: 'Printer-kick', ip: '',           port: '',     type: 'drawer',  color: '#fcbe40', status: 'online' },
  { id: 1, name: 'KDS Expo',       conn: 'WiFi',         ip: '10.0.0.40', port: '8080', type: 'kds',     color: '#C6FFBB', status: 'online' },
  { id: 2, name: 'KDS Grill',      conn: 'WiFi',         ip: '10.0.0.41', port: '8080', type: 'kds',     color: '#C6FFBB', status: 'online' },
  { id: 3, name: 'Honeywell 1900', conn: 'USB',          ip: '',           port: '',     type: 'scanner', color: '#ff6699', status: 'online' },
];

// Device positions for hit testing (populated during draw)
let hwDeviceRects = [];
let hwDotProgress = 0;
let hwCursorBlink = true;

function getHwDevices() {
  const sub = TABS.hardware.subs[S.subIdx];
  if (sub === 'Printers') return HW_PRINTERS;
  if (sub === 'CC Readers') return HW_READERS;
  if (sub === 'Peripherals') return HW_PERIPHERALS;
  return [];
}

function getHwFilters() {
  const sub = TABS.hardware.subs[S.subIdx];
  if (sub === 'Printers') return [
    { label: 'Receipt', color: '#3388ff', type: 'receipt' },
    { label: 'Kitchen', color: '#ff8844', type: 'kitchen' },
  ];
  if (sub === 'CC Readers') return [
    { label: 'Dejavoo', color: '#33ffff', type: 'Dejavoo' },
    { label: 'Square', color: '#b48efa', type: 'Square' },
  ];
  if (sub === 'Peripherals') return [
    { label: 'Drawer', color: '#fcbe40', type: 'drawer' },
    { label: 'KDS', color: '#C6FFBB', type: 'kds' },
    { label: 'Scanner', color: '#ff6699', type: 'scanner' },
  ];
  return [];
}

function renderHardwareView(devices, filters) {
  const filterHtml = [pillBtn('ALL', '#ffcba4', S.hwFilter === 'ALL', 'hw-filter-ALL')]
    .concat(filters.map(f => pillBtn(f.label, f.color, S.hwFilter === f.type, `hw-filter-${f.type}`)))
    .join('');

  return `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">
      ${filterHtml}
      ${pillBtn('Scan Network', '#44FF88', false, 'hw-scan')}
    </div>
    <canvas id="cfg-topo-canvas" style="width:100%;flex:1;background:#222;border:1px solid #444;"></canvas>
    <div id="cfg-scan-status" style="font-family:${T.fb};font-size:0.6rem;color:#C6FFBB;text-align:center;margin-top:4px;min-height:16px;text-transform:uppercase;letter-spacing:1px;"></div>`;
}

function renderPrinters() { return renderHardwareView(HW_PRINTERS, getHwFilters()); }
function renderCCReaders() { return renderHardwareView(HW_READERS, getHwFilters()); }
function renderPeripherals() { return renderHardwareView(HW_PERIPHERALS, getHwFilters()); }

// ── Topology Canvas Drawing ──

function initTopology() {
  const canvas = $('cfg-topo-canvas');
  if (!canvas) return;
  const container = canvas.parentElement;
  canvas.width = container.clientWidth;
  canvas.height = Math.max(200, container.clientHeight - 60);

  hwDeviceRects = [];
  hwDotProgress = 0;

  // Start scan animation
  runScanAnimation(canvas);

  // Hit testing
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    for (const dr of hwDeviceRects) {
      if (x >= dr.x && x <= dr.x + dr.w && y >= dr.y && y <= dr.y + dr.h) {
        showDeviceOverlay(dr.device);
        return;
      }
    }
  });
}

function runScanAnimation(canvas) {
  const ctx = canvas.getContext('2d');
  const devices = getHwDevices();
  const filtered = S.hwFilter === 'ALL' ? devices : devices.filter(d => (d.type || d.processor) === S.hwFilter);
  const statusEl = $('cfg-scan-status');

  const scanSteps = ['Initializing scan...', 'Probing network...', 'Detecting devices...'];
  let step = 0;
  let revealed = 0;

  function scanStep() {
    if (step < scanSteps.length) {
      if (statusEl) statusEl.textContent = scanSteps[step];
      step++;
      setTimeout(scanStep, 600);
    } else if (revealed < filtered.length) {
      revealed++;
      if (statusEl) statusEl.textContent = `Found ${revealed}/${filtered.length} devices`;
      drawTopology(canvas, filtered.slice(0, revealed));
      setTimeout(scanStep, 400);
    } else {
      if (statusEl) statusEl.textContent = `${filtered.length} devices online`;
      // Start connection animation loop
      startConnectionAnim(canvas, filtered);
    }
  }

  // Draw empty terminal first
  drawTopology(canvas, []);
  scanStep();
}

function startConnectionAnim(canvas, devices) {
  hwDotProgress = 0;
  const anim = () => {
    hwDotProgress += 0.008;
    if (hwDotProgress > 1) hwDotProgress = 0;
    hwCursorBlink = Math.floor(Date.now() / 500) % 2 === 0;
    drawTopology(canvas, devices);
    trackRAF(requestAnimationFrame(anim));
  };
  trackRAF(requestAnimationFrame(anim));
}

function drawTopology(canvas, devices) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const monW = 80;
  const monH = 60;

  // Draw retro terminal monitor
  drawRetroMonitor(ctx, cx - monW / 2, cy - monH / 2, monW, monH);

  // Position devices in a circle around the terminal
  hwDeviceRects = [];
  const radius = Math.min(w, h) * 0.35;
  const angleStep = (Math.PI * 2) / Math.max(devices.length, 1);
  const startAngle = -Math.PI / 2;

  devices.forEach((dev, i) => {
    const angle = startAngle + i * angleStep;
    const dx = cx + Math.cos(angle) * radius;
    const dy = cy + Math.sin(angle) * radius;
    const devW = 60;
    const devH = 50;

    // Draw connection line
    const isWifi = dev.conn === 'WiFi' || dev.conn === 'Bluetooth';
    drawConnectionLine(ctx, cx, cy, dx, dy, isWifi, dev.color);

    // Draw device icon
    const sub = TABS.hardware.subs[S.subIdx];
    if (sub === 'Printers') drawPrinterIcon(ctx, dx - devW / 2, dy - devH / 2, devW, devH, dev.color);
    else if (sub === 'CC Readers') drawCCReaderIcon(ctx, dx - devW / 2, dy - devH / 2, devW, devH, dev.color);
    else if (sub === 'Peripherals') drawPeripheralIcon(ctx, dx - devW / 2, dy - devH / 2, devW, devH, dev);

    // Device label
    ctx.fillStyle = dev.color;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(dev.name.substring(0, 14), dx, dy + devH / 2 + 12);

    // Store rect for hit testing
    hwDeviceRects.push({ x: dx - devW / 2, y: dy - devH / 2, w: devW, h: devH + 16, device: dev });
  });
}

function drawRetroMonitor(ctx, x, y, w, h) {
  // Beige bezel
  ctx.fillStyle = '#c0b8a0';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8a8070';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // Screen (blue)
  const sx = x + 6;
  const sy = y + 4;
  const sw = w - 12;
  const sh = h - 16;
  ctx.fillStyle = '#000088';
  ctx.fillRect(sx, sy, sw, sh);

  // C:\KIND> cursor
  ctx.fillStyle = '#aaaaff';
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('C:\\KIND>', sx + 3, sy + 12);
  if (hwCursorBlink) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + 52, sy + 5, 6, 10);
  }

  // Green power LED
  ctx.beginPath();
  ctx.arc(x + w - 10, y + h - 6, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#44FF88';
  ctx.fill();

  // Base
  ctx.fillStyle = '#a09880';
  ctx.fillRect(x + w * 0.3, y + h, w * 0.4, 6);
}

function drawConnectionLine(ctx, x1, y1, x2, y2, isDashed, color) {
  ctx.strokeStyle = color + '88';
  ctx.lineWidth = 1.5;
  if (isDashed) ctx.setLineDash([4, 4]);
  else ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Traveling dots
  for (let i = 0; i < 4; i++) {
    const t = (hwDotProgress + i * 0.25) % 1;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function drawPrinterIcon(ctx, x, y, w, h, color) {
  // Body
  ctx.fillStyle = '#ddd';
  ctx.fillRect(x + 5, y + 12, w - 10, h - 20);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5, y + 12, w - 10, h - 20);

  // Paper tray (top)
  ctx.fillStyle = '#eee';
  ctx.fillRect(x + 10, y + 4, w - 20, 12);

  // Receipt paper coming out
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 14, y - 4, w - 28, 12);
  // Printed lines
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 18, y + i * 3);
    ctx.lineTo(x + w - 18, y + i * 3);
    ctx.stroke();
  }

  // LED
  ctx.beginPath();
  ctx.arc(x + 12, y + h - 12, 2, 0, Math.PI * 2);
  ctx.fillStyle = '#44FF88';
  ctx.fill();
}

function drawCCReaderIcon(ctx, x, y, w, h, color) {
  // Body
  ctx.fillStyle = '#333';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.fillRect(x + 8, y + 2, w - 16, h - 6);
  ctx.strokeRect(x + 8, y + 2, w - 16, h - 6);

  // Screen
  ctx.fillStyle = '#112211';
  ctx.fillRect(x + 12, y + 6, w - 24, 14);
  ctx.fillStyle = color;
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('READY', x + w / 2, y + 14);
  ctx.fillText('$0.00', x + w / 2, y + 20);

  // Keypad dots (3x3)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.beginPath();
      ctx.arc(x + 18 + c * 8, y + 28 + r * 6, 2, 0, Math.PI * 2);
      ctx.fillStyle = '#666';
      ctx.fill();
    }
  }

  // Contactless arcs
  ctx.strokeStyle = color + '88';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(x + w / 2, y - 2, i * 4, Math.PI * 0.8, Math.PI * 0.2, true);
    ctx.stroke();
  }
}

function drawPeripheralIcon(ctx, x, y, w, h, dev) {
  if (dev.type === 'drawer') {
    // Cash drawer: wide flat box
    ctx.fillStyle = '#555';
    ctx.fillRect(x + 2, y + 15, w - 4, h - 22);
    ctx.strokeStyle = dev.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 15, w - 4, h - 22);
    // Handle
    ctx.fillStyle = '#888';
    ctx.fillRect(x + w * 0.3, y + 12, w * 0.4, 5);
  } else if (dev.type === 'kds') {
    // KDS monitor
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 5, y + 2, w - 10, h - 14);
    ctx.strokeStyle = dev.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 5, y + 2, w - 10, h - 14);
    // Dark green screen
    ctx.fillStyle = '#0a2a0a';
    ctx.fillRect(x + 8, y + 5, w - 16, h - 20);
    // Order tickets
    ctx.fillStyle = '#33aa33';
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('#142 BAR', x + 10, y + 13);
    ctx.fillText('#143 T5', x + 10, y + 20);
    ctx.fillText('#144 T2', x + 10, y + 27);
    // Base
    ctx.fillStyle = '#444';
    ctx.fillRect(x + w * 0.35, y + h - 12, w * 0.3, 8);
  } else if (dev.type === 'scanner') {
    // Handheld scanner body
    ctx.fillStyle = '#444';
    ctx.fillRect(x + 15, y + 5, w - 30, h - 10);
    ctx.strokeStyle = dev.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 15, y + 5, w - 30, h - 10);
    // Scan window
    ctx.fillStyle = '#111';
    ctx.fillRect(x + 18, y + 8, w - 36, 10);
    // Pulsing red laser line
    const laserAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 200);
    ctx.strokeStyle = `rgba(255,0,0,${laserAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 13);
    ctx.lineTo(x + w - 20, y + 13);
    ctx.stroke();
  }
}

// ── Hardware Overlays ──

function showDeviceOverlay(device) {
  const sub = TABS.hardware.subs[S.subIdx];
  let fieldsHtml = '';

  fieldsHtml += fieldInput('hw-name', 'Name', device.name);
  if (device.ip) fieldsHtml += fieldInput('hw-ip', 'IP Address', device.ip);
  if (device.port) fieldsHtml += fieldInput('hw-port', 'Port', device.port);
  fieldsHtml += fieldInput('hw-conn', 'Connection', device.conn, { readonly: true });

  if (sub === 'Printers') {
    fieldsHtml += fieldInput('hw-type', 'Type', device.type, { readonly: true });
    fieldsHtml += toggleRow('hw-autocut', 'Auto-cut', true);
    fieldsHtml += toggleRow('hw-kick', 'Kick Drawer', true);
    // Receipt layout section
    fieldsHtml += `<div style="margin-top:8px;">`;
    fieldsHtml += sunkenPanel('Receipt Layout', `
      ${fieldInput('hw-biz', 'Business Name', 'KINDpos Cafe')}
      ${fieldInput('hw-addr', 'Address', '123 Main St')}
      ${fieldInput('hw-phone', 'Phone', '(555) 123-4567')}
      ${toggleRow('hw-logo', 'Show Logo', true)}
      ${toggleRow('hw-server-name', 'Show Server Name', true)}
      ${toggleRow('hw-table-num', 'Show Table #', true)}
      ${fieldInput('hw-footer', 'Footer Message', 'Thank you!')}
      ${toggleRow('hw-cust-copy', 'Print Customer Copy', true)}
      ${toggleRow('hw-kitchen-tkt', 'Print Kitchen Tkt', true)}
    `);
    fieldsHtml += `</div>`;
  } else if (sub === 'CC Readers') {
    fieldsHtml += fieldInput('hw-proc', 'Processor', device.processor, { readonly: true });
    fieldsHtml += toggleRow('hw-tip-prompt', 'Tip Prompt', true);
    fieldsHtml += toggleRow('hw-contactless', 'Contactless', true);
    fieldsHtml += toggleRow('hw-manual', 'Manual Entry', false);
  } else if (sub === 'Peripherals') {
    fieldsHtml += fieldInput('hw-type', 'Type', device.type, { readonly: true });
    if (device.type === 'drawer') {
      fieldsHtml += toggleRow('hw-kick-sale', 'Kick on Sale', true);
      fieldsHtml += toggleRow('hw-kick-cash', 'Kick on Cash', true);
    } else if (device.type === 'kds') {
      fieldsHtml += fieldInput('hw-station', 'Station Filter', 'All');
      fieldsHtml += toggleRow('hw-autobump', 'Auto-bump Timer', false);
    } else if (device.type === 'scanner') {
      fieldsHtml += toggleRow('hw-beep', 'Beep on Scan', true);
    }
  }

  showOverlay(`
    ${overlayTitle(device.name)}
    ${overlayBody(fieldsHtml)}
    ${overlayFooter(saveBtn())}
  `);
}

function wireHardwareEvents() {
  const content = $('cfg-content');
  if (!content) return;

  // Filter pills
  content.querySelectorAll('[data-action^="hw-filter-"]').forEach(el => {
    el.addEventListener('click', () => {
      S.hwFilter = el.dataset.action.replace('hw-filter-', '');
      render();
    });
  });

  // Scan button
  content.querySelectorAll('[data-action="hw-scan"]').forEach(el => {
    el.addEventListener('click', () => {
      render(); // Re-triggers scan animation
    });
  });

  // Init topology canvas
  requestAnimationFrame(() => initTopology());
}

// ══════════════════════════════════════════════════════
//  Scene Registration
// ══════════════════════════════════════════════════════

registerLiteScene('lite-config', {
  onEnter(el) {
    sceneEl = el;
    resetState();

    // Clock update interval
    const clockId = setInterval(() => {
      const tbar = $('tbar');
      if (tbar && APP.screen === 'lite-config') {
        tbar.innerHTML = `<span style="font-family:${T.fb};font-size:0.7rem;color:#aaa;letter-spacing:1px;">${cfgTime()}</span>`;
      }
    }, 30000);

    render();

    return () => {
      cancelAllAnimations();
      clearInterval(clockId);
      sceneEl = null;
      const sbar = $('sbar');
      if (sbar) sbar.style.display = '';
    };
  }
});
