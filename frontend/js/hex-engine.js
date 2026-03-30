// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Hex Navigation Engine
//  CHOO: Contextual Hexagonal Organizational Overlay
//  Nice. Dependable. Yours.
// ═══════════════════════════════════════════════════

import {
  T, buildHexButton, hexContextHeader
} from './theme-manager.js';

// ── Hex Sizing ──
const HEX_SIZES = Object.freeze({
  category: { w: 60, h: 68 },
  item:     { w: 60, h: 68 },
  modifier: { w: 60, h: 68 },
});

// ── Layout Constants ──
const GAP_MULTIPLIER = 1.06;
const BORDER_WIDTH = 3;

// ── Derived: outer dimensions including border ──
const OUTER = Object.freeze({
  category: {
    w: HEX_SIZES.category.w + BORDER_WIDTH * 2,
    h: HEX_SIZES.category.h + BORDER_WIDTH * 2,
  },
  item: {
    w: HEX_SIZES.item.w + BORDER_WIDTH * 2,
    h: HEX_SIZES.item.h + BORDER_WIDTH * 2,
  },
  modifier: {
    w: HEX_SIZES.modifier.w + BORDER_WIDTH * 2,
    h: HEX_SIZES.modifier.h + BORDER_WIDTH * 2,
  },
});

// ── Hex Math Utilities ──

/**
 * Generate the 6 vertex positions for a pointy-top hexagon.
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} r  - Radius (center to vertex)
 * @returns {Array<{x: number, y: number}>} 6 vertices, starting top, clockwise
 */
function hexVertices(cx, cy, r) {
  const verts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    verts.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return verts;
}

/**
 * Calculate positions for the first ring (6 surrounding hexes).
 * Uses face-centered placement: +π/6 offset shifts from vertex-aligned
 * to face-centered positioning.
 */
function firstRingPositions(cx, cy, parentRadius, childRadius) {
  const distance = (parentRadius + childRadius) * GAP_MULTIPLIER;
  const positions = [];
  for (let face = 0; face < 6; face++) {
    const angle = -Math.PI / 2 + (Math.PI / 3) * face + Math.PI / 6;
    positions.push({
      x: cx + distance * Math.cos(angle),
      y: cy + distance * Math.sin(angle),
      face,
    });
  }
  return positions;
}

/**
 * Calculate positions for the second ring (12 positions).
 * Uses 30° intervals at ~2.1× the hex-width distance.
 */
function secondRingPositions(cx, cy, centerRadius, ringRadius) {
  const distance = (centerRadius + ringRadius) * 2 * GAP_MULTIPLIER;
  const positions = [];
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI / 6) * i;
    positions.push({
      x: cx + distance * Math.cos(angle),
      y: cy + distance * Math.sin(angle),
      index: i,
    });
  }
  return positions;
}

/**
 * Detect which of a hex's 6 faces are occupied by existing neighbors.
 * Uses 1.2× combined radii as the neighbor distance threshold.
 * @param {{x,y,radius}} targetHex - Target hex with actual radius
 * @param {Array<{x,y,radius}>} allHexagons - All placed hexes with actual radii
 * @param {number} itemRadius - Radius of the items being placed
 * @returns {boolean[]} 6-element array, true = occupied
 */
function getOccupiedFaces(targetHex, allHexagons, itemRadius) {
  const occupiedFaces = [false, false, false, false, false, false];
  const threshold = (targetHex.radius + itemRadius) * 1.2;

  for (const otherHex of allHexagons) {
    if (otherHex === targetHex) continue;

    const dx = otherHex.x - targetHex.x;
    const dy = otherHex.y - targetHex.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > threshold) continue;

    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;

    let adjustedAngle = angle + Math.PI / 2;
    if (adjustedAngle >= Math.PI * 2) adjustedAngle -= Math.PI * 2;

    const face = Math.round(adjustedAngle / (Math.PI / 3)) % 6;
    occupiedFaces[face] = true;
  }
  return occupiedFaces;
}

/**
 * Get positions on empty (unoccupied) faces of a parent hex.
 * Uses face-centered placement with +π/6 (30°) offset and 1.05× gap.
 * @param {{x,y,radius}} parentHex - Parent hex with actual radius
 * @param {boolean[]} occupiedFaces - 6-element array from getOccupiedFaces
 * @param {number} childRadius - Radius of the child hexes being placed
 * @returns {Array<{x,y,face}>} Available positions
 */
