# Audit: Zero-Data Boot Viability

**Date:** 2026-03-30
**Scope:** Can KINDpos start and operate with a completely empty database?
**Verdict:** **YES — with caveats** (0 BLOCKERs, 8 HIGH, 17 LOW)

---

## Category 1: Hardcoded Dummy Data

### Finding 1.1 — Frontend Fallback Roster with Bypass PINs
- **File:** `frontend/js/config.js:16-19`
- **What:** Hardcoded fallback employees with PINs `0000` (manager) and `9999` (server) used when API returns empty roster
- **Severity:** `HIGH`
- **Evidence:**
  ```js
  export const FALLBACK_ROSTER = [
    { id: "mgr-fallback",  name: "Manager",  pin: "0000", role: "manager" },
    { id: "svr-fallback",  name: "Server",   pin: "9999", role: "server"  },
  ];
  ```

### Finding 1.2 — Frontend Fallback Menu (38+ items, hardcoded prices)
- **File:** `frontend/js/config.js:24-36`
- **What:** Full menu with prices hardcoded as offline fallback. Used when API is empty/unreachable.
- **Severity:** `LOW` — labeled as fallback, isolated to offline mode
- **Evidence:**
  ```js
  export const FALLBACK_MENU = {
    "Food": { "Mains": [{ name: "Smash Burger", price: 12 }, ...], ... },
    "Drinks": { ... }, "Desserts": [...]
  };
  ```

### Finding 1.3 — Hardcoded Modifiers with Prices
- **File:** `frontend/js/config.js:38-51`
- **What:** 12 modifiers with fixed prices (e.g., Bacon $2.00, Cheese $1.00). Used as the only modifier source — no API fetch for modifiers found.
- **Severity:** `HIGH` — production order entry depends on these; not fetched from backend
- **Evidence:**
  ```js
  export const MODIFIERS = [
    { name: "Onions", price: 0 }, { name: "Bacon", price: 2.0 }, ...
  ];
  ```

### Finding 1.4 — Mock Payment Device in Production Route
- **File:** `backend/app/api/routes/payment_routes.py:38-52`
- **What:** Every payment sale call auto-registers a `MockPaymentDevice` with hardcoded `device_id="mock_001"`. Hardcoded terminal mapping `T-01 → mock_001`.
- **Severity:** `HIGH` — all payments go through mock device; no real device discovery
- **Evidence:**
  ```python
  mock = MockPaymentDevice()
  config = PaymentDeviceConfig(device_id="mock_001", ip_address="127.0.0.1", ...)
  manager.map_terminal_to_device("T-01", "mock_001")
  ```

### Finding 1.5 — Snapshot Scene Hardcoded Mock Data
- **File:** `frontend/js/scenes/snapshot.js:15-51`
- **What:** ~40 lines of hardcoded mock sales figures, labor stats, server transactions, discounts, voids, and batch totals. Used directly in rendering (not just test fixtures).
- **Severity:** `HIGH` — manager snapshot shows fabricated financial data, not live data
- **Evidence:**
  ```js
  const MOCK_SERVERS=[{name:'Alex M.',openChecks:2,gross:467.50,...}];
  const MOCK_BATCH={cardTotal:2847,cashTotal:412.50,...};
  ```

### Finding 1.6 — Bombard Simulation Mock Menu
- **File:** `backend/bombard/mock_menu.py:12-142`
- **What:** 33 menu items, 6 servers, 25 tables, tax rate. Used only by simulation engine.
- **Severity:** `LOW` — isolated to simulation/testing tool, not imported by main app

### Finding 1.7 — Cash Discount Rate Hardcoded
- **File:** `frontend/js/config.js:10`
- **What:** `CASH_DISC: 0.035` (3.5%) hardcoded with no backend fetch
- **Severity:** `LOW` — cosmetic for display; actual payment logic is backend-side

### Finding 1.8 — Payment Credentials in Script
- **File:** `scripts/dejavoo_test.py:39-43`
- **What:** Real Dejavoo TPN, RegisterID, AuthKey, MAC address hardcoded in test script
- **Severity:** `LOW` for boot audit (not in production path), but **security concern**

---

## Category 2: Seed Data Dependencies

