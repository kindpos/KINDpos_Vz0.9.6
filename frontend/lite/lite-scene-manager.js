// ═══════════════════════════════════════════════════
//  KINDpos Lite — Scene Manager (Standalone)
//  Handles all routing for the Lite UI.
//  Does NOT modify or depend on the existing scene-manager.js.
// ═══════════════════════════════════════════════════

const scenes = {};
let currentScene = null;
let currentCleanup = null;
let authUser = null;
let sessionMode = null;

// Back navigation map per spec
const BACK_MAP = {
  'lite-checks':    'lite-login',
  'lite-order':     'lite-checks',
  'lite-payment':   'lite-order',
  'lite-clock':     'lite-login',
  'lite-reporting': 'lite-login',
  'lite-config':    'lite-login',
  'lite-close-day': 'lite-checks',
};

function registerScene(name, scene) {
  scenes[name] = scene;
}

function getSceneEl() {
  return document.getElementById('lite-scene');
}

const LiteSceneManager = {
  /**
   * Initialize the scene manager and show the login screen.
   */
  init() {
    currentScene = null;
    currentCleanup = null;
    authUser = null;
    sessionMode = null;
    this.navigateTo('lite-login');
  },

  /**
   * Navigate to a scene by ID.
   * @param {string} sceneId - one of the registered scene IDs
   * @param {object} options - context passed to the scene's onEnter
   */
  navigateTo(sceneId, options = {}) {
    // Clean up previous scene
    if (currentCleanup) {
      currentCleanup();
      currentCleanup = null;
    }

    // Reset auth on return to login
    if (sceneId === 'lite-login') {
      authUser = null;
      sessionMode = null;
    }

    // Persist mode if provided
    if (options.mode) {
      sessionMode = options.mode;
    }

    // Always pass current mode in options
    if (sessionMode && !options.mode) {
      options.mode = sessionMode;
    }

    currentScene = sceneId;

    // Update header clock
    updateTbar();

    // Clear and render scene
    const el = getSceneEl();
    if (!el) return;
    el.innerHTML = '';

    const scene = scenes[sceneId];
    if (scene && scene.onEnter) {
      const cleanup = scene.onEnter(el, options);
      if (typeof cleanup === 'function') {
        currentCleanup = cleanup;
      }
    } else {
      // Fallback for unregistered scenes
      el.innerHTML = `
        <div class="lite-placeholder">
          <div class="lite-placeholder__title">${sceneId.toUpperCase()}</div>
          <div class="lite-placeholder__label">SCENE NOT REGISTERED</div>
          <div class="lite-placeholder__back" onclick="LiteSceneManager.back()">Back</div>
        </div>`;
    }
  },

  /**
   * Go back based on the back navigation map.
   */
  back() {
    const target = BACK_MAP[currentScene] || 'lite-login';
    this.navigateTo(target);
  },

  /**
   * Returns the current active scene ID.
   */
  getActiveScene() {
    return currentScene;
  },

  /**
   * Returns the authenticated user set during PIN validation.
   */
  getAuthUser() {
    return authUser;
  },

  /**
   * Set the authenticated user (called by login scene on successful PIN).
   */
  setAuthUser(user) {
    authUser = user;
  },

  /**
   * Get the current session mode.
   */
  getSessionMode() {
    return sessionMode;
  },
};

// Update the header bar clock
function updateTbar() {
  const tbar = document.getElementById('lite-tbar');
  if (!tbar) return;
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const hStr = String(hours).padStart(2, '0');
  tbar.textContent = `${dd}/${mm}/${yyyy} <> ${hStr}:${minutes}${ampm}`;
}

// Auto-refresh clock every 30s
setInterval(updateTbar, 30000);

// Make globally accessible
window.LiteSceneManager = LiteSceneManager;
window.registerLiteScene = registerScene;

export { LiteSceneManager, registerScene };
