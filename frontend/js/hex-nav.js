// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — CHOO Hex Navigation Engine
//  Contextual Hexagonal Organizational Overlay
//  Container-aware SVG rendering — zero viewport refs
//  Nice. Dependable. Yours.
// ═══════════════════════════════════════════════════

import { T } from './theme-manager.js';

// ── Constants ──
const SVG_NS = 'http://www.w3.org/2000/svg';
const GAP_MULTIPLIER = 1.06;
const BORDER_WIDTH = 3;
const SELECTED_BORDER_WIDTH = 5;
const ORIGIN_MARGIN = 16;

// Face iteration order: prefer downward-right cascade, siblings cluster tight.
// Face 2 = 5 o'clock, Face 3 = 7 o'clock, Face 1 = 3 o'clock,
// Face 0 = 2 o'clock, Face 4 = 9 o'clock, Face 5 = 11 o'clock
const CASCADE_FACE_ORDER = [2, 3, 1, 0, 4, 5];

// ── Hex Math Utilities ──

/** Generate 6 vertices for a pointy-top hexagon. */
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

/** First ring: 6 face-centered positions around a parent hex. */
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

/** Second ring: 12 overflow positions at ~2.1x distance. */
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
 * Centered honeycomb positions for root-level items.
 * Hand-tuned layouts for small counts (1-8), grid fallback for 9+.
 * All positions centered within the container for a balanced look.
 */
function centeredHoneycombPositions(cx, cy, outerW, outerH, count, containerW, containerH, margin) {
  // Tight spacing — feels clustered like a real honeycomb
  const colSpacing = outerW * 1.02;
  const rowSpacing = outerH * 0.76;
  const halfCol = colSpacing / 2;

  if (count <= 8) {
    // Hand-tuned centered layouts per count
    let offsets;
    switch (count) {
      case 1:
        offsets = [[0, 0]];
        break;
      case 2:
        offsets = [[-halfCol, 0], [halfCol, 0]];
        break;
      case 3:
        // Triangle: 1 top centered, 2 below staggered
        offsets = [
          [0, -rowSpacing * 0.5],
          [-halfCol, rowSpacing * 0.5],
          [halfCol, rowSpacing * 0.5],
        ];
        break;
      case 4:
        // Diamond: 1 top, 2 middle, 1 bottom
        offsets = [
          [0, -rowSpacing],
          [-halfCol, 0],
          [halfCol, 0],
          [0, rowSpacing],
        ];
        break;
      case 5:
        // 2 top row, 3 bottom row (staggered)
        offsets = [
          [-halfCol, -rowSpacing * 0.5],
          [halfCol, -rowSpacing * 0.5],
          [-colSpacing, rowSpacing * 0.5],
          [0, rowSpacing * 0.5],
          [colSpacing, rowSpacing * 0.5],
        ];
        break;
      case 6:
        // 3 top row, 3 bottom row (staggered)
        offsets = [
          [-colSpacing, -rowSpacing * 0.5],
          [0, -rowSpacing * 0.5],
          [colSpacing, -rowSpacing * 0.5],
          [-halfCol, rowSpacing * 0.5],
          [halfCol, rowSpacing * 0.5],
          [colSpacing + halfCol, rowSpacing * 0.5],
        ];
        break;
      case 7:
        // 3 top, 4 bottom
        offsets = [
          [-colSpacing, -rowSpacing * 0.5],
          [0, -rowSpacing * 0.5],
          [colSpacing, -rowSpacing * 0.5],
          [-colSpacing - halfCol, rowSpacing * 0.5],
          [-halfCol, rowSpacing * 0.5],
          [halfCol, rowSpacing * 0.5],
          [colSpacing + halfCol, rowSpacing * 0.5],
        ];
        break;
      case 8:
        // 3 top, 2 middle, 3 bottom
        offsets = [
          [-colSpacing, -rowSpacing],
          [0, -rowSpacing],
          [colSpacing, -rowSpacing],
          [-halfCol, 0],
          [halfCol, 0],
          [-colSpacing, rowSpacing],
          [0, rowSpacing],
          [colSpacing, rowSpacing],
        ];
        break;
      default:
        offsets = [[0, 0]];
    }
    return offsets.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }));
  }

  // 9+ items: centered honeycomb grid fallback
  const cols = Math.ceil(Math.sqrt(count * 1.15));
  const rows = Math.ceil(count / cols);
  const gridW = (cols - 1) * colSpacing + halfCol; // account for stagger
  const gridH = (rows - 1) * rowSpacing;
  const startX = cx - gridW / 2;
  const startY = cy - gridH / 2;

  const positions = [];
  let idx = 0;
  for (let r = 0; r < rows && positions.length < count; r++) {
    const isOddRow = r % 2 === 1;
    const xOff = isOddRow ? halfCol : 0;
    const rowCols = isOddRow ? cols - 1 : cols;
    for (let c = 0; c < rowCols && positions.length < count; c++) {
      positions.push({
        x: startX + c * colSpacing + xOff,
        y: startY + r * rowSpacing,
      });
    }
  }
  return positions;
}

