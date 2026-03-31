// ═══════════════════════════════════════════════════
//  KINDpos Lite — Login Scene
//  Replicates the login UI but routes to lite scenes.
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { CFG, FALLBACK_ROSTER, PALM_LOGO } from '../config.js';
import { registerLiteScene, liteGo } from '../lite-scene-manager.js';
import { T, pinFrame, errBanner, buildNumpadKey, buildActionButton, numpadContainerStyle } from '../theme-manager.js';

registerLiteScene('lite-login', {
  onEnter(el) {
    let pin = '';
    let err = '';
    let holdTimer = null;
    let roster = [...FALLBACK_ROSTER];

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

    // ── Draw Login Screen ──
    function draw() {
      el.innerHTML = `
        <div id="login-content" style="display:grid;grid-template-columns:280px 400px 1fr;height:100%;padding:16px;gap:16px;padding-bottom:56px;">
          <!-- LEFT: BRANDING -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
            <img src="${PALM_LOGO}" style="height:300px;width:auto;object-fit:contain;">
            <div style="font-family:${T.fhiSolid};font-size:36px;color:${T.mint};">KINDpos LITE</div>
          </div>

          <!-- CENTER: NUMPAD -->
          <div style="display:flex;flex-direction:column;justify-content:center;">
            <div style="${numpadContainerStyle()}" id="pad"></div>
          </div>

          <!-- RIGHT: PIN DISPLAY + ACTIONS -->
          <div style="display:flex;flex-direction:column;gap:0;">
            ${pinFrame(pin.length)}
            <div style="width:100%;">${errBanner(err)}</div>
            <div style="display:flex;flex-direction:column;justify-content:center;gap:10px;flex:1;" id="action-btns"></div>
          </div>
        </div>`;

      buildNumpad();
      buildActionButtons();
    }

    function buildNumpad() {
      const pad = $('pad');
      if (!pad) return;
      const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','>>>'];
      keys.forEach(k => {
        const isCLR = k === 'CLR';
        const btn = buildNumpadKey(k, {
          onPress: () => press(k),
          onLongPress: isCLR ? { delay: 500, action: () => { pin = ''; err = ''; draw(); } } : null
        });
        pad.appendChild(btn);
      });
    }

    function buildActionButtons() {
      const ab = $('action-btns');
      if (!ab) return;
      const actions = [
        { label: 'Quick Service', act: () => { if (!matchPin()) return; const o = makeOrder(); liteGo('lite-order', { order: o }); } },
        { label: 'Settings',      act: () => { console.log('[Lite] Settings — PLACEHOLDER'); } },
        { label: 'Clock in/out',  act: () => { console.log('[Lite] Clock — PLACEHOLDER'); } },
      ];
      actions.forEach(a => ab.appendChild(buildActionButton(a.label, a.act)));
    }

    function press(k) {
      err = '';
      if (k === 'CLR') {
        pin = pin.slice(0, -1);
      } else if (k === '>>>') {
        submit();
        return;
      } else if (pin.length < 6) {
        pin += k;
      }
      draw();
    }

    function submit() {
      if (!pin) return;
      if (!matchPin()) {
        err = 'PIN not recognised.';
        pin = '';
        draw();
        shakeFrame();
        return;
      }
      // Role-based routing
      const role = (APP.staff.role || '').toLowerCase();
      if (role === 'manager' || role === 'admin' || role === 'mgr') {
        liteGo('lite-snapshot');
      } else {
        liteGo('lite-order');
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

    function shakeFrame() {
      const f = $('pin-frame');
      if (f) {
        f.style.animation = 'shake 0.3s ease';
        setTimeout(() => { if (f) f.style.animation = ''; }, 400);
      }
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
    draw();

    return () => {
      window.removeEventListener('keydown', keyHandler);
      clearTimeout(holdTimer);
    };
  }
});
