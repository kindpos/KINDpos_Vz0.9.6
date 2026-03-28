// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Scene Manager
// ═══════════════════════════════════════════════════

import { APP, $ } from './app.js';
import { renderBars } from './bars.js';

const scenes = {};
let currentCleanup = null;

/**
 * Register a scene.
 * @param {string} name   - screen name (e.g. 'login', 'snapshot')
 * @param {object} scene  - { onEnter(el, params), onExit?() }
 */
export function registerScene(name, scene) {
  scenes[name] = scene;
}

/**
 * Navigate to a scene.
 * @param {string} screen - scene name
 * @param {object} p      - params to pass to the scene
 */
export function go(screen, p = {}) {
  // Clean up previous scene
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  // Update state
  APP.screen = screen;
  APP.p = p;

  // Reset staff on return to login
  if (screen === 'login') {
    APP.staff = null;
    APP.offline = false;
  }

  // Render chrome
  renderBars();

  // Clear scene container
  const el = $('scene');
  el.innerHTML = '';

  // Enter new scene
  const scene = scenes[screen];
  if (scene && scene.onEnter) {
    const cleanup = scene.onEnter(el, p);
    if (typeof cleanup === 'function') {
      currentCleanup = cleanup;
    }
    if (scene.onExit) {
      currentCleanup = scene.onExit;
    }
  } else {
    // Placeholder for unregistered scenes
    el.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:12px;">
        <div style="font-family:var(--fh);font-size:22px;">${screen.toUpperCase()}</div>
        <div style="opacity:0.4;">Coming Soon</div>
        <div class="btn-s" style="border:1px solid var(--mint);padding:10px 20px;cursor:pointer;"
             id="_placeholder_back">← Snapshot</div>
      </div>`;
    const backBtn = $('_placeholder_back');
    if (backBtn) backBtn.addEventListener('click', () => go('snapshot'));
  }
}

// Make go() globally accessible for inline handlers
window.go = go;
