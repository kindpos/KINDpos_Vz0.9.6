// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — First-Run Setup Wizard
//  Gates the system until core configuration is complete.
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { CFG, MODIFIERS, MOD_PREFIXES } from '../config.js';
import { registerScene, go } from '../scene-manager.js';
import { T, chamfer } from '../theme-manager.js';

const STEPS = [
  { key: 'employees',      title: 'Employees' },
  { key: 'tax_rate',        title: 'Tax Rate' },
  { key: 'menu',            title: 'Menu' },
  { key: 'modifiers',       title: 'Modifiers' },
  { key: 'payment_device',  title: 'Payment Device' },
  { key: 'cash_discount',   title: 'Cash Discount' },
];

registerScene('setup-wizard', {
  onEnter(el, params) {
    let currentStep = 0;
    const completedSteps = new Set();

    // ── Wizard state per step ──
    const state = {
      employees: [{ name: '', role: 'server', pin: '' }],
      taxRate: 7.0,
      menuSkip: true,
      modifiers: MODIFIERS.map(m => ({
        name: m.name,
        price: m.price,
        prefixes: [...MOD_PREFIXES],
      })),
      paymentDevice: 'mock',
      dejavoo: { tpn: '', registerId: '', authKey: '' },
      cashDiscountEnabled: true,
      cashDiscountRate: 3.5,
    };

    // Pre-mark steps that are already complete from params
    if (params && params.steps) {
      STEPS.forEach((s, i) => {
        if (params.steps[s.key] && params.steps[s.key].complete) {
          completedSteps.add(i);
        }
      });
      // Jump to first incomplete step
      for (let i = 0; i < STEPS.length; i++) {
        if (!completedSteps.has(i)) { currentStep = i; break; }
      }
    }

    // ── Render ──
    function render() {
      el.innerHTML = '';
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;
        background:${T.bg};
        z-index:200;
      `;

      const box = document.createElement('div');
      box.style.cssText = `
        width:720px;
        max-height:480px;
        background:${T.bg};
        border:${T.borderW} solid ${T.mint};
        clip-path:${chamfer('12px')};
        filter:drop-shadow(4px 6px 0px #1a1a1a);
        display:flex;
        flex-direction:column;
        overflow:hidden;
      `;

      // Step indicator
      box.appendChild(buildStepIndicator());
      // Header
      box.appendChild(buildHeader());
      // Body
      const body = document.createElement('div');
      body.style.cssText = 'flex:1;overflow-y:auto;padding:16px 24px;';
      body.innerHTML = buildStepContent();
      box.appendChild(body);
      // Footer
      box.appendChild(buildFooter());

      overlay.appendChild(box);
      el.appendChild(overlay);

      attachStepListeners();
    }

    // ── Step Indicator (6 squares) ──
    function buildStepIndicator() {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:center;padding:12px 24px 4px;';
      for (let i = 0; i < STEPS.length; i++) {
        const sq = document.createElement('div');
        let bg, border;
        if (completedSteps.has(i)) {
          bg = T.mint; border = T.mint;
        } else if (i === currentStep) {
          bg = T.cyan; border = T.cyan;
        } else {
          bg = 'transparent'; border = T.mint;
        }
        sq.style.cssText = `width:24px;height:24px;background:${bg};border:2px solid ${border};`;
        sq.title = STEPS[i].title;
        row.appendChild(sq);
      }
      return row;
    }

    // ── Header Bar ──
    function buildHeader() {
      const hdr = document.createElement('div');
      hdr.style.cssText = `
        background:${T.mint};color:${T.bg};
        font-family:${T.fb};font-size:24px;
        padding:8px 24px;
        text-align:center;
      `;
      hdr.textContent = `Step ${currentStep + 1}: ${STEPS[currentStep].title}`;
      return hdr;
    }

    // ── Step Content Builders ──
    function buildStepContent() {
      switch (currentStep) {
        case 0: return buildEmployeesStep();
        case 1: return buildTaxRateStep();
        case 2: return buildMenuStep();
        case 3: return buildModifiersStep();
        case 4: return buildPaymentDeviceStep();
        case 5: return buildCashDiscountStep();
        default: return '';
      }
    }

    // Step 1: Employees
    function buildEmployeesStep() {
      const rows = state.employees.map((emp, i) => `
        <tr>
          <td><input type="text" id="emp-name-${i}" value="${esc(emp.name)}" placeholder="Name"
            style="${inputStyle()}width:160px;"></td>
          <td><select id="emp-role-${i}" style="${inputStyle()}width:120px;">
            <option value="manager"${emp.role === 'manager' ? ' selected' : ''}>Manager</option>
            <option value="server"${emp.role === 'server' ? ' selected' : ''}>Server</option>
            <option value="bartender"${emp.role === 'bartender' ? ' selected' : ''}>Bartender</option>
          </select></td>
          <td><input type="text" id="emp-pin-${i}" value="${esc(emp.pin)}" placeholder="PIN" maxlength="4"
            style="${inputStyle()}width:80px;text-align:center;"></td>
          <td>${state.employees.length > 1 ? `<span class="wiz-remove" data-action="remove-emp" data-idx="${i}" style="color:${T.red};cursor:pointer;font-family:${T.fb};font-size:20px;">X</span>` : ''}</td>
        </tr>`).join('');

      return `
        <div style="font-family:${T.fb};font-size:14px;color:${T.mint};margin-bottom:8px;">
          Add at least 1 employee with a name, role, and 4-digit PIN.
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="font-family:${T.fb};font-size:13px;color:${T.cyan};text-align:left;">
            <th style="padding:4px;">Name</th><th style="padding:4px;">Role</th>
            <th style="padding:4px;">PIN</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div id="add-emp-btn" style="margin-top:8px;font-family:${T.fb};font-size:16px;color:${T.mint};cursor:pointer;border:2px solid ${T.mint};padding:4px 12px;display:inline-block;clip-path:${chamfer('sm')};">+ Add Employee</div>`;
    }

    // Step 2: Tax Rate
    function buildTaxRateStep() {
      const rate = state.taxRate;
      const preview = (10 * (1 + rate / 100)).toFixed(2);
      return `
        <div style="font-family:${T.fb};font-size:14px;color:${T.mint};margin-bottom:12px;">
          Sales tax rate for this location
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <input type="number" id="tax-rate-input" value="${rate}" step="0.1" min="0" max="25"
            style="${inputStyle()}width:100px;font-size:24px;text-align:center;">
          <span style="font-family:${T.fb};font-size:24px;color:${T.mint};">%</span>
        </div>
        <div style="margin-top:16px;font-family:${T.fb};font-size:16px;color:${T.cyan};" id="tax-preview">
          $10.00 item &rarr; $${preview} with tax
        </div>`;
    }

    // Step 3: Menu
    function buildMenuStep() {
      return `
        <div style="font-family:${T.fb};font-size:14px;color:${T.mint};margin-bottom:12px;">
          The menu is best configured using the Settings panel or Excel import tool.
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px;">
          <div id="menu-skip-btn" style="font-family:${T.fb};font-size:18px;color:${T.bg};background:${T.mint};padding:12px 24px;cursor:pointer;text-align:center;clip-path:${chamfer('sm')};">
            I'll configure the menu later in Settings
          </div>
          <div style="font-family:${T.fb};font-size:12px;color:${T.yellow};text-align:center;">
            The wizard will still complete. You can import your full menu anytime from Settings.
          </div>
        </div>`;
    }

    // Step 4: Modifiers
    function buildModifiersStep() {
      const rows = state.modifiers.map((mod, i) => `
        <tr>
          <td><input type="text" id="mod-name-${i}" value="${esc(mod.name)}" placeholder="Name"
            style="${inputStyle()}width:120px;font-size:13px;"></td>
          <td><input type="number" id="mod-price-${i}" value="${mod.price}" step="0.25" min="0"
            style="${inputStyle()}width:60px;font-size:13px;text-align:center;"></td>
          <td><span class="wiz-remove" data-action="remove-mod" data-idx="${i}" style="color:${T.red};cursor:pointer;font-family:${T.fb};font-size:16px;">X</span></td>
        </tr>`).join('');

      return `
        <div style="font-family:${T.fb};font-size:14px;color:${T.mint};margin-bottom:8px;">
          Edit modifiers (pre-populated from defaults). Prefixes: ${MOD_PREFIXES.join(', ')}
        </div>
        <div style="max-height:200px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="font-family:${T.fb};font-size:12px;color:${T.cyan};text-align:left;">
            <th style="padding:3px;">Name</th><th style="padding:3px;">Price</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        </div>
        <div id="add-mod-btn" style="margin-top:8px;font-family:${T.fb};font-size:14px;color:${T.mint};cursor:pointer;border:2px solid ${T.mint};padding:4px 12px;display:inline-block;clip-path:${chamfer('sm')};">+ Add Modifier</div>`;
    }

    // Step 5: Payment Device
    function buildPaymentDeviceStep() {
      const isMock = state.paymentDevice === 'mock';
      const isDeja = state.paymentDevice === 'dejavoo_spin';
      return `
        <div style="font-family:${T.fb};font-size:14px;color:${T.mint};margin-bottom:12px;">
          Select your payment processing device.
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-family:${T.fb};font-size:18px;color:${isMock ? T.cyan : T.mint};">
            <input type="radio" name="pay-device" value="mock" ${isMock ? 'checked' : ''} id="pay-mock">
            Mock device (for testing)
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-family:${T.fb};font-size:18px;color:${isDeja ? T.cyan : T.mint};">
            <input type="radio" name="pay-device" value="dejavoo_spin" ${isDeja ? 'checked' : ''} id="pay-dejavoo">
            Dejavoo SPIN (production)
          </label>
        </div>
        <div id="dejavoo-fields" style="margin-top:12px;display:${isDeja ? 'flex' : 'none'};flex-direction:column;gap:8px;">
          <input type="text" id="deja-tpn" value="${esc(state.dejavoo.tpn)}" placeholder="TPN" style="${inputStyle()}width:240px;">
          <input type="text" id="deja-register" value="${esc(state.dejavoo.registerId)}" placeholder="Register ID" style="${inputStyle()}width:240px;">
          <input type="text" id="deja-auth" value="${esc(state.dejavoo.authKey)}" placeholder="Auth Key" style="${inputStyle()}width:240px;">
        </div>`;
    }

    // Step 6: Cash Discount
    function buildCashDiscountStep() {
      const enabled = state.cashDiscountEnabled;
      const rate = state.cashDiscountRate;
      const preview = (100 * (1 - rate / 100)).toFixed(2);
      return `
        <div style="font-family:${T.fb};font-size:14px;color:${T.mint};margin-bottom:12px;">
          Enable cash discount program?
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-family:${T.fb};font-size:18px;color:${enabled ? T.cyan : T.mint};">
            <input type="radio" name="cash-disc" value="yes" ${enabled ? 'checked' : ''} id="cash-yes"> Yes
          </label>
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-family:${T.fb};font-size:18px;color:${!enabled ? T.cyan : T.mint};">
            <input type="radio" name="cash-disc" value="no" ${!enabled ? 'checked' : ''} id="cash-no"> No
          </label>
        </div>
        <div id="cash-rate-section" style="display:${enabled ? 'block' : 'none'};">
          <div style="display:flex;align-items:center;gap:12px;">
            <input type="number" id="cash-rate-input" value="${rate}" step="0.1" min="0" max="10"
              style="${inputStyle()}width:100px;font-size:24px;text-align:center;">
            <span style="font-family:${T.fb};font-size:24px;color:${T.mint};">%</span>
          </div>
          <div style="margin-top:12px;font-family:${T.fb};font-size:16px;color:${T.cyan};" id="cash-preview">
            $100.00 order &rarr; $${preview} cash price
          </div>
        </div>`;
    }

    // ── Footer with Back / Next buttons ──
    function buildFooter() {
      const footer = document.createElement('div');
      footer.style.cssText = `
        display:flex;justify-content:space-between;padding:10px 24px;
        border-top:2px solid rgba(198,255,187,0.15);
      `;

      if (currentStep > 0) {
        const back = document.createElement('div');
        back.id = 'wiz-back';
        back.textContent = 'Back';
        back.style.cssText = `
          font-family:${T.fb};font-size:20px;color:${T.mint};
          border:2px solid ${T.mint};padding:6px 24px;cursor:pointer;
          clip-path:${chamfer('sm')};
        `;
        footer.appendChild(back);
      } else {
        footer.appendChild(document.createElement('span'));
      }

      const next = document.createElement('div');
      next.id = 'wiz-next';
      const isLast = currentStep === STEPS.length - 1;
      next.textContent = isLast ? 'Complete Setup' : 'Next';
      next.style.cssText = `
        font-family:${T.fb};font-size:20px;color:${T.bg};
        background:${isLast ? T.mint : T.cyan};padding:6px 24px;cursor:pointer;
        clip-path:${chamfer('sm')};
      `;
      footer.appendChild(next);

      return footer;
    }

    // ── Attach Listeners ──
    function attachStepListeners() {
      // Navigation
      const backBtn = $('wiz-back');
      if (backBtn) backBtn.addEventListener('click', () => { saveCurrentStep(); currentStep--; render(); });

      const nextBtn = $('wiz-next');
      if (nextBtn) nextBtn.addEventListener('click', () => {
        saveCurrentStep();
        if (!validateCurrentStep()) return;
        completedSteps.add(currentStep);
        if (currentStep < STEPS.length - 1) {
          currentStep++;
          render();
        } else {
          submitWizard();
        }
      });

      // Step-specific listeners
      if (currentStep === 0) {
        const addBtn = $('add-emp-btn');
        if (addBtn) addBtn.addEventListener('click', () => {
          saveCurrentStep();
          state.employees.push({ name: '', role: 'server', pin: '' });
          render();
        });
        el.querySelectorAll('[data-action="remove-emp"]').forEach(btn => {
          btn.addEventListener('click', () => {
            saveCurrentStep();
            state.employees.splice(parseInt(btn.dataset.idx), 1);
            render();
          });
        });
      }

      if (currentStep === 1) {
        const input = $('tax-rate-input');
        if (input) input.addEventListener('input', () => {
          const rate = parseFloat(input.value) || 0;
          state.taxRate = rate;
          const preview = (10 * (1 + rate / 100)).toFixed(2);
          const pEl = $('tax-preview');
          if (pEl) pEl.innerHTML = `$10.00 item &rarr; $${preview} with tax`;
        });
      }

      if (currentStep === 2) {
        const skipBtn = $('menu-skip-btn');
        if (skipBtn) skipBtn.addEventListener('click', () => {
          state.menuSkip = true;
          completedSteps.add(currentStep);
          currentStep++;
          render();
        });
      }

      if (currentStep === 3) {
        const addBtn = $('add-mod-btn');
        if (addBtn) addBtn.addEventListener('click', () => {
          saveCurrentStep();
          state.modifiers.push({ name: '', price: 0, prefixes: [...MOD_PREFIXES] });
          render();
        });
        el.querySelectorAll('[data-action="remove-mod"]').forEach(btn => {
          btn.addEventListener('click', () => {
            saveCurrentStep();
            state.modifiers.splice(parseInt(btn.dataset.idx), 1);
            render();
          });
        });
      }

      if (currentStep === 4) {
        document.querySelectorAll('input[name="pay-device"]').forEach(radio => {
          radio.addEventListener('change', () => {
            state.paymentDevice = radio.value;
            const fields = $('dejavoo-fields');
            if (fields) fields.style.display = radio.value === 'dejavoo_spin' ? 'flex' : 'none';
          });
        });
      }

      if (currentStep === 5) {
        document.querySelectorAll('input[name="cash-disc"]').forEach(radio => {
          radio.addEventListener('change', () => {
            state.cashDiscountEnabled = radio.value === 'yes';
            const section = $('cash-rate-section');
            if (section) section.style.display = state.cashDiscountEnabled ? 'block' : 'none';
          });
        });
        const rateInput = $('cash-rate-input');
        if (rateInput) rateInput.addEventListener('input', () => {
          const rate = parseFloat(rateInput.value) || 0;
          state.cashDiscountRate = rate;
          const preview = (100 * (1 - rate / 100)).toFixed(2);
          const pEl = $('cash-preview');
          if (pEl) pEl.innerHTML = `$100.00 order &rarr; $${preview} cash price`;
        });
      }
    }

    // ── Save current step inputs to state ──
    function saveCurrentStep() {
      if (currentStep === 0) {
        state.employees = state.employees.map((emp, i) => ({
          name: ($(`emp-name-${i}`) || {}).value || emp.name,
          role: ($(`emp-role-${i}`) || {}).value || emp.role,
          pin: ($(`emp-pin-${i}`) || {}).value || emp.pin,
        }));
      }
      if (currentStep === 1) {
        const input = $('tax-rate-input');
        if (input) state.taxRate = parseFloat(input.value) || 0;
      }
      if (currentStep === 3) {
        state.modifiers = state.modifiers.map((mod, i) => ({
          name: ($(`mod-name-${i}`) || {}).value || mod.name,
          price: parseFloat(($(`mod-price-${i}`) || {}).value) || mod.price,
          prefixes: mod.prefixes,
        }));
      }
      if (currentStep === 4) {
        const tpn = $('deja-tpn');
        const reg = $('deja-register');
        const auth = $('deja-auth');
        if (tpn) state.dejavoo.tpn = tpn.value;
        if (reg) state.dejavoo.registerId = reg.value;
        if (auth) state.dejavoo.authKey = auth.value;
      }
      if (currentStep === 5) {
        const rateInput = $('cash-rate-input');
        if (rateInput) state.cashDiscountRate = parseFloat(rateInput.value) || 0;
      }
    }

    // ── Validate current step ──
    function validateCurrentStep() {
      if (currentStep === 0) {
        const valid = state.employees.filter(e => e.name.trim() && e.pin.length >= 4);
        if (valid.length === 0) {
          showError('Add at least 1 employee with a name and 4-digit PIN.');
          return false;
        }
        // Remove empty rows
        state.employees = state.employees.filter(e => e.name.trim() && e.pin.trim());
      }
      if (currentStep === 4 && state.paymentDevice === 'dejavoo_spin') {
        if (!state.dejavoo.tpn.trim()) {
          showError('TPN is required for Dejavoo SPIN.');
          return false;
        }
      }
      return true;
    }

    function showError(msg) {
      const existing = $('wiz-error');
      if (existing) existing.remove();
      const err = document.createElement('div');
      err.id = 'wiz-error';
      err.style.cssText = `
        position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
        background:rgba(232,64,64,0.9);color:white;padding:8px 24px;
        font-family:${T.fb};font-size:14px;z-index:300;
        clip-path:${chamfer('sm')};
      `;
      err.textContent = msg;
      document.body.appendChild(err);
      setTimeout(() => { if (err.parentNode) err.remove(); }, 3000);
    }

    // ── Submit all wizard data to backend ──
    async function submitWizard() {
      const nextBtn = $('wiz-next');
      if (nextBtn) { nextBtn.textContent = 'Saving...'; nextBtn.style.pointerEvents = 'none'; }

      try {
        // Step 1: Employees (only if not already complete)
        if (!params?.steps?.employees?.complete && state.employees.length > 0) {
          await apiFetch('/api/v1/setup/employees', {
            method: 'POST',
            body: JSON.stringify(state.employees.map(e => ({
              name: e.name, role: e.role, pin: e.pin,
            }))),
          });
        }

        // Step 2: Tax Rate
        if (!params?.steps?.tax_rate?.complete) {
          await apiFetch('/api/v1/setup/tax-rate', {
            method: 'POST',
            body: JSON.stringify({ rate: state.taxRate }),
          });
        }

        // Step 3: Menu (skip sends nothing, which is fine)
        if (!params?.steps?.menu?.complete && !state.menuSkip) {
          await apiFetch('/api/v1/setup/menu', {
            method: 'POST',
            body: JSON.stringify({ categories: [], skip: true }),
          });
        }

        // Step 4: Modifiers
        if (!params?.steps?.modifiers?.complete && state.modifiers.length > 0) {
          await apiFetch('/api/v1/setup/modifiers', {
            method: 'POST',
            body: JSON.stringify(state.modifiers.filter(m => m.name.trim()).map(m => ({
              name: m.name, price: m.price, prefix_options: m.prefixes,
            }))),
          });
        }

        // Step 5: Payment Device
        if (!params?.steps?.payment_device?.complete) {
          const payload = { device_type: state.paymentDevice };
          if (state.paymentDevice === 'dejavoo_spin') {
            payload.tpn = state.dejavoo.tpn;
            payload.register_id = state.dejavoo.registerId;
            payload.auth_key = state.dejavoo.authKey;
          }
          await apiFetch('/api/v1/setup/payment-device', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
        }

        // Step 6: Cash Discount
        if (!params?.steps?.cash_discount?.complete) {
          await apiFetch('/api/v1/setup/cash-discount', {
            method: 'POST',
            body: JSON.stringify({
              rate: state.cashDiscountRate / 100,
              enabled: state.cashDiscountEnabled,
            }),
          });
        }

        // Show completion screen
        showComplete();
      } catch (err) {
        console.error('Setup wizard submission error:', err);
        showError('Failed to save setup. Please check your connection and try again.');
        if (nextBtn) { nextBtn.textContent = 'Complete Setup'; nextBtn.style.pointerEvents = 'auto'; }
      }
    }

    // ── Completion Screen ──
    function showComplete() {
      el.innerHTML = '';
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;
        background:${T.bg};z-index:200;
      `;

      const box = document.createElement('div');
      box.style.cssText = `
        width:480px;
        background:${T.bg};
        border:${T.borderW} solid ${T.mint};
        clip-path:${chamfer('12px')};
        filter:drop-shadow(4px 6px 0px #1a1a1a);
        display:flex;flex-direction:column;align-items:center;
        padding:40px;gap:20px;
      `;

      box.innerHTML = `
        <div style="font-family:${T.fb};font-size:48px;color:${T.mint};">&#10003;</div>
        <div style="font-family:${T.fb};font-size:28px;color:${T.mint};text-align:center;">
          Setup Complete
        </div>
        <div style="font-family:${T.fb};font-size:14px;color:${T.cyan};text-align:center;">
          Your terminal is ready. Redirecting to login...
        </div>
      `;

      overlay.appendChild(box);
      el.appendChild(overlay);

      // Store setup flag and redirect
      localStorage.setItem('kindpos_setup_complete', 'true');
      setTimeout(() => go('login'), 2000);
    }

    // ── Utilities ──
    function esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

    function inputStyle() {
      return `background:${T.bg2};color:${T.mint};border:2px solid ${T.mint};padding:6px 8px;font-family:${T.fb};font-size:16px;outline:none;`;
    }

    // Initial render
    render();
  }
});