/** Detect which of a hex's 6 faces are occupied by neighbors. */
function getOccupiedFaces(targetHex, allHexagons, itemRadius) {
  const occupiedFaces = [false, false, false, false, false, false];
  const threshold = (targetHex.radius + itemRadius) * 1.2;
  for (const other of allHexagons) {
    if (other === targetHex) continue;
    const dx = other.x - targetHex.x;
    const dy = other.y - targetHex.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > threshold) continue;
    let angle = Math.atan2(dy, dx);
    if (angle < 0) angle += Math.PI * 2;
    let adjusted = angle + Math.PI / 2;
    if (adjusted >= Math.PI * 2) adjusted -= Math.PI * 2;
    const face = Math.round(adjusted / (Math.PI / 3)) % 6;
    occupiedFaces[face] = true;
  }
  return occupiedFaces;
}

/** Get positions on empty faces of a parent hex. */
function getPositionsForEmptyFaces(parentHex, occupiedFaces, childRadius, faceOrder) {
  const order = faceOrder || [0, 1, 2, 3, 4, 5];
  const positions = [];
  const distance = (parentHex.radius + childRadius) * 1.05;
  for (const face of order) {
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

/** Greedy nearest-neighbor reorder for tight sibling clustering. */
function clusterByProximity(candidates) {
  if (candidates.length <= 1) return candidates;
  const remaining = candidates.slice();
  const ordered = [remaining.shift()];
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - last.x;
      const dy = remaining[i].y - last.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }
  return ordered;
}

// ── HexNav Class ──

/**
 * HexNav — Container-aware SVG hexagonal navigation engine.
 *
 * Usage:
 *   const nav = new HexNav(containerEl, {
 *     data: menuCategories,
 *     onSelect: (item) => addToCheck(item),
 *     onBack: () => {},
 *   });
 *
 * Data shape:
 *   [{ id, label, color?, children?: [same], price? }]
 */
export class HexNav {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.data = options.data || [];
    this.onSelect = options.onSelect || (() => {});
    this.onBack = options.onBack || (() => {});
    this.onPathChange = options.onPathChange || null;

    // Navigation state
    this._selections = [];

    // Derived measurements (recalculated on resize)
    this._containerW = 0;
    this._containerH = 0;
    this._hexRadius = 0;
    this._outerW = 0;
    this._outerH = 0;
    this._originX = 0;
    this._originY = 0;

    // SVG element
    this.svg = null;
    this._resizeObserver = null;

    this._init();
  }

  // ── Public API ──

  /** Replace data set and reset to root. */
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
    this._firePathChange();
    this.onBack();
    return true;
  }

  /** Programmatic navigation to a path array of item IDs. */
  navigateTo(path) {
    this._selections = [];
    let items = this.data;
    for (const id of path) {
      const found = items.find(item => item.id === id);
      if (!found || !found.children) break;
      // Use center position for programmatic navigation
      this._measure();
      this._selections.push({
        item: found,
        position: { x: this._containerW / 2, y: this._containerH / 2 },
      });
      items = found.children;
    }
    this._rebuild();
    this._firePathChange();
  }

  /** Return to root level. */
  reset() {
    this._selections = [];
    this._rebuild();
    this._firePathChange();
  }

  /** Tear down everything. */
  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.svg && this.svg.parentNode) {
      this.svg.parentNode.removeChild(this.svg);
      this.svg = null;
    }
  }

  // ── Private: Init ──

  _init() {
    // Container setup for touch isolation
    const pos = getComputedStyle(this.container).position;
    if (pos === 'static') {
      this.container.style.position = 'relative';
    }
    this.container.style.overflow = 'hidden';
    this.container.style.isolation = 'isolate';

    // Create SVG — sizes to container, not viewport
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.style.width = '100%';
    this.svg.style.height = '100%';
    this.svg.style.position = 'absolute';
    this.svg.style.top = '0';
    this.svg.style.left = '0';
    this.svg.style.filter = 'drop-shadow(0 0 12px rgba(198, 255, 187, 0.25))';
    this.container.appendChild(this.svg);

    // Initial measure and render
    this._measure();
    this._rebuild();

    // ResizeObserver for container size changes
    this._resizeObserver = new ResizeObserver(() => {
      this._measure();
      this._rebuild();
    });
    this._resizeObserver.observe(this.container);
  }

  // ── Private: Measurement ──

  _measure() {
    const rect = this.container.getBoundingClientRect();
    this._containerW = rect.width;
    this._containerH = rect.height;

    // Dynamic hex sizing from container's smaller dimension
    const minDim = Math.min(this._containerW, this._containerH);
    this._hexRadius = Math.max(30, Math.min(65, minDim / 8));

    // Outer dimensions including border
    this._outerW = this._hexRadius * 2 + BORDER_WIDTH * 2;
    this._outerH = this._hexRadius * 2 + BORDER_WIDTH * 2;

    // Top-left origin for root grid
    this._originX = ORIGIN_MARGIN + this._outerW / 2;
    this._originY = ORIGIN_MARGIN + this._outerH / 2;
  }

  // ── Private: Rendering ──

  _rebuild() {
    // Nuke and rebuild — clear SVG, re-render from state
    while (this.svg.firstChild) {
      this.svg.removeChild(this.svg.firstChild);
    }

    if (!this.data || this.data.length === 0) return;
    if (this._containerW === 0 || this._containerH === 0) return;

    if (this._selections.length === 0) {
      this._renderRootItems();
    } else {
      this._renderDrilledScene();
    }
  }

  /** Render root-level items in centered honeycomb layout. */
  _renderRootItems() {
    const items = this.data;
    const positions = centeredHoneycombPositions(
      this._containerW / 2, this._containerH / 2,
      this._outerW, this._outerH,
      items.length,
      this._containerW, this._containerH, ORIGIN_MARGIN
    );

    const maxItems = Math.min(items.length, positions.length);
    for (let i = 0; i < maxItems; i++) {
      const g = this._renderHex(items[i], positions[i].x, positions[i].y, this._hexRadius, {
        locked: false,
        onClick: () => this._onHexClick(items[i], positions[i]),
      });
      this.svg.appendChild(g);
    }
  }

  /** Render locked ancestors + bloom current children around parent. */
  _renderDrilledScene() {
    const depth = this._selections.length;
    const currentChildren = this._getCurrentChildren();
    if (!currentChildren || currentChildren.length === 0) return;

    const childRadius = this._hexRadius;
    const childOuterR = childRadius + BORDER_WIDTH;

    // Build tracking array for all locked ancestors
    const allHexagons = [];
    for (let i = 0; i < this._selections.length; i++) {
      const sel = this._selections[i];
      const lockedOuterR = this._hexRadius + SELECTED_BORDER_WIDTH;

      const g = this._renderHex(sel.item, sel.position.x, sel.position.y, this._hexRadius, {
        locked: true,
        onClick: () => this._onLockedHexClick(i),
      });
      this.svg.appendChild(g);

      allHexagons.push({
        x: sel.position.x,
        y: sel.position.y,
        radius: lockedOuterR,
        visualRadius: this._hexRadius,
      });
    }

    // Bloom children around the last selected parent
    const parentSel = this._selections[this._selections.length - 1];
    const parentOuterR = this._hexRadius + SELECTED_BORDER_WIDTH;

    const parentHex = {
      x: parentSel.position.x,
      y: parentSel.position.y,
      radius: parentOuterR,
    };

    // Detect occupied faces, iterate in cascade order
    const occupied = getOccupiedFaces(parentHex, allHexagons, childOuterR);
    let candidates = getPositionsForEmptyFaces(parentHex, occupied, childOuterR, CASCADE_FACE_ORDER);

    // Collision check: reject candidates overlapping non-parent ancestors
    const ancestors = allHexagons.slice(0, -1);
    if (ancestors.length > 0) {
      candidates = candidates.filter(pos => {
        return !ancestors.some(lp => {
          const dx = pos.x - lp.x;
          const dy = pos.y - lp.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < (childRadius + lp.visualRadius);
        });
      });
    }

    // Sibling-cluster packing
    let positions = clusterByProximity(candidates);

    // Overflow into second ring if needed
    if (positions.length < currentChildren.length) {
      const ring2 = secondRingPositions(
        parentSel.position.x, parentSel.position.y,
        parentOuterR, childOuterR
      );
      const allPlaced = allHexagons.concat(
        positions.map(p => ({ x: p.x, y: p.y, radius: childOuterR }))
      );
      let safeRing2 = ring2.filter(rp => {
        return !allPlaced.some(placed => {
          const dx = rp.x - placed.x;
          const dy = rp.y - placed.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < (childOuterR + placed.radius) * 1.05;
        });
      });
      safeRing2.sort((a, b) => (b.y + b.x * 0.5) - (a.y + a.x * 0.5));
      positions.push(...safeRing2.slice(0, currentChildren.length - positions.length));
    }

    // Boundary filtering: reject out-of-bounds positions
    const margin = ORIGIN_MARGIN;
    positions = positions.filter(pos =>
      pos.x - childOuterR > margin &&
      pos.x + childOuterR < this._containerW - margin &&
      pos.y - childOuterR > margin &&
      pos.y + childOuterR < this._containerH - margin
    );

    // Place child hexes
    const maxItems = Math.min(currentChildren.length, positions.length);
    for (let i = 0; i < maxItems; i++) {
      const item = currentChildren[i];
      const pos = positions[i];
      const g = this._renderHex(item, pos.x, pos.y, this._hexRadius, {
        locked: false,
        disabled: item.disabled || item.is86,
        onClick: () => this._onHexClick(item, pos),
      });
      this.svg.appendChild(g);
    }
  }

  /** Get children at current drill level. */
  _getCurrentChildren() {
    if (this._selections.length === 0) return this.data;
    const lastSel = this._selections[this._selections.length - 1];
    return lastSel.item.children || [];
  }

  /** Render a single hex as an SVG <g> group. */
  _renderHex(item, cx, cy, radius, opts = {}) {
    const { locked = false, disabled = false, onClick } = opts;
    const g = document.createElementNS(SVG_NS, 'g');
    g.style.cursor = disabled ? 'not-allowed' : 'pointer';

    const points = hexVertices(cx, cy, radius)
      .map(v => `${v.x},${v.y}`)
      .join(' ');

    const color = item.color || 'var(--mint)';
    const strokeWidth = locked ? SELECTED_BORDER_WIDTH : BORDER_WIDTH;
    const baseFillOpacity = disabled ? 0.05 : (locked ? 0.4 : 0.15);
    const hoverFillOpacity = disabled ? 0.05 : (locked ? 0.6 : 0.35);

    // Fill + stroke polygon
    const poly = document.createElementNS(SVG_NS, 'polygon');
    poly.setAttribute('points', points);
    poly.setAttribute('fill', color);
    poly.setAttribute('fill-opacity', String(baseFillOpacity));
    poly.setAttribute('stroke', locked ? 'var(--kind-gold)' : color);
    poly.setAttribute('stroke-width', String(strokeWidth));
    g.appendChild(poly);

    // Label text
    const fontSize = Math.max(10, Math.min(16, radius * 0.35));
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(cx));
    text.setAttribute('y', String(cy));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', disabled ? '#666' : '#fff');
    text.setAttribute('font-family', 'var(--fb)');
    text.setAttribute('font-size', fontSize + 'px');
    text.setAttribute('pointer-events', 'none');
    text.textContent = item.label;
    g.appendChild(text);

    // Disabled 86'd strikethrough
    if (disabled) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(cx - radius * 0.5));
      line.setAttribute('y1', String(cy));
      line.setAttribute('x2', String(cx + radius * 0.5));
      line.setAttribute('y2', String(cy));
      line.setAttribute('stroke', '#ff3355');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('pointer-events', 'none');
      g.appendChild(line);
    }

    // Pointer events
    if (!disabled && onClick) {
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
    }
    g.addEventListener('pointerenter', () => {
      if (!disabled) poly.setAttribute('fill-opacity', String(hoverFillOpacity));
    });
    g.addEventListener('pointerleave', () => {
      poly.setAttribute('fill-opacity', String(baseFillOpacity));
    });

    return g;
  }

  // ── Private: Navigation ──

  _onHexClick(item, pos) {
    if (item.children && item.children.length > 0) {
      this._selections.push({
        item,
        position: { x: pos.x, y: pos.y },
      });
      this._rebuild();
      this._firePathChange();
    } else {
      this.onSelect(item);
    }
  }

  _onLockedHexClick(selectionIndex) {
    this._selections.splice(selectionIndex);
    this._rebuild();
    this._firePathChange();
    this.onBack();
  }

  _firePathChange() {
    if (this.onPathChange) {
      const path = this._selections.map(s => s.item.id);
      this.onPathChange(path);
    }
  }
}
