// ═══════════════════════════════════════════════════
//  KINDpos Terminal Vz1 — Settings / Hardware
//  Two-tab card/sub-card architecture
// ═══════════════════════════════════════════════════

import { APP, $, apiFetch } from '../app.js';
import { CFG } from '../config.js';
import { registerScene, go } from '../scene-manager.js';

registerScene('settings', {
  onEnter(el) {
    let activeTab = 'terminal'; // 'terminal' or 'hardware'
    let expandedCards = new Set(['venue-info', 'printers']); // Initially expanded cards
    let scanning = false;
    let scanError = null;
    let discoveredPrinters = [];
    let savedPrinters = [];
    let discoveredReaders = [];
    let savedReaders = [];
    let categories = [];
    let categoryRouting = {}; // { categoryId: [role] }
    const ROLES = ['kitchen', 'bar', 'receipt'];

    function showToast(msg, type='info') {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '100px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.background = type === 'error' ? 'var(--red)' : (type === 'success' ? 'var(--cyan)' : '#333');
        toast.style.color = '#fff';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '5px';
        toast.style.zIndex = '10000';
        toast.style.fontFamily = 'var(--fm)';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Load saved data
    async function loadData() {
      try {
        const bundle = await apiFetch('/api/v1/config/terminal-bundle');
        if (bundle && bundle.store && bundle.store.tax_rules) {
          const defaultRule = bundle.store.tax_rules.find(r => r.tax_rule_id === 'default');
          if (defaultRule) {
            settings.financial.taxRate = defaultRule.rate_percent.toFixed(2);
            CFG.TAX = defaultRule.rate_percent / 100;
          }
        }
        if (bundle && bundle.hardware) {
          if (bundle.hardware.printers) {
            savedPrinters = bundle.hardware.printers.map(p => ({
              id: p.printer_id,
              name: p.name,
              ip: p.ip_address,
              role: p.station,
              status: 'online', 
              mac: p.mac_address
            }));
          }
          if (bundle.hardware.readers) {
            savedReaders = bundle.hardware.readers.map(r => ({
              id: r.device_id,
              name: r.name,
              ip: r.ip_address,
              port: r.port || 8443,
              protocol: r.protocol || 'spin',
              status: 'online'
            }));
          }
          if (bundle.hardware.routing && bundle.hardware.routing.matrix) {
            categoryRouting = bundle.hardware.routing.matrix;
          }
        }
        
        const catData = await apiFetch('/api/v1/config/menu/categories');
        categories = catData || [];
        
        // Default routing for new categories
        categories.forEach(cat => {
            if (!categoryRouting[cat.category_id]) {
                const name = cat.name.toLowerCase();
                if (name.includes('drink') || name.includes('beer') || name.includes('wine') || name.includes('alc')) {
                    categoryRouting[cat.category_id] = ['bar'];
                } else {
                    categoryRouting[cat.category_id] = ['kitchen'];
                }
            }
        });

        // Check printer status
        checkPrinterStatus();
      } catch (e) {
        console.error("Failed to load settings data", e);
      }
      draw();
    }

    async function checkPrinterStatus() {
        for (let p of savedPrinters) {
            if (p.ip.startsWith('usb://')) {
                p.status = 'online'; // Assume USB is online if it was found
                continue;
            }
            try {
                const resp = await apiFetch('/api/v1/hardware/test-connection', {
                    method: 'POST',
                    body: JSON.stringify({ ip: p.ip, timeout: 1.0 })
                });
                p.status = resp.status === 'online' ? 'online' : 'offline';
            } catch (e) {
                p.status = 'offline';
            }
        }
        draw();
    }

    let settings = {
      venue: {
        name: CFG.TID || 'KINDpos Terminal',
        address: '123 Main St, Tech City',
        terminalName: 'Bar 1',
        timezone: 'UTC-5 (EST)'
      },
      financial: {
        taxRate: (CFG.TAX * 100).toFixed(2),
        dualPricingEnabled: true,
        dualPricingMode: 'cash-discount',
        dualPricingPercent: (CFG.CASH_DISC * 100).toFixed(1),
        tipPresets: [18, 20, 22],
        autoGratThreshold: 6,
        autoGratPercent: 20
      },
      staff: {
        pinLength: 4,
        autoLogout: 15,
        managerCode: '0000'
      },
      order: {
        defaultCoursing: 'fire-all',
        autoClose: 'immediate',
        modifierPrompt: 'required-only',
        item86Handling: 'show-unavailable'
      },
      display: {
        brightness: 80,
        screenTimeout: 10,
        hexDensity: 'normal'
      },
      system: {
        rebootTime: '04:00',
        version: CFG.VER || 'Vz1.0.0'
      }
    };

    loadData();

    function draw() {
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;background:var(--bg2);">
          <!-- Tabs -->
          <div style="display:flex;background:var(--bg);border-bottom:2px solid #555;">
            <div class="tab-btn ${activeTab === 'terminal' ? 'active' : ''}" data-tab="terminal">TERMINAL SETTINGS</div>
            <div class="tab-btn ${activeTab === 'hardware' ? 'active' : ''}" data-tab="hardware">HARDWARE</div>
          </div>
          
          <!-- Content Area -->
          <div style="flex:1;padding:20px;display:flex;flex-direction:column;gap:15px;min-height:0;overflow:hidden;" id="settings-content">
            ${activeTab === 'terminal' ? renderTerminalSettings() : renderHardwareSettings()}
          </div>

          <!-- Footer Actions -->
          <div style="height:60px;background:var(--bg);border-top:2px solid #555;display:flex;align-items:center;justify-content:flex-end;padding:0 20px;gap:10px;">
            <div class="btn-s" id="btn-back" style="width:120px;">BACK</div>
            <div class="btn-p" id="btn-save" style="width:120px;">SAVE</div>
          </div>
        </div>
        
        <style>
          .tab-btn {
            padding: 12px 30px;
            font-family: var(--fh);
            font-size: 18px;
            cursor: pointer;
            color: var(--mint-dim);
            border-right: 2px solid #444;
            user-select: none;
          }
          .tab-btn.active {
            color: var(--mint);
            background: var(--bg2);
            border-bottom: 2px solid var(--mint);
          }
          .card {
            border: 2px solid #555;
            background: #1a1a1a;
            display: flex;
            flex-direction: column;
            min-height: 0; /* Important for flex child to be able to shrink */
          }
          .card-header {
            padding: 10px 15px;
            background: var(--bg3);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            font-family: var(--fh);
            font-size: 18px;
            user-select: none;
            flex-shrink: 0; /* Keep header fixed size */
          }
          .card-body {
            padding: 15px;
            display: flex;
            flex-direction: column;
            gap: 15px;
            border-top: 1px solid #444;
            overflow-y: auto; /* Make card body scrollable */
          }
          .sub-card {
            background: var(--bg2);
            border: 1px solid #444;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .sub-card-title {
            font-size: 14px;
            color: var(--mint);
            opacity: 0.7;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .setting-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          input[type="text"], input[type="number"], select {
            background: #000;
            border: 1px solid #555;
            color: var(--mint);
            padding: 5px 10px;
            font-family: var(--fb);
            font-size: 16px;
          }
          .gold-text { color: var(--gold); }
          .cyan-text { color: var(--cyan); }
          .red-text { color: var(--red); }
          .yellow-text { color: var(--yellow); }
          
          .scanning-animation {
            width: 20px;
            height: 20px;
            border: 2px solid var(--cyan);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        </style>
      `;

      // Wire up events
      const backBtn = el.querySelector('#btn-back');
      if (backBtn) backBtn.onclick = () => go('snapshot');
      
      const saveBtn = el.querySelector('#btn-save');
      if (saveBtn) saveBtn.onclick = async () => {
          await saveAll();
          showToast('Settings Saved');
      };

      el.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
          activeTab = btn.dataset.tab;
          expandedCards.clear();
          if (activeTab === 'terminal') expandedCards.add('venue-info');
          else expandedCards.add('printers');
          draw();
        };
      });

      el.querySelectorAll('.card-header').forEach(hdr => {
        hdr.onclick = () => {
          const id = hdr.parentElement.dataset.id;
          if (expandedCards.has(id)) expandedCards.delete(id);
          else {
              expandedCards.clear();
              expandedCards.add(id);
          }
          draw();
        };
      });

      if (activeTab === 'hardware') {
          el.querySelectorAll('.btn-scan').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                runScan();
            };
          });
          
          el.querySelectorAll('.btn-test-print').forEach(btn => {
              btn.onclick = (e) => {
                  e.stopPropagation();
                  testPrint(btn.dataset.id);
              };
          });
          
          el.querySelectorAll('.btn-remove-printer').forEach(btn => {
              btn.onclick = (e) => {
                  e.stopPropagation();
                  savedPrinters = savedPrinters.filter(p => p.id !== btn.dataset.id);
                  draw();
              };
          });

          el.querySelectorAll('.btn-add-printer').forEach(btn => {
              btn.onclick = (e) => {
                  e.stopPropagation();
                  window.savePrinter(btn.dataset.ip);
              };
          });

          el.querySelectorAll('.btn-add-reader').forEach(btn => {
              btn.onclick = (e) => {
                  e.stopPropagation();
                  window.saveReader(btn.dataset.ip);
              };
          });

          el.querySelectorAll('.btn-test-connection').forEach(btn => {
              btn.onclick = (e) => {
                  e.stopPropagation();
                  const ip = btn.dataset.ip;
                  const port = parseInt(btn.dataset.port);
                  testReaderConnection(ip, port);
              };
          });

          el.querySelectorAll('.btn-remove-reader').forEach(btn => {
              btn.onclick = (e) => {
                  e.stopPropagation();
                  savedReaders = savedReaders.filter(r => r.id !== btn.dataset.id);
                  draw();
              };
          });

          el.querySelectorAll('.printer-role-select').forEach(sel => {
              sel.onchange = () => {
                  const p = savedPrinters.find(x => x.id === sel.dataset.id);
                  if (p) p.role = sel.value;
              };
          });

          el.querySelectorAll('.cat-route-select').forEach(sel => {
              sel.onchange = () => {
                  categoryRouting[sel.dataset.cat] = sel.value;
              };
          });
      }
    }

    function renderTerminalSettings() {
      return `
        <!-- Venue Info -->
        <div class="card" data-id="venue-info">
          <div class="card-header">
            <span>VENUE INFO</span>
            <span>${expandedCards.has('venue-info') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('venue-info') ? `
          <div class="card-body">
            <div class="sub-card">
              <div class="sub-card-title">Venue Details</div>
              <div class="setting-row">
                <span>Venue Name</span>
                <input type="text" value="${settings.venue.name}" oninput="settings.venue.name=this.value">
              </div>
              <div class="setting-row">
                <span>Address</span>
                <input type="text" value="${settings.venue.address}" oninput="settings.venue.address=this.value">
              </div>
            </div>
            <div class="sub-card">
              <div class="sub-card-title">Terminal Identification</div>
              <div class="setting-row">
                <span>Terminal Name</span>
                <input type="text" value="${settings.venue.terminalName}" oninput="settings.venue.terminalName=this.value">
              </div>
              <div class="setting-row">
                <span>Timezone</span>
                <input type="text" value="${settings.venue.timezone}" oninput="settings.venue.timezone=this.value">
              </div>
            </div>
          </div>` : ''}
        </div>

        <!-- Financial -->
        <div class="card" data-id="financial">
          <div class="card-header">
            <span>FINANCIAL</span>
            <span>${expandedCards.has('financial') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('financial') ? `
          <div class="card-body">
            <div class="sub-card">
              <div class="sub-card-title">Taxation</div>
              <div class="setting-row">
                <span>Tax Rate (%)</span>
                <input type="number" step="0.01" value="${settings.financial.taxRate}" oninput="settings.financial.taxRate=this.value">
              </div>
            </div>
            <div class="sub-card">
              <div class="sub-card-title gold-text">Dual Pricing</div>
              <div class="setting-row">
                <span>Enabled</span>
                <input type="checkbox" ${settings.financial.dualPricingEnabled ? 'checked' : ''} onchange="settings.financial.dualPricingEnabled=this.checked">
              </div>
              <div class="setting-row">
                <span>Mode</span>
                <select onchange="settings.financial.dualPricingMode=this.value">
                  <option value="cash-discount" ${settings.financial.dualPricingMode === 'cash-discount' ? 'selected' : ''}>Cash Discount</option>
                  <option value="card-surcharge" ${settings.financial.dualPricingMode === 'card-surcharge' ? 'selected' : ''}>Card Surcharge</option>
                </select>
              </div>
              <div class="setting-row">
                <span>Percentage</span>
                <input type="number" step="0.1" value="${settings.financial.dualPricingPercent}" class="gold-text" oninput="settings.financial.dualPricingPercent=this.value">
              </div>
            </div>
            <div class="sub-card">
              <div class="sub-card-title">Tips & Gratuity</div>
              <div class="setting-row">
                <span>Tip Presets</span>
                <input type="text" value="${settings.financial.tipPresets.join(', ')}" oninput="settings.financial.tipPresets=this.value.split(',').map(x=>parseInt(x.trim()))">
              </div>
              <div class="setting-row">
                <span>Auto-Grat Threshold</span>
                <input type="number" value="${settings.financial.autoGratThreshold}" oninput="settings.financial.autoGratThreshold=this.value">
              </div>
              <div class="setting-row">
                <span>Auto-Grat Percentage</span>
                <input type="number" value="${settings.financial.autoGratPercent}" oninput="settings.financial.autoGratPercent=this.value">
              </div>
            </div>
            <div class="sub-card">
              <div class="sub-card-title">Precision</div>
              <div class="setting-row">
                <span style="opacity:0.5;">Rounding Rules</span>
                <span style="opacity:0.5;">2dp Precision Gate Active</span>
              </div>
            </div>
          </div>` : ''}
        </div>

        <!-- Staff & Security -->
        <div class="card" data-id="staff-security">
          <div class="card-header">
            <span>STAFF & SECURITY</span>
            <span>${expandedCards.has('staff-security') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('staff-security') ? `
          <div class="card-body">
            <div class="sub-card">
              <div class="sub-card-title">Access Control</div>
              <div class="setting-row">
                <span>Server PIN Length</span>
                <input type="number" value="${settings.staff.pinLength}" oninput="settings.staff.pinLength=this.value">
              </div>
              <div class="setting-row">
                <span>Manager Code</span>
                <input type="text" value="${settings.staff.managerCode}" oninput="settings.staff.managerCode=this.value">
              </div>
              <div class="setting-row">
                <span>Auto-Logout (min)</span>
                <input type="number" value="${settings.staff.autoLogout}" oninput="settings.staff.autoLogout=this.value">
              </div>
            </div>
            <div class="sub-card">
              <div class="sub-card-title">Peripherals</div>
              <div class="setting-row" style="opacity:0.5;">
                <span>RFID Credential Support</span>
                <span>Not Installed</span>
              </div>
            </div>
          </div>` : ''}
        </div>

        <!-- Order Behavior -->
        <div class="card" data-id="order-behavior">
          <div class="card-header">
            <span>ORDER BEHAVIOR</span>
            <span>${expandedCards.has('order-behavior') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('order-behavior') ? `
          <div class="card-body">
            <div class="sub-card">
              <div class="sub-card-title">Workflow</div>
              <div class="setting-row">
                <span>Default Coursing</span>
                <select onchange="settings.order.defaultCoursing=this.value">
                  <option value="fire-all">Fire All at Once</option>
                  <option value="hold">Hold Courses</option>
                </select>
              </div>
              <div class="setting-row">
                <span>Auto-Close Check</span>
                <select onchange="settings.order.autoClose=this.value">
                  <option value="immediate">Immediately after Pay</option>
                  <option value="manual">Manual Close Only</option>
                </select>
              </div>
            </div>
            <div class="sub-card">
              <div class="sub-card-title">Menu Handling</div>
              <div class="setting-row">
                <span>Modifier Prompt</span>
                <select onchange="settings.order.modifierPrompt=this.value">
                  <option value="always">Always Show Overlay</option>
                  <option value="required-only">Required Only</option>
                </select>
              </div>
              <div class="setting-row">
                <span>86'd Items</span>
                <select onchange="settings.order.item86Handling=this.value">
                  <option value="hide">Hide from Menu</option>
                  <option value="show-unavailable">Show as Unavailable</option>
                </select>
              </div>
            </div>
          </div>` : ''}
        </div>

        <!-- System -->
        <div class="card" data-id="system">
          <div class="card-header">
            <span>SYSTEM</span>
            <span>${expandedCards.has('system') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('system') ? `
          <div class="card-body">
            <div class="sub-card">
              <div class="sub-card-title">Maintenance</div>
              <div class="setting-row">
                <span>Scheduled Reboot</span>
                <input type="text" value="${settings.system.rebootTime}" oninput="settings.system.rebootTime=this.value">
              </div>
            </div>
            <div class="sub-card">
              <div class="sub-card-title">Stats (Read-only)</div>
              <div class="setting-row">
                <span>Software Version</span>
                <span>${settings.system.version}</span>
              </div>
              <div class="setting-row">
                <span>Event Ledger Stats</span>
                <span>842 events | 1.2MB</span>
              </div>
            </div>
            <div style="display:flex;gap:10px;">
              <div class="btn-s" style="flex:1;">EXPORT CONFIG</div>
              <div class="btn-s" style="flex:1;">IMPORT CONFIG</div>
            </div>
          </div>` : ''}
        </div>
      `;
    }

    function renderHardwareSettings() {
      const routingData = JSON.parse(localStorage.getItem('kind_hardware_routing') || '{"savedPrinters":[],"categoryRouting":{}}');
      const hasPrinters = savedPrinters.length > 0;
      
      return `
        <!-- Printers -->
        <div class="card" data-id="printers">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:10px;">
                <span>PRINTERS</span>
                ${!hasPrinters ? '<div style="background:var(--red);color:#fff;font-size:10px;padding:2px 6px;border-radius:10px;font-family:var(--fb);">NO PRINTERS CONFIGURED</div>' : ''}
            </div>
            <span>${expandedCards.has('printers') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('printers') ? `
          <div class="card-body">
            <div class="sub-card">
              <div class="sub-card-title">Network Scan</div>
              <div style="display:flex;gap:10px;align-items:center;">
                <div class="btn-p btn-scan" data-type="printers" style="padding:10px 20px;">
                    ${scanning ? 'SCANNING\u2026' : 'SCAN NETWORK'}
                </div>
                ${scanning ? '<div class="scanning-animation"></div>' : ''}
              </div>
              <div id="discovered-list" style="margin-top:10px;display:flex;flex-direction:column;gap:5px;max-height:200px;overflow-y:auto;padding-right:5px;">
                ${scanError ? `<div style="color:var(--yellow);font-size:13px;padding:8px;border:1px dashed #555;">${scanError}</div>` : ''}
                ${discoveredPrinters.map(p => `
                  <div style="display:flex;justify-content:space-between;padding:8px;background:#000;border:1px solid var(--cyan);">
                    <div style="display:flex;flex-direction:column;">
                        <span style="font-weight:bold;">${p.name}</span>
                        <span style="font-size:11px;opacity:0.6;">${p.ip} | ${p.discovery_method.toUpperCase()}</span>
                    </div>
                    <div class="btn-s btn-add-printer" data-ip="${p.ip}" style="padding:2px 8px;font-size:14px;align-self:center;">ADD</div>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="sub-card">
              <div class="sub-card-title">Saved Printers</div>
              <div id="saved-list" style="display:flex;flex-direction:column;gap:10px;">
                ${savedPrinters.length === 0 ? '<div style="opacity:0.4;">No printers saved</div>' : ''}
                ${savedPrinters.map(p => `
                  <div style="border:1px solid #444;padding:10px;background:#111;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                      <span style="font-weight:bold;color:${p.status === 'online' ? '#33ffff' : '#ff3355'};">
                        \u25CF ${p.name}
                      </span>
                      <div style="display:flex;gap:5px;">
                        <div class="btn-s btn-test-print" data-id="${p.id}" style="padding:4px 8px;font-size:12px;">TEST PRINT</div>
                        <div class="btn-s btn-remove-printer" data-id="${p.id}" style="padding:4px 8px;font-size:12px;color:var(--red);">DEL</div>
                      </div>
                    </div>
                    <div class="setting-row" style="font-size:13px;margin-bottom:5px;">
                      <span>${p.ip}</span>
                      <select class="printer-role-select" data-id="${p.id}" style="font-size:12px;padding:2px;">
                        ${ROLES.map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${r.toUpperCase()}</option>`).join('')}
                      </select>
                    </div>
                    ${p.error ? `<div style="color:var(--red);font-size:11px;margin-top:4px;">Error: ${p.error}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="sub-card">
              <div class="sub-card-title">Category Routing</div>
              <div style="display:flex;flex-direction:column;gap:5px;">
                ${categories.map(cat => `
                   <div class="setting-row">
                     <span>${cat.name}</span>
                     <select class="cat-route-select" data-cat="${cat.category_id}">
                       ${ROLES.map(r => `<option value="${r}" ${categoryRouting[cat.category_id]?.includes(r) ? 'selected' : ''}>${r.toUpperCase()}</option>`).join('')}
                     </select>
                   </div>
                `).join('')}
              </div>
            </div>
          </div>` : ''}
        </div>

        <!-- Payment Devices -->
        <div class="card" data-id="payment-devices">
          <div class="card-header">
            <span>PAYMENT DEVICES</span>
            <span>${expandedCards.has('payment-devices') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('payment-devices') ? `
          <div class="card-body">
            <div class="sub-card">
                <div class="sub-card-title">Network Scan</div>
                <div style="display:flex;gap:10px;align-items:center;">
                  <div class="btn-p btn-scan" data-type="readers" style="padding:10px 20px;">
                      ${scanning ? 'SCANNING\u2026' : 'SCAN READERS'}
                  </div>
                  ${scanning ? '<div class="scanning-animation"></div>' : ''}
                </div>
                <div id="discovered-readers-list" style="margin-top:10px;display:flex;flex-direction:column;gap:5px;max-height:200px;overflow-y:auto;padding-right:5px;">
                  ${discoveredReaders.map(r => `
                    <div style="display:flex;justify-content:space-between;padding:8px;background:#000;border:1px solid var(--cyan);">
                      <div style="display:flex;flex-direction:column;">
                          <span style="font-weight:bold;">${r.name}</span>
                          <span style="font-size:11px;opacity:0.6;">${r.ip}:${r.port} | ${r.protocol.toUpperCase()}</span>
                      </div>
                      <div class="btn-s btn-add-reader" data-ip="${r.ip}" style="padding:2px 8px;font-size:14px;align-self:center;">ADD</div>
                    </div>
                  `).join('')}
                </div>
            </div>

            <div class="sub-card">
                <div class="sub-card-title">Saved Readers</div>
                <div id="saved-readers-list" style="display:flex;flex-direction:column;gap:10px;">
                  ${savedReaders.length === 0 ? '<div style="opacity:0.4;">No readers saved</div>' : ''}
                  ${savedReaders.map(r => `
                    <div style="border:1px solid #444;padding:10px;background:#111;">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:bold;color:${r.status === 'online' ? '#33ffff' : '#ff3355'};">
                          \u25CF ${r.name} (${r.ip})
                        </span>
                        <div style="display:flex;gap:5px;">
                          <div class="btn-s btn-test-connection" data-ip="${r.ip}" data-port="${r.port}" style="padding:4px 8px;font-size:12px;">TEST</div>
                          <div class="btn-s btn-remove-reader" data-id="${r.id}" style="padding:4px 8px;font-size:12px;color:var(--red);">DEL</div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
            </div>
            <div class="sub-card" style="opacity:0.4;">
                <div class="sub-card-title">Coming Soon</div>
                <div>Other payment types...</div>
            </div>
          </div>` : ''}
        </div>

        <!-- Displays -->
        <div class="card" data-id="displays">
            <div class="card-header" style="opacity:0.5;">
                <span>DISPLAYS (COMING SOON)</span>
                <span>\u25B6</span>
            </div>
        </div>

        <!-- Peripherals -->
        <div class="card" data-id="peripherals">
          <div class="card-header">
            <span>PERIPHERALS</span>
            <span>${expandedCards.has('peripherals') ? '\u25BC' : '\u25B6'}</span>
          </div>
          ${expandedCards.has('peripherals') ? `
          <div class="card-body">
            <div class="sub-card">
                <div class="sub-card-title">Cash Drawer</div>
                <div class="setting-row">
                    <span>Printer Port Trigger</span>
                    <select>
                        <option value="prn-1">Kitchen Printer (Port 1)</option>
                        <option value="prn-2">Bar Printer (Port 1)</option>
                    </select>
                </div>
            </div>
            <div class="sub-card" style="opacity:0.4;">
                <div class="sub-card-title">E-ink Pager</div>
                <div>COMING SOON</div>
            </div>
            <div class="sub-card" style="opacity:0.4;">
                <div class="sub-card-title">Expansion Cards</div>
                <div>COMING SOON</div>
            </div>
          </div>` : ''}
        </div>
      `;
    }

    async function runScan() {
      if (scanning) return;
      scanning = true;
      scanError = null;
      discoveredPrinters = [];
      discoveredReaders = [];
      draw();
      
      const scanBtns = el.querySelectorAll('.btn-scan');
      scanBtns.forEach(btn => {
          btn.disabled = true;
          btn.innerText = 'SCANNING...';
      });

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 65000); // 65s timeout for scan

        const resp = await fetch('/api/v1/hardware/discover-printers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ timeout: 60 }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
            throw new Error(`API ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const event = JSON.parse(line.substring(6));
                        if (event.type === 'printer_config') {
                            // Deduplicate by IP
                            if (!discoveredPrinters.find(p => p.ip === event.ip_address)) {
                                discoveredPrinters.push({
                                    name: event.name || (event.ip_address.startsWith('usb://') ? 'USB Printer' : 'Network Printer'),
                                    ip: event.ip_address,
                                    manufacturer: event.manufacturer || '',
                                    model: event.model || '',
                                    discovery_method: event.discovery_method || 'network',
                                    mac: event.mac_address || ''
                                });
                                draw();
                            }
                        } else if (event.type === 'reader_config') {
                            if (!discoveredReaders.find(r => r.ip === event.ip_address)) {
                                discoveredReaders.push({
                                    name: event.name || 'Payment Terminal',
                                    ip: event.ip_address,
                                    port: event.port || 8443,
                                    protocol: event.protocol || 'spin'
                                });
                                draw();
                            }
                        } else if (event.type === 'error') {
                            scanError = event.message;
                            draw();
                        }
                    } catch (e) {
                        console.error("Error parsing SSE data", e, line);
                    }
                }
            }
        }

        if (discoveredPrinters.length === 0 && discoveredReaders.length === 0 && !scanError) {
            scanError = "No devices found. Check network, USB connection, and power.";
        }
      } catch (e) {
        console.error("Scan failed", e);
        scanError = `Scan failed: ${e.message || 'Please try again.'}`;
      } finally {
        scanning = false;
        draw();
      }
    }

    window.savePrinter = (ip) => {
        const p = discoveredPrinters.find(x => x.ip === ip);
        if (p) {
            let name = prompt("Enter custom name for printer:", p.name);
            if (name === null) return; // Cancelled
            name = name || p.name;

            let roleInput = prompt("Enter role (kitchen, bar, receipt):", "kitchen");
            if (roleInput === null) return; // Cancelled
            const role = roleInput.toLowerCase().trim();
            
            savedPrinters.push({
                id: 'prn-' + Date.now(),
                name: name,
                ip: p.ip,
                role: ROLES.includes(role) ? role : 'kitchen',
                status: 'online',
                mac: p.mac || ''
            });
            discoveredPrinters = discoveredPrinters.filter(x => x.ip !== ip);
            draw();
        }
    };

    window.saveReader = (ip) => {
        const r = discoveredReaders.find(x => x.ip === ip);
        if (r) {
            let name = prompt("Enter custom name for reader:", r.name);
            if (name === null) return; // Cancelled
            name = name || r.name;
            
            savedReaders.push({
                id: 'reader-' + Date.now(),
                name: name,
                ip: r.ip,
                port: r.port,
                protocol: r.protocol,
                status: 'online'
            });
            discoveredReaders = discoveredReaders.filter(x => x.ip !== ip);
            draw();
        }
    };

    async function testReaderConnection(ip, port) {
        showToast(`Testing connection to ${ip}:${port}...`);
        try {
            const resp = await apiFetch('/api/v1/hardware/test-connection', {
                method: 'POST',
                body: JSON.stringify({ ip, port, timeout: 2.0 })
            });
            if (resp.status === 'online') {
                showToast('Connection OK', 'success');
                const reader = savedReaders.find(r => r.ip === ip);
                if (reader) {
                    reader.status = 'online';
                    draw();
                }
            } else {
                showToast('Unreachable', 'error');
                const reader = savedReaders.find(r => r.ip === ip);
                if (reader) {
                    reader.status = 'offline';
                    draw();
                }
            }
        } catch (e) {
            showToast('Test failed', 'error');
        }
    }

    async function testPrint(id) {
        const p = savedPrinters.find(x => x.id === id);
        if (!p) return;
        showToast('Printing test ticket...');
        p.error = null;
        try {
            const res = await apiFetch('/api/v1/hardware/test-print', {
                method: 'POST',
                body: JSON.stringify({ ip: p.ip, port: 9100 })
            });
            if (!res.success) {
                p.error = res.message;
                showToast('Print failed');
            }
        } catch (e) {
            p.error = e.message || 'Network error';
            showToast('Print failed');
        }
        draw();
    }

    async function saveAll() {
        // Persist settings and saved printers
        const events = [];
        
        // Printers
        savedPrinters.forEach(p => {
            events.push({
                event_type: 'printer.registered',
                payload: {
                    printer_id: p.id,
                    name: p.name,
                    station: p.role,
                    ip_address: p.ip,
                    mac_address: p.mac,
                    active: true
                }
            });
        });

        // Routing Matrix
        const matrix = {};
        for (let cid in categoryRouting) {
            matrix[cid] = Array.isArray(categoryRouting[cid]) ? categoryRouting[cid] : [categoryRouting[cid]];
        }
        events.push({
            event_type: 'routing.matrix_updated',
            payload: {
                matrix: matrix
            }
        });

        events.push({
            event_type: 'store.tax_rule_updated',
            payload: {
                tax_rule_id: 'default',
                name: 'Sales Tax',
                rate_percent: parseFloat(settings.financial.taxRate),
                applies_to: 'all'
            }
        });
        
        // Push events
        try {
            await apiFetch('/api/v1/config/push', {
                method: 'POST',
                body: JSON.stringify(events)
            });
            
            // Update CFG locally
            CFG.TAX = parseFloat(settings.financial.taxRate) / 100;
            CFG.CASH_DISC = parseFloat(settings.financial.dualPricingPercent) / 100;
            
            // Persist hardware routing to local storage as well for fast access
            localStorage.setItem('kind_hardware_routing', JSON.stringify({
                savedPrinters,
                categoryRouting
            }));

        } catch (e) {
            console.error("Save failed", e);
            showToast('Save partially failed');
        }
    }

    function showToast(t) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--mint);color:var(--bg);padding:14px 28px;font-size:16px;font-weight:bold;z-index:200;pointer-events:none;opacity:1;transition:opacity 0.5s;border:2px solid #555;';
      d.textContent = t;
      el.appendChild(d);
      setTimeout(() => { d.style.opacity = '0'; }, 1000);
      setTimeout(() => { d.remove(); }, 1500);
    }
    
    // Set settings object on el for oninput access
    el.settings = settings;
    
    draw();

    return () => { delete window.savePrinter; };
  }
});