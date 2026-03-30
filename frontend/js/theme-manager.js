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

export function sbarContent(opts = {}) {
  const roleBadge = opts.role === 'manager'
    ? `<span style="background:${T.clockGold};color:${T.bg};padding:2px 8px;font-family:${T.fb};font-size:12px;font-weight:bold;clip-path:${chamfer('sm')};">[ mgr ]</span>`
    : opts.role === 'server'
    ? `<span style="background:${T.orange};color:${T.bg};padding:2px 8px;font-family:${T.fb};font-size:12px;font-weight:bold;clip-path:${chamfer('sm')};">[ svr ]</span>`
    : '';
  const settingsBtn = opts.showSettings
    ? `<span style="font-family:${T.fb};font-size:14px;color:${T.mint};cursor:pointer;padding:2px 12px;border:1px solid ${T.mint};clip-path:${chamfer('sm')};" onclick="${opts.onSettings || ''}">settings</span>`
    : '';
  return `
    <span class="sbar-box" style="display:flex;align-items:center;gap:10px;">${footerTerminalId()}${roleBadge}</span>
    ${settingsBtn ? `<span class="sbar-box">${settingsBtn}</span>` : ''}
    <span class="sbar-box">${footerLogo()}</span>`;
}

// ── TBar: Logged-Out (clock only) ──

export function tbarLoggedOut(timeStr) {
  return `<span id="_tbar_clock" style="font-family:${T.fb};font-size:36px;">${timeStr}</span><span></span>`;
}

// ── TBar: Logged-In (full header) ──

