# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Active Milestone:** Milestone 1 — Extension Skeleton & SQLite Persistence Layer
- **Required Working Branch:** `v1` (branched from `staging`)
- **Base Integration Branch:** `staging`

## Milestone & Branch Matrix
| Milestone | Branch | Status | Scope Summary |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | `v1` | `COMPLETED` | `manifest.json`, `global.d.ts`, `index.js`, `style.css`, `src/contracts.js`, `src/db/sqlite-store.js` (`sql.js` + `localforage`), Extensions drawer UI with Test NPC & JSON export |
| **Milestone 2** | `v2` | `READY` | Multi-Scope Link Manager (Chat/Character/Persona/Global), `setExtensionPrompt` prompt injector, `CHAT_CHANGED` auto-query |
| **Milestone 3** | `v3` | `LOCKED` | Dynamic Block Editor UI, Custom Templates, `DOMPurify` sanitized rendering |
| **Milestone 4** | `v4` | `LOCKED` | LLM Chat Scanner & `ConnectionManagerRequestService` integration |

## Milestone 1 Task Checklist (`v1`)
- [x] Initialize Git repository with `main`, `staging`, and checkout `v1` from `staging`
- [x] Set remote `origin` to `https://github.com/rinchannow02/SillyTavern-NPC-tracker.git`
- [x] Scaffold Antigravity Agent Control Plane (`GEMINI.md`, `docs/SPEC.md`, `docs/STATE.md`, `.agents/rules/*`, `.agents/workflows/*`, subfolder `GEMINI.md` lane contracts)
- [x] Create `manifest.json` and `global.d.ts` (with `/// <reference path="../../../global.d.ts" />` and window types)
- [x] Implement `src/contracts.js` defining shared JSDoc contracts (`NpcRecord`, `NpcBlock`, `NpcScopeLink`, `ScannerConfig`) and lane interfaces
- [x] Implement `src/db/sqlite-store.js` (`sql.js` WASM loader from CDN, schema init, debounced `localforage` save, CRUD, scoping, JSON import/export)
- [x] Implement `index.js` bootstrap, settings initialization, collapsible Extensions UI drawer in `#extensions_settings2`, and buttons for **Create Test NPC** and **Export DB JSON**
- [x] Verified zero 404s and successful live activation in SillyTavern Docker instance at `http://127.0.0.1:8000` (console: `[NPC Tracker] Milestone 1 (v1) initialized successfully.`, `typeof window.ST_NPC_Tracker === 'object'`)

## Active Decisions & Constraints
- Module Name: `npc_tracker`
- CSS Prefix: `st-npc-`
- Storage Key in `localforage`: `st_npc_tracker_sqlite_db`
- Coordinator-Only Files: `index.js`, `manifest.json`, `docs/STATE.md`, `src/contracts.js`