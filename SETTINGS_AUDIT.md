# SETTINGS AUDIT — Configurable Values

This document compiles all configurable values identified in the codebase, grouped by their target Settings section.

## TAB 1: TERMINAL SETTINGS

### Card: Venue Info
- **Venue Name**: Currently hardcoded as "KINDpos Terminal Vz1" in `index.html`. Should be configurable.
- **Location/Address**: Not explicitly found. Needs to be added.
- **Terminal ID/Name**: Currently hardcoded as "Bar 1", "Host Stand", etc. in `snapshot.js` mocks. Should be configurable per device.
- **Timezone**: Not explicitly found. Implied by system clock.

### Card: Financial
- **Tax Rate (%)**: Currently `CFG.TAX = 0.07` in `frontend/js/config.js` and `tax_rate = 0.07` in `backend/app/config.py`. Should be 2dp precision.
- **Dual Pricing Toggle**: Implied by the existence of `CASH_DISC`. Needs explicit toggle.
- **Dual Pricing Mode**: Currently only `cash discount` logic found. Need to add `card surcharge` support.
- **Dual Pricing Percentage**: Currently `CFG.CASH_DISC = 0.035` in `frontend/js/config.js`. Should be configurable.
- **Default Tip Presets**: Not found in codebase. Need to add (e.g., 18%, 20%, 22%).
- **Auto-Gratuity Threshold**: Found as `party_size_threshold = 6` in `store_config_service.py`. Should be configurable.
- **Auto-Gratuity Percentage**: Found as `rate_percent = 20.0` in `store_config_service.py`. Should be configurable.
- **Rounding Rules**: Read-only display confirming 2dp precision (already active in `projections.py` and `app.js`).

### Card: Staff & Security
- **Server PIN Length**: Not explicitly found. Implied 4 digits.
- **Server PIN Format**: Not explicitly found. Implied numeric.
- **Manager PIN / Override Code**: Fallback `0000` in `config.js` and `index.html`.
- **Auto-Logout Timer**: Not found. Should be configurable (minutes of inactivity).
- **RFID Credential Settings**: Placeholder requested. Not found.
- **Permission Levels**: Found `manager` vs `server` roles in `config.js`. Needs structured settings.

### Card: Order Behavior
- **Default Coursing**: Not found. Should be configurable (fire all vs hold).
- **Auto-Close Behavior**: Not found. Should be configurable.
- **Modifier Prompt Behavior**: Not found. Should be configurable.
- **86'd Item Handling**: Not found. Should be configurable (hide vs show unavailable).

### Card: Display & Theme
- **Brightness / Screen Timeout**: Not found.
- **Hex Grid Density**: Not found.
- **UI Scale / Font Size**: Not found.

### Card: System
- **Scheduled Reboot Time**: Maintenance reboots exist in `printer_manager.py` but the time (default: 4 AM) is not centrally configurable yet.
- **Event Ledger Stats**: Count/Size/Last write. Read-only.
- **Software Version**: Not explicitly found.
- **Config Export/Import**: Placeholder requested.

---

## TAB 2: HARDWARE

### Card: Printers
- **Network Scan**: Logic exists in `printer_detector.py`.
- **Saved Printers**: Configuration structure exists in `printer_config.py` and `printer_manager.py`.
- **Printer Roles**: Kitchen, Bar, Receipt. Supported by `printer_config.py`.
- **Category Routing**: Mapping menu categories to printer roles. Not fully implemented in frontend yet.

### Card: Payment Devices
- **Saved Card Readers**: `Dejavoo P8 / SPIN` adapter config found in `dejavoo_spin.py`.
- **Connection Status**: Placeholder requested.

### Card: Displays
- **KDS / Customer-facing**: Coming Soon placeholders.

### Card: Peripherals
- **Cash Drawer Config**: Port trigger settings. Not found.
- **E-ink Pager**: Placeholder requested.
- **Expansion Cards**: Placeholder requested.