function getPositionsForEmptyFaces(parentHex, occupiedFaces, childRadius) {
  const positions = [];
  const distance = (parentHex.radius + childRadius) * 1.05;

  for (let face = 0; face < 6; face++) {
    if (occupiedFaces[face]) continue;
    const angle = -Math.PI / 2 + (Math.PI / 3) * face + (Math.PI / 6);
    positions.push({
      x: parentHex.x + distance * Math.cos(angle),
      y: parentHex.y + distance * Math.sin(angle),
      face,
    });
  }
  return positions;
}

// ── Size key helpers ──
const SIZE_KEYS = ['category', 'item', 'modifier'];
function sizeKeyForDepth(depth) {
  return SIZE_KEYS[Math.min(depth, SIZE_KEYS.length - 1)];
}

// ── HexEngine Class ──

/**
 * HexEngine — Instantiable hexagonal navigation controller.
 *
 * Uses a nuke-and-rebuild pattern: every navigation action (forward or back)
 * clears ALL hex elements and rebuilds the entire scene from a state object.
 *
 * Usage:
 *   const nav = new HexEngine({
 *     container: document.getElementById('hex-panel'),
 *     data: menuCategories,  // Array of { id, label, color?, children? }
 *     onSelect: (item) => addToCheck(item),
 *     onBack: () => clearSelection(),
 *   });
 *
 * Data shape:
 *   {
 *     id: string,
 *     label: string,
 *     color: string (optional — defaults to T.mint),
 *     disabled: boolean (optional — 86'd items),
 *     children: Array<same shape> (optional — next drill level),
 *   }
 */
export class HexEngine {
  constructor(opts) {
    this.container = opts.container;
    this.data = opts.data || [];
    this.onSelect = opts.onSelect || (() => {});
    this.onBack = opts.onBack || (() => {});
    this.sizeKey = opts.sizeKey || 'category';

    // Per-level hex dimensions (caller can override defaults)
    this._sizes = opts.sizes || HEX_SIZES;
    this._outer = Object.freeze({
      category: {
        w: this._sizes.category.w + BORDER_WIDTH * 2,
        h: this._sizes.category.h + BORDER_WIDTH * 2,
      },
      item: {
        w: this._sizes.item.w + BORDER_WIDTH * 2,
        h: this._sizes.item.h + BORDER_WIDTH * 2,
      },
      modifier: {
        w: this._sizes.modifier.w + BORDER_WIDTH * 2,
        h: this._sizes.modifier.h + BORDER_WIDTH * 2,
      },
    });

    // Navigation state: all positions stored here, never derived from DOM
    this._navState = {
      level: 'cat',          // 'cat' | 'subcat' | 'item'
      selectedCat: null,     // { item, position: {x, y} }
      selectedSubcat: null,  // { item, position: {x, y} }
      catPosition: null,     // {x, y} stored when cat is selected
      subcatPosition: null,  // {x, y} stored when subcat is selected
    };

    // Generalized selection stack for arbitrary depth
    // Each entry: { item, position: {x, y}, children }
    this._selections = [];

    this._elements = [];
    this._cx = 0;
    this._cy = 0;

    this._init();
  }

  // ── Public API ──

  /** Replace the data set and reset to root level. */
  setData(data) {
    this.data = data;
    this._selections = [];
    this._rebuild();
  }

  /** Navigate back one level. Returns false if already at root. */
  back() {
    if (this._selections.length === 0) return false;
    this._selections.pop();
    this._rebuild();
    return true;
  }

  /** Reset to root level. */
  reset() {
    this._selections = [];
    this._rebuild();
  }

  /** Clean up DOM elements. Call when unmounting. */
  destroy() {
    this._clear();
    this.container = null;
  }

  // ── Private Methods ──

  _init() {
    const pos = getComputedStyle(this.container).position;
    if (pos === 'static') {
      this.container.style.position = 'relative';
    }
    this.container.style.overflow = 'hidden';

    this._updateCenter();
    this._rebuild();
  }

  _updateCenter() {
    const rect = this.container.getBoundingClientRect();
    this._cx = rect.width / 2;
    this._cy = rect.height / 2;
  }

  /** Remove ALL hex elements and context headers from the container. Full wipe. */
  _clear() {
    for (const el of this._elements) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    this._elements = [];
    const header = this.container.querySelector('[data-hex-context-header]');
    if (header) header.remove();
  }

  /**
   * Master rebuild: clear everything, then render the entire scene from state.
   * Called on every navigation action (forward drill-down AND back).
   */
  _rebuild() {
    this._clear();
    this._updateCenter();

    const depth = this._selections.length;

    if (depth === 0) {
      // Root level: render all top-level items
      this._renderRootItems();
    } else {
      // Drilled in: render locked ancestors + current children
      this._renderDrilledScene();
    }
  }

