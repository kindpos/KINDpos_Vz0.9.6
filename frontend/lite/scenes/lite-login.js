// ═══════════════════════════════════════════════════
//  KINDpos Lite — Login / Launchpad Scene
//  PIN entry + mode selection in a single screen.
// ═══════════════════════════════════════════════════

import { LiteSceneManager, registerScene } from '../lite-scene-manager.js';

const FALLBACK_ROSTER = [
  { pin: '0000', name: 'Manager', role: 'manager' },
  { pin: '9999', name: 'Server',  role: 'server'  },
];

const API_BASE = '';
const API_TIMEOUT = 3000;

registerScene('lite-login', {
  onEnter(el) {
    let pin = '';
    let selectedMode = null;
    let pendingRoute = null;
    let roster = [...FALLBACK_ROSTER];
    let errorFlash = false;

    fetchRoster();

    async function fetchRoster() {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
        const resp = await fetch(`${API_BASE}/api/v1/servers`, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.servers && data.servers.length > 0) {
            roster = data.servers;
          }
        }
      } catch (_) {
        // Use fallback roster
      }
    }

    function draw() {
      el.innerHTML = '';

      // ── Three-Column Grid ──
      const grid = document.createElement('div');
      grid.className = 'lite-login-grid';

      // Column 1: Admin Functions
      const adminCol = document.createElement('div');
      adminCol.className = 'lite-col';

      adminCol.appendChild(makeAdminBtn('Clock\nin/out', 'mint', () => handleAdmin('lite-clock')));
      adminCol.appendChild(makeAdminBtn('Reporting', 'mint', () => handleAdmin('lite-reporting')));
      adminCol.appendChild(makeAdminBtn('Configuration', 'gold', () => handleAdmin('lite-config')));

      // Column 2: Mode Selection
      const modeCol = document.createElement('div');
      modeCol.className = 'lite-col';

      modeCol.appendChild(makeModeBtn('Quick\nService', 'quick-service'));
      modeCol.appendChild(makeModeBtn('Quick\nBar', 'quick-bar'));
      modeCol.appendChild(makeModeBtn('Quick\nPay', 'quick-pay'));

      // Column 3: PIN Pad
      const pinCol = document.createElement('div');
      pinCol.style.cssText = 'display:flex;flex-direction:column;justify-content:center;';

      const panel = document.createElement('div');
      panel.className = 'lite-pin-panel' + (errorFlash ? ' error' : '');
      panel.id = 'pin-panel';

      // PIN dots
      const dots = document.createElement('div');
      dots.className = 'lite-pin-dots';
      for (let i = 0; i < 4; i++) {
        const dot = document.createElement('div');
        dot.className = 'lite-pin-dot' + (i < pin.length ? ' filled' : '');
        dots.appendChild(dot);
      }
      panel.appendChild(dots);

      // Numpad
      const numpad = document.createElement('div');
      numpad.className = 'lite-numpad';

      const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','>>>'];
      keys.forEach(k => {
        const key = document.createElement('div');
        if (k === 'CLR') {
          key.className = 'lite-num-key lite-num-key--clr';
          key.textContent = 'clr';
        } else if (k === '>>>') {
          key.className = 'lite-num-key lite-num-key--submit';
          key.textContent = '>>>';
        } else {
          key.className = 'lite-num-key';
          key.textContent = k;
        }
        key.addEventListener('click', () => press(k));
        numpad.appendChild(key);
      });

      panel.appendChild(numpad);
      pinCol.appendChild(panel);

      grid.appendChild(adminCol);
      grid.appendChild(modeCol);
      grid.appendChild(pinCol);

      el.appendChild(grid);

      // ── Footer Brand Watermark ──
      const footer = document.createElement('div');
      footer.style.cssText = 'position:absolute;bottom:8px;right:16px;';
      footer.className = 'lite-brand';
      footer.innerHTML =
        '<span style="color:#fcbe40;">KIND</span>' +
        '<span style="color:#ff3355;">pos</span>' +
        '<span style="color:#C6FFBB;">/lite_</span>' +
        '<span style="color:#fcbe40;">Vz1.0</span>';
      el.appendChild(footer);

      errorFlash = false;
    }

    function makeAdminBtn(label, variant, onClick) {
      const wrap = document.createElement('div');
      wrap.className = 'btn-wrap';
      const btn = document.createElement('div');
      btn.className = 'lite-admin-btn lite-admin-btn--' + variant;
      btn.textContent = label;
      btn.style.whiteSpace = 'pre-line';
      btn.addEventListener('click', onClick);
      wrap.appendChild(btn);
      return wrap;
    }

    function makeModeBtn(label, mode) {
      const wrap = document.createElement('div');
      wrap.className = 'btn-wrap';
      const btn = document.createElement('div');
      btn.className = 'lite-mode-btn' + (selectedMode === mode ? ' selected' : '');
      btn.textContent = label;
      btn.style.whiteSpace = 'pre-line';
      btn.addEventListener('click', () => {
        selectedMode = selectedMode === mode ? null : mode;
        draw();
      });
      wrap.appendChild(btn);
      return wrap;
    }

    function press(k) {
      if (k === 'CLR') {
        pin = '';
      } else if (k === '>>>') {
        submit();
        return;
      } else if (pin.length < 4) {
        pin += k;
      }
      draw();
    }

    function handleAdmin(sceneId) {
      if (pin.length > 0 && validatePin()) {
        LiteSceneManager.navigateTo(sceneId);
      } else {
        // Store pending route and flash PIN pad
        pendingRoute = sceneId;
        flashPinPad();
      }
    }

    function submit() {
      if (!pin) return;

      if (!validatePin()) {
        errorFlash = true;
        pin = '';
        draw();
        return;
      }

      // Route based on state
      if (pendingRoute) {
        const route = pendingRoute;
        pendingRoute = null;
        LiteSceneManager.navigateTo(route);
      } else if (selectedMode === 'quick-pay') {
        LiteSceneManager.navigateTo('lite-payment', { mode: 'quick-pay' });
      } else if (selectedMode === 'quick-service') {
        LiteSceneManager.navigateTo('lite-order', { mode: 'quick-service' });
      } else if (selectedMode === 'quick-bar') {
        LiteSceneManager.navigateTo('lite-order', { mode: 'quick-bar' });
      } else {
        // No mode selected — go to checks view
        LiteSceneManager.navigateTo('lite-checks');
      }
    }

    function validatePin() {
      const match = roster.find(r => r.pin === pin);
      if (match) {
        LiteSceneManager.setAuthUser(match);
        return true;
      }
      return false;
    }

    function flashPinPad() {
      const panel = document.getElementById('pin-panel');
      if (panel) {
        panel.classList.add('error');
        setTimeout(() => panel.classList.remove('error'), 600);
      }
    }

    // Keyboard support
    function keyHandler(e) {
      if (LiteSceneManager.getActiveScene() !== 'lite-login') return;
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); }
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') { pin = ''; selectedMode = null; pendingRoute = null; draw(); }
    }

    window.addEventListener('keydown', keyHandler);
    draw();

    return () => {
      window.removeEventListener('keydown', keyHandler);
    };
  }
});
