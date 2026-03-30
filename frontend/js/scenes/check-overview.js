import { registerScene, go } from '../scene-manager.js';
import { T, chamfer, buildActionButton, btnWrap } from '../theme-manager.js';

registerScene('check-overview', {
  onEnter(el, p) {
    // Normalize params — login sends { order }, snapshot sends { check }
    const check = p.check || p.order || null;

    // Placeholder UI
    el.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center;
                  height:100%; color:var(--mint); font-family:var(--fb); font-size:32px;">
        CHECK OVERVIEW — SCAFFOLD
        <br>Check: ${check ? check.id || 'new' : 'none'}
      </div>
    `;

    // Back navigation
    window.onBackRequested = () => {
      go('snapshot');
    };

    return () => {
      window.onBackRequested = null;
    };
  }
});
