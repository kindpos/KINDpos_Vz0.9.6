# HEX BLOOMING AUDIT — KINDpos CHOO Navigation

**Date:** 2026-03-30
**Scope:** Frontend hex blooming logic on the Order Entry (add-items) screen
**Status:** Diagnostic only — no code modified

---

## 1. File Inventory

| File | Lines | Role | Key Functions (line numbers) |
|------|-------|------|------------------------------|
| `frontend/js/hex-engine.js` | 653 | Core CHOO engine — math, placement, state | `hexVertices` L47, `firstRingPositions` L69, `secondRingPositions` L92, `occupiedFaces` L113, `emptyFacePositions` L134, `HexEngine` class L171, `_clampPositions` L267, `_render` L333, `_onHexClick` L435, `_lockHex` L465, `_renderChildren` L508 |
| `frontend/js/scenes/add-items.js` | 378 | Order screen integration | `menuToHexData` L8, `modifiersToHexData` L48, `ITEM_SIZES` L91, `MOD_SIZES` L96, `initHexEngine` L102, cleanup return L131, `handleItemSelected` L250 |
| `frontend/js/theme-manager.js` | 688 | Hex button DOM builder | `hexClip` L312, `hexBtn` L316, `hexBtnOuter` L355, `buildHexButton` L370, `hexContextHeader` L444 |
| `frontend/js/config.js` | 61 | Menu data (3-level) | `FALLBACK_MENU` L24, `MODIFIERS` L38 |
| `frontend/js/scene-manager.js` | 78 | Scene lifecycle & cleanup | `go()` L25 (calls cleanup on scene exit) |

---

## 2. Math Comparison — Spec vs Implementation

### 2.1 Vertex Generation

| | Spec | Code (`hex-engine.js:49-50`) |
|-|------|-----|
| Formula | `angle = (π/3) × i − π/2` | `const angle = (Math.PI / 3) * i - Math.PI / 2` |
| Orientation | Pointy-top, vertex 0 at 12 o'clock | Same |
| **Verdict** | **MATCH** | |

### 2.2 First Ring Positions (Root Layout)

