# KINDpos v0.9.6 — Code Review Report

**Date:** 2026-03-28
**Scope:** Full codebase audit — frontend (8 JS, 2 CSS), backend (34 Python), tests (6 test files)
**Verdict:** 4 critical bugs, 5 high-severity issues, 12 warnings, 15 cleanup items

---

## 1. Code Quality

### 1.1 Dead Code & Unused Imports

| Severity | File | Line(s) | Description |
|----------|------|---------|-------------|
| **warning** | `backend/app/services/print_context_builder.py` | 17–53 | Entire class is stub — all 4 methods return hardcoded dicts with `# TODO: Implement` |
| **warning** | `backend/app/services/server_snapshot_service.py` | 4 | Unused import: `Event` imported but never referenced |
| **cleanup** | `backend/app/core/events.py` | 197 | Pydantic `class Config` deprecated — should use `model_config = ConfigDict(...)` |
| **cleanup** | `backend/app/config.py` | 12 | Same Pydantic `class Config` deprecation |
| **cleanup** | `backend/app/core/adapters/payment_manager.py` | 65, 124, 128 | `.dict()` deprecated — should be `.model_dump()` (3 call sites) |

### 1.2 Duplicated Logic

| Severity | Pattern | Locations | Description |
|----------|---------|-----------|-------------|
| **warning** | Toast notifications | `check-editing.js:653`, `settings.js:23`, `settings.js:990`, `snapshot.js:708` | 4 separate toast implementations with different styling/behavior. Should be a shared utility in `app.js` |
| **warning** | Overlay creation | `check-editing.js` (12×), `snapshot.js` (8×), `settings.js` (5×) | Repeated `createElement('div') → className='overlay' → innerHTML → appendChild` pattern with no shared factory |
| **cleanup** | ~~Hex clip-path~~ | ~~`login.js:38`, `check-editing.js:663`~~ | Removed — hex nav purged 2026-03-31 |
| **cleanup** | Date/time parsing | `server_snapshot_service.py:25–29`, `server_snapshot_service.py:140–144`, `server_snapshot_service.py:206–210` | Same `fromisoformat(…replace('Z', '+00:00'))` pattern repeated 3× within one file |

### 1.3 Hardcoded Values

| Severity | File | Line | Value | Should Be |
|----------|------|------|-------|-----------|
| **critical** | `backend/app/core/projections.py` | 98 | `return 0.08` (tax rate) | Should reference `settings.tax_rate` (which is 0.07) — **mismatch causes wrong totals** |
| **warning** | `frontend/js/config.js` | 9 | `TAX: 0.07` | Should be fetched from backend config at startup |
| **warning** | `backend/app/core/adapters/payment_validator.py` | 21–23 | Max tip 50%, max tip $100, max txn $10,000 | Should be in `Settings` or store config |
| **warning** | `backend/app/core/adapters/dejavoo_spin.py` | 34 | HTTP timeout 95s | Should be in `Settings` |
| **warning** | `frontend/js/scenes/check-editing.js` | 911 | Manager PIN hardcoded `'0000'` | Should validate against employee roster |
| **warning** | `backend/app/api/routes/menu.py` | 28 | `limit=10000` events | Should be configurable |
| **cleanup** | ~~`frontend/js/scenes/check-editing.js`~~ | ~~1059–1063~~ | ~~Hex radii~~ | Removed — hex nav purged 2026-03-31 |
| **cleanup** | `frontend/js/config.js` | 19–42 | Fallback roster and menu baked into JS | Acceptable as offline fallback but should be documented as such |
| **cleanup** | `backend/app/api/routes/system.py` | 66 | Hardcoded path `core/backend/tests` | Should use `Path(__file__).resolve()` relative navigation |
| **cleanup** | `backend/app/api/routes/printing.py` | 74 | Hardcoded fixture path `core/backend/app/printing/fixtures/` | Same issue |

### 1.4 Inline Styles in JavaScript

| Severity | File | Count | Worst Offenders |
|----------|------|-------|-----------------|
| **cleanup** | `frontend/js/bars.js` | 15+ inline style attrs | Lines 28–29, 37–38, 42–43, 47–49, 51–55, 78–87 — entire TBar and SBar rendered with inline styles |
| **cleanup** | `frontend/js/scenes/snapshot.js` | 10 `.style.` + extensive template literal styles | Lines 615, 624–634, 817, 991–996 — complex conditional styling in HTML templates |
| **cleanup** | `frontend/js/scenes/check-editing.js` | 13 `.style.` assignments | Lines 199, 655–658 — toast `cssText`, mixed CSS var and inline RGB |
| **cleanup** | `frontend/js/scenes/settings.js` | 12 `.style.` assignments | Lines 25–37 — toast positioning set property-by-property instead of class |

---

## 2. Bug Scan

### 2.1 Critical Bugs

