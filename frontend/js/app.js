// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — App State
// ═══════════════════════════════════════════════════

import { CFG } from './config.js';

export const APP = {
  staff: null,
  screen: 'login',
  offline: false,
  orders: [],
  nextNum: 101,
  p: {},  // scene params
};

// ─── Helpers ────────────────────────────────────────
export const $ = (id) => document.getElementById(id);

export const fmtTime = () => {
  const n = new Date();
  return n.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
    + ' // '
    + n.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();
};

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
};

export const calcOrder = (o) => {
  const sub = o.items.reduce((s, i) => {
    let itemTotal = i.price;
    if (i.mods) {
      i.mods.forEach(mod => {
        if (mod.price) itemTotal += mod.price;
      });
    }
    return s + itemTotal * (i.qty || 1);
  }, 0);
  const tax = sub * CFG.TAX;
  return { sub, tax, card: sub + tax, cash: (sub + tax) * (1 - CFG.CASH_DISC) };
};

// ─── API Helper ─────────────────────────────────────
export async function apiFetch(path, options = {}) {
  const url = CFG.API_BASE + path;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CFG.API_TIMEOUT);

  try {
    const fetchOptions = { ...options, signal: controller.signal };
    
    // Auto-add Content-Type if we have a body and it's not already set
    if (fetchOptions.body && (!fetchOptions.headers || !fetchOptions.headers['Content-Type'])) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': 'application/json'
      };
    }

    const resp = await fetch(url, fetchOptions);
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    return await resp.json();
  } catch (err) {
    clearTimeout(timeout);
    APP.offline = true;
    throw err;
  }
}