export function tbarLoggedIn({ timeStr, titlePart, staffName, role, screen, msgCount }) {
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

  const msgBtn = msgCount != null && msgCount > 0
    ? msgButton(msgCount, "window._kindSnapOverlay&&window._kindSnapOverlay('messages')")
    : '';

  return `
    <div style="display:flex;align-items:center;">
      ${backBtn}
      <span style="font-size:20px;font-family:${T.fb};"><span id="_tbar_clock">${timeStr}</span>${titlePart} // ${staffName}</span>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      ${msgBtn}
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

// ── Button Wrap (drop-shadow + tap animation wrapper) ──

export function btnWrap(innerHtml, opts = {}) {
  const id = opts.id ? ` id="${opts.id}"` : '';
  const onClick = opts.onClick ? ` onclick="${opts.onClick}"` : '';
  return `<div${id} style="filter:drop-shadow(2px 3px 0px #1a1a1a);transition:filter 0.05s ease,transform 0.05s ease;cursor:pointer;"
    onpointerdown="this.style.filter='drop-shadow(0 0 0 #1a1a1a)';this.style.transform='translate(2px,3px)';"
    onpointerup="this.style.filter='drop-shadow(2px 3px 0px #1a1a1a)';this.style.transform='';"
    onpointerleave="this.style.filter='drop-shadow(2px 3px 0px #1a1a1a)';this.style.transform='';"${onClick}>${innerHtml}</div>`;
}

// ── Seat Tab (active/inactive seat button with subtotal) ──

export function seatTab(label, opts = {}) {
  const active = opts.active || false;
  const subtotal = opts.subtotal;
  const isAdd = opts.isAdd || false;
  const isDashed = opts.dashed || false;
  const onClick = opts.onClick || '';
  const handler = onClick ? ` onclick="${onClick}"` : '';
  const fontSize = opts.fontSize || '24px';
  const subLine = subtotal != null
    ? `<div style="font-family:${T.fb};font-size:14px;color:${T.gold};">$${subtotal}</div>`
    : '';

  if (isAdd) {
    return btnWrap(`<div style="min-height:60px;display:flex;align-items:center;justify-content:center;flex-direction:column;background:${T.bg};border:3px dashed ${T.bg3};color:${T.bg3};font-family:${T.fb};font-size:32px;clip-path:${chamfer('sm')};cursor:pointer;transition:border-color 0.1s,color 0.1s;"${handler}
      onpointerenter="this.style.borderColor='${T.mint}';this.style.color='${T.mint}';"
      onpointerleave="this.style.borderColor='${T.bg3}';this.style.color='${T.bg3}';">+</div>`);
  }

  const bg = active ? T.mint : T.bg;
  const textColor = active ? T.bg2 : T.mint;
  const border = active ? `3px solid ${T.mint}` : `3px solid ${T.bg3}`;

  return btnWrap(`<div style="min-height:60px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;background:${bg};color:${textColor};border:${border};font-family:${T.fb};font-size:${fontSize};clip-path:${chamfer('sm')};cursor:pointer;padding:4px 8px;"${handler}>
    <div style="letter-spacing:${label === 'ALL' ? '2px' : '0'};font-size:${label === 'ALL' ? '20px' : fontSize};">${label}</div>
    ${subLine}
  </div>`);
}

// ── Actions Card (peek/expand accordion) ──

export function actionsCard(state, opts = {}) {
  // state: 'hidden' | 'peek' | 'expanded'
  const peekLabels = opts.peekLabels || [];
  const expandedButtons = opts.expandedButtons || [];
  const onPeekClick = opts.onPeekClick || '';

  if (state === 'hidden') {
    return `<div style="max-height:0;opacity:0;overflow:hidden;transition:max-height 0.25s ease,opacity 0.25s ease;"></div>`;
  }

  const peekHtml = `<div style="display:flex;gap:6px;cursor:pointer;" onclick="${onPeekClick}">
    ${peekLabels.map(l => {
      const borderColor = l.dimBorder || T.bg3;
      return `<div style="flex:1;text-align:center;font-family:${T.fb};font-size:12px;letter-spacing:1.5px;color:${l.color};border:1px solid ${borderColor};background:${T.bg};padding:4px 8px;clip-path:${chamfer('sm')};">${l.label}</div>`;
    }).join('')}
  </div>`;

  if (state === 'peek') {
    return `<div style="max-height:36px;opacity:1;overflow:hidden;transition:max-height 0.25s ease,opacity 0.25s ease;margin-top:6px;">${peekHtml}</div>`;
  }

  // expanded
  const buttonsHtml = expandedButtons.map(b => {
    const inner = `<div style="height:48px;display:flex;align-items:center;justify-content:center;background:${T.bg2};color:${b.color};border:${T.borderW} solid ${b.color};font-family:${T.fb};font-size:16px;font-weight:900;letter-spacing:2px;clip-path:${chamfer('md')};cursor:pointer;" onclick="${b.onClick || ''}">${b.label}</div>`;
    return `<div style="flex:1;">${btnWrap(inner)}</div>`;
  }).join('');

  return `<div style="max-height:120px;opacity:1;overflow:hidden;transition:max-height 0.25s ease,opacity 0.25s ease;margin-top:6px;display:flex;flex-direction:column;gap:6px;">
    ${peekHtml}
    <div style="display:flex;gap:6px;">${buttonsHtml}</div>
  </div>`;
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

// ── Tab Bar (horizontal tabbed navigation) ──

export function tabBar(tabs, activeIndex, onTabClick) {
  const items = tabs.map((tab, i) => {
    const isActive = i === activeIndex;
    const otherTab = tabs[1 - i]; // assumes 2 tabs
    if (isActive) {
      return `<div style="flex:1;background:${tab.color};color:${T.bg};font-family:${T.fb};font-size:36px;height:50px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('lg')};" onclick="${onTabClick}(${i})">${tab.label}</div>`;
    } else {
      return `<div style="flex:1;padding:3px;background:${tab.color};clip-path:${chamfer('lg')};" onclick="${onTabClick}(${i})"><div style="background:${T.bg};color:${tab.color};font-family:${T.fb};font-size:36px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('lg')};">${tab.label}</div></div>`;
    }
  }).join('');
  return `<div style="display:flex;gap:8px;">${items}</div>`;
}

// ── Big Card (large touchable card for grids) ──

export function bigCard(label, opts = {}) {
  const color = opts.color || T.mint;
  const id = opts.id ? ` id="${opts.id}"` : '';
  const handler = opts.onClick ? ` onclick="${opts.onClick}"` : '';
  const width = opts.width || '100%';
  const height = opts.height || '220px';
  const inner = `<div${id} style="background:${T.bg};border:${T.borderW} solid ${color};color:${color};font-family:${T.fb};font-size:40px;width:${width};height:${height};display:flex;align-items:center;justify-content:center;cursor:pointer;clip-path:${chamfer('lg')};"${handler}>${label}</div>`;
  return `<div class="btn-wrap">${inner}</div>`;
}

// ── Full-Screen Overlay (fills scene area) ──

export function fullScreenOverlay(inner, opts = {}) {
  const id = opts.id ? ` id="${opts.id}"` : '';
  const borderColor = opts.borderColor || T.mint;
  const closeBtn = opts.onClose ? overlayCloseBtn(opts.onClose) : '';
  return `<div${id} style="position:absolute;inset:0;background:${T.bg};border:${T.borderW} solid ${borderColor};z-index:100;display:flex;flex-direction:column;padding:16px 20px;gap:12px;filter:drop-shadow(4px 6px 0px #1a1a1a);clip-path:${chamfer('12px')};">
    <div style="display:flex;justify-content:flex-end;">${closeBtn}</div>
    ${inner}
  </div>`;
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

// ═══════════════════════════════════════════════════
//  Hex Navigation Components (CHOO)
// ═══════════════════════════════════════════════════

export function hexClip() {
  return 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';
}

export function hexBtn(label, opts = {}) {
  const color = opts.color || T.mint;
  const selected = opts.selected || false;
  const disabled = opts.disabled || false;
  const w = opts.width || '60px';
  const h = opts.height || '68px';
  const id = opts.id ? `id="${opts.id}"` : '';

  const autoSize = label.length <= 5 && !label.includes(' ') ? '28px' : '22px';
  const fs = opts.fontSize || autoSize;

  const bg = disabled ? T.bg3 : (selected ? color : T.bg);
  const textColor = selected ? T.bg : (disabled ? 'rgba(198,255,187,0.3)' : T.mint);
  const opacity = disabled ? '0.4' : '1';
  const pointer = disabled ? 'none' : 'auto';

  return `<div ${id} style="
    width:${w};
    height:${h};
    background:${bg};
    color:${textColor};
    clip-path:${hexClip()};
    display:flex;
    align-items:center;
    justify-content:center;
    text-align:center;
    font-family:${T.fb};
    font-size:${fs};
    line-height:1.1;
    user-select:none;
    cursor:pointer;
    opacity:${opacity};
    pointer-events:${pointer};
    padding:4px;
    word-break:break-word;
    transition:background 0.1s ease;
  ">${label}</div>`;
}