  /** Render root-level items in ring layout around container center. */
  _renderRootItems() {
    const items = this.data;
    if (!items || items.length === 0) return;

    const outerSize = this._outer[sizeKeyForDepth(0)];
    const hexRadius = outerSize.w / 2;

    let positions;
    if (items.length === 1) {
      positions = [{ x: this._cx, y: this._cy }];
    } else if (items.length <= 7) {
      positions = [{ x: this._cx, y: this._cy }];
      const ring = firstRingPositions(this._cx, this._cy, hexRadius, hexRadius);
      positions.push(...ring.slice(0, items.length - 1));
    } else {
      positions = [{ x: this._cx, y: this._cy }];
      const ring1 = firstRingPositions(this._cx, this._cy, hexRadius, hexRadius);
      positions.push(...ring1);
      const ring2 = secondRingPositions(this._cx, this._cy, hexRadius, hexRadius);
      positions.push(...ring2.slice(0, items.length - 7));
    }

    const currentSizeKey = sizeKeyForDepth(0);
    const maxItems = Math.min(items.length, positions.length);
    for (let i = 0; i < maxItems; i++) {
      const item = items[i];
      const pos = positions[i];
      this._placeHex(item, pos, currentSizeKey, false);
    }
  }

  /** Render locked ancestors at stored positions + bloom current children. */
  _renderDrilledScene() {
    const depth = this._selections.length;
    const currentChildren = this._getCurrentChildren();
    if (!currentChildren || currentChildren.length === 0) return;

    const childSizeKey = sizeKeyForDepth(depth);
    const outerSize = this._outer[childSizeKey];
    const childRadius = outerSize.w / 2;

    // Build allHexagons tracking array with actual radii for each locked ancestor
    const allHexagons = [];
    for (let i = 0; i < this._selections.length; i++) {
      const sel = this._selections[i];
      const ancestorSizeKey = sizeKeyForDepth(i);
      this._placeLockedHex(sel.item, sel.position, ancestorSizeKey, i);

      const selectedBw = 5;
      const lockedOuterW = this._sizes[ancestorSizeKey].w + selectedBw * 2;
      allHexagons.push({
        x: sel.position.x,
        y: sel.position.y,
        radius: lockedOuterW / 2,
        label: sel.item.label,
      });
    }

    // Render context header
    const lastSel = this._selections[this._selections.length - 1];
    const headerEl = document.createElement('div');
    headerEl.setAttribute('data-hex-context-header', '');
    headerEl.innerHTML = hexContextHeader(lastSel.item.label);
    headerEl.style.cssText = `
      position: absolute;
      top: 4px;
      left: 0;
      right: 0;
      z-index: 10;
    `;
    this.container.appendChild(headerEl);

    // Items bloom ONLY around the last selected parent (subcat parent only)
    const parentSel = this._selections[this._selections.length - 1];
    const parentSizeKey = sizeKeyForDepth(depth - 1);
    const selectedBw = 5;
    const parentOuterW = this._sizes[parentSizeKey].w + selectedBw * 2;
    const parentRadius = parentOuterW / 2;

    // Build parent hex object for the new API
    const parentHex = {
      x: parentSel.position.x,
      y: parentSel.position.y,
      radius: parentRadius,
      label: parentSel.item.label,
    };

    // Detect occupied faces using all placed hexes with actual radii
    const occupied = getOccupiedFaces(parentHex, allHexagons, childRadius);
    let positions = getPositionsForEmptyFaces(parentHex, occupied, childRadius);

    // Global collision check: reject candidates too close to any locked hex
    positions = positions.filter(pos => {
      return !allHexagons.some(lp => {
        const dx = pos.x - lp.x;
        const dy = pos.y - lp.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (childRadius + lp.radius) * 1.05;
      });
    });

    // Overflow into second ring if needed
    if (positions.length < currentChildren.length) {
      const ring2 = secondRingPositions(
        parentSel.position.x, parentSel.position.y,
        parentRadius, childRadius
      );
      const allPlaced = allHexagons.concat(
        positions.map(p => ({ x: p.x, y: p.y, radius: childRadius }))
      );
      const safeRing2 = ring2.filter(rp => {
        return !allPlaced.some(placed => {
          const dx = rp.x - placed.x;
          const dy = rp.y - placed.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < (childRadius + placed.radius) * 1.05;
        });
      });
      positions.push(...safeRing2.slice(0, currentChildren.length - positions.length));
    }

    // Boundary filtering: individually reject out-of-bounds positions
    const rect = this.container.getBoundingClientRect();
    const margin = 16;
    positions = positions.filter(pos =>
      pos.x - childRadius > margin &&
      pos.x + childRadius < rect.width - margin &&
      pos.y - childRadius > margin &&
      pos.y + childRadius < rect.height - margin
    );

    // Place child hexes
    const maxItems = Math.min(currentChildren.length, positions.length);
    for (let i = 0; i < maxItems; i++) {
      const item = currentChildren[i];
      const pos = positions[i];
      this._placeHex(item, pos, childSizeKey, false);
    }
  }

