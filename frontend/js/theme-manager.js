// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Theme Manager
//  Nice. Dependable. Yours.
// ═══════════════════════════════════════════════════

// ── Design Tokens (aliases for CSS custom properties) ──

export const T = Object.freeze({
  // Backgrounds
  bg:       'var(--bg)',
  bg2:      'var(--bg2)',
  bg3:      'var(--bg3)',

  // Brand Colors
  mint:     'var(--mint)',
  mintDim:  'var(--mint-dim)',
  mintHover:'var(--mint-hover)',
  yellow:   'var(--yellow)',
  red:      'var(--red)',
  cyan:     'var(--cyan)',
  lavender: 'var(--lavender)',
  gold:     'var(--gold)',
  orange:   'var(--orange)',
  clrRed:   'var(--clr-red)',
  goGreen:  'var(--go-green)',
  kindGold: 'var(--kind-gold)',
  clockGold:'var(--clock-gold)',

  // Typography
  fh:       'var(--fh)',
  fb:       'var(--fb)',
  fhi:      'var(--fhi)',
  fhiSolid: 'var(--fhi-solid)',

  // Layout
  borderW:  'var(--border-w)',
  barH:     'var(--bar-h)',
});

// ── Chamfer Clip-Path Generator ──

export function chamfer(size = 'lg') {
  const s = { sm: 'var(--chamfer-sm)', md: 'var(--chamfer-md)', lg: 'var(--chamfer-lg)', xl: 'var(--chamfer-xl)' }[size] || size;
  return `polygon(${s} 0%,calc(100% - ${s}) 0%,100% ${s},100% calc(100% - ${s}),calc(100% - ${s}) 100%,${s} 100%,0% calc(100% - ${s}),0% ${s})`;
}

// ═══════════════════════════════════════════════════
//  HTML String Generators
// ═══════════════════════════════════════════════════

// ── PIN Hex Indicator ──

export function pinHex(filled) {
  const bg = filled ? T.mint : '#444';
  const color = filled ? T.bg : T.mint;
  return `<div style="width:44px;height:50px;background:${bg};border:2px solid ${T.mint};clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);display:flex;align-items:center;justify-content:center;font-family:${T.fb};font-size:24px;color:${color};"></div>`;
}

// ── PIN Frame (chamfered container with hex indicators) ──

export function pinFrame(pinLength, maxDigits = 4) {
  let hexes = '';
  for (let i = 0; i < maxDigits; i++) {
    hexes += pinHex(i < pinLength);
  }
  return `<div id="pin-frame" style="border:${T.borderW} solid ${T.mint};padding:8px;display:flex;justify-content:center;align-items:center;gap:4px;flex-wrap:wrap;height:65px;clip-path:${chamfer('lg')};">${hexes}</div>`;
}

// ── Error Banner ──

export function errBanner(msg) {
  if (!msg) return '';
  return `<div style="background:rgba(232,64,64,0.15);border:1px solid ${T.red};padding:4px 8px;font-size:15px;color:${T.red};margin-top:4px;border-radius:4px;">\u26A0 ${msg}</div>`;
}

// ── Footer Logo: KIND (gold) + pos (red) ──

export function footerLogo() {
  return `<span style="font-family:${T.fhi};font-size:30px;color:${T.kindGold};">KIND</span><span style="font-family:${T.fb};font-size:30px;color:${T.clrRed};">pos</span>`;
}

// ── Footer Terminal ID ──

export function footerTerminalId(id = '01', version = '1.0') {
  return `<span style="font-family:${T.fb};color:${T.mint};font-size:24px;">TRM-</span><span style="font-family:${T.fb};color:${T.kindGold};font-size:24px;">${id}</span><span style="font-family:${T.fb};color:${T.mint};font-size:24px;"> // Vz</span><span style="font-family:${T.fb};color:${T.kindGold};font-size:24px;">${version}</span>`;
}

// ── SBar Content (footer innerHTML) ──

