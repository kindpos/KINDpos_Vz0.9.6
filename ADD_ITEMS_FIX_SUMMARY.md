# Add-Items Scene Fix Summary

**Date:** 2026-03-30
**Branch:** `claude/fix-add-items-bugs-GzkVN` → merged to `main`
**Commits:** `727e697` → `863f1eb` (4 commits)

---

## What Was Fixed

### Bug 1 — Double Topbar (CRITICAL)
**Files:** `add-items.js`, `bars.js`

The scene rendered its own `buildHeader()` with timestamp, check ID, and seat
info — duplicating the persistent topbar from `bars.js`. Removed the custom
header entirely. Extended `bars.js` `titlePart` to include check/seat context
when `APP.screen === 'add-items'`, so the standard topbar now shows:

```
05:30 pm // Add Items <> C-101 // Seat(s): ALL // Good Evening, Alex M.
```

Removed the redundant `add-close-btn` (X button) — the topbar's `_tbar_back`
button already handles discard-or-navigate via `window.onBackRequested`.

### Bug 2 — Hex Bloom Overflow / Clipping (HIGH)
**File:** `hex-engine.js`

Added `_clampPositions()` method that centers the entire bloom group in the
container, then clamps to bounds with 16px padding. Called in both `_render()`
and `_renderChildren()`. For drill-downs, locked parent hex positions are
included in the bounding box and their DOM positions shift with the group.

### Bug 3 — Duplicate Hexes Persisting in DOM (HIGH)
**File:** `hex-engine.js`

Two root causes:

1. **Stale index closure in `_lockHex()`** — The onClick handler captured
   `index` at creation time. After `_renderChildren()` reorganized the
   `_elements` array, the captured index pointed to the wrong element.
   Fixed by using `this._elements.indexOf(newEl)` at click time.

2. **Incomplete DOM cleanup in `_renderChildren()`** — Only removed elements
   tracked in `this._elements`. Switched to walking actual `container.children`
   to catch any orphaned DOM nodes.

### Bug 4 — Circular Selection Indicator (MEDIUM)
**Files:** `theme-manager.js`, `hex-engine.js`

Selected/locked hexes now show a **cyan hex-shaped highlight ring** using
`hexBtnOuter(T.cyan, ...)` with a wider border (5px vs 3px). Added
`outline: none` to the wrapper to suppress circular browser focus rings.
Adjusted locked hex positioning by the border difference to keep centers
aligned.

### Bloom Ring Math — Mixed-Size Levels
**File:** `hex-engine.js`

`emptyFacePositions()` and `secondRingPositions()` were called with the
**child** hex radius for both `parentRadius` and `itemRadius`. When
category hexes (140px) bloom into item hexes (90px), children overlapped
the parent. Now correctly derives `parentRadius` from the parent's depth
level, matching the function signatures' intended design.

### Bloom Centering
**File:** `hex-engine.js`

`_clampPositions()` previously only shifted when hexes exceeded container
edges. Asymmetric layouts (e.g. 3 root categories filling 2 of 6 ring
positions) appeared right-biased. Now always centers the bounding box of
all hex positions in the container first, then clamps as a secondary step.

### Modifier Restructure
**Files:** `config.js`, `add-items.js`

- `MODIFIERS` changed from flat array to categorized object:
  `Produce` (6 items), `Protein` (2), `Sauce` (4)
- `modifiersToHexData()` handles the new cat → items structure
- HexEngine recreated with smaller sizes for modifier mode:
  categories 90x102, items 60x68 (vs menu's 140x158 / 90x102)
- Prefix row (ADD/NO/ON SIDE/LITE/EXTRA) moved above hex workspace
  with larger buttons (24px font, 40px height)

---

## Files Changed

| File | Changes |
|------|---------|
| `frontend/js/scenes/add-items.js` | Remove custom header, restructure modifier data/sizing, move prefix row |
| `frontend/js/hex-engine.js` | Fix stale index, DOM cleanup, bloom math, centering, mixed-size radii |
| `frontend/js/theme-manager.js` | Cyan hex-shaped selection ring, wider selected border, outline suppression |
| `frontend/js/bars.js` | Extend topbar titlePart with check ID + seat for add-items screen |
| `frontend/js/config.js` | Restructure MODIFIERS into categorized object |
