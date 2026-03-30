// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Persistent Chrome (TBar + SBar)
// ═══════════════════════════════════════════════════

import { APP, $, fmtTime, greeting } from './app.js';
import { CFG, PALM_LOGO } from './config.js';
import { sbarContent, tbarLoggedOut, tbarLoggedIn } from './theme-manager.js';

let _barSubtitle = '';

export function setBarSubtitle(subtitle) {
  _barSubtitle = subtitle || '';
  // Update tbar clock area to show subtitle
  const clockEl = $('_tbar_clock');
  if (clockEl) {
    clockEl.textContent = _barSubtitle ? `${fmtTime()} // ${_barSubtitle}` : fmtTime();
  }
}

const SCREEN_TITLES = {
  'snapshot':       'Snapshot',
  'check-overview': 'Check Overview',
  'add-item':       'Add Item',
  'add-items':      'Add Items',
  'modify':         'Modify',
  'payment':        'Payment',
  'close-day':      'Close Day',
  'settings':       'Settings',
  'printer-discovery': 'Printer Discovery',
};

export function renderBars() {
  const t = $('tbar');
  const s = $('sbar');

  // ── TBar ──
  if (!APP.staff) {
    const timeDisplay = _barSubtitle ? `${fmtTime()} // ${_barSubtitle}` : fmtTime();
    t.innerHTML = tbarLoggedOut(timeDisplay);
  } else {
    const title = SCREEN_TITLES[APP.screen] || '';
    const orderRef = (APP.p && APP.p.order) ? ` ${APP.p.order.id}` : '';
    const titlePart = title ? ` // ${title}${orderRef}` : '';

    t.innerHTML = tbarLoggedIn({
      timeStr: fmtTime(),
      titlePart,
      staffName: `${greeting()}, ${APP.staff.name}`,
      role: APP.staff.role,
      screen: APP.screen,
      msgCount: APP.screen === 'snapshot' ? 4 : 0,
    });

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

  // ── SBar ──
  if (APP.staff) {
    s.innerHTML = sbarContent({
      role: APP.staff.role,
      showSettings: APP.staff.role === 'manager',
      onSettings: "window.go('settings')",
    });
  } else {
    s.innerHTML = sbarContent();
  }
}

// Auto-refresh clock every 30s — only update the clock text, not the full DOM
setInterval(() => {
  if (APP.staff) {
    const clockEl = $('_tbar_clock');
    if (clockEl) clockEl.textContent = _barSubtitle ? `${fmtTime()} // ${_barSubtitle}` : fmtTime();
  }
}, 30000);
