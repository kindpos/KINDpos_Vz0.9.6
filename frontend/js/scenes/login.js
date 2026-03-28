// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Login Scene
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { FALLBACK_ROSTER, PALM_LOGO } from '../config.js';
import { registerScene, go } from '../scene-manager.js';

registerScene('login', {
  onEnter(el) {
    let pin = '';
    let err = '';
    let holdTimer = null;
    let roster = [...FALLBACK_ROSTER]; // Start with fallback, upgrade if API responds

    // ── Fetch live roster from API on mount ──
    fetchRoster();

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

    // ── PIN Hex Visualization ──
    function renderPinHexes() {
      if (pin.length === 0) {
        return '<span style="opacity:0.35;font-size:15px;">enter PIN</span>';
      }
      const S = 30;
      const H = S * 0.866;
      const cStep = S * 0.75;
      const maxCols = 6;
      let html = '';
      for (let i = 0; i < pin.length && i < maxCols * 2; i++) {
        const col = i % maxCols;
        const row = Math.floor(i / maxCols);
        const x = col * cStep + 4;
        const y = row * (H + 4) + (col % 2 === 1 ? H * 0.5 : 0) + 4;
        html += `<div style="position:absolute;left:${x}px;top:${y}px;width:${S}px;height:${H}px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;inset:0;background:var(--mint);clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);"></div>
          <div style="position:absolute;inset:2px;background:var(--bg3);clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);"></div>
        </div>`;
      }
      return html;
    }

    // ── Draw Login Screen ──
    function draw() {
      const errH = err
        ? `<div style="background:rgba(232,64,64,0.15);border:1px solid var(--red);padding:4px 8px;font-size:15px;color:var(--red);margin-top:4px;border-radius:4px;">\u26A0 ${err}</div>`
        : '';

      el.innerHTML = `
        <div style="display:flex;height:100%;align-items:center;justify-content:center;gap:20px;">
          <!-- LEFT: LOGO + PIN DISPLAY -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;width:180px;">
            <div style="width:60px;height:60px;display:flex;align-items:center;justify-content:center;">
              <img src="${PALM_LOGO}" style="width:55px;height:55px;object-fit:contain;animation:spin 20s linear infinite;">
            </div>
            <div id="pin-frame" style="width:160px;height:70px;border:2px solid var(--mint);border-radius:8px;background:var(--bg2);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;">
              ${renderPinHexes()}
            </div>
            <div style="width:160px;">${errH}</div>
          </div>

          <!-- CENTER: NUMPAD -->
          <div style="background:var(--mint);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:grid;grid-template-columns:repeat(3,80px);gap:8px;" id="pad"></div>
          </div>

          <!-- RIGHT: ACTION HEXES -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;margin-left:20px;" id="action-hexes"></div>
        </div>`;

      buildNumpad();
      buildActionHexes();
    }

    // ── Build Numpad ──
    function buildNumpad() {
      const pad = $('pad');
      if (!pad) return;

      const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','>>>'];

      keys.forEach(k => {
        const b = document.createElement('div');
        b.textContent = k;
        const isCLR = k === 'CLR';
        const isENT = k === '>>>';

        if (isCLR) {
          b.style.cssText = 'width:80px;height:60px;background:var(--red);color:var(--bg);border:none;border-radius:6px;font-family:var(--fb);font-size:15px;font-weight:bold;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;';
        } else if (isENT) {
          b.style.cssText = 'width:80px;height:60px;background:#22CC66;color:var(--bg);border:none;border-radius:6px;font-family:var(--fb);font-size:16px;font-weight:bold;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;';
        } else {
          b.style.cssText = 'width:80px;height:60px;background:var(--bg);color:var(--mint);border:none;border-radius:6px;font-family:var(--fb);font-size:22px;font-weight:bold;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;';
        }

        if (!isCLR && !isENT) {
          b.addEventListener('mouseover', () => { b.style.background = 'var(--bg3)'; });
          b.addEventListener('mouseout',  () => { b.style.background = 'var(--bg)'; });
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

        pad.appendChild(b);
      });
    }

    // ── Build Action Hexes ──
    function buildActionHexes() {
      const ah = $('action-hexes');
      if (!ah) return;

      const hexes = [
        { label: 'Clock\nin/out', act: () => {} },
        { label: 'Settings', act: () => { if (!matchPin()) return; go('settings'); } },
        { label: 'Quick\nOrder',  act: () => { if (!matchPin()) return; const o = makeOrder('quick_service'); go('check-editing', { order: o }); } },
      ];

      hexes.forEach(h => {
        const d = document.createElement('div');
        d.style.cssText = 'width:120px;height:100px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:20px;cursor:pointer;position:relative;white-space:pre-line;';
        d.innerHTML = `
          <div style="position:absolute;inset:0;background:var(--mint);clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);"></div>
          <div style="position:absolute;inset:3px;background:var(--bg3);clip-path:polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%);"></div>
          <span style="z-index:1;">${h.label}</span>`;
        d.addEventListener('click', h.act);
        ah.appendChild(d);
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