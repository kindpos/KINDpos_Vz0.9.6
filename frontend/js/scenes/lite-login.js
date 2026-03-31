// ═══════════════════════════════════════════════════
//  KINDpos Lite — Login Scene
//  Three-column layout: Admin | Mode | PIN Pad
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { CFG, FALLBACK_ROSTER } from '../config.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T, chamfer, buildNumpadKey, errBanner, numpadContainerStyle } from '../theme-manager.js';

registerLiteScene('lite-login', {
  onEnter(el) {
    let pin = '';
    let err = '';
    let selectedMode = null; // null | 'quick-service' | 'quick-bar' | 'quick-pay'
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

    // ── Shared Style Constants ──
    const ADMIN_GREEN = '#33ff99';
    const CONFIG_ORANGE = '#faad74';
    const MODE_MINT = '#C6FFBB';

    // ── Draw Login Screen ──
    function draw() {
      // Override tbar with lite time format
      updateClock();

      // Hide sbar for clean look
      const sbar = $('sbar');
      if (sbar) sbar.style.display = 'none';

      // PIN display dots/underscores — 4 evenly spaced positions
      const pinChars = Array.from({length: 4}, (_, i) =>
        i < pin.length
          ? `<span style="color:${T.mint};font-size:36px;">\u25CF</span>`
          : `<span style="color:${T.mint};opacity:0.4;font-size:36px;">_</span>`
      ).join('');

      // Mode button style helper
      const modeStyle = (mode) => {
        const isSelected = selectedMode === mode;
        const borderStyle = isSelected
          ? `border:${T.borderW} solid ${T.cyan};box-shadow:0 0 8px ${T.cyan};`
          : `border:${T.borderW} solid #1a1a1a;`;
        return `background:${MODE_MINT};${borderStyle}font-family:${T.fb};font-size:36px;color:#1a1a1a;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;user-select:none;line-height:1.1;padding:14px 12px;clip-path:${chamfer('lg')};`;
      };

      // Admin button base style
      const adminBtnStyle = (bg) =>
        `background:${bg};border:${T.borderW} solid #1a1a1a;font-family:${T.fb};color:#1a1a1a;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;user-select:none;line-height:1.1;padding:14px 12px;clip-path:${chamfer('lg')};`;

      el.innerHTML = `
        <div style="display:grid;grid-template-columns:160px 180px 1fr;grid-template-rows:1fr auto;height:100%;padding:14px 16px 24px 16px;gap:10px;position:relative;">
          <!-- COLUMN 1: Admin Buttons -->
          <div style="display:flex;flex-direction:column;gap:8px;align-self:start;">
            <div class="btn-wrap">
              <div id="btn-clock" style="${adminBtnStyle(ADMIN_GREEN)}font-size:32px;width:100%;height:120px;">Clock<br>in/out</div>
            </div>
            <div class="btn-wrap">
              <div id="btn-reporting" style="${adminBtnStyle(ADMIN_GREEN)}font-size:32px;width:100%;height:120px;">Reporting</div>
            </div>
            <div class="btn-wrap">
              <div id="btn-config" style="${adminBtnStyle(CONFIG_ORANGE)}font-size:24px;width:100%;height:50px;">Configuration</div>
            </div>
          </div>

          <!-- COLUMN 2: Mode Buttons -->
          <div style="display:flex;flex-direction:column;gap:8px;align-self:start;">
            <div class="btn-wrap">
              <div id="btn-qs" style="${modeStyle('quick-service')}width:100%;height:120px;">Quick<br>Service</div>
            </div>
            <div class="btn-wrap">
              <div id="btn-qb" style="${modeStyle('quick-bar')}width:100%;height:120px;">Quick<br>Bar</div>
            </div>
            <div class="btn-wrap">
              <div id="btn-qp" style="${modeStyle('quick-pay')}width:100%;height:120px;">Quick<br>Pay</div>
            </div>
          </div>

          <!-- COLUMN 3: PIN Pad Panel -->
          <div style="background:${T.mint};border:${T.borderW} solid ${T.mint};padding:8px;display:flex;flex-direction:column;gap:6px;clip-path:${chamfer('xl')};grid-row:1/3;">
            <!-- PIN Display Strip (sunken inset) -->
            <div id="pin-display" style="background:#1a1a1a;border:2px inset #1a1a1a;padding:6px 16px;display:flex;align-items:center;justify-content:space-around;font-family:${T.fb};height:36px;clip-path:${chamfer('lg')};">${pinChars}</div>
            <!-- Number Grid (reuses numpad container style) -->
            <div style="${numpadContainerStyle()}flex:1;padding:4px;" id="pad"></div>
          </div>

          <!-- Watermark (in grid footer, right-aligned) -->
          <div style="grid-column:1/4;text-align:right;font-family:${T.fb};font-size:14px;user-select:none;pointer-events:none;padding-right:4px;"><span style="color:${T.gold};">KIND</span><span style="color:#ff3355;">pos</span><span style="color:${T.mint};">/lite_</span><span style="color:${T.gold};">Vz1.0</span></div>
        </div>`;

      buildNumpad();
      wireButtons();

      // Show error via design-system errBanner
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

    function wireButtons() {
      // Admin buttons — validate PIN before routing
      const clockBtn = $('btn-clock');
      const reportBtn = $('btn-reporting');
      const configBtn = $('btn-config');

      if (clockBtn) clockBtn.addEventListener('click', () => {
        if (!requirePin()) return;
        liteGo('lite-clock');
      });
      if (reportBtn) reportBtn.addEventListener('click', () => {
        if (!requirePin()) return;
        liteGo('lite-reporting');
      });
      if (configBtn) configBtn.addEventListener('click', () => {
        if (!requirePin()) return;
        liteGo('lite-config');
      });

      // Mode buttons — radio selection (toggle)
      const qsBtn = $('btn-qs');
      const qbBtn = $('btn-qb');
      const qpBtn = $('btn-qp');

      if (qsBtn) qsBtn.addEventListener('click', () => selectMode('quick-service'));
      if (qbBtn) qbBtn.addEventListener('click', () => selectMode('quick-bar'));
      if (qpBtn) qpBtn.addEventListener('click', () => selectMode('quick-pay'));
    }

    function selectMode(mode) {
      selectedMode = selectedMode === mode ? null : mode;
      draw();
    }

    function requirePin() {
      if (!pin) {
        flashPinPad();
        return false;
      }
      if (!matchPin()) {
        err = 'PIN not recognised.';
        pin = '';
        draw();
        shakePinDisplay();
        return false;
      }
      return true;
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

      // Route based on selected mode
      if (selectedMode === 'quick-service') {
        const o = makeOrder();
        liteGo('lite-order', { order: o, mode: 'quick-service' });
      } else if (selectedMode === 'quick-bar') {
        const o = makeOrder();
        liteGo('lite-order', { order: o, mode: 'quick-bar' });
      } else if (selectedMode === 'quick-pay') {
        liteGo('lite-payment');
      } else {
        // No mode selected — open/closed checks view
        liteGo('lite-snapshot');
      }
    }

    function matchPin() {
      const match = roster.find(r => r.pin === pin);
      if (match) {
        APP.staff = match;
        return true;
      }
      return false;
    }

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
      // Restore sbar visibility
      const sbar = $('sbar');
      if (sbar) sbar.style.display = '';
    };
  }
});