### Finding 2.1 — Login Screen: Empty Roster Falls Back to Hardcoded Users
- **File:** `frontend/js/scenes/login.js:22-37`
- **What:** If `/api/v1/servers` returns empty `servers` array, login falls back to `FALLBACK_ROSTER`. System is "usable" but with fake identities (`mgr-fallback`, `svr-fallback`).
- **Severity:** `HIGH` — orders created with fallback user IDs would have no corresponding employee events in the ledger
- **Evidence:**
  ```js
  if (data && data.servers && data.servers.length > 0) {
    roster = data.servers;
  } else {
    APP.offline = true; // keeps FALLBACK_ROSTER
  }
  ```

### Finding 2.2 — Tax Rate Defaults to 0% Without Config Events
- **File:** `frontend/js/config.js:9` + `frontend/js/scenes/login.js:40-52`
- **What:** `CFG.TAX` starts at `0.0`. Login fetches `/api/v1/config/terminal-bundle` to get tax rules. On empty DB, no `STORE_TAX_RULE_CREATED` events exist → `tax_rules` is empty → `CFG.TAX` stays `0.0`. All orders computed with 0% tax on frontend.
- **Severity:** `HIGH` — tax silently zero; no warning to user
- **Evidence:**
  ```js
  TAX: 0.0,  // Fetched from backend at login; 0 until configured
  ```

### Finding 2.3 — Menu API Returns Empty on Clean DB (No Crash)
- **File:** `backend/app/api/routes/menu.py:16-23`
- **What:** `GET /api/v1/menu` projects all events → returns empty `MenuState`. No crash.
- **Severity:** `LOW` — API works; frontend hex-nav handles empty

### Finding 2.4 — Orders Endpoint Returns Empty Array (No Crash)
- **File:** `backend/app/api/routes/orders.py:45-48`
- **What:** `get_last_day_close_sequence()` returns `0` on empty DB → `get_events_since(0)` returns `[]`. Clean.
- **Severity:** `LOW` — works correctly

