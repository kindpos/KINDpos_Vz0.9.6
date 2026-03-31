// ═══════════════════════════════════════════════════
//  KINDpos Lite — Scene Manager
//  Standalone scene manager for the Lite UI.
//  Does NOT share a registry with the full scene-manager.js.
// ═══════════════════════════════════════════════════

import { APP, $ } from './app.js';
import { renderBars } from './bars.js';

const scenes = {};
let currentCleanup = null;

/**
 * Register a lite scene.
 * @param {string} name   - scene id (e.g. 'lite-login', 'lite-order')
 * @param {object} scene  - { onEnter(el, params), onExit?() }
 */
export function registerLiteScene(name, scene) {
  scenes[name] = scene;
}

/**
 * Navigate to a lite scene.
 * @param {string} screen - scene id
 * @param {object} p      - params to pass to the scene
 */
export function liteGo(screen, p = {}) {
  // Clean up previous scene
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  // Update shared state
  APP.screen = screen;
  APP.p = p;

  // Reset staff on return to login
  if (screen === 'lite-login') {
    APP.staff = null;
    APP.offline = false;
  }

  // Render chrome (TBar + SBar)
  renderBars();

  // Clear scene container
  const el = $('scene');
  el.innerHTML = '';

  // Enter new scene
  const scene = scenes[screen];
  if (scene && scene.onEnter) {
    const cleanup = scene.onEnter(el, p);
    const hasCleanup = typeof cleanup === 'function';
    const hasOnExit = typeof scene.onExit === 'function';
    if (hasCleanup && hasOnExit) {
      currentCleanup = () => { cleanup(); scene.onExit(); };
    } else if (hasOnExit) {
      currentCleanup = scene.onExit;
    } else if (hasCleanup) {
      currentCleanup = cleanup;
    }
  } else {
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;">
        <div style="font-family:var(--fh);font-size:22px;">${screen.toUpperCase()}</div>
        <div style="opacity:0.4;">Coming Soon</div>
        <div class="btn-s" style="border:1px solid var(--mint);padding:10px 20px;cursor:pointer;"
             onclick="window.go('lite-snapshot')">← Snapshot</div>
      </div>`;
  }
}

// Make liteGo globally accessible for inline handlers and bars logout
window.go = liteGo;