| | Spec (Surrounding Hex Positions) | Code (`hex-engine.js:70-78`) |
|-|------|-----|
| Distance | `(parentRadius + childRadius) × gapMultiplier` | `(parentRadius + childRadius) * GAP_MULTIPLIER` (1.06) |
| Angle | `(π/3) × i` (starts 3 o'clock) | `−π/2 + (π/3) × face + π/6` (face-centered, starts upper-right) |
| **Verdict** | **INTENTIONAL DEVIATION** — code uses face-centered placement for root ring layout, not vertex-aligned. Produces different starting position (2 o'clock vs 3 o'clock) but consistent honeycomb | |

### 2.3 Face Occupancy Detection

| | Spec | Code (`hex-engine.js:113-122`) |
|-|------|-----|
| Angle calc | `atan2(dy, dx)` | `Math.atan2(n.y - targetY, n.x - targetX)` — **MATCH** |
| Normalize | `if angle < 0: angle += 2π` then `adjustedAngle = angle + π/2` | `((angle + π/2) % 2π + 2π) % 2π` — mathematically equivalent (add π/2 first, then normalize) — **MATCH** |
| Face index | `round(adjustedAngle / (π/3)) % 6` | `Math.round(normalized / (Math.PI / 3)) % 6` — **MATCH** |
| Distance filter | `maxNeighborDist = (targetRadius + otherRadius) × 1.3`; skip if farther | **MISSING** — see BUG 1 |

### 2.4 Empty Face Placement

| | Spec | Code (`hex-engine.js:134-147`) |
|-|------|-----|
| Distance | `(parentRadius + itemRadius) × 1.05` | `(parentRadius + itemRadius) * 1.06` |
| Angle | `−π/2 + (π/3) × face + π/6` | Same — **MATCH** |
| **Verdict** | GAP_MULTIPLIER 1.06 vs spec 1.05 — within spec range (1.05–1.08) — **MATCH** | |

### 2.5 Second Ring Positions

| | Spec | Code (`hex-engine.js:92-104`) |
|-|------|-----|
| Distance | `(centerRadius + ringRadius) × 2.1` | `(centerRadius + ringRadius) * 2 * 1.06 = × 2.12` |
| Intervals | 12 positions at 30° (π/6) | Same — **MATCH** |
| **Verdict** | 2.12 vs 2.1 — negligible — **MATCH** | |

### 2.6 Collision Check

| | Spec | Code |
|-|------|-----|
| After face placement | Check distance against ALL already-placed hexes | **NOT IMPLEMENTED** — see BUG 4 |
| Threshold | `1.05× combined radii` | Ring 2 filter uses `outerSize.w * 0.8` — see BUG 6 |

---

## 3. Bugs Found

### BUG 1 — `occupiedFaces` has no distance threshold (CRITICAL)

- **File:** `frontend/js/hex-engine.js:113-122`
- **Spec says:** Only consider hexes within `maxNeighborDist = (targetRadius + otherRadius) × 1.3`. Skip hexes farther than this threshold.
- **Code does:** The function signature accepts `(targetX, targetY, neighbors)` — a flat array of positions with no radius info. It processes every entry in `neighbors` regardless of distance, marking the corresponding face as occupied.
- **Root cause:** The callers (`_render` L374, `_renderChildren` L539) pass in all locked hex positions without filtering by distance.
- **Impact:** At Level 3, the locked category hex (potentially far from the subcategory) falsely occupies one of the subcategory's 6 faces, reducing available bloom slots from 5 to 4 (or worse).

```
// Current (no distance check):
function occupiedFaces(targetX, targetY, neighbors) {
  const occupied = new Set();
  for (const n of neighbors) {
    const angle = Math.atan2(n.y - targetY, n.x - targetX);
    ...
    occupied.add(face);    // <-- always adds, no distance gate
  }
  return occupied;
}

// Spec requires:
//   distance = sqrt(dx² + dy²)
//   maxNeighborDist = (targetRadius + otherRadius) × 1.3
//   if distance > maxNeighborDist: continue
```

---

### BUG 2 — Locked hex center calculation assumes uniform size (CRITICAL)

- **File:** `frontend/js/hex-engine.js:529-537` (`_renderChildren`)
- **Spec says:** Each hex has its own radius; calculations must use per-hex dimensions.
- **Code does:**

```javascript
// L529-532: parentOuterW/H are computed from PARENT depth's size key
const parentOuterW = this._sizes[parentSizeKey].w + selectedBw * 2;
const parentOuterH = this._sizes[parentSizeKey].h + selectedBw * 2;

// L534-537: ALL locked elements use parentOuterW/H to reconstruct center
const lockedPositions = this._elements.map(el => ({
  x: parseFloat(el.style.left) + parentOuterW / 2,   // <-- wrong for non-parent hexes
  y: parseFloat(el.style.top) + parentOuterH / 2,
}));
```

- **Concrete scenario (with `add-items.js` ITEM_SIZES):**
  - Category hex (depth 0): inner 140px, selected outer = 140 + 5×2 = **150px**
  - Subcategory hex (depth 1): inner 90px, selected outer = 90 + 5×2 = **100px**
  - At Level 3 (items), `parentSizeKey = 'item'`, so `parentOuterW = 100`
  - Locked category hex center is calculated as `left + 50`, but actual center is `left + 75`
  - **25px error** in the x-coordinate passed to `occupiedFaces`

- **Impact:** Face detection for the subcategory receives a wrong position for the category hex, potentially mapping it to the wrong face. Combined with BUG 1 (no distance filtering), this causes children to bloom in unexpected directions.

---

### BUG 3 — Back navigation destroys locked parent hexes (MAJOR)

- **File:** `frontend/js/hex-engine.js:215-225` (`back()`) and `hex-engine.js:319-326` (`_clear()`)
- **Spec says:** Tapping a locked hex navigates back one level. Parent hexes remain visible and locked at all times.
- **Code does:**

```javascript
// back() — L215-225
back() {
  this._stack.pop();
  if (this._stack.length === 0) {
    this._render(this.data, null);      // root — correct
  } else {
    const prev = this._stack[this._stack.length - 1];
    this._render(prev.children, prev.parentPos);  // <-- calls _render
  }
}

// _render() — L333-334
_render(items, parentPos) {
  this._clear();          // <-- removes ALL elements, including locked parents
  this._updateCenter();
  ...
}
```

- **Trace:** User at Level 3 (locked category + locked subcategory + items visible). User taps locked subcategory:
  1. `_onHexClick` detects `_hexLocked`, calls `this.back()`
  2. `back()` pops stack (now 1 entry), calls `_render(subcategories, categoryPos)`
  3. `_render` calls `_clear()` — removes ALL DOM elements, empties `_elements` array
  4. `_render` renders subcategories around `categoryPos`, but never recreates the locked category hex
  5. **Result:** Category hex vanishes from screen

- **Contrast with forward navigation:** `_renderChildren` (L508) preserves locked elements by only removing non-locked siblings (L511-518). `_render` has no such protection.

---

### BUG 4 — No global collision check after face-based placement (MODERATE)

- **File:** `frontend/js/hex-engine.js:540-543` (`_renderChildren`)
- **Spec says:** "After calculating a candidate position, also check distance against ALL already-placed items (not just the target hex's neighbors)."
- **Code does:** Computes empty face positions, then uses them directly without checking whether any candidate overlaps another already-placed hex at less than `1.05× combined radii`.

```javascript
// L539-543: positions are used as-is after face detection
const occupied = occupiedFaces(parentPos.x, parentPos.y, lockedPositions);
let positions = emptyFacePositions(
  parentPos.x, parentPos.y,
  parentRadius, childRadius, occupied
);
// No collision check against lockedPositions or against each other
```

- **Impact:** With mixed-size hexes (category outer 150px, child outer 100px), a child placed on an "empty" face can still visually overlap a locked parent if the parent is large enough to extend into the face zone. The face detection only checks angle, not radial overlap.

---

### BUG 5 — Boundary handling shifts group instead of rejecting individuals (MINOR)

- **File:** `frontend/js/hex-engine.js:267-317` (`_clampPositions`)
- **Spec says:** "Items that would render partially off-screen should be rejected."
- **Code does:** Calculates bounding box of all hex centers, centers the group in the container, then shifts the entire group if any hex exceeds bounds. No individual position is ever removed.

```javascript
// L298-308: only handles one edge per axis (if/else, not both)
if (newMinX - halfW < pad) {
  shiftX += pad - (newMinX - halfW);
} else if (newMaxX + halfW > rect.width - pad) {       // <-- only one side
  shiftX -= (newMaxX + halfW) - (rect.width - pad);
}
```

- **Impact:** If the bloom group is wider than the container, clamping fixes one side but the other side overflows. On small screens or containers, hexes can still render off-screen.

---

### BUG 6 — Ring 2 collision uses wrong threshold and incomplete check (MINOR)

- **File:** `frontend/js/hex-engine.js:549-555` (`_renderChildren`)
- **Spec says:** Collision threshold = `1.05× combined radii minimum distance`.
- **Code does:**

```javascript
const safeRing2 = ring2.filter(rp => {
  return !lockedPositions.some(lp => {
    const dx = rp.x - lp.x;
    const dy = rp.y - lp.y;
    return Math.sqrt(dx * dx + dy * dy) < outerSize.w * 0.8;  // <-- wrong threshold
  });
});
```

- **Issues:**
  1. Threshold `outerSize.w * 0.8` is ~80% of ONE hex width, not 1.05× combined radii of two hexes
  2. Only checks against `lockedPositions`, not against Ring 1 children already placed in `positions`
- **Impact:** Ring 2 candidates can overlap Ring 1 children. With mixed-size hexes, the single-width threshold is even more incorrect.

---

## 4. State Management Issues

| Area | Status | Details |
|------|--------|---------|
| State reset on leave | OK | `add-items.js:131-135` returns cleanup: `hexEngine.destroy()`, nulls reference, clears `stagedItems`. Scene manager calls cleanup in `go()` (L27-29). |
| Locked hex tap → back | BROKEN | `_onHexClick` (L435-441) correctly detects `_hexLocked` and calls `back()`, but `back()` destroys locked parents (BUG 3). |
| `_elements` array tracking | BROKEN on back nav | `_renderChildren` correctly filters to locked-only (L518) then appends children. But `_render` (called by `back()`) calls `_clear()` which empties `_elements`, losing all locked hex references. |
| `_stack` management | OK | Stack pushes on drill-down with `parentPos`, `children`, `label`. `back()` pops correctly. Data integrity is fine. |
| `hexEngine` lifecycle | OK | Created in `requestAnimationFrame` (L116), destroyed on mode switch (L105), destroyed on scene exit (L132). No leaks. |

---

## 5. Recommended Fix Order

| Priority | Bug | Rationale |
|----------|-----|-----------|
| 1 | BUG 3 — Back navigation | Highest user-facing impact. Navigation is visually broken: parent hex disappears. Fix `back()` to preserve/recreate locked parents, or refactor to use `_renderChildren`-style logic. |
| 2 | BUG 2 — Uniform size assumption | Causes incorrect center positions for locked hexes at different depth levels. Must store per-element outer dimensions (or depth/sizeKey) on the DOM element so center can be reconstructed accurately. |
| 3 | BUG 1 — Missing distance threshold | With BUG 2 fixed, positions will be correct but distant hexes still mark faces. Add `maxNeighborDist` check to `occupiedFaces`, passing radius info alongside positions. |
| 4 | BUG 4 — Global collision check | After face placement, verify each candidate against all placed hexes at `1.05× combined radii`. Reject or reposition colliders. |
| 5 | BUG 6 — Ring 2 threshold | Change threshold to `1.05 × (childRadius + otherRadius)` and check against Ring 1 positions too. |
| 6 | BUG 5 — Individual boundary rejection | Replace group-shift with per-position filter: reject any candidate where `center ± halfSize` exceeds container bounds (with padding). |

---

## 6. Additional Runtime Testing Needed

The following cannot be determined from code inspection alone:

1. **Visual overlap severity** — Need to render with `ITEM_SIZES` (140/90/80) and visually verify how much overlap BUG 2+4 produce in practice
2. **Back navigation DOM state** — Inspect DOM after back-navigation to confirm orphaned elements or missing locked hexes
3. **Container size sensitivity** — Test `_clampPositions` on the actual `#hex-workspace` dimensions to see if BUG 5 triggers on target hardware (POS terminal screen size)
4. **Touch target accuracy** — Verify that the 25px center-offset from BUG 2 doesn't cause tap targets to misfire (user taps one hex, adjacent hex receives the event)