| ID | Severity | File | Line(s) | Description |
|----|----------|------|---------|-------------|
| B-01 | **critical** | `backend/app/services/server_snapshot_service.py` | 37–40, 56–57, 77, 79, 83, 85, 90, 154 | **Attribute access errors — will crash at runtime.** Code calls `o.subtotal()`, `o.total()`, `o.discount_total()` as methods but they are `@property` (no parens). Code checks `o.voided` and `o.closed` as boolean attributes but `Order` uses `o.status` string (`"open"/"closed"/"voided"`). Code accesses `p.tip` (should be `p.tip_amount`) and `p.tip_adjusted` (does not exist). |
| B-02 | **critical** | `backend/app/api/routes/config.py` | 147 | **Nested `add_task` call.** `background_tasks.add_task(background_tasks.add_task, broadcast_config_update, ["menu"])` — passes `add_task` as the callable. Should be `background_tasks.add_task(broadcast_config_update, ["menu"])`. Will fail when restoring 86'd menu items. |
| B-03 | **critical** | `backend/app/core/projections.py` | 98 | **Tax rate mismatch.** `Order.tax_rate` returns `0.08` (8%) but `backend/app/config.py:31` defines `tax_rate = 0.07` (7%) and `frontend/js/config.js:9` uses `0.07`. Print fixtures also use `0.08`. Backend calculations disagree with frontend display — receipts will show wrong tax. |
| B-04 | **critical** | `backend/app/core/events.py` | 97–106, 117 | **EventType enum value format inconsistency.** Payment events use `"payment.initiated"`, `"payment.confirmed"`, `"payment.failed"` (dot.notation) while order/item events use `"ORDER_CREATED"`, `"PAYMENT_FAILED"` (SCREAMING_SNAKE). `PAYMENT_DECLINED = "payment.failed"` and `PAYMENT_FAILED = "PAYMENT_FAILED"` are two separate enum members with confusingly similar names but different string values. Code comparing `event_type.value` against one format will silently miss the other. |

### 2.2 High-Severity Issues

| ID | Severity | File | Line(s) | Description |
|----|----------|------|---------|-------------|
| B-05 | **high** | `backend/app/core/adapters/printer_manager.py` | 132 | **Missing `await` on async call.** `connected = printer.connect()` should be `connected = await printer.connect()`. Returns a coroutine object (truthy) instead of actual connection status, so printers appear connected when they are not. |
| B-06 | **high** | `frontend/js/bars.js` | 58–74, 91–93 | **Event listeners accumulate every 30 seconds.** `setInterval` calls `renderBars()` which re-creates innerHTML and adds new `addEventListener('click', ...)` on logout/back/settings buttons. Old listeners are GC'd only if old DOM nodes are fully dereferenced — but the `click` handler closures capture `window.go` which persists. Over a shift (8h = 960 re-adds), this accumulates handlers. |
| B-07 | **high** | `backend/app/api/routes/payment_routes.py` | 25–32 | **Race condition on mock initialization.** Global `_mock_initialized` flag checked/set without `asyncio.Lock`. Two concurrent requests could both pass the `if _mock_initialized: return` check before either sets `True`, initializing the mock device twice. |
| B-08 | **high** | `frontend/js/scenes/snapshot.js` | 867–873 | **Event listeners not removed on overlay dismiss.** Overlay `[data-cdedit]` click handlers added via `addEventListener` are not removed when `ov.remove()` is called. If overlay is opened/closed repeatedly, orphaned handlers accumulate. |
| B-09 | **high** | `frontend/js/scene-manager.js` | 56–57 | **`onExit` overwrites cleanup function.** If a scene returns a cleanup function from `onEnter` AND defines `onExit`, the `onExit` replaces the cleanup. Only one runs on scene transition — the other is silently discarded. Currently affects: none (no scene uses both), but is a latent trap. |

### 2.3 Warnings

| ID | Severity | File | Line(s) | Description |
|----|----------|------|---------|-------------|
| B-10 | **warning** | `frontend/js/scenes/check-editing.js` | 291, 399, 451+ | **Null reference risk on `.onclick` assignment.** `$('all-seats-btn').onclick = ...` — if `$()` returns null (element missing from DOM), assignment silently fails. Some call sites have guards (e.g., `settings.js:262`), most in check-editing.js do not. |
| B-11 | **warning** | `frontend/js/scenes/settings.js` | 1004 | **Incomplete global cleanup.** Scene cleanup deletes `window.savePrinter` but not `window.saveReader` (created at line 860). `saveReader` persists on `window` after leaving settings. |
| B-12 | **warning** | `frontend/js/scenes/check-editing.js` | 1364–1372 | **Menu close listener timing.** Document click listener for dropdown menu is added inside `setTimeout(…, 0)`. If menu is removed by other code before the timeout fires, the listener is never cleaned up. |
| B-13 | **warning** | `backend/app/api/routes/printing.py` | 20–26 | **Deprecated FastAPI lifecycle.** `@router.on_event("startup"/"shutdown")` is deprecated — should use the lifespan context manager pattern already in use in `main.py`. |
| B-14 | **warning** | `backend/app/core/adapters/payment_manager.py` | 70 | **Private attribute access.** `payment_routes.py` accesses `manager._terminal_device_map` directly — breaks encapsulation and will break if internal structure changes. |
| B-15 | **warning** | `backend/app/main.py` | 59 | **CORS allows all origins.** `allow_origins=["*"]` in production is a security concern. Should restrict to known terminal IPs or localhost. |

