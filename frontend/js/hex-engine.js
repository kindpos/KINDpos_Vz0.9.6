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
 * @param {number} cx - Parent center X
 * @param {number} cy - Parent center Y
 * @param {number} parentRadius - Parent hex radius (half of outer width)
 * @param {number} childRadius  - Child hex radius (half of outer width)
 * @returns {Array<{x: number, y: number, face: number}>} 6 positions
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
 * @param {number} cx - Center X
 * @param {number} cy - Center Y
 * @param {number} centerRadius - Center hex radius
 * @param {number} ringRadius   - Ring hex radius
 * @returns {Array<{x: number, y: number, index: number}>} 12 positions
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
 * @param {number} targetX - Target hex center X
 * @param {number} targetY - Target hex center Y
 * @param {Array<{x: number, y: number}>} neighbors - Existing neighbor positions
 * @returns {Set<number>} Set of occupied face indices (0=top, clockwise)
 */
function occupiedFaces(targetX, targetY, neighbors) {
  const occupied = new Set();
  for (const n of neighbors) {
    const angle = Math.atan2(n.y - targetY, n.x - targetX);
    const normalized = ((angle + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const face = Math.round(normalized / (Math.PI / 3)) % 6;
    occupied.add(face);
  }
  return occupied;
}

/**
 * Get positions on empty (unoccupied) faces of a parent hex.
 * Uses face-centered placement with +π/6 offset.
 * @param {number} parentX - Parent center X
 * @param {number} parentY - Parent center Y
 * @param {number} parentRadius - Parent hex radius
 * @param {number} itemRadius   - Item hex radius
 * @param {Set<number>} occupied - Set of occupied face indices
 * @returns {Array<{x: number, y: number, face: number}>} Available positions
 */
function emptyFacePositions(parentX, parentY, parentRadius, itemRadius, occupied) {
  const distance = (parentRadius + itemRadius) * GAP_MULTIPLIER;
  const positions = [];
  for (let face = 0; face < 6; face++) {
    if (occupied.has(face)) continue;
    const angle = -Math.PI / 2 + (Math.PI / 3) * face + Math.PI / 6;
    positions.push({
      x: parentX + distance * Math.cos(angle),
      y: parentY + distance * Math.sin(angle),
      face,
    });
  }
  return positions;
}

// ── HexEngine Class ──

/**
 * HexEngine — Instantiable hexagonal navigation controller.
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

    this._stack = [];
    this._elements = [];

    this._cx = 0;
    this._cy = 0;

    this._init();
  }

  // ── Public API ──

  /** Replace the data set and reset to root level. */
  setData(data) {
    this.data = data;
    this._stack = [];
    this._render(this.data, null);
  }

  /** Navigate back one level. Returns false if already at root. */
  back() {
    if (this._stack.length === 0) return false;
    this._stack.pop();
    if (this._stack.length === 0) {
      this._render(this.data, null);
    } else {
      const prev = this._stack[this._stack.length - 1];
      this._render(prev.children, prev.parentPos);
    }
    return true;
  }

  /** Reset to root level. */
  reset() {
    this._stack = [];
    this._render(this.data, null);
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
    this._render(this.data, null);
  }

  _updateCenter() {
    const rect = this.container.getBoundingClientRect();
    this._cx = rect.width / 2;
    this._cy = rect.height / 2;
  }

  _clear() {
    for (const el of this._elements) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    this._elements = [];
    const header = this.container.querySelector('[data-hex-context-header]');
    if (header) header.remove();
  }

  /**
   * Render a set of items around an optional parent position.
   * If parentPos is null, renders in a ring around container center.
   * If parentPos is given, blooms children on empty faces of the parent.
   */
  _render(items, parentPos) {
    this._clear();
    this._updateCenter();

    if (!items || items.length === 0) return;

    const depth = this._stack.length;
    const sizeKeys = ['category', 'item', 'modifier'];
    const currentSizeKey = sizeKeys[Math.min(depth, sizeKeys.length - 1)];
    const outerSize = this._outer[currentSizeKey];
    const hexRadius = outerSize.w / 2;

    let positions;

    if (parentPos === null) {
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
    } else {
      const siblingPositions = this._elements
        .filter(el => el._hexLocked)
        .map(el => ({
          x: parseFloat(el.style.left) + outerSize.w / 2,
          y: parseFloat(el.style.top) + outerSize.h / 2,
        }));

      const occupied = occupiedFaces(parentPos.x, parentPos.y, siblingPositions);
      positions = emptyFacePositions(
        parentPos.x, parentPos.y,
        hexRadius, hexRadius, occupied
      );

      if (positions.length < items.length) {
        const ring2 = secondRingPositions(
          parentPos.x, parentPos.y, hexRadius, hexRadius
        );
        positions.push(...ring2.slice(0, items.length - positions.length));
      }
    }

    // Render context header if drilled in
    if (this._stack.length > 0) {
      const current = this._stack[this._stack.length - 1];
      const headerEl = document.createElement('div');
      headerEl.setAttribute('data-hex-context-header', '');
      headerEl.innerHTML = hexContextHeader(current.label);
      headerEl.style.cssText = `
        position: absolute;
        top: 4px;
        left: 0;
        right: 0;
        z-index: 10;
      `;
      this.container.appendChild(headerEl);
    }

    // Build and place hex buttons
    const maxItems = Math.min(items.length, positions.length);
    for (let i = 0; i < maxItems; i++) {
      const item = items[i];
      const pos = positions[i];

      const el = buildHexButton(item.label, {
        color: item.color || T.mint,
        disabled: item.disabled || false,
        width: this._sizes[currentSizeKey].w + 'px',
        height: this._sizes[currentSizeKey].h + 'px',
        data: item,
        onClick: () => this._onHexClick(item, pos, i),
      });

      el.style.left = (pos.x - outerSize.w / 2) + 'px';
      el.style.top = (pos.y - outerSize.h / 2) + 'px';

      this.container.appendChild(el);
      this._elements.push(el);
    }
  }

  /**
   * Handle hex click. If item has children, drill down (lock hex, bloom children).
   * If item has no children, it's a leaf — fire onSelect callback.
   * If clicking a locked hex, navigate back up.
   */
  _onHexClick(item, pos, index) {
    const el = this._elements[index];
    if (el && el._hexLocked) {
      this.back();
      this.onBack();
      return;
    }

    if (item.children && item.children.length > 0) {
      this._lockHex(index);

      this._stack.push({
        data: this.data,
        selectedIndex: index,
        label: item.label,
        parentPos: pos,
        children: item.children,
        level: this._stack.length,
      });

      this._renderChildren(item.children, pos);
    } else {
      this.onSelect(item);
    }
  }

  /**
   * Visually lock a hex button (solid fill, thicker appearance).
   * Replaces the hex element in-place with a selected version.
   */
  _lockHex(index) {
    const el = this._elements[index];
    if (!el) return;

    const item = el._hexData;
    const depth = this._stack.length;
    const sizeKeys = ['category', 'item', 'modifier'];
    const currentSizeKey = sizeKeys[Math.min(depth, sizeKeys.length - 1)];

    const newEl = buildHexButton(item.label, {
      color: item.color || T.mint,
      selected: true,
      width: this._sizes[currentSizeKey].w + 'px',
      height: this._sizes[currentSizeKey].h + 'px',
      data: item,
      onClick: () => this._onHexClick(item,
        {
          x: parseFloat(el.style.left) + this._outer[currentSizeKey].w / 2,
          y: parseFloat(el.style.top) + this._outer[currentSizeKey].h / 2,
        },
        index
      ),
    });

    newEl.style.left = el.style.left;
    newEl.style.top = el.style.top;
    newEl._hexLocked = true;

    el.parentNode.replaceChild(newEl, el);
    this._elements[index] = newEl;
  }

  /**
   * Render children around a parent hex, keeping locked parent(s) visible.
   * Removes non-locked siblings, then blooms children on empty faces.
   */
  _renderChildren(children, parentPos) {
    const kept = [];
    for (const el of this._elements) {
      if (el._hexLocked) {
        kept.push(el);
      } else {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    }
    this._elements = kept;

    const depth = this._stack.length;
    const sizeKeys = ['category', 'item', 'modifier'];
    const childSizeKey = sizeKeys[Math.min(depth, sizeKeys.length - 1)];
    const outerSize = this._outer[childSizeKey];
    const hexRadius = outerSize.w / 2;

    const lockedPositions = this._elements.map(el => ({
      x: parseFloat(el.style.left) + outerSize.w / 2,
      y: parseFloat(el.style.top) + outerSize.h / 2,
    }));

    const occupied = occupiedFaces(parentPos.x, parentPos.y, lockedPositions);
    let positions = emptyFacePositions(
      parentPos.x, parentPos.y,
      hexRadius, hexRadius, occupied
    );

    if (positions.length < children.length) {
      const ring2 = secondRingPositions(
        parentPos.x, parentPos.y, hexRadius, hexRadius
      );
      const safeRing2 = ring2.filter(rp => {
        return !lockedPositions.some(lp => {
          const dx = rp.x - lp.x;
          const dy = rp.y - lp.y;
          return Math.sqrt(dx * dx + dy * dy) < outerSize.w * 0.8;
        });
      });
      positions.push(...safeRing2.slice(0, children.length - positions.length));
    }

    // Update context header
    const existingHeader = this.container.querySelector('[data-hex-context-header]');
    if (existingHeader) existingHeader.remove();

    const current = this._stack[this._stack.length - 1];
    const headerEl = document.createElement('div');
    headerEl.setAttribute('data-hex-context-header', '');
    headerEl.innerHTML = hexContextHeader(current.label);
    headerEl.style.cssText = `
      position: absolute;
      top: 4px;
      left: 0;
      right: 0;
      z-index: 10;
    `;
    this.container.appendChild(headerEl);

    // Build and place child hexes
    const maxItems = Math.min(children.length, positions.length);
    for (let i = 0; i < maxItems; i++) {
      const item = children[i];
      const pos = positions[i];

      const el = buildHexButton(item.label, {
        color: item.color || T.mint,
        disabled: item.disabled || false,
        width: this._sizes[childSizeKey].w + 'px',
        height: this._sizes[childSizeKey].h + 'px',
        data: item,
        onClick: () => this._onHexClick(item, pos, this._elements.indexOf(el)),
      });

      el.style.left = (pos.x - outerSize.w / 2) + 'px';
      el.style.top = (pos.y - outerSize.h / 2) + 'px';

      this.container.appendChild(el);
      this._elements.push(el);
    }
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
