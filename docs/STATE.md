# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Active Milestone:** Milestone 4 — LLM Chat Scanner & Connection Routing
- **Required Working Branch:** `v4` (branched from `staging`)
- **Base Integration Branch:** `staging`

## Milestone & Branch Matrix
| Milestone | Branch | Status | Scope Summary |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | `v1` | `COMPLETED` | `manifest.json`, `global.d.ts`, `index.js`, `style.css`, `src/contracts.js`, `src/db/sqlite-store.js` (`sql.js` + `localforage`), Extensions drawer UI with Test NPC & JSON export |
| **Milestone 2** | `v2` | `COMPLETED` | Multi-Scope Link Manager (Chat/Character/Persona/Global), `setExtensionPrompt` prompt injector (`src/injection.js`), `CHAT_CHANGED` auto-query, prompt preview panel |
| **Milestone 3** | `v3` | `COMPLETED` | Dynamic Block Editor UI (`src/ui/editor.js`, `src/ui/editor-modal.html`), Custom Handlebars/Markdown Templates, `DOMPurify` sanitization, NPC Grouping & Location trigger fields |
| **Milestone 4** | `v4` | `COMPLETED` | LLM Chat Scanner (`src/scanner/chat-scanner.js`), `ConnectionManagerRequestService` routing, structured JSON extraction, trigger modes, and setting-aware evaluation |

## Milestone 4 Task Checklist (`v4`)
- [x] Merge completed `v3` into `staging` and branch `v4` off `staging`
- [x] Implement `src/scanner/chat-scanner.js` with API routing (`generateQuietPrompt` vs `ConnectionManagerRequestService`), JSON parser, and SQLite merge
- [x] Add Setting-Aware Keyword Triggering (`evaluateSettingAwareTriggers`)
- [x] Enhance `src/ui/settings.html` and `style.css` with Scanner configuration panel and "Scan Recent Chat Now" button
- [x] Wire lifecycle events in `index.js` for `every_n_messages` and `on_keyword` triggers
- [x] Verify live scanning with low-budget / careful token execution against SillyTavern Docker container (`http://127.0.0.1:8000`)
- [x] Commit cleanly to branch `v4`

## Active Decisions & Constraints
- Module Name: `npc_tracker`
- Default Scan Depth: `10`
- API Fallback: Active ST API if connection profile is unspecified
- Token Budget Safety: Strict limits on maxTokens (default: 500) and concise system prompt

## Security & Quality Audit Resolution (2026-10-15)
All P0 (Security) and P1 (Correctness) items from `AUDIT.md` have been implemented:

### P0 Items (Security)
- **S1 · Stored XSS via imported `npc.id`:** FIXED. Implemented `validateImport(payload)` validating UUID format, scope types, string fields, and block structure before `BEGIN TRANSACTION`. Rebuilt quick-list cards in `updateDrawerStats()` using jQuery DOM APIs with `.text()`.
- **S2 · Attribute injection via block label in editor:** FIXED. Rebuilt `renderBlocks()` using DOM APIs (`.attr('placeholder', ...)`, `.text(label)`, `.val(label)`, `.val(value)`).
- **S3 · DOMPurify used in wrong context:** FIXED. Removed all DOMPurify invocations in rendering sinks; verified with grep.
- **S4 · Remote script & WASM loaded without integrity check:** FIXED by P2-1: sql.js and the CDN load were removed entirely (no `lib/` files exist).
- **S5 · Low-severity batch:** FIXED. Profile dropdown uses `.val().text()`; profile request failure throws naming profile; added safe `parseBlocks()` helper; removed `db` and `queryAll` from `window.ST_NPC_Tracker`.

