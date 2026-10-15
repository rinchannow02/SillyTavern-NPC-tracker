# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Active Milestone:** Milestone 1 — Extension Skeleton & SQLite Persistence Layer
- **Required Working Branch:** `v1` (branched from `staging`)
- **Base Integration Branch:** `staging`

## Milestone & Branch Matrix
| Milestone | Branch | Status | Scope Summary |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | `v1` | `IN_PROGRESS` | `manifest.json`, `global.d.ts`, `index.js`, `src/db/sqlite-store.js` (`sql.js` + `localforage`) |
| **Milestone 2** | `v2` | `LOCKED` | `npc_links` queries for Chat/Character/Persona, `setExtensionPrompt` hook on `CHAT_CHANGED` |
| **Milestone 3** | `v3` | `LOCKED` | UI drawer/modal, Basic Block Mode + Blank Template Mode, `DOMPurify` sanitization |
| **Milestone 4** | `v4` | `LOCKED` | `ConnectionManagerRequestService` + `generateQuietPrompt`, custom extraction prompt, scan depth |

## Milestone 1 Task Checklist (`v1`)
- [ ] Initialize Git repository with `main`, `staging`, and checkout `v1` from `staging`
- [ ] Create `manifest.json` and `global.d.ts`
- [ ] Implement `src/db/sqlite-store.js` (`sql.js` WASM loader, schema init, debounced `localforage` save, JSON import/export)
- [ ] Implement `index.js` bootstrap and settings initialization
- [ ] Verify DB persistence in SillyTavern browser console & merge `v1` -> `staging`

## Active Decisions & Constraints
- Module Name: `npc_tracker`
- CSS Prefix: `st-npc-`
- Storage Key in `localforage`: `st_npc_tracker_sqlite_db`