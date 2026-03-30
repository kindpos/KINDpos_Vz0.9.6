import { registerScene, go } from '../scene-manager.js';
import { T, chamfer, buildActionButton, btnWrap } from '../theme-manager.js';

registerScene('add-items', {
  onEnter(el, p) {
    const { check, seat, mode } = p;

    // Placeholder UI
    el.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center;
                  height:100%; color:var(--mint); font-family:var(--fb); font-size:32px;">
        ADD ITEMS — SCAFFOLD
        <br>Mode: ${mode || 'items'}
      </div>
    `;

    // Back navigation
    window.onBackRequested = () => {
      go('check-overview', { check });
    };

    return () => {
      window.onBackRequested = null;
    };
  }
});