### P1 Items (Correctness Bugs)
- **B1 · Custom prompt default empty string:** FIXED. Used `||` chaining for `DEFAULT_EXTRACTION_PROMPT`.
- **B2 · Scope target resolution bug:** FIXED. Extracted shared `resolveScopeTarget(scopeType, context)` helper and applied across scanner, editor, DB queries, and test creation.
- **B3 · Duplicate multi-scope NPC prompt injection:** FIXED. Deduplicated active NPCs by `n.id` with precedence `chat > character > persona > global`.
- **B4 · Depth/position 0 falsy bug:** FIXED. Used `Number.isFinite()` for `injectionDepth`, `injectionPosition`, and `temperature`.
- **B5 · Stale setting-aware filter:** FIXED. Wired `GENERATION_STARTED` event to re-sync prompt injection when `settingAwareFilter` is active; removed redundant `on_keyword` branch.
- **B6 · Concurrent scan race condition:** FIXED. Added module-level `scanning` lock to `scanRecentChat()`.
- **B7 · Cross-chat NPC collision in scanner:** FIXED. Limited `findExistingNpc()` lookups to active context NPCs (`getActiveContextNpcs()`).
- **B8 · Scanner overwrite of user edits:** FIXED. Changed merge rule to only fill empty fields and never overwrite non-empty user data.
- **B9 · Immediate unlinking/toggling in modal:** FIXED. Deferred link mutations to modal Save; diffed against existing scopes and upserted via `INSERT ... ON CONFLICT DO UPDATE`.
- **B10 · Double prompt token cost:** FIXED. Preferred `generateRaw` over `generateQuietPrompt` in `requestViaActiveApi()`.
- **B11 · Missing native confirm dialog:** FIXED. Used `context.Popup` and `context.callGenericPopup` before falling back to 2-click confirm.
- **B12 · Dropdown closing on click:** FIXED. Removed rebuild timeouts and `mousedown` handler on profile dropdown; refreshed on `focus` and manual refresh button.

### P2 Items (Simplification & Optimization)
- **P2-1 · Plain JSON storage:** FIXED. Replaced `sql.js` and WASM runtime with a lightweight in-browser plain-JSON store backed by `localforage` under key `st_npc_tracker_data`. With dev-environment approval from the user, migration was skipped and legacy `st_npc_tracker_sqlite_db` is automatically deleted on init.
- **P2-2 · Dead code cleanup:** FIXED. Removed unused per-NPC `injection_position/depth/role` columns, removed unused `avatar` input and fields from `editor-modal.html` and `editor.js`, removed `settings.defaultTemplate` from `index.js`, eliminated unused `extensionBaseUrl`, removed dead `src/contracts.js`, and eliminated redundant `saveDatabaseNow()` in `executeModalDelete`.
- **P2-3 · Unified `DEFAULT_BLOCKS`:** FIXED. Defined `DEFAULT_BLOCKS` once in `src/db/sqlite-store.js` and reused it across `editor.js` and `chat-scanner.js`.
- **P2-4 · Template rendering without cache-busting:** FIXED. Replaced `fetch + ?t=Date.now()` with clean direct `fetch` without cache-busting queries (`renderExtensionTemplateAsync` was evaluated but triggers Handlebars compilation errors and toasts on literal tokens like `{{name}}` and `{{npcs}}`).
- **P2-5 · Slim published package:** REVERTED (R7). `.gitattributes` was deleted because ST installs extensions with `git clone`, which ignores `export-ignore`.

### Additional Features
- **Custom Injection Prompt Format Menu:** ADDED. Implemented customizable injection wrapper template in `src/ui/settings.html` and `index.js` with `settings.injectionTemplate` (default: `[Active NPCs in Context:\n{{npcs}}\n]`), accordion toggle, reset button, and updated `src/injection.js` to interpolate `{{npcs}}`. Updated database badge in settings to reflect `JSON (localforage)`.

### Verification
- Unit test suite `test/import.test.mjs` verifying `validateImport(payload)` (5/5 tests: valid payload, bad NPC id, bad link npc_id, bad scope_type, malformed blocks_json).

## Second Audit Resolution (2026-10-15)
- **R1:** The legacy SQLite key is no longer deleted on init (the user approved skipping migration; data is left recoverable).
- **R2:** A localforage read failure sets `loadFailed`, which blocks all saves and shows a toast.
- **R3:** Persona scope now uses `user_avatar` from ST's `personas.js` (dynamic import in `initDatabase`); `getContext()` does not expose it.
- **R4:** The import accepts only `blocks_json` and `npc_links`; the string fields are type-checked.
- **R5:** All template `.replace` calls use function replacers (`$` patterns stay literal).
- **R6:** `DEFAULT_BLOCKS` is deep-frozen; import and `getActiveContextNpcs` return block copies.
- **R7:** `.gitattributes` was deleted.
- **R8:** Storage uses `SillyTavern.libs.localforage`.
- **R9:** Docs corrected. Run the tests with `node --test` (no path argument); 8/8 pass.

