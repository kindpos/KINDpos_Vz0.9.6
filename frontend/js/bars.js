// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Persistent Chrome (TBar + SBar)
// ═══════════════════════════════════════════════════

import { APP, $, fmtTime, greeting } from './app.js';
import { CFG, PALM_LOGO } from './config.js';

const SCREEN_TITLES = {
  'snapshot':       'Snapshot',
  'check-overview': 'Check Overview',
  'check-editing':  'Check Editing',
  'add-item':       'Add Item',
  'modify':         'Modify',
  'payment':        'Payment',
  'close-day':      'Close Day',
  'settings':       'Settings',
};

export function renderBars() {
  const t = $('tbar');
  const s = $('sbar');

  // ── TBar ──
  if (!APP.staff) {
    t.innerHTML = `<span id="_tbar_clock" style="font-family:var(--fb);font-size:36px;">${fmtTime()}</span><span></span>`;
  } else {
    const badge = APP.staff.role === 'manager'
      ? `<span style="background:#44FF88;color:var(--bg);padding:0 5px;font-size:14px;">[MGR]</span>`
      : `<span style="background:#FF8C00;color:var(--bg);padding:0 5px;font-size:14px;">[SVR]</span>`;

    const title = SCREEN_TITLES[APP.screen] || '';
    const orderRef = (APP.p && APP.p.order) ? ` ${APP.p.order.id}` : '';
    const titlePart = title ? ` // ${title}${orderRef}` : '';

    // Settings button in header (manager only)
    const headerSettings = APP.staff.role === 'manager'
      ? `<span style="background:var(--bg);color:var(--mint);padding:0 8px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;font-family:var(--fb);cursor:pointer;"
              id="_tbar_settings">Settings</span>`
      : '';

    const backBtn = (APP.screen === 'check-editing' || APP.screen === 'check-overview')
      ? `<span style="background:var(--bg);color:var(--mint);padding:0 8px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;font-family:var(--fb);cursor:pointer;margin-right:8px;"
              id="_tbar_back">\u2190</span>`
      : '';

    t.innerHTML = `
      <div style="display:flex;align-items:center;">
        ${backBtn}
        <span style="font-size:20px;font-family:var(--fb);"><span id="_tbar_clock">${fmtTime()}</span>${titlePart} // ${greeting()}, ${APP.staff.name}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        ${badge}
        ${headerSettings}
        <span style="background:var(--red);color:var(--bg);width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;cursor:pointer;clip-path:polygon(4px 0%,calc(100% - 4px) 0%,100% 4px,100% calc(100% - 4px),calc(100% - 4px) 100%,4px 100%,0% calc(100% - 4px),0% 4px);"
              id="_tbar_logout">\u2715</span>
      </div>`;

    const logoutBtn = $('_tbar_logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => window.go('login'));
    }

    const backEl = $('_tbar_back');
    if (backEl) {
      backEl.addEventListener('click', () => {
        if (window.onBackRequested) window.onBackRequested();
        else window.go('snapshot');
      });
    }

    const settingsBtn = $('_tbar_settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => window.go('settings'));
    }
  }

  // ── SBar — Mint background with chamfered dark text boxes ──
  s.innerHTML = `
    <span class="sbar-box">
      <span style="font-family:var(--fb);color:var(--mint);font-size:24px;">TRM-</span><span style="font-family:var(--fb);color:var(--kind-gold);font-size:24px;">01</span><span style="font-family:var(--fb);color:var(--mint);font-size:24px;"> // Vz</span><span style="font-family:var(--fb);color:var(--kind-gold);font-size:24px;">1.0</span>
    </span>
    <span class="sbar-box">
      <span style="font-family:var(--fhi);font-size:30px;color:var(--kind-gold);">KIND</span><span style="font-family:var(--fb);font-size:30px;color:var(--clr-red);">pos</span>
    </span>`;
}

// Auto-refresh clock every 30s — only update the clock text, not the full DOM
setInterval(() => {
  if (APP.staff) {
    const clockEl = $('_tbar_clock');
    if (clockEl) clockEl.textContent = fmtTime();
  }
}, 30000);