export function sbarContent() {
  return `
    <span class="sbar-box">${footerTerminalId()}</span>
    <span class="sbar-box">${footerLogo()}</span>`;
}

// ── TBar: Logged-Out (clock only) ──

export function tbarLoggedOut(timeStr) {
  return `<span id="_tbar_clock" style="font-family:${T.fb};font-size:36px;">${timeStr}</span><span></span>`;
}

// ── TBar: Logged-In (full header) ──

export function tbarLoggedIn({ timeStr, titlePart, staffName, role, screen }) {
  const badge = role === 'manager'
    ? `<span style="background:#44FF88;color:${T.bg};padding:0 5px;font-size:14px;">[MGR]</span>`
    : `<span style="background:#FF8C00;color:${T.bg};padding:0 5px;font-size:14px;">[SVR]</span>`;

  const headerSettings = role === 'manager'
    ? `<span style="background:${T.bg};color:${T.mint};padding:0 8px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;font-family:${T.fb};cursor:pointer;"
            id="_tbar_settings">Settings</span>`
    : '';

  const backBtn = (screen === 'check-editing' || screen === 'check-overview')
    ? `<span style="background:${T.bg};color:${T.mint};padding:0 8px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;font-family:${T.fb};cursor:pointer;margin-right:8px;"
            id="_tbar_back">\u2190</span>`
    : '';

  return `
    <div style="display:flex;align-items:center;">
      ${backBtn}
      <span style="font-size:20px;font-family:${T.fb};"><span id="_tbar_clock">${timeStr}</span>${titlePart} // ${staffName}</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      ${badge}
      ${headerSettings}
      <span style="background:${T.red};color:${T.bg};width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold;cursor:pointer;clip-path:${chamfer('4px')};"
            id="_tbar_logout">\u2715</span>
    </div>`;
}

// ═══════════════════════════════════════════════════
//  DOM Element Builders
// ═══════════════════════════════════════════════════

// ── Numpad Key (returns DOM element with event listeners) ──

export function buildNumpadKey(key, { onPress, onLongPress }) {
  const wrap = document.createElement('div');
  wrap.className = 'btn-wrap';

  const b = document.createElement('div');
  b.textContent = key;

  const isCLR = key === 'CLR';
  const isENT = key === '>>>';

  if (isCLR) {
    b.style.cssText = `background:${T.clrRed};color:${T.bg};border:none;font-family:${T.fb};font-size:72px;display:flex;align-items:center;justify-content:center;height:88px;cursor:pointer;user-select:none;clip-path:${chamfer('sm')};`;
  } else if (isENT) {
    b.style.cssText = `background:${T.goGreen};color:${T.bg};border:none;font-family:${T.fb};font-size:72px;display:flex;align-items:center;justify-content:center;height:88px;cursor:pointer;user-select:none;clip-path:${chamfer('sm')};`;
  } else {
    b.style.cssText = `background:${T.bg};color:${T.mint};border:none;font-family:${T.fb};font-size:100px;display:flex;align-items:center;justify-content:center;height:88px;cursor:pointer;user-select:none;clip-path:${chamfer('sm')};`;
  }

  b.addEventListener('click', onPress);

  if (onLongPress) {
    let holdTimer = null;
    const startHold = () => { holdTimer = setTimeout(onLongPress.action, onLongPress.delay); };
    const endHold = () => { clearTimeout(holdTimer); };
    b.addEventListener('mousedown', startHold);
    b.addEventListener('mouseup', endHold);
    b.addEventListener('mouseleave', endHold);
    b.addEventListener('touchstart', startHold);
    b.addEventListener('touchend', endHold);
  }

  wrap.appendChild(b);
  return wrap;
}

// ── Action Button (returns DOM element with click listener) ──

export function buildActionButton(label, onClick) {
  const wrap = document.createElement('div');
  wrap.className = 'btn-wrap';

  const btn = document.createElement('div');
  btn.textContent = label;
  btn.className = 'btn-p';
  btn.style.cssText = 'font-size:32px;height:56px;';
  btn.addEventListener('click', onClick);

  wrap.appendChild(btn);
  return wrap;
}

