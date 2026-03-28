// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Printer Discovery Scene
//  Network scanner + saved printer management
// ═══════════════════════════════════════════════════

import { registerScene } from '../scene-manager.js';
import { APP, apiFetch } from '../app.js';
import {
  T, chamfer, overlayBox, overlayCloseBtn, overlayHeader, roleBtn
} from '../theme-manager.js';


registerScene('printer-discovery', {
  onEnter(el) {

    // ── State ──────────────────────────────────────
    let savedPrinters = [];
    let discoveredPrinters = [];
    let scanning = false;
    let saveOverlayIp = null;   // IP being saved (null = overlay hidden)
    let saveOverlayHost = '';
    let saveOverlayName = '';
    let saveOverlayRole = 'receipt';
    let testResults = {};       // { ip: { success, message } }

    // ── Render ─────────────────────────────────────

    function render() {
      el.innerHTML = `
        <div style="display:flex;gap:16px;height:100%;padding:12px 16px;box-sizing:border-box;position:relative;">

          <!-- LEFT: Saved Printers -->
          <div style="flex:0 0 38%;display:flex;flex-direction:column;gap:10px;min-width:0;">
            <div style="font-family:${T.fh};font-size:28px;color:${T.mint};">SAVED PRINTERS</div>
            <div id="_pd_saved" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;">
              ${savedPrinters.length === 0
                ? `<div style="font-family:${T.fb};font-size:20px;color:${T.mintDim};padding:20px 0;">No printers configured</div>`
                : savedPrinters.map(p => savedCard(p)).join('')}
            </div>
          </div>

          <!-- RIGHT: Network Scan -->
          <div style="flex:1;display:flex;flex-direction:column;gap:10px;min-width:0;">
            <div style="display:flex;align-items:center;gap:16px;">
              <div style="font-family:${T.fh};font-size:28px;color:${T.mint};">NETWORK SCAN</div>
              <div style="font-family:${T.fb};font-size:18px;color:${T.mintDim};" id="_pd_subnet"></div>
            </div>

            <!-- Scan Button -->
            <div>
              <div class="btn-wrap" style="display:inline-block;">
                <div class="btn-p" id="_pd_scan_btn" style="font-size:28px;padding:8px 28px;${scanning ? 'opacity:0.5;pointer-events:none;' : ''}">
                  ${scanning ? 'SCANNING\u2026' : 'SCAN NETWORK'}
                </div>
              </div>
              ${scanning ? `<span style="font-family:${T.fb};font-size:18px;color:${T.mintDim};margin-left:12px;">Scanning port 9100\u2026</span>` : ''}
            </div>

            <!-- Discovered list -->
            <div id="_pd_discovered" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:4px;">
              ${discoveredPrinters.length === 0 && !scanning
                ? `<div style="font-family:${T.fb};font-size:18px;color:${T.mintDim};padding:16px 0;">Tap "Scan Network" to find printers</div>`
                : discoveredPrinters.map(p => discoveredCard(p)).join('')}
            </div>
          </div>

          <!-- BACK button (bottom-left absolute) -->
          <div style="position:absolute;bottom:8px;left:16px;">
            <div class="btn-wrap">
              <div class="btn-p" id="_pd_back" style="font-size:24px;padding:6px 20px;">\u2190 Back</div>
            </div>
          </div>

          ${saveOverlayIp ? renderSaveOverlay() : ''}
        </div>`;

      bindEvents();
    }

    // ── Card Renderers ─────────────────────────────

    function savedCard(p) {
      const dot = p.online
        ? `background:${T.goGreen};`
        : `background:${T.red};`;
      const result = testResults[p.ip];
      const testFeedback = result
        ? `<div style="font-family:${T.fb};font-size:16px;color:${result.success ? T.goGreen : T.red};margin-top:4px;">${result.success ? 'Test OK' : result.error || 'Failed'}</div>`
        : '';

      return `
        <div style="background:${T.bg2};border:3px solid ${T.mint};padding:10px 12px;clip-path:${chamfer('lg')};">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:12px;height:12px;border-radius:50%;${dot}flex-shrink:0;"></div>
            <div style="font-family:${T.fb};font-size:24px;color:${T.mint};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</div>
            <div style="font-family:${T.fb};font-size:16px;color:${T.mintDim};padding:2px 8px;background:${T.bg3};clip-path:${chamfer('sm')};">${p.role}</div>
          </div>
          <div style="font-family:${T.fb};font-size:18px;color:${T.mintDim};margin-top:4px;">${p.ip}:${p.port}</div>
          ${testFeedback}
          <div style="margin-top:8px;">
            <div class="btn-wrap" style="display:inline-block;">
              <div class="btn-p _pd_test_saved" data-ip="${p.ip}" data-port="${p.port}" style="font-size:20px;padding:4px 16px;">Test</div>
            </div>
          </div>
        </div>`;
    }

    function discoveredCard(p) {
      const responseColor = p.response_ms < 50 ? T.cyan : p.response_ms < 200 ? T.yellow : T.red;
      const result = testResults[p.ip];
      const testFeedback = result
        ? `<div style="font-family:${T.fb};font-size:16px;color:${result.success ? T.goGreen : T.red};margin-top:4px;">${result.success ? 'Test OK' : result.error || 'Failed'}</div>`
        : '';

      // Check if already saved
      const alreadySaved = savedPrinters.some(s => s.ip === p.ip);

      return `
        <div style="background:${T.bg2};border:3px solid ${T.mint};padding:10px 12px;clip-path:${chamfer('lg')};">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;min-width:0;">
              <div style="font-family:${T.fb};font-size:24px;color:${T.mint};">${p.ip}</div>
              ${p.hostname ? `<div style="font-family:${T.fb};font-size:18px;color:${T.mintDim};">${p.hostname}</div>` : ''}
            </div>
            <div style="font-family:${T.fb};font-size:18px;color:${responseColor};">${p.response_ms}ms</div>
          </div>
          ${testFeedback}
          <div style="display:flex;gap:8px;margin-top:8px;">
            <div class="btn-wrap">
              <div class="btn-p _pd_test_disc" data-ip="${p.ip}" data-port="${p.port}" style="font-size:20px;padding:4px 16px;">Test</div>
            </div>
            ${alreadySaved
              ? `<div style="font-family:${T.fb};font-size:18px;color:${T.goGreen};display:flex;align-items:center;">\u2713 Saved</div>`
              : `<div class="btn-wrap">
                  <div class="btn-p _pd_save_disc" data-ip="${p.ip}" data-host="${p.hostname || ''}" style="font-size:20px;padding:4px 16px;">Save</div>
                </div>`}
          </div>
        </div>`;
    }

    // ── Save Overlay ───────────────────────────────

    function renderSaveOverlay() {
      const roles = ['receipt', 'kitchen', 'bar', 'backup'];
      const roleButtons = roles.map(r =>
        roleBtn(r.charAt(0).toUpperCase() + r.slice(1), {
          selected: saveOverlayRole === r,
          color: r === 'kitchen' ? T.gold : r === 'bar' ? T.cyan : r === 'backup' ? T.lavender : T.mint,
          onClick: `window._pdSelectRole('${r}')`,
        })
      ).join('');

      const inner = `
        ${overlayHeader(
          `<div style="font-family:${T.fb};font-size:28px;color:${T.mint};">Save Printer</div>`,
          'window._pdCloseSaveOverlay()'
        )}
        <div style="font-family:${T.fb};font-size:18px;color:${T.mintDim};">${saveOverlayIp}</div>

        <div style="margin-top:8px;">
          <div style="font-family:${T.fb};font-size:20px;color:${T.mint};margin-bottom:4px;">Name</div>
          <input id="_pd_save_name" type="text" value="${saveOverlayName}"
            style="width:100%;box-sizing:border-box;font-family:${T.fb};font-size:22px;padding:8px 12px;
              background:${T.bg2};color:${T.mint};border:3px solid ${T.mint};outline:none;
              clip-path:${chamfer('sm')};" />
        </div>

        <div style="margin-top:8px;">
          <div style="font-family:${T.fb};font-size:20px;color:${T.mint};margin-bottom:6px;">Role</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${roleButtons}</div>
        </div>

        <div style="display:flex;gap:12px;margin-top:16px;">
          <div class="btn-wrap" style="flex:1;">
            <div class="btn-p" id="_pd_save_confirm" style="font-size:24px;padding:8px 0;text-align:center;width:100%;">SAVE</div>
          </div>
          <div class="btn-wrap">
            <div class="btn-p" id="_pd_save_cancel" style="font-size:24px;padding:8px 20px;background:${T.bg3};color:${T.mint};">Cancel</div>
          </div>
        </div>`;

      return overlayBox(inner, { id: '_pd_overlay', width: '440px', top: '40px' });
    }

    // ── Event Binding ──────────────────────────────

    function bindEvents() {
      // Scan button
      const scanBtn = document.getElementById('_pd_scan_btn');
      if (scanBtn) scanBtn.addEventListener('click', startScan);

      // Back button
      const backBtn = document.getElementById('_pd_back');
      if (backBtn) backBtn.addEventListener('click', () => {
        if (APP.staff) window.go('snapshot');
        else window.go('login');
      });

      // Test buttons (saved)
      el.querySelectorAll('._pd_test_saved').forEach(btn => {
        btn.addEventListener('click', () => testPrinter(btn.dataset.ip, parseInt(btn.dataset.port)));
      });

      // Test buttons (discovered)
      el.querySelectorAll('._pd_test_disc').forEach(btn => {
        btn.addEventListener('click', () => testPrinter(btn.dataset.ip, parseInt(btn.dataset.port)));
      });

      // Save buttons (discovered)
      el.querySelectorAll('._pd_save_disc').forEach(btn => {
        btn.addEventListener('click', () => showSaveOverlay(btn.dataset.ip, btn.dataset.host));
      });

      // Overlay buttons
      const saveConfirm = document.getElementById('_pd_save_confirm');
      if (saveConfirm) saveConfirm.addEventListener('click', confirmSave);

      const saveCancel = document.getElementById('_pd_save_cancel');
      if (saveCancel) saveCancel.addEventListener('click', closeSaveOverlay);
    }

    // ── Actions ────────────────────────────────────

    async function loadSaved() {
      try {
        const data = await apiFetch('/api/v1/printers/saved');
        savedPrinters = data.printers || [];
      } catch {
        savedPrinters = [];
      }
      render();
    }

    async function startScan() {
      if (scanning) return;
      scanning = true;
      discoveredPrinters = [];
      testResults = {};
      render();

      try {
        const data = await apiFetch('/api/v1/printers/scan');
        discoveredPrinters = data.printers || [];
        // Update subnet display
        const subnetEl = document.getElementById('_pd_subnet');
        if (subnetEl) subnetEl.textContent = data.subnet || '';
      } catch (e) {
        discoveredPrinters = [];
      }

      scanning = false;
      render();
    }

    async function testPrinter(ip, port) {
      testResults[ip] = { success: null, message: 'Sending\u2026' };
      render();

      try {
        const data = await apiFetch('/api/v1/printers/test', {
          method: 'POST',
          body: JSON.stringify({ ip, port }),
        });
        testResults[ip] = data;
      } catch {
        testResults[ip] = { success: false, error: 'Request failed' };
      }

      render();
    }

    function showSaveOverlay(ip, hostname) {
      saveOverlayIp = ip;
      saveOverlayHost = hostname || '';
      saveOverlayName = hostname || 'Printer';
      saveOverlayRole = 'receipt';
      render();
      // Focus the name input
      const nameInput = document.getElementById('_pd_save_name');
      if (nameInput) nameInput.focus();
    }

    function closeSaveOverlay() {
      saveOverlayIp = null;
      render();
    }

    async function confirmSave() {
      const nameInput = document.getElementById('_pd_save_name');
      const name = nameInput ? nameInput.value.trim() : saveOverlayName;
      if (!name) return;

      try {
        await apiFetch('/api/v1/printers/save', {
          method: 'POST',
          body: JSON.stringify({
            name,
            ip: saveOverlayIp,
            port: 9100,
            role: saveOverlayRole,
          }),
        });
      } catch {
        // Silently fail — printer will just not appear in saved list
      }

      saveOverlayIp = null;
      await loadSaved();
    }

    // ── Global Handlers (for roleBtn onclick) ──────

    window._pdSelectRole = (role) => {
      // Preserve the name input value before re-render
      const nameInput = document.getElementById('_pd_save_name');
      if (nameInput) saveOverlayName = nameInput.value;
      saveOverlayRole = role;
      render();
    };

    window._pdCloseSaveOverlay = () => {
      closeSaveOverlay();
    };

    // ── Init ───────────────────────────────────────

    render();
    loadSaved();

    // ── Cleanup ────────────────────────────────────

    return () => {
      delete window._pdSelectRole;
      delete window._pdCloseSaveOverlay;
    };
  }
});
