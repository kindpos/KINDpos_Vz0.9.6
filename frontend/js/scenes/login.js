// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Login Scene
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { CFG, FALLBACK_ROSTER, PALM_LOGO } from '../config.js';
import { registerScene, go } from '../scene-manager.js';
import { T, pinFrame, errBanner, buildNumpadKey, buildActionButton, numpadContainerStyle, overlayBox, overlayHeader, overlayStubBtn, roleBtn } from '../theme-manager.js';

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

    // ── Role Color Map ──
    const ROLE_COLORS = {
      server:    T.mint,
      manager:   T.clockGold,
      mgr:       T.clockGold,
      bartender: T.cyan,
      host:      T.lavender,
    };
    const ROLE_COLOR_PALETTE = [T.mint, T.clockGold, T.cyan, T.lavender, T.orange];

    function roleColor(role) {
      const key = (role || '').toLowerCase();
      return ROLE_COLORS[key] || ROLE_COLOR_PALETTE[0];
    }

    function roleDisplayName(role) {
      const key = (role || '').toLowerCase();
      if (key === 'manager') return 'MGR';
      return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
    }

    // ── Draw Login Screen ──
    function draw() {
      el.innerHTML = `
        <div id="login-content" style="display:grid;grid-template-columns:280px 400px 1fr;height:100%;padding:16px;gap:16px;padding-bottom:56px;">
          <!-- LEFT: BRANDING -->
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
            <img src="${PALM_LOGO}" style="height:300px;width:auto;object-fit:contain;">
            <div style="font-family:${T.fhiSolid};font-size:36px;color:${T.mint};">STORE NAME</div>
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

    // ── Build Numpad ──
    function buildNumpad() {
      const pad = $('pad');
      if (!pad) return;

      const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','>>>'];

      keys.forEach(k => {
        const isCLR = k === 'CLR';
        const el = buildNumpadKey(k, {
          onPress: () => press(k),
          onLongPress: isCLR ? { delay: 500, action: () => { pin = ''; err = ''; draw(); } } : null
        });
        pad.appendChild(el);
      });
    }

    // ── Build Action Buttons ──
    function buildActionButtons() {
      const ab = $('action-btns');
      if (!ab) return;

      const actions = [
        { label: 'Quick Service', act: () => { if (!matchPin()) return; const o = makeOrder('quick_service'); go('check-editing', { order: o }); } },
        { label: 'Settings',      act: () => { if (!matchPin()) return; go('settings'); } },
        { label: 'Clock in/out',  act: () => { showClockOverlay(); } },
      ];

      actions.forEach(a => {
        ab.appendChild(buildActionButton(a.label, a.act));
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

    // ── Clock-In Overlay ──
    let selectedRole = '';

    function showClockOverlay() {
      if (!matchPin()) {
        err = 'Enter PIN first.';
        pin = '';
        draw();
        shakeFrame();
        return;
      }

      const staff = APP.staff;
      const staffName = staff.name || 'Team Member';

      // Collect unique roles from the roster
      const uniqueRoles = [...new Set(roster.map(r => r.role).filter(Boolean))];
      if (uniqueRoles.length === 0) uniqueRoles.push(staff.role || 'server');

      // Pre-select the staff member's own role
      selectedRole = staff.role || uniqueRoles[0];

      // Dim login content
      const loginContent = $('login-content');
      if (loginContent) loginContent.style.opacity = '0.25';

      renderClockOverlay(staffName, uniqueRoles);
    }

    function renderClockOverlay(staffName, roles) {
      // Remove existing overlay elements if any
      const existingBox = $('clock-overlay-box');
      if (existingBox) existingBox.remove();
      const existingStub = $('clock-overlay-stub');
      if (existingStub) existingStub.remove();

      // Build welcome header
      const welcomeLeft = `<div><span style="font-family:${T.fb};font-size:32px;color:${T.mint};">Welcome, </span><span style="font-family:${T.fhi};font-size:32px;color:${T.clockGold};">${staffName}!</span></div>`;

      // Build role grid
      const roleGridHtml = roles.map(role => {
        const color = roleColor(role);
        const label = roleDisplayName(role);
        const sel = (role === selectedRole);
        return roleBtn(label, { selected: sel, color, onClick: `window._kindClockSelectRole('${role}')` });
      }).join('');

      // Build hours bar (placeholder — no backend endpoint yet)
      const hoursHtml = `<div style="border-top:2px solid ${T.mint};padding-top:10px;margin-top:auto;"><span style="font-family:${T.fb};font-size:28px;color:${T.mint};">Current Hours: <span style="color:${T.clockGold};">0.0</span></span></div>`;

      // Determine clock in vs clock out label
      const clockLabel = 'Clock in';

      // Build overlay inner content
      const inner = overlayHeader(welcomeLeft, `window._kindCloseClockOverlay()`)
        + `<div style="font-family:${T.fb};font-size:36px;color:${T.mint};text-align:center;padding-bottom:8px;border-bottom:3px solid ${T.mint};">Select Role</div>`
        + `<div id="clock-role-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">${roleGridHtml}</div>`
        + hoursHtml;

      // Inject overlay box
      el.insertAdjacentHTML('beforeend', overlayBox(inner, { id: 'clock-overlay-box' }));

      // Inject stub button (positioned at bottom-right of scene area)
      el.insertAdjacentHTML('beforeend', overlayStubBtn(clockLabel, {
        id: 'clock-overlay-stub',
        right: '16px',
        bottom: '4px',
        onClick: `window._kindSubmitClock()`
      }));
    }

    function closeClockOverlay() {
      const box = $('clock-overlay-box');
      if (box) box.remove();
      const stub = $('clock-overlay-stub');
      if (stub) stub.remove();

      // Restore login content opacity
      const loginContent = $('login-content');
      if (loginContent) loginContent.style.opacity = '1';

      // Reset staff state (PIN still needs to be re-entered for next action)
      APP.staff = null;
      pin = '';
      err = '';
    }

    // Global handlers for inline onclick attrs in overlay HTML
    window._kindCloseClockOverlay = function() {
      closeClockOverlay();
    };

    window._kindClockSelectRole = function(role) {
      selectedRole = role;
      // Re-render overlay with updated selection
      const staff = APP.staff;
      if (!staff) return;
      const uniqueRoles = [...new Set(roster.map(r => r.role).filter(Boolean))];
      if (uniqueRoles.length === 0) uniqueRoles.push('server');
      renderClockOverlay(staff.name || 'Team Member', uniqueRoles);
    };

    window._kindSubmitClock = function() {
      console.log(`Clock action: ${APP.staff ? APP.staff.name : 'unknown'} → role: ${selectedRole}`);
      closeClockOverlay();
      draw();
    };

    // ── Keyboard Support ──
    function keyHandler(e) {
      if (APP.screen !== 'login') return;
      if (e.key >= '0' && e.key <= '9') press(e.key);
      else if (e.key === 'Backspace') press('CLR');
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') {
        // Close overlay if open, otherwise clear PIN
        if ($('clock-overlay-box')) { closeClockOverlay(); }
        else { pin = ''; err = ''; draw(); }
      }
    }

    window.addEventListener('keydown', keyHandler);

    // Initial render
    draw();

    // Return cleanup function
    return () => {
      window.removeEventListener('keydown', keyHandler);
      clearTimeout(holdTimer);
      delete window._kindCloseClockOverlay;
      delete window._kindClockSelectRole;
      delete window._kindSubmitClock;
    };
  }
});
