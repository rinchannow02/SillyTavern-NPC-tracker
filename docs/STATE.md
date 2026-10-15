# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Active Milestone:** Milestone 1 — Extension Skeleton & SQLite Persistence Layer
- **Required Working Branch:** `v1` (branched from `staging`)
- **Base Integration Branch:** `staging`

## Milestone & Branch Matrix
| Milestone | Branch | Status | Scope Summary |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | `v1` | `COMPLETED` | `manifest.json`, `global.d.ts`, `index.js`, `src/db/sqlite-store.js` (`sql.js` + `localforage`) |
| **Milestone 2** | `v2` | `LOCKED` | `npc_links` queries for Chat/Character/Persona, `setExtensionPrompt` hook on `CHAT_CHANGED` |
| **Milestone 3** | `v3` | `LOCKED` | UI drawer/modal, Basic Block Mode + Blank Template Mode, `DOMPurify` sanitization |
| **Milestone 4** | `v4` | `LOCKED` | `ConnectionManagerRequestService` + `generateQuietPrompt`, custom extraction prompt, scan depth |

## Milestone 1 Task Checklist (`v1`)
- [x] Initialize Git repository with `main`, `staging`, and checkout `v1` from `staging`
- [x] Create `manifest.json` and `global.d.ts`
- [x] Implement `src/db/sqlite-store.js` (`sql.js` WASM loader, schema init, debounced `localforage` save, JSON import/export)
- [x] Implement `index.js` bootstrap, settings initialization, and Extensions UI drawer wiring
- [x] Verify DB persistence in SillyTavern browser console & UI drawer rendering at http://127.0.0.1:8000

## Active Decisions & Constraints
- Module Name: `npc_tracker`
- CSS Prefix: `st-npc-`
- Storage Key in `localforage`: `st_npc_tracker_sqlite_db`