### Finding 2.5 — Seed Script is Manual, Not Auto-Run
- **File:** `backend/seed_employees.py`
- **What:** Employee seeding is a standalone script, not called during `main.py` startup.
- **Severity:** `LOW` (by design — event-sourced systems shouldn't auto-seed)

---

## Category 3: Empty State Handling

### Finding 3.1 — Snapshot Scene Uses Hardcoded Mock Data (Not Live)
- **File:** `frontend/js/scenes/snapshot.js:15-51`
- **What:** Manager dashboard renders `MOCK_SERVERS`, `MOCK_BATCH`, `MOCK_DISCOUNTS`, etc. directly. On a clean DB, the manager sees fake financial data ($2,847 card total, named servers, etc.).
- **Severity:** `HIGH` — misleading fabricated financial data

### Finding 3.2 — Server Snapshot: Unguarded Property Access
- **File:** `frontend/js/scenes/snapshot.js:140-154`
- **What:** `d.sales.net_sales.toFixed(2)` without null-checking intermediate properties.
- **Severity:** `LOW` — backend returns valid zero-value objects for empty state

### Finding 3.3 — calcOrder() NaN Risk on Missing Price
- **File:** `frontend/js/app.js:31-43`
- **What:** `i.price` accessed without null check. If undefined, NaN propagates through tax/total.
- **Severity:** `LOW` — items are created with price; would only occur from corrupt event data

### Finding 3.4 — Login Screen Handles Empty Gracefully
- **File:** `frontend/js/scenes/login.js:16-37`
- **Severity:** `LOW` — works via fallback roster

### Finding 3.5 — Check Editing Handles Empty Orders
- **File:** `frontend/js/scenes/check-editing.js:180`
- **What:** Shows "NO ITEMS YET" when empty.
- **Severity:** `LOW` — properly handled

### Finding 3.6 — Settings Screen: Safe Null Checks
- **File:** `frontend/js/scenes/settings.js:42-99`
- **Severity:** `LOW` — properly handled with guard clauses

### Finding 3.7 — Hex Engine: Empty Items Handled
- **File:** `frontend/js/hex-engine.js:259`
- **What:** Checks `!items || items.length === 0` before rendering.
- **Severity:** `LOW` — properly handled

---

## Category 4: Event Store Integrity From Zero

### Finding 4.1 — Hash Chain Initializes Correctly With Empty DB
- **File:** `backend/app/core/event_ledger.py:95-99`
- **What:** Empty string used as genesis checksum. First event computes hash with `previous_checksum=""`.
- **Severity:** None — **correctly handled**
- **Evidence:**
  ```python
  row = await cursor.fetchone()
  self._last_checksum = row[0] if row else ""
  ```

### Finding 4.2 — Diagnostic Collector Uses GENESIS_HASH
- **File:** `backend/app/services/diagnostic_collector.py:188-191`
- **What:** Uses `GENESIS_HASH = "KIND_DIAGNOSTIC_GENESIS"` when no prior diagnostic events exist.
- **Severity:** None — **correctly handled**
- **Evidence:**
  ```python
  prev_hash = row[0] if row else GENESIS_HASH
  ```

### Finding 4.3 — First ORDER_CREATED Event Works Without Prior Events
- **File:** `backend/app/core/event_ledger.py:126-131`
- **What:** `append()` uses cached `_last_checksum` (empty string on fresh DB). No assumption of prior events.
- **Severity:** None — **correctly handled**

### Finding 4.4 — Chain Verify Works on Empty Range
- **File:** `backend/app/core/event_ledger.py:427-473`
- **What:** Empty chain verification returns success.
- **Severity:** None — **correctly handled**

---

## Category 5: Configuration vs. Data

### Finding 5.1 — Tax Rate: Dual Source of Truth (Backend/Frontend Mismatch)
- **File:** `backend/app/config.py:31` + `frontend/js/config.js:9`
- **What:** Backend defaults to `0.07` (7%), frontend defaults to `0.0` (0%). On empty DB with no tax rule events, backend computes 7% tax, frontend computes 0%. **Totals will not match.**
- **Severity:** `HIGH`
- **Evidence:**
  ```python
  # backend/app/config.py
  tax_rate: float = 0.07
  ```
  ```js
  // frontend/js/config.js
  TAX: 0.0,  // Fetched from backend at login; 0 until configured
  ```

### Finding 5.2 — Payment Adapter: Mock is the Only Option
- **File:** `backend/app/api/routes/payment_routes.py:30-52`
- **What:** No real payment adapter registered at boot. MockPaymentDevice auto-registers on first sale.
- **Severity:** `LOW` — works for development; real payment is a deployment concern

### Finding 5.3 — Theme Manager: No Server Dependency
- **File:** `frontend/js/theme-manager.js`
- **What:** Pure CSS/HTML generation. No API calls needed.
- **Severity:** None — **no issue**

### Finding 5.4 — Terminal ID Mismatch
- **File:** `backend/app/config.py:21` + `frontend/js/config.js:7`
- **What:** Backend defaults to `"terminal_01"`, frontend hardcodes `"T-01"`. Events will have mismatched terminal IDs.
- **Severity:** `LOW` — both mapped to mock device; cosmetic

### Finding 5.5 — Hardcoded Timestamp in terminal-bundle
- **File:** `backend/app/api/routes/config.py:203`
- **What:** `"generated_at": "2026-03-24T14:30:00Z"` — hardcoded instead of dynamic
- **Severity:** `LOW` — cosmetic, no functional impact

---

## Summary Table

| Category                | BLOCKER | HIGH | LOW |
|-------------------------|---------|------|-----|
| Hardcoded Dummy Data    | 0       | 4    | 4   |
| Seed Data Dependencies  | 0       | 2    | 3   |
| Empty State Handling    | 0       | 1    | 6   |
| Event Store Integrity   | 0       | 0    | 0   |
| Configuration vs. Data  | 0       | 1    | 4   |
| **TOTAL**               | **0**   | **8**| **17** |

---

## Verdict

**YES — KINDpos can boot clean, but is not operationally viable without seed data.**

The server starts without errors. Tables auto-create. The hash chain initializes correctly. All API endpoints return valid (empty) responses. No crashes.

However, a restaurant operator on a clean database would face:
- Login with fake phantom employees (PINs 0000/9999)
- Tax calculated at 0% on the frontend (7% on backend) — totals won't match
- No real menu items in hex-nav (empty categories)
- Modifiers hardcoded in frontend, not configurable
- Manager snapshot showing fabricated financial data
- All payments processed through a mock device

**Recommendation:** A first-run setup wizard or mandatory seed step is needed before the system is operationally viable.