export function hexBtnOuter(color, innerHtml, opts = {}) {
  const w = opts.width || '66px';
  const h = opts.height || '74px';

  return `<div style="
    width:${w};
    height:${h};
    background:${color};
    clip-path:${hexClip()};
    display:flex;
    align-items:center;
    justify-content:center;
  ">${innerHtml}</div>`;
}

export function buildHexButton(label, opts = {}) {
  const color = opts.color || T.mint;
  const bw = parseInt(opts.borderWidth || '3');
  const innerW = opts.width || '60px';
  const innerH = opts.height || '68px';
  const outerW = (parseInt(innerW) + bw * 2) + 'px';
  const outerH = (parseInt(innerH) + bw * 2) + 'px';

  const inner = hexBtn(label, {
    color,
    selected: opts.selected,
    disabled: opts.disabled,
    fontSize: opts.fontSize,
    width: innerW,
    height: innerH,
  });

  const outer = hexBtnOuter(color, inner, {
    width: outerW,
    height: outerH,
  });

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    filter: drop-shadow(2px 3px 0px #1a1a1a);
    transition: filter 0.05s ease, transform 0.05s ease;
    cursor: pointer;
    position: absolute;
  `;
  wrapper.innerHTML = outer;

  wrapper.addEventListener('pointerdown', () => {
    wrapper.style.filter = 'drop-shadow(0 0 0 #1a1a1a)';
    wrapper.style.transform = 'translate(2px, 3px)';
  });
  wrapper.addEventListener('pointerup', () => {
    wrapper.style.filter = 'drop-shadow(2px 3px 0px #1a1a1a)';
    wrapper.style.transform = '';
  });
  wrapper.addEventListener('pointerleave', () => {
    wrapper.style.filter = 'drop-shadow(2px 3px 0px #1a1a1a)';
    wrapper.style.transform = '';
  });

  if (opts.onClick && !opts.disabled) {
    wrapper.addEventListener('click', () => opts.onClick(wrapper));
  }

  if (opts.data !== undefined) {
    wrapper._hexData = opts.data;
  }

  wrapper._hexLabel = label;
  wrapper._hexColor = color;

  return wrapper;
}

export function hexLabel(text, opts = {}) {
  const color = opts.color || T.mint;
  const autoSize = text.length <= 5 && !text.includes(' ') ? '28px' : '22px';
  const fs = opts.fontSize || autoSize;

  return `<span style="
    font-family:${T.fb};
    font-size:${fs};
    color:${color};
    user-select:none;
    line-height:1.1;
  ">${text}</span>`;
}

export function hexContextHeader(text, opts = {}) {
  const color = opts.color || T.mint;
  return `<div style="
    font-family:${T.fb};
    font-size:36px;
    color:${color};
    user-select:none;
    text-align:center;
    padding:4px 0;
  ">${text}</div>`;
}

// ═══════════════════════════════════════════════════
//  Snapshot Components
// ═══════════════════════════════════════════════════

// ── Status Card (big tap-target for side columns) ──

export function statusCard(title, contentHtml, opts = {}) {
  const borderColor = opts.warning ? T.yellow : T.mint;
  const titleColor = opts.warning ? T.yellow : T.mint;
  const handler = opts.onClick ? ` onclick="${opts.onClick}"` : '';
  const id = opts.id ? ` id="${opts.id}"` : '';
  return `<div class="btn-wrap"><div${id} style="
    width:100%;
    background:${T.bg2};
    border:3px solid ${borderColor};
    clip-path:${chamfer('lg')};
    padding:16px 18px;
    cursor:pointer;
    position:relative;
    transition:background 0.1s ease;
  "${handler}>
    <div style="font-family:${T.fb};font-size:15px;color:${titleColor};font-weight:bold;text-transform:uppercase;letter-spacing:2px;margin-bottom:8px;">${title}</div>
    ${contentHtml}
  </div></div>`;
}

// ── Check Overview Panel (center workspace) ──

export function checkOverviewPanel(headerHtml, bodyHtml, footerHtml, opts = {}) {
  const id = opts.id ? ` id="${opts.id}"` : '';
  return `<div${id} style="
    flex:1;
    background:${T.bg2};
    border:${T.borderW} solid ${T.mint};
    clip-path:${chamfer('xl')};
    display:flex;
    flex-direction:column;
    position:relative;
    overflow:hidden;
  ">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:2px solid rgba(198,255,187,0.15);flex-shrink:0;">
      ${headerHtml}
    </div>
    <div style="flex:1;overflow-y:auto;padding:10px 14px;">
      ${bodyHtml}
    </div>
    ${footerHtml ? `<div style="padding:6px 14px;border-top:2px solid rgba(198,255,187,0.15);flex-shrink:0;">${footerHtml}</div>` : ''}
  </div>`;
}

// ── Snapshot Overlay (full-screen drill-down) ──

export function snapshotOverlay(title, contentHtml, onCloseAttr) {
  return `<div style="
    position:absolute;inset:0;
    background:${T.bg};
    border:${T.borderW} solid ${T.mint};
    clip-path:${chamfer('xl')};
    filter:drop-shadow(4px 6px 0px #1a1a1a);
    z-index:100;
    display:flex;
    flex-direction:column;
  ">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:2px solid rgba(198,255,187,0.15);flex-shrink:0;">
      <span style="font-family:${T.fb};font-size:18px;color:${T.mint};font-weight:bold;letter-spacing:2px;text-transform:uppercase;">${title}</span>
      ${overlayCloseBtn(onCloseAttr)}
    </div>
    <div style="flex:1;overflow-y:auto;padding:16px 20px;">
      ${contentHtml}
    </div>
  </div>`;
}

// ── Message Button (header notification) ──

export function msgButton(count, onClickAttr) {
  const handler = onClickAttr ? ` onclick="${onClickAttr}"` : '';
  return `<div style="
    background:${T.bg2};
    border:2px solid ${T.mint};
    clip-path:${chamfer('sm')};
    padding:2px 10px;
    cursor:pointer;
    font-family:${T.fb};
    font-size:14px;
    color:${T.mint};
    display:flex;
    align-items:center;
    justify-content:center;
  "${handler}>msg(${count})</div>`;
}
