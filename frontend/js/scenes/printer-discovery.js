// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Printer Discovery (Stub)
// ═══════════════════════════════════════════════════

import { registerScene, go } from '../scene-manager.js';

registerScene('printer-discovery', {
  onEnter(el) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;">
        <div style="font-family:var(--fh);font-size:22px;">PRINTER DISCOVERY</div>
        <div style="opacity:0.4;">Network scanner — Coming Soon</div>
        <div class="btn-p" style="padding:10px 20px;cursor:pointer;"
             id="_back_hw">\u2190 Hardware</div>
      </div>`;
    document.getElementById('_back_hw')?.addEventListener('click', () => go('login'));
  }
});