  /** Get the children to display at the current drill level. */
  _getCurrentChildren() {
    if (this._selections.length === 0) return this.data;
    const lastSel = this._selections[this._selections.length - 1];
    return lastSel.item.children || [];
  }

  /**
   * Place a regular (unlocked) hex button in the container.
   * Attaches click handler for drill-down or leaf selection.
   */
  _placeHex(item, pos, sizeKey, locked) {
    const outerSize = this._outer[sizeKey];

    const el = buildHexButton(item.label, {
      color: item.color || T.mint,
      disabled: item.disabled || false,
      width: this._sizes[sizeKey].w + 'px',
      height: this._sizes[sizeKey].h + 'px',
      data: item,
      onClick: () => this._onHexClick(item, pos),
    });

    el.style.left = (pos.x - outerSize.w / 2) + 'px';
    el.style.top = (pos.y - outerSize.h / 2) + 'px';

    this.container.appendChild(el);
    this._elements.push(el);
  }

  /**
   * Place a locked (selected) ancestor hex at its stored position.
   * Click handler navigates back to this ancestor's level.
   */
  _placeLockedHex(item, pos, sizeKey, selectionIndex) {
    const selectedBw = 5;
    const lockedOuterW = this._sizes[sizeKey].w + selectedBw * 2;
    const lockedOuterH = this._sizes[sizeKey].h + selectedBw * 2;

    const el = buildHexButton(item.label, {
      color: item.color || T.mint,
      selected: true,
      width: this._sizes[sizeKey].w + 'px',
      height: this._sizes[sizeKey].h + 'px',
      data: item,
      onClick: () => this._onLockedHexClick(selectionIndex),
    });

    el.style.left = (pos.x - lockedOuterW / 2) + 'px';
    el.style.top = (pos.y - lockedOuterH / 2) + 'px';
    el._hexLocked = true;
    el._hexOuterW = lockedOuterW;
    el._hexOuterH = lockedOuterH;

    this.container.appendChild(el);
    this._elements.push(el);
  }

  /**
   * Handle click on a regular (unlocked) hex.
   * If it has children, drill down. If leaf, fire onSelect.
   */
  _onHexClick(item, pos) {
    if (item.children && item.children.length > 0) {
      // Store position and drill down
      this._selections.push({
        item,
        position: { x: pos.x, y: pos.y },
      });
      this._rebuild();
    } else {
      this.onSelect(item);
    }
  }

  /**
   * Handle click on a locked ancestor hex.
   * Pops back to that ancestor's level (removes it and everything after).
   */
  _onLockedHexClick(selectionIndex) {
    // Pop back to the level before this selection
    this._selections.splice(selectionIndex);
    this._rebuild();
    this.onBack();
  }
}

/*
 * ── INTEGRATION EXAMPLE (for check-editing.js) ──
 *
 * import { HexEngine } from '../hex-engine.js';
 *
 * const menuData = [
 *   {
 *     id: 'apps', label: 'Apps', color: '#c6ffbb',
 *     children: [
 *       { id: 'wings', label: 'Wings', color: '#c6ffbb',
 *         children: [
 *           { id: 'buffalo', label: 'Buffalo' },
 *           { id: 'garlic-parm', label: 'Garl Prm' },
 *           { id: 'bbq', label: 'BBQ' },
 *         ]
 *       },
 *       { id: 'nachos', label: 'Nachos' },
 *       { id: 'bruschetta', label: 'Brusch', disabled: true }, // 86'd
 *     ]
 *   },
 *   { id: 'entrees', label: 'Entree', color: '#ffc344' },
 *   { id: 'drinks', label: 'Drinks', color: '#33ffff' },
 *   { id: 'desserts', label: 'Dessrt', color: '#b48efa' },
 * ];
 *
 * const hexNav = new HexEngine({
 *   container: document.getElementById('hex-panel'),
 *   data: menuData,
 *   onSelect: (item) => {
 *     console.log('Selected:', item.label);
 *     addToCheck(item);
 *   },
 *   onBack: () => {
 *     console.log('Navigated back');
 *   },
 * });
 *
 * // Later, to switch data (e.g., modifiers):
 * hexNav.setData(modifierData);
 *
 * // To clean up:
 * hexNav.destroy();
 */
