// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Login Scene
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { CFG, FALLBACK_ROSTER, PALM_LOGO } from '../config.js';
import { registerScene, go } from '../scene-manager.js';

registerScene('login', {
  onEnter(el) {
    let pin = '';
    let err = '';
    let holdTimer = null;
    let roster = [...FALLBACK_ROSTER]; // Start with fallback, upgrade if API responds

    // ── Fetch live roster + config from API on mount ──
    fetchRoster();
    fetchConfig();

    async function fetchRoster() {
      try {
        APP.offline = false;
        const data = await apiFetch('/api/v1/servers');
        if (data && data.servers && data.servers.length > 0) {
          roster = data.servers;
          console.log(`Roster loaded: ${roster.length} staff from API`);
        } else {
          // API responded but no employees seeded — keep fallback
          APP.offline = true;
          console.log('API returned empty roster — using fallback');
        }
      } catch (_) {
        APP.offline = true;
        console.log('API unreachable — using fallback roster');
      }
    }

    async function fetchConfig() {
      try {
        const bundle = await apiFetch('/api/v1/config/terminal-bundle');
        if (bundle && bundle.store && bundle.store.tax_rules) {
          const defaultRule = bundle.store.tax_rules.find(r => r.tax_rule_id === 'default');
          if (defaultRule) {
            CFG.TAX = defaultRule.rate_percent / 100;
            console.log(`Tax rate loaded from config: ${(CFG.TAX * 100).toFixed(2)}%`);
          }
        }
      } catch (_) {
        console.log('Config fetch failed — using existing tax rate');
      }
    }

    // ── PIN Hex Visualization ──
    function renderPinHexes() {
      const maxDigits = 4;
      let html = '';
      for (let i = 0; i < maxDigits; i++) {
        const filled = i < pin.length;
        const bgColor = filled ? 'var(--mint)' : '#444';
        const textColor = filled ? 'var(--bg)' : 'var(--mint)';
        html += `<div style="width:44px;height:50px;background:${bgColor};border:2px solid var(--mint);clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);display:flex;align-items:center;justify-content:center;font-family:var(--fb);font-size:24px;color:${textColor};"></div>`;
      }
      return html;
    }

    // ── Draw Login Screen ──
    function draw() {
      const errH = err
        ? `<div style="background:rgba(232,64,64,0.15);border:1px solid var(--red);padding:4px 8px;font-size:15px;color:var(--red);margin-top:4px;border-radius:4px;">\u26A0 ${err}</div>`
        : '';

      el.innerHTML = `
        <div style="display:grid;grid-template-columns:280px 400px 1fr;height:100%;padding:16px;gap:16px;padding-bottom:56px;">
          <!-- LEFT: BRANDING -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
            <img src="${PALM_LOGO}" style="height:300px;width:auto;object-fit:contain;">
            <div style="font-family:var(--fhi-solid);font-size:36px;color:var(--mint);">STORE NAME</div>
          </div>

          <!-- CENTER: NUMPAD -->
          <div style="display:flex;flex-direction:column;justify-content:center;">
            <div style="background:var(--mint);border:var(--border-w) solid var(--mint);padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;clip-path:polygon(10px 0%,calc(100% - 10px) 0%,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0% calc(100% - 10px),0% 10px);" id="pad"></div>
          </div>

          <!-- RIGHT: PIN DISPLAY + ACTIONS -->
          <div style="display:flex;flex-direction:column;gap:0;">
            <div id="pin-frame" style="border:var(--border-w) solid var(--mint);padding:8px;display:flex;justify-content:center;align-items:center;gap:4px;flex-wrap:wrap;height:65px;clip-path:polygon(8px 0%,calc(100% - 8px) 0%,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0% calc(100% - 8px),0% 8px);">
              ${renderPinHexes()}
            </div>
            <div style="width:100%;">${errH}</div>
            <div style="display:flex;flex-direction:column;justify-content:center;gap:10px;flex:1;" id="action-btns"></div>
          </div>
        </div>`;

      buildNumpad();
      buildActionButtons();
    }

    // ── Build Numpad ──
    function buildNumpad() {
      const pad = $('pad');
      if (!pad) return;

      const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','>>>'];

      keys.forEach(k => {
        const wrap = document.createElement('div');
        wrap.className = 'btn-wrap';

        const b = document.createElement('div');
        b.textContent = k;
        const isCLR = k === 'CLR';
        const isENT = k === '>>>';

        if (isCLR) {
          b.style.cssText = 'background:var(--clr-red);color:var(--bg);border:none;font-family:var(--fb);font-size:72px;display:flex;align-items:center;justify-content:center;height:88px;cursor:pointer;user-select:none;clip-path:polygon(5px 0%,calc(100% - 5px) 0%,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0% calc(100% - 5px),0% 5px);';
        } else if (isENT) {
          b.style.cssText = 'background:var(--go-green);color:var(--bg);border:none;font-family:var(--fb);font-size:72px;display:flex;align-items:center;justify-content:center;height:88px;cursor:pointer;user-select:none;clip-path:polygon(5px 0%,calc(100% - 5px) 0%,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0% calc(100% - 5px),0% 5px);';
        } else {
          b.style.cssText = 'background:var(--bg);color:var(--mint);border:none;font-family:var(--fb);font-size:100px;display:flex;align-items:center;justify-content:center;height:88px;cursor:pointer;user-select:none;clip-path:polygon(5px 0%,calc(100% - 5px) 0%,100% 5px,100% calc(100% - 5px),calc(100% - 5px) 100%,5px 100%,0% calc(100% - 5px),0% 5px);';
        }

        b.addEventListener('click', () => press(k));

        if (isCLR) {
          const startHold = () => { holdTimer = setTimeout(() => { pin = ''; err = ''; draw(); }, 500); };
          const endHold   = () => { clearTimeout(holdTimer); };
          b.addEventListener('mousedown',   startHold);
          b.addEventListener('mouseup',     endHold);
          b.addEventListener('mouseleave',  endHold);
          b.addEventListener('touchstart',  startHold);
          b.addEventListener('touchend',    endHold);
        }

        wrap.appendChild(b);
        pad.appendChild(wrap);
      });
    }

    // ── Build Action Buttons ──
    function buildActionButtons() {
      const ab = $('action-btns');
      if (!ab) return;

      const actions = [
        { label: 'Quick Service', act: () => { if (!matchPin()) return; const o = makeOrder('quick_service'); go('check-editing', { order: o }); } },
        { label: 'Settings',      act: () => { if (!matchPin()) return; go('settings'); } },
        { label: 'Clock in/out',  act: () => {} },
      ];

      actions.forEach(a => {
        const wrap = document.createElement('div');
        wrap.className = 'btn-wrap';

        const btn = document.createElement('div');
        btn.textContent = a.label;
        btn.style.cssText = 'background:var(--mint);color:var(--bg);border:none;font-family:var(--fb);font-size:32px;height:56px;cursor:pointer;text-align:center;display:flex;align-items:center;justify-content:center;clip-path:polygon(6px 0%,calc(100% - 6px) 0%,100% 6px,100% calc(100% - 6px),calc(100% - 6px) 100%,6px 100%,0% calc(100% - 6px),0% 6px);';
        btn.addEventListener('click', a.act);

        wrap.appendChild(btn);
        ab.appendChild(wrap);
      });
    }

    // ── Key Press Handler ──
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

    // ── Submit PIN ──
    function submit() {
      if (!pin) return;
      if (!matchPin()) {
        err = 'PIN not recognised.';
        pin = '';
        draw();
        shakeFrame();
        return;
      }
      go('snapshot');
    }

    // ── Match PIN against roster (API or fallback) ──
    function matchPin() {
      const match = roster.find(r => r.pin === pin);
      if (match) {
        APP.staff = match;
        // The snapshot scene will handle view switching based on APP.staff.role
        return true;
      }
      return false;
    }

    // ── Shake animation on wrong PIN ──
    function shakeFrame() {
      const f = $('pin-frame');
      if (f) {
        f.style.animation = 'shake 0.3s ease';
        setTimeout(() => { if (f) f.style.animation = ''; }, 400);
      }
    }

    // ── Make a new order ──
    function makeOrder(type) {
      const o = {
        id: `C-${APP.nextNum++}`,
        label: type === 'quick_service' ? 'Quick' : 'Table',
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
      if (APP.screen !== 'login') return;
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') press('CLR');
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') { pin = ''; err = ''; draw(); }
    }

    window.addEventListener('keydown', keyHandler);

    // Initial render
    draw();

    // Return cleanup function
    return () => {
      window.removeEventListener('keydown', keyHandler);
      clearTimeout(holdTimer);
    };
  }
});