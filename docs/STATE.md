# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Active Milestone:** Milestone 3 — Dynamic Block Editor UI & Custom Templates
- **Required Working Branch:** `v3` (branched from `staging`)
- **Base Integration Branch:** `staging`

## Milestone & Branch Matrix
| Milestone | Branch | Status | Scope Summary |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | `v1` | `COMPLETED` | `manifest.json`, `global.d.ts`, `index.js`, `style.css`, `src/contracts.js`, `src/db/sqlite-store.js` (`sql.js` + `localforage`), Extensions drawer UI with Test NPC & JSON export |
| **Milestone 2** | `v2` | `COMPLETED` | Multi-Scope Link Manager (Chat/Character/Persona/Global), `setExtensionPrompt` prompt injector (`src/injection.js`), `CHAT_CHANGED` auto-query, prompt preview panel |
| **Milestone 3** | `v3` | `COMPLETED` | Dynamic Block Editor UI (`src/ui/editor.js`, `src/ui/editor-modal.html`), Custom Handlebars/Markdown Templates, `DOMPurify` sanitization, NPC Grouping & Location trigger fields |
| **Milestone 4** | `v4` | `READY` | LLM Chat Scanner & `ConnectionManagerRequestService` integration, Setting-aware activation |

## Milestone 3 Task Checklist (`v3`)
- [x] Merge completed `v2` into `staging` and branch `v3` off `staging`
- [x] Update contracts & schema with `group_name` and `location_keywords` (with safe SQLite auto-migration)
- [x] Create `src/ui/editor-modal.html` with Basic Block Mode, Freeform Template Mode, and Multi-Scope Linker
- [x] Implement `src/ui/editor.js` managing modal lifecycle, dynamic custom blocks, block reordering, and DOMPurify sanitization
- [x] Enhance `index.js` and `src/ui/settings.html` with "+ New NPC" button and clickable mini-cards with group badges
- [x] Update `style.css` with responsive dark-theme modal, tab bar, block cards, and scope list styling
- [x] Verify live creation, editing, and prompt injection in SillyTavern Docker container (`http://127.0.0.1:8000`)
- [x] Commit cleanly to branch `v3`

## Active Decisions & Constraints
- Module Name: `npc_tracker`
- Modal Selector Prefix: `.st-npc-modal-`
- Default Editor Mode: `basic` (Dynamic Blocks)
- Sanitizer: `SillyTavern.libs.DOMPurify.sanitize()`
- Storage Key in `localforage`: `st_npc_tracker_sqlite_db`
- Supported Groups: Any arbitrary string group (e.g. `Silvermoon Tavern`, `City Guard`), autocompleted via HTML datalist