// ── Numpad Container Style ──

export function numpadContainerStyle() {
  return `background:${T.mint};border:${T.borderW} solid ${T.mint};padding:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;clip-path:${chamfer('xl')};`;
}

// ═══════════════════════════════════════════════════
//  Overlay Components
// ═══════════════════════════════════════════════════

// ── Overlay Box (centered chamfered container) ──

export function overlayBox(inner, opts = {}) {
  const width = opts.width || '560px';
  const top = opts.top || '0';
  const bottom = opts.bottom || '0';
  const id = opts.id ? ` id="${opts.id}"` : '';
  return `<div${id} style="position:absolute;top:${top};left:50%;transform:translateX(-50%);width:${width};bottom:${bottom};background:${T.bg};border:${T.borderW} solid ${T.mint};z-index:100;display:flex;flex-direction:column;padding:20px 24px;gap:12px;filter:drop-shadow(4px 6px 0px #1a1a1a);clip-path:${chamfer('12px')};">${inner}</div>`;
}

// ── Overlay Close Button (red X) ──

export function overlayCloseBtn(onClickAttr) {
  const handler = onClickAttr ? ` onclick="${onClickAttr}"` : '';
  return `<div style="filter:drop-shadow(2px 3px 0px #1a1a1a);"><div style="background:${T.clrRed};color:${T.mint};font-family:${T.fb};font-size:28px;width:44px;height:44px;cursor:pointer;display:flex;align-items:center;justify-content:center;clip-path:${chamfer('md')};"${handler}>X</div></div>`;
}

// ── Overlay Header (welcome row + close button) ──

export function overlayHeader(leftHtml, onCloseAttr) {
  return `<div style="display:flex;justify-content:space-between;align-items:center;">${leftHtml}${overlayCloseBtn(onCloseAttr)}</div>`;
}

// ── Overlay Stub Button (positioned over login button) ──

export function overlayStubBtn(label, opts = {}) {
  const id = opts.id ? ` id="${opts.id}"` : '';
  const right = opts.right || '16px';
  const bottom = opts.bottom || '0';
  const width = opts.width || '280px';
  const height = opts.height || '56px';
  const bg = opts.bg || T.clockGold;
  const onClickAttr = opts.onClick || '';
  const handler = onClickAttr ? ` onclick="${onClickAttr}"` : '';
  return `<div${id} style="position:absolute;right:${right};bottom:${bottom};z-index:110;filter:drop-shadow(2px 3px 0px #1a1a1a);"><div style="background:${bg};color:${T.bg};font-family:${T.fb};font-size:32px;width:${width};height:${height};cursor:pointer;display:flex;align-items:center;justify-content:center;clip-path:${chamfer('md')};"${handler}>${label}</div></div>`;
}

// ── Role Button Outer (colored border wrapper) ──

export function roleBtnOuter(color, inner) {
  return `<div style="padding:3px;background:${color};clip-path:${chamfer('md')};">${inner}</div>`;
}

// ── Role Button (selectable role toggle) ──

export function roleBtn(label, opts = {}) {
  const selected = opts.selected || false;
  const color = opts.color || T.mint;
  const onClickAttr = opts.onClick || '';
  const bg = selected ? color : T.bg;
  const textColor = selected ? T.bg : color;
  const handler = onClickAttr ? ` onclick="${onClickAttr}"` : '';
  const inner = `<div style="height:64px;display:flex;align-items:center;justify-content:center;font-family:${T.fb};font-size:32px;cursor:pointer;background:${bg};color:${textColor};clip-path:${chamfer('sm')};"${handler}>${label}</div>`;
  return `<div style="filter:drop-shadow(2px 3px 0px #1a1a1a);">${roleBtnOuter(color, inner)}</div>`;
}
