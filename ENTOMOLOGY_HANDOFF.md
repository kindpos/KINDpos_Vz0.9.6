# Entomology System — Session Handoff

## Branch
`claude/entomology-diagnostic-system-OaaD6`

## Last Commit
`a9f6c88` — feat(entomology): add diagnostic data model, collector service, and report generator

## Files Created (committed & pushed)

| File | Lines | Description |
|------|-------|-------------|
| `backend/app/models/diagnostic_event.py` | ~210 | `DiagnosticCategory` enum (5 values), `DiagnosticSeverity` enum (4 values, with ordering), `DiagnosticEvent` Pydantic model, `compute_diagnostic_hash()` (SHA-256), `EVENT_CODE_REGISTRY` (36 codes), `DEFAULT_RETENTION_DAYS = 90`, `GENESIS_HASH = "KIND_DIAGNOSTIC_GENESIS"` |
| `backend/app/services/diagnostic_collector.py` | ~480 | `DiagnosticCollector` singleton service: `record()` method (only public write interface), independent hash chain, adaptive heartbeat loop (60s active / 15min off-hours), reverse correlation, retention with JSON archiving, SQLite table + 5 indexes |
| `backend/app/reports/__init__.py` | 0 | Empty package init |
| `backend/app/reports/entomology_report.py` | ~895 | `EntomologyReportGenerator`: self-contained HTML with inline CSS, no JS. Layer 1 (scorecards, top 5, active/resolved), Layer 2 (recurring clusters with hour histograms, peripheral timelines, correlation chains, escalation candidates), Layer 3 (filtered timeline WARNING+, heartbeat collapsing, expandable context JSON) |

## Still Needed

### 1. Test Suite — `backend/tests/test_entomology_system.py`
122 tests across 11 sections per spec Section 9:
- M-01..M-14: Data model (enums, model validation, hash computation)
- C-01..C-31: DiagnosticCollector (recording, hash chain, adaptive heartbeat, singleton)
- S-01..S-14: Storage & retention (schema, queries, retention lifecycle)
- R-01..R-09: Event code registry (all codes, no duplicates, format)
- B-01..B-05: Scheduled reboot SYS-007 (context, gap detection)
- L1-01..L1-14: Report Layer 1 (scorecards, health colors, empty state)
- L2-01..L2-12: Report Layer 2 (clusters, histograms, escalation)
- L3-01..L3-10: Report Layer 3 (filtering, collapsing, correlation links)
- RC-01..RC-05: Reverse correlation (retroactive linking, time windows)
- I-01..I-08: Integration (end-to-end, high volume, full day sim)

### 2. Integration Wiring

| File | Action | What to Add |
|------|--------|-------------|
| `backend/app/api/dependencies.py` | EDIT | `_diagnostic_collector` singleton, `init_diagnostic_collector()`, `close_diagnostic_collector()`, `get_diagnostic_collector()` — same pattern as ledger |
| `backend/app/main.py` | EDIT | Call `init_diagnostic_collector()` after ledger init in lifespan, `close_diagnostic_collector()` on shutdown, start heartbeat background task |
| `backend/app/api/routes/system.py` | EDIT | Add `GET /api/v1/system/entomology-report` endpoint returning downloadable HTML |
| `backend/tests/conftest.py` | EDIT | Add `collector` fixture (fresh DiagnosticCollector with test DB, cleanup) |
| `backend/requirements.txt` | EDIT | Add `psutil` for system metrics (memory, disk, CPU temp with Pi 5 sysfs fallback) |

### 3. Run & Verify
- `cd backend && python -m pytest tests/test_entomology_system.py -v`
- `cd backend && python -m pytest tests/ -v` (full suite, confirm no regressions)

### 4. Commit & Push
- Commit all remaining files
- Push to `claude/entomology-diagnostic-system-OaaD6`

## Spec Reference
The full spec was provided as a user message in the original session. Key sections:
- Section 2: Data model (enums, DiagnosticEvent fields, context blob examples)
- Section 3: Collection pipeline (record() method, reactive vs ambient, hash chain, reverse correlation)
- Section 4: Report structure (Layer 1/2/3 details)
- Section 5: Storage & retention (SQLite schema, indexes, retention constant)
- Section 7: Event code registry (all 36 codes with descriptions)
- Section 9: Test suite (122 tests with test IDs and descriptions)

## Plan File
Full implementation plan at `/root/.claude/plans/peaceful-hopping-sparkle.md`
