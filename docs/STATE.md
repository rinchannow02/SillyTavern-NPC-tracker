# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Current Version:** `1.1.3`
- **Active Branching Model:** Feature Branches (`feat/<feature-name>`, `fix/<bug-name>`)
- **Versioning Policy:** `1.x.x` (Major), `x.1.x` (Feature updates), `x.x.1` (Minor / hotfix / security)
- **Base Integration Branch:** `staging`
- **Production Release Branch:** `main`

## Version 1.0.0 Milestone Baseline
| Milestone | Status | Scope Summary |
| :--- | :--- | :--- |
| **Milestone 1** | `COMPLETED` | `manifest.json`, `global.d.ts`, `index.js`, `style.css`, Plain-JSON localforage store, Extensions drawer UI with Test NPC & JSON export |
| **Milestone 2** | `COMPLETED` | Multi-Scope Link Manager (Chat/Character/Persona/Global), `setExtensionPrompt` prompt injector (`src/injection.js`), `CHAT_CHANGED` auto-query, prompt preview panel |
| **Milestone 3** | `COMPLETED` | Dynamic Block Editor UI (`src/ui/editor.js`, `src/ui/editor-modal.html`), Custom Handlebars/Markdown Templates, `DOMPurify` sanitization, NPC Grouping & Location trigger fields |
| **Milestone 4** | `COMPLETED` | LLM Chat Scanner (`src/scanner/chat-scanner.js`), `ConnectionManagerRequestService` routing, structured JSON extraction, trigger modes, and setting-aware evaluation |

## Active Feature Branches
| Feature Branch | Status | Assigned Lane / Agent | Scope Summary |
| :--- | :--- | :--- | :--- |
| `feat/block-template-conversion` | `COMPLETED` | Antigravity AI | Two-way conversion with prompt on tab change between Block Editor and Freeform Template, hierarchical Group / Sub-Group tree selector, customizable genre presets (Slice-of-Life, Adventure, RPG, Classic) with export/import and template selectors |

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
- **R9:** Docs corrected. Run the tests with `node --test` (no path argument); 27/27 pass across import, converter, and preset suites.

## Third Audit Resolution — 1.1.0 Pre-Release (2026-10-20)
- **S1 & S2 (Stored XSS):** Escaped `safeTitle` and `safeMessage` with `escapeHtml` in `askUserConfirm` (`src/ui/editor.js`). Routed `deleteNpcFromModal` through `askUserConfirm`, eliminating stored XSS from untrusted NPC names and preset names.
- **C1 (Label & Block Loss):** Broadened label regexes to allow `&` (e.g. `Race & Class`, `Weapons & Gear`, `Tone & Speaking Style`). Matched `currentNpc.blocks` by lowercased label before creating new blocks to preserve custom IDs and ordering without collapsing into Notes. Added round-trip test across all built-in presets.
- **C2 (Scanner Prompt Override):** Synced scanner prompt textarea with the active preset. Resetting prompt sets `customPrompt = ''` and restores the active preset's extraction prompt.
- **C3 (Prototype & Serialization Safety):** Sanitized prototype property names (`constructor`, `__proto__`, etc.) in `validatePreset`. Enforced safe primitive string extraction via `Object.hasOwn` in chat scanner and coerced `relationship_summary` to string in SQLite store.
- **C4 (Mid-scan Chat Context):** Captured and passed `context` through `findExistingNpc` to prevent cross-chat merge collisions.
- **C5 (Preset Collision):** Renamed imported presets matching built-in IDs to `custom_${Date.now()}`.
- **I1 & I2 (Macro & Injection Notice):** Added documentation in README regarding SillyTavern macro evaluation on prompt strings.
- **I4 (Negative Scan Depth Clamping):** Clamped scanner and setting-aware trigger depth to `Math.max(1, ...)` in `chat-scanner.js`, `index.js`, and `evaluateSettingAwareTriggers`.
- **P2 Cleanup & Efficiency:**
  - Removed dead `blocks_json` stringification from in-memory `getNpcById` and `getActiveContextNpcs` calls.
  - Eliminated redundant per-turn injection syncs from message sent/rendered handlers, synchronizing on `GENERATION_STARTED` only and passing pre-queried active NPC lists into `updateDrawerStats`.
  - Extracted shared `normalizeLink(l)` helper in `src/db/sqlite-store.js` and unified browser JSON downloads via `downloadJsonFile(filename, jsonStr)` in `index.js`.
  - Fixed indentation of `scanRecentChat`, removed model vendor hint ("GLM-5.3-flash"), and cleaned up stale SQLite/Milestone 4 comments across the codebase.
  - Dropped meaningless `id: Date.now()` generation on embedded scope links.
- **Verification:** 28/28 unit tests passing via `node --test test/*.mjs`.

## Fourth Audit & Feature Updates — 1.1.3 (2026-10-22)
- **Visual Gap Fix:** Removed `.st-npc-settings { margin-bottom: 12px; }` in `style.css` (reset to `margin-bottom: 0`), perfectly eliminating the excess vertical gap between the NPC Tracker drawer header and adjacent extension drawers (e.g. NPC Name Suggester). Added `id="st_npc_settings_drawer"` and `id="st_npc_settings_content"` in `src/ui/settings.html` to align with editor modal reopening logic.
- **Match Scan Depth Adjustment (General Setting):** Moved Setting-Aware Selective Prompt Injection and its `matchDepth` input (`#st_npc_match_depth`) out of the LLM Chat Scanner panel into the general prompt injection settings in `src/ui/settings.html`. Setting-aware filtering is purely local (matching keywords/names in recent chat) and no longer requires enabling or opening the LLM Chat Scanner. Wired through `index.js`, `src/injection.js`, and the `GENERATION_STARTED` event.
- **Template Separation & Schema Enhancements:** Deconstructed monolithic template definitions in `src/templates/preset-manager.js` into standalone, easily editable JSON preset files under `src/templates/presets/` (`classic.json`, `slice_of_life.json`, `adventure_fantasy.json`, `rpg_scifi.json`). Added `appearance` blocks across all presets (fixing blindspots in Slice of Life and Cyberpunk) and expanded `relationship` blocks into pairwise connection maps covering inter-NPC social dynamics in addition to user ties.
- **Scanner Salvage Engine & Fuzzy Matching:** Implemented two-tier salvage in `src/scanner/chat-scanner.js`: (1) Normalized alphanumeric key matching to support casing/separator variations (e.g. `speechStyle` -> `speech_style`), and (2) Dynamic Custom Block Salvage to automatically convert any novel attributes returned by the LLM into safe custom blocks (`custom_<key>`), ensuring zero data loss.
- **Verification:** 36/36 unit tests passing via `node --test`.