---

## 3. Test Coverage

### 3.1 Test Results (2026-03-28)

```
43 collected — 37 passed, 1 failed, 5 skipped
Duration: 54.86s
```

| Test File | Tests | Status | Notes |
|-----------|-------|--------|-------|
| `test_cash_and_tip_flows.py` | 7 | 7 passed | Cash payment, tips, 2dp precision |
| `test_daily_workflow.py` | 1 | 1 passed | Full day-of-service integration test |
| `test_event_ledger.py` | 1 | 1 passed | 9 sub-scenarios, hash chain verification |
| `test_payment_manager.py` | 18 | 13 passed, 5 skipped | Skipped: unregister, cash, failover (×2), tip entry — deferred features |
| `test_printer_system.py` | 16 | 15 passed, 1 **failed** | `test_health_check` fails — assertion message has typo (`AssertionError`) and status check fails after reboot |

### 3.2 Failed Test Detail

```
FAILED backend/tests/test_printer_system.py::test_health_check
  AssertionError: All printers should be online after reboot
  assert False
```
All printers show "online" in stdout but the assertion still fails — likely a status enum comparison issue (string vs enum) in the health check return value.

### 3.3 Deprecation Warnings

| Count | Warning | Location |
|-------|---------|----------|
| 2 | `class Config` deprecated, use `ConfigDict` | `events.py:197`, `config.py:12` |
| 26 | `.dict()` deprecated, use `.model_dump()` | `payment_manager.py:65,124,128` (×13 via test parameterization) |

### 3.4 Critical Paths with No Test Coverage

| Severity | Area | Description |
|----------|------|-------------|
| **critical** | API routes | **Zero tests** for any FastAPI route handler (orders, payments, config, menu, staff, system, hardware, printing). All business logic tested only at the service/adapter level. |
| **critical** | `server_snapshot_service.py` | No tests — and the code has attribute access bugs (B-01) that would be caught immediately by any test. |
| **critical** | `store_config_service.py` | No tests for config projection or push logic. |
| **critical** | `menu_projection.py` | No tests for menu state projection from events. |
| **warning** | `overseer_config_service.py` | No tests for employee/role/tipout/floorplan projection. |
| **warning** | Frontend | No automated tests for any frontend scene. Manual walkthrough only. |

### 3.5 Stale Test Interfaces

| Severity | Test | Issue |
|----------|------|-------|
| **warning** | `test_payment_manager.py` — 5 skipped tests | Tests reference removed features (device failover, cash flow, unregister). Skipped via `pytest.skip()` but should be either updated or deleted. |
| **warning** | `backend/app/core/adapters/test_payment_system.py` | Standalone integration test in source directory (not in `tests/`). References `MockPaymentDevice` from old adapter interface — may be stale. |

---

## 4. Architecture Consistency

### 4.1 Event Ledger Event Types

| Severity | Issue | Details |
|----------|-------|---------|
| **critical** | Enum value format split | 80+ event types defined. Order/item/print events use `"SCREAMING_SNAKE_CASE"` values. Payment/batch/config events use `"dot.notation"` values. This means `EventType.PAYMENT_INITIATED.value == "payment.initiated"` but `EventType.ITEM_ADDED.value == "ITEM_ADDED"`. Any code that pattern-matches on string format will be inconsistent. |
| **critical** | `PAYMENT_DECLINED` vs `PAYMENT_FAILED` | `PAYMENT_DECLINED = "payment.failed"` and `PAYMENT_FAILED = "PAYMENT_FAILED"` are two separate members. `projections.py:276` handles `EventType.PAYMENT_FAILED` (SCREAMING_SNAKE) but `payment_manager.py:116` maps declined results to `EventType.PAYMENT_DECLINED` (dot notation). A declined card payment may not be projected correctly into the order state. |
| **warning** | String comparisons instead of enum | `menu_projection.py:52,55,58,63` compares `event.event_type` against raw strings like `"restaurant.configured"` instead of `EventType` enum members. Fragile and bypasses type safety. |
| **warning** | Many event types defined but unused | Several event types (e.g., `REPORTING_*`, `FLOORPLAN_*`, `TERMINAL_TRAINING_MODE_CHANGED`) are defined in the enum but never emitted by any code path. Not harmful but adds maintenance surface. |

### 4.2 API Endpoints

| Severity | Issue | Details |
|----------|-------|---------|
| **warning** | `print_context_builder.py` not integrated | Print routes in `printing.py` exist but the `PrintContextBuilder` that should feed them is 100% stub. Printing currently only works via test fixtures, not live order data. |
| **warning** | Config push broadcast stub | `config.py:147` calls `broadcast_config_update` but with nested `add_task` bug (B-02). Even when fixed, `broadcast_config_update` is a stub — no WebSocket broadcast is implemented. |
| **cleanup** | `/system/run-tests` exposes pytest to HTTP | `system.py` has a POST endpoint that runs pytest via subprocess. Should be gated behind debug/dev mode flag, not exposed in production. |

### 4.3 Frontend Scene Lifecycle

| Severity | Issue | Details |
|----------|-------|---------|
| **warning** | `onExit` / cleanup conflict | `scene-manager.js:52–58`: If `onEnter` returns a cleanup function AND the scene defines `onExit`, `onExit` overwrites the cleanup (line 57). Should compose both: call cleanup then onExit. Currently no scene uses both, but the pattern is a trap. |
| **cleanup** | Inconsistent cleanup patterns | `login.js`: returns cleanup function from `onEnter`. `snapshot.js`: uses `onExit` to remove overlays. `check-editing.js`: sets `window.onBackRequested` in `onEnter`, nullifies in returned cleanup. `settings.js`: uses `onExit` to delete globals. — Each scene picks a different approach. |

---

## 5. Performance

### 5.1 Redundant API Calls / Queries

| Severity | File | Line(s) | Description |
|----------|------|---------|-------------|
| **warning** | `backend/app/services/server_snapshot_service.py` | 15, 36, 54, 70, 103, 134, 169, 198, 217 | Every public method calls `get_events_since(0, limit=10000)` independently. A single server checkout flow (`get_server_sales` + `get_server_checks` + `get_server_tips` + `calculate_tip_out` + `get_checkout_blockers`) replays the full event ledger **5 times**. |
| **warning** | `backend/app/services/overseer_config_service.py` | 17–19, 33–35, 49–51 | Multiple separate `get_events_by_type()` calls for different config event types. Should batch-fetch all config events in one query and filter in memory. |
| **cleanup** | `backend/app/api/routes/menu.py` | 28 | `limit=10000` is an arbitrary cap. For long-running venues, this could silently truncate event history and return stale menu state. |

### 5.2 DOM / Rendering

| Severity | File | Line(s) | Description |
|----------|------|---------|-------------|
| **warning** | `frontend/js/bars.js` | 19–93 | `renderBars()` replaces full innerHTML of `#tbar` and `#sbar` every 30 seconds. Each call creates new DOM nodes and attaches new event listeners. Should diff-check or only update the clock text. |
| **cleanup** | `frontend/js/scenes/check-editing.js` | 298–311 | Individual `.onclick` handler on each seat card instead of event delegation on the parent container. For large floor plans (30+ seats) this creates 30+ function objects. |
| **cleanup** | `frontend/js/scenes/snapshot.js` | 624–634 | Complex conditional inline styles computed per-render in template literals. Moving to CSS class toggling would reduce string allocation. |

### 5.3 Blocking Operations

| Severity | File | Line(s) | Description |
|----------|------|---------|-------------|
| **warning** | `backend/app/api/routes/hardware.py` | 26 | Network printer discovery uses `threading.Thread` inside an async endpoint, communicating via `asyncio.Queue`. The thread performs synchronous TCP scans. While functional, the thread↔asyncio bridge adds complexity. Consider using `asyncio` sockets directly or `run_in_executor`. |
| **cleanup** | `backend/app/core/adapters/dejavoo_spin.py` | 34 | 95-second HTTP timeout for payment terminal communication. If the terminal is unreachable, the request handler blocks for 95s before timing out. Should have a shorter connect timeout with longer read timeout. |

---

## Summary by Severity

| Severity | Count | Key Items |
|----------|-------|-----------|
| **Critical** | 4 | server_snapshot_service attribute crashes (B-01), nested add_task (B-02), tax rate mismatch (B-03), EventType format split (B-04) |
| **High** | 5 | Missing await (B-05), listener accumulation (B-06), race condition (B-07), overlay listener leak (B-08), cleanup overwrite (B-09) |
| **Warning** | 17 | Null refs, incomplete cleanup, deprecated patterns, no test coverage for critical paths, redundant queries, dead stubs |
| **Cleanup** | 15 | Inline styles, hardcoded layout values, duplicate utilities, stale skipped tests |

---

*Report generated by codebase audit — no changes made.*
