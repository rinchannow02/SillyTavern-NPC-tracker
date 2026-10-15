# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Active Milestone:** Milestone 2 — Multi-Scope Link Manager & Prompt Injector
- **Required Working Branch:** `v2` (branched from `staging`)
- **Base Integration Branch:** `staging`

## Milestone & Branch Matrix
| Milestone | Branch | Status | Scope Summary |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | `v1` | `COMPLETED` | `manifest.json`, `global.d.ts`, `index.js`, `style.css`, `src/contracts.js`, `src/db/sqlite-store.js` (`sql.js` + `localforage`), Extensions drawer UI with Test NPC & JSON export |
| **Milestone 2** | `v2` | `COMPLETED` | Multi-Scope Link Manager (Chat/Character/Persona/Global), `setExtensionPrompt` prompt injector (`src/injection.js`), `CHAT_CHANGED` auto-query, prompt preview panel |
| **Milestone 3** | `v3` | `READY` | Dynamic Block Editor UI, Custom Templates, `DOMPurify` sanitized rendering |
| **Milestone 4** | `v4` | `LOCKED` | LLM Chat Scanner & `ConnectionManagerRequestService` integration |

## Milestone 2 Task Checklist (`v2`)
- [x] Merge completed `v1` into `staging` and branch `v2` off `staging`
- [x] Implement `src/injection.js` with `renderNpcSheet`, `formatActiveNpcsPrompt`, and `syncPromptInjection` calling `context.setExtensionPrompt('npc_tracker', ...)`
- [x] Add scope linking helpers (`getNpcScopes`, `setNpcScopeStatus`) in `src/db/sqlite-store.js`
- [x] Update `src/ui/settings.html` and `style.css` with Prompt Injection Preview, Depth/Position controls, and Sync button
- [x] Wire lifecycle events in `index.js` (`CHAT_CHANGED`, `CHARACTER_PAGE_LOADED`) to auto-sync prompt injection
- [x] Validate HTTP 200, JS syntax (`node --check`), and live prompt injection in SillyTavern Docker container (`http://127.0.0.1:8000`)
- [x] Commit cleanly to branch `v2`

## Active Decisions & Constraints
- Module Name: `npc_tracker`
- Prompt Injection Identifier: `npc_tracker`
- CSS Prefix: `st-npc-`
- Storage Key in `localforage`: `st_npc_tracker_sqlite_db`
- Default Injection Settings: `position = 1` (in-chat), `depth = 4`, `role = 0` (system)