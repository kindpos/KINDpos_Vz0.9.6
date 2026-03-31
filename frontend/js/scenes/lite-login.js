// ═══════════════════════════════════════════════════
//  KINDpos Lite — Login Scene
//  Three-column layout: Admin | Quick-Login | PIN Pad
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { CFG, FALLBACK_ROSTER } from '../config.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T, chamfer, buildNumpadKey, errBanner, numpadContainerStyle } from '../theme-manager.js';

registerLiteScene('lite-login', {
  onEnter(el) {
    let pin = '';
    let err = '';
    let roster = [...FALLBACK_ROSTER];
    let clockInterval = null;

    // Fetch live roster + config
    fetchRoster();
    fetchConfig();

    async function fetchRoster() {
      try {
        APP.offline = false;
        const data = await apiFetch('/api/v1/servers');
        if (data && data.servers && data.servers.length > 0) {
          roster = data.servers;
          console.log(`[Lite] Roster loaded: ${roster.length} staff from API`);
        } else {
          APP.offline = true;
          console.log('[Lite] API returned empty roster — using fallback');
        }
      } catch (_) {
        APP.offline = true;
        console.log('[Lite] API unreachable — using fallback roster');
      }
    }

    async function fetchConfig() {
      try {
        const bundle = await apiFetch('/api/v1/config/terminal-bundle');
        if (bundle && bundle.store && bundle.store.tax_rules) {
          const defaultRule = bundle.store.tax_rules.find(r => r.tax_rule_id === 'default');
          if (defaultRule) {
            CFG.TAX = defaultRule.rate_percent / 100;
          }
        }
      } catch (_) { /* keep existing tax rate */ }
    }

    // ── Time formatter: dd/mm/yyyy <> hh:mmam/pm ──
    function liteTime() {
      const n = new Date();
      const dd = String(n.getDate()).padStart(2, '0');
      const mm = String(n.getMonth() + 1).padStart(2, '0');
      const yyyy = n.getFullYear();
      let h = n.getHours();
      const ampm = h >= 12 ? 'pm' : 'am';
      h = h % 12 || 12;
      const hh = String(h).padStart(2, '0');
      const min = String(n.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} <> ${hh}:${min}${ampm}`;
    }

    function updateClock() {
      const tbar = $('tbar');
      if (tbar && APP.screen === 'lite-login') {
        tbar.innerHTML = `<span style="font-family:${T.fb};font-size:28px;color:#1a1a1a;">${liteTime()}</span>`;
      }
    }

    // ── Style Constants ──
    const ADMIN_GREEN = '#33ff99';
    const CONFIG_PEACH = '#ffcba4';

    // ── Draw Login Screen ──
    function draw() {
      // Override tbar with lite time format
      updateClock();

      // PIN display: 4 dots/underscores
      const pinChars = Array.from({length: 4}, (_, i) =>
        i < pin.length
          ? `<span style="color:${T.mint};font-size:36px;">\u25CF</span>`
          : `<span style="color:${T.mint};opacity:0.4;font-size:36px;">_</span>`
      ).join('');

      // Admin button style helper (solid fill, dark text)
      const adminBtn = (bg, fontSize) =>
        `background:${bg};border:${T.borderW} solid #1a1a1a;font-family:${T.fb};font-size:${fontSize || '32px'};color:${T.bg};display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;user-select:none;line-height:1.1;padding:14px 12px;clip-path:${chamfer('lg')};`;

      // Mode button style helper (solid mint bg, dark text)
      const modeBtn = () =>
        `background:${T.mint};border:${T.borderW} solid #1a1a1a;font-family:${T.fb};font-size:32px;color:${T.bg};display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;user-select:none;line-height:1.1;padding:14px 12px;clip-path:${chamfer('lg')};`;

      el.innerHTML = `
        <div id="login-content" style="display:grid;grid-template-columns:25% 25% 1fr;height:100%;padding:14px 16px;gap:10px;position:relative;">
          <!-- COLUMN 1: Pre-Login Actions -->
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="btn-wrap" style="flex:35;">
              <div id="btn-clock" style="${adminBtn(ADMIN_GREEN)}width:100%;height:100%;">Clock<br>in/out</div>
            </div>
            <div class="btn-wrap" style="flex:35;">
              <div id="btn-reporting" style="${adminBtn(ADMIN_GREEN)}width:100%;height:100%;">Reporting</div>
            </div>
            <div class="btn-wrap" style="flex:30;">
              <div id="btn-config" style="${adminBtn(CONFIG_PEACH, '28px')}width:100%;height:100%;">Configuration</div>
            </div>
          </div>

          <!-- COLUMN 2: Quick Login Shortcuts -->
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="btn-wrap" style="flex:1;">
              <div id="btn-qs" style="${modeBtn()}width:100%;height:100%;">Quick<br>Service</div>
            </div>
            <div class="btn-wrap" style="flex:1;">
              <div id="btn-qb" style="${modeBtn()}width:100%;height:100%;">Quick<br>Bar</div>
            </div>
            <div class="btn-wrap" style="flex:1;">
              <div id="btn-qp" style="${modeBtn()}width:100%;height:100%;">Quick<br>Pay</div>
            </div>
          </div>

          <!-- COLUMN 3: Numpad with PIN Display -->
          <div style="background:${T.mint};border:${T.borderW} solid ${T.mint};padding:10px;display:flex;flex-direction:column;gap:6px;clip-path:${chamfer('xl')};">
            <!-- PIN Display Strip (sunken inset) -->
            <div id="pin-display" style="background:#1a1a1a;border:2px inset #1a1a1a;padding:6px 16px;display:flex;align-items:center;justify-content:space-around;font-family:${T.fb};height:36px;clip-path:${chamfer('lg')};">${pinChars}</div>
            <!-- Number Grid -->
            <div style="${numpadContainerStyle()}flex:1;padding:4px;" id="pad"></div>
          </div>

        </div>`;

      buildNumpad();
      wireButtons();

      // Show error via errBanner
      if (err) {
        const errDiv = document.createElement('div');
        errDiv.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);z-index:10;';
        errDiv.innerHTML = errBanner(err);
        el.firstElementChild.appendChild(errDiv);
      }
    }

    function buildNumpad() {
      const pad = $('pad');
      if (!pad) return;

      const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','>>>'];
      keys.forEach(k => {
        const isCLR = k === 'CLR';
        const keyEl = buildNumpadKey(k, {
          onPress: () => press(k),
          onLongPress: isCLR ? { delay: 500, action: () => { pin = ''; err = ''; draw(); } } : null
        });

        // Scale down key heights for lite's denser layout
        const inner = keyEl.querySelector('div');
        if (inner) inner.style.height = 'auto';

        pad.appendChild(keyEl);
      });
    }

    // ── Wire Column 1 + Column 2 Buttons ──
    function wireButtons() {
      // Column 1: Pre-login actions (no PIN required — navigate directly)
      // REVIEW: Clock in/out navigates to lite-clock; if that scene needs staff identity,
      // it should handle its own PIN prompt. Reporting/Config are stub scenes for now.
      const clockBtn = $('btn-clock');
      const reportBtn = $('btn-reporting');
      const configBtn = $('btn-config');

      if (clockBtn) clockBtn.addEventListener('click', () => { liteGo('lite-clock'); });
      if (reportBtn) reportBtn.addEventListener('click', () => { liteGo('lite-reporting'); });
      if (configBtn) configBtn.addEventListener('click', () => { liteGo('lite-config'); });

      // Column 2: Quick-login shortcuts (PIN required, then route)
      const qsBtn = $('btn-qs');
      const qbBtn = $('btn-qb');
      const qpBtn = $('btn-qp');

      if (qsBtn) qsBtn.addEventListener('click', () => quickLogin('quick-service'));
      if (qbBtn) qbBtn.addEventListener('click', () => quickLogin('quick-bar'));
      if (qpBtn) qpBtn.addEventListener('click', () => quickLogin('quick-pay'));
    }

    // ── Quick Login: validate PIN, then navigate to role-specific workflow ──
    function quickLogin(mode) {
      if (!pin) {
        flashPinPad();
        return;
      }
      if (!matchPin()) {
        err = 'PIN not recognised.';
        pin = '';
        draw();
        shakePinDisplay();
        return;
      }
      if (mode === 'quick-service') {
        const o = makeOrder();
        liteGo('lite-order', { order: o, mode: 'quick-service' });
      } else if (mode === 'quick-bar') {
        const o = makeOrder();
        liteGo('lite-order', { order: o, mode: 'quick-bar' });
      } else if (mode === 'quick-pay') {
        liteGo('lite-payment');
      }
    }

    function flashPinPad() {
      const display = $('pin-display');
      if (display) {
        display.style.boxShadow = `0 0 20px ${T.cyan}`;
        setTimeout(() => { if ($('pin-display')) $('pin-display').style.boxShadow = ''; }, 600);
      }
    }

    function shakePinDisplay() {
      const display = $('pin-display');
      if (display) {
        display.style.animation = 'shake 0.3s ease';
        setTimeout(() => { if ($('pin-display')) $('pin-display').style.animation = ''; }, 400);
      }
    }

    // ── Key Press Handler ──
    function press(k) {
      err = '';
      if (k === 'CLR') {
        pin = pin.slice(0, -1);
      } else if (k === '>>>') {
        submit();
        return;
      } else if (pin.length < 4) {
        pin += k;
      }
      draw();
    }

    // ── Submit PIN ──
    function submit() {
      if (!pin) {
        flashPinPad();
        return;
      }
      if (!matchPin()) {
        err = 'PIN not recognised.';
        pin = '';
        draw();
        shakePinDisplay();
        return;
      }
      // No mode selected — go to snapshot
      liteGo('lite-snapshot');
    }

    // ── Match PIN against roster ──
    function matchPin() {
      const match = roster.find(r => r.pin === pin);
      if (match) {
        APP.staff = match;
        return true;
      }
      return false;
    }

    // ── Make a new order ──
    function makeOrder() {
      const o = {
        id: `C-${APP.nextNum++}`,
        label: 'Quick',
        guest_count: 1,
        server: APP.staff.name,
        status: 'open',
        elapsed: '0:00',
        items: [],
      };
      APP.orders.push(o);
      return o;
    }

    // ── Keyboard Support ──
    function keyHandler(e) {
      if (APP.screen !== 'lite-login') return;
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') press('CLR');
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') { pin = ''; err = ''; draw(); }
    }

    window.addEventListener('keydown', keyHandler);

    // Start clock interval
    clockInterval = setInterval(updateClock, 30000);

    draw();

    return () => {
      window.removeEventListener('keydown', keyHandler);
      clearInterval(clockInterval);
    };
  }
});
