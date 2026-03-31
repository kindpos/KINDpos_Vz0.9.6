// ═══════════════════════════════════════════════════
//  KINDpos Lite — Close Day / Batch Scene (Placeholder)
//  Tip adjustment, batch submission, cash expected.
// ═══════════════════════════════════════════════════

import { registerScene } from '../lite-scene-manager.js';

registerScene('lite-close-day', {
  onEnter(el) {
    el.innerHTML = `
      <div class="lite-placeholder">
        <div class="lite-placeholder__title">BATCH / TIP ADJUST</div>
        <div class="lite-placeholder__label">PLACEHOLDER</div>
        <div style="background:var(--bg2);border:2px solid var(--mint);padding:20px 32px;clip-path:polygon(8px 0%,calc(100% - 8px) 0%,100% 8px,100% calc(100% - 8px),calc(100% - 8px) 100%,8px 100%,0% calc(100% - 8px),0% 8px);">
          <div style="font-family:var(--fb);font-size:14px;color:var(--mint);opacity:0.6;">Tip adjustment, batch submission, cash expected</div>
        </div>
        <div class="lite-placeholder__back" onclick="LiteSceneManager.back()">Back</div>
      </div>`;
  }
});
