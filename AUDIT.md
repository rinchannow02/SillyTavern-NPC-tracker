# AUDIT.md — Security & Quality Audit (2026-10-15)

Target: `staging` @ `a9dedfa`. Findings were verified by reading and tracing the code. No PoC was executed.

**Instructions for the implementing agent**
- Work through the tasks **in order**. P0 is mandatory; P1 should follow. Do **not** start P2 unless the user approves it.
- Keep each fix minimal and local. Do not refactor unrelated code or add dependencies.
- Constraints (from `GEMINI.md`) still apply: browser ES modules, no bundler, no server code, SillyTavern access only via `SillyTavern.getContext()` / `SillyTavern.libs`.
- Line numbers refer to `a9dedfa`. Re-locate them by the quoted code if the file has changed.
- After finishing, tick the checkboxes here and add a short entry to `docs/STATE.md`.

---

## Threat model (read first)

| Input | Who controls it | Trust |
|---|---|---|
| Imported backup JSON (`importDatabaseFromJson`) | Anyone who shares an "NPC pack". The README advertises sharing | **Untrusted** |
| Scanner LLM output (names, aliases, groups, block values) | Chat content, which can be steered by a downloaded character card | **Untrusted** |
| Connection profile names, user-typed editor fields | The local user | Semi-trusted (self-XSS) |

Any JS executed in the SillyTavern origin gets **full control of the ST session**: it can read all chats and cards, call any `/api/*` route (e.g. `/api/secrets/view`, `/api/extensions/install` for persistence), and spend the user's API credits. Treat every HTML sink fed by the first two rows as critical.

---

## P0 — Security (mandatory)

### [x] S1 · HIGH · Stored XSS via imported `npc.id` (no click needed, runs on every load)
- **Sink:** `index.js:128`, `data-npc-id="${npc.id}"` is placed inside an HTML string passed to `quickListContainer.html(...)`.
- **Source:** `src/db/sqlite-store.js:431` `importDatabaseFromJson` accepts any `id`, `scope_type`, `target_id` and `blocks_json`.
- **Exploit:** import `{"npcs":[{"id":"x\"><img src=x onerror=alert(1)>","name":"a",...}],"npc_links":[{"npc_id":"x\"><img src=x onerror=alert(1)>","scope_type":"global","target_id":"global"}]}`. Global-scope NPCs render in the drawer on startup (`renderSettingsDrawer` → `updateDrawerStats`), so the payload runs on every page load.
- **Fix (both parts required):**
  1. Validate the import in `importDatabaseFromJson`, **before** `BEGIN TRANSACTION`. Reject the whole file on the first bad record (throw with a clear message):
     - `id` / `npc_id` must match `/^[0-9a-f-]{36}$/i`.
     - `scope_type` must be in `['chat','character','persona','global']`.
     - `name`, `aliases`, `group_name`, `location_keywords`, `raw_content` and `target_id` must be strings.
     - `blocks_json` must `JSON.parse` to an array of `{id:string,label:string,value:string}`.
     - Numeric fields must be finite numbers or absent.
  2. Rebuild the quick-list cards in `updateDrawerStats` with jQuery DOM APIs (`$('<div>').attr('data-npc-id', npc.id)`, `.text(name)`) instead of a template string. Remove the `DOMPurify.sanitize` calls there; `.text()` makes them unnecessary.

### [x] S2 · HIGH · Attribute injection via block label in the editor
- **Sink:** `src/ui/editor.js:313` (the `renderBlocks` textarea): `placeholder="Enter ${safeLabel.toLowerCase()} details..."`. `safeLabel` is DOMPurify output, and **DOMPurify does not escape `"`**.
- **Exploit:** a block label of `x" onfocus="alert(1)` (from an import) runs when the user clicks into that field.
- **Fix:** build each block card in `renderBlocks` with DOM APIs. Use `.attr('placeholder', ...)` for the placeholder, `.text(label)` for the fixed label, `.val(label)` for the label input and `.val(value)` for the textarea. Do not put user data into an HTML string.

### [x] S3 · MEDIUM · DOMPurify used in the wrong context
- `editor.js:313` puts DOMPurify output inside `<textarea>…</textarea>`. Anything DOMPurify strips (e.g. the literal text `<script>`) is **permanently deleted** the next time the NPC is saved. There is also a possible RCDATA breakout via attribute values on browsers that don't escape `<` in attribute serialization. **Fixed by S2's `.val()`**.
- `index.js:124-126` (quick list): names written by the LLM can still carry `<img src="https://attacker/...">` (tracking beacon) and `<style>` (restyles the ST UI). **Fixed by S1's `.text()`**.
- **Acceptance:** `grep -n "DOMPurify" index.js src/` returns no results in rendering code.

### [x] S4 · MEDIUM · Remote script and WASM loaded without integrity check
- `src/db/sqlite-store.js:7,21,27,35` loads `sql-wasm.js` and `sql-wasm.wasm` from jsdelivr at runtime with no SRI. If the CDN or package is compromised, the attacker's code runs in the ST origin. The extension also fails completely offline.
- **Fix:** add `lib/sql-wasm.js` and `lib/sql-wasm.wasm` to the repo (sql.js **1.11.0**, unmodified). Point `SQLJS_CDN_BASE` at `new URL('../../lib', import.meta.url).href`, and record the files' sha256 in this document.
  - *Alternative: P2-1 removes sql.js entirely, which also resolves S4.*
  - **Resolution:** resolved by P2-1 (sql.js removed). No `lib/` files were added; earlier checksums listed here referred to files that don't exist and were removed.

### [x] S5 · LOW (batch these)
- `index.js:305`: connection profile `id` and `name` are concatenated into `<option>`. Use `$('<option>').val(p.id).text(p.name)`.
- `src/scanner/chat-scanner.js:138-141`: when the selected profile fails, the scanner silently falls back to the main API, which may send private chat to a different provider. Instead, throw an error that names the profile. Do not fall back.
- `sqlite-store.js:184,403` and `chat-scanner.js:330,340`: an unguarded `JSON.parse(blocks_json)` throws on malformed data, which bricks init and every query. Add one helper, `parseBlocks(s)`, that returns `[]` on error, and use it in all four places.
- `index.js:631-657`: `window.ST_NPC_Tracker` exposes raw-SQL `queryAll` and the `db` handle. Remove `db` and `queryAll` from the object.

---

## P1 — Correctness bugs

| # | Location | Bug | Fix |
|---|---|---|---|
| [x] B1 | `chat-scanner.js:99` | The default setting is `customPrompt: ''`, and `''` doesn't trigger `??`, so **by default the scanner sends no extraction instructions**. | Change to `options.customPrompt \|\| scannerSettings.customPrompt \|\| DEFAULT_EXTRACTION_PROMPT`. |
| [x] B2 | `chat-scanner.js:163-216` | A new NPC is linked as `(settings.defaultScope, chatId)`. With the default scope set to character or persona, the link never matches and the NPC is never injected. | Extract one `resolveScopeTarget(scopeType, context)` helper (it is currently duplicated in `index.js:489-499`, `editor.js:801-824` and `sqlite-store.js:380-384`) and use it everywhere. |
| [x] B3 | `sqlite-store.js:387` | `SELECT DISTINCT n.*, l.scope_type, ...`: an NPC linked to more than one active scope is returned (and **injected into the prompt**) once per link. | Deduplicate by `n.id`, keeping the most specific link (chat > character > persona > global), either in SQL or with a JS `Map` after the query. |
| [x] B4 | `index.js:278,287` | `parseInt(...) \|\| 4` / `\|\| 1` makes depth 0 and position 0 (system prompt) impossible to select. | Use `Number.isFinite(n) ? n : default`. Do the same for temperature at `index.js:384` (`parseFloat(...) ?? 0.2` lets NaN through). |
| [x] B5 | `injection.js:93`, `index.js:207-219` | The setting-aware filter only recalculates on chat change, so the injected prompt goes stale as the chat moves on. | When `settingAwareFilter` is on, call `syncPromptInjection()` on `event_types.GENERATION_STARTED` (or on each MESSAGE_RECEIVED/SENT), independent of the scanner trigger mode. Then delete the `on_keyword` branch, which becomes redundant. |
| [x] B6 | `index.js:196`, `index.js:456` | Auto and manual scans can overlap, and both create the same NPC. | Add a module-level `let scanning = false` guard in `scanRecentChat` that rejects or skips while a scan is running. |
| [x] B7 | `chat-scanner.js:322-347` | `findExistingNpc` matches across **all** chats, so "Guard" in chat A merges into chat B, and no link to the current scope is added. | Match only NPCs linked to the active context, or, when updating a match from another scope, add a link for the current scope as well. |
| [x] B8 | `chat-scanner.js:188-201` | The merge rule "longer LLM text wins" overwrites values the user edited, and the LLM's aliases/group overwrite the user's. | Only fill fields that are **empty**. Never overwrite non-empty user data. |
| [x] B9 | `editor.js:477-502` | Unlinking and toggling write to the DB immediately, so Cancel doesn't undo them. Save uses `INSERT OR REPLACE`, which resets link IDs and `is_active`, then runs one query per inactive link to fix it. | Keep all link edits in `currentLinks` until Save. On Save, diff against `getNpcScopes(id)`: delete the removed links, then upsert the rest with `INSERT ... ON CONFLICT(npc_id, scope_type, target_id) DO UPDATE SET relationship_summary=excluded.relationship_summary, is_active=excluded.is_active`. |
| [x] B10 | `chat-scanner.js:244-251` | `generateQuietPrompt` already includes the full chat and card, so the last N messages are paid for twice and `temperature` is ignored. | Prefer `generateRaw` when it is available. Keep `generateQuietPrompt` only as a fallback. |
| [x] B11 | `editor.js:382` | `typeof Popup` checks a global that ST doesn't expose, so the native confirm dialog never appears. | Use `SillyTavern.getContext().Popup` / `callGenericPopup` if present. |
| [x] B12 | `index.js:313-317` | The profile dropdown is rebuilt by timers at 500, 1500 and 3000 ms and on every `mousedown`, which closes the select while it's opening. | Remove the timers and the `mousedown` handler. Refresh on `focus` and the existing refresh button only. |

---

## P2 — Simplification (ask the user before doing any of this)

1. [x] **Replace sql.js with plain JSON storage.** Converted storage to plain JSON in `localforage` under key `st_npc_tracker_data`. As approved by user for dev environment, migration was skipped and legacy `st_npc_tracker_sqlite_db` is automatically removed on init.sql.js runtime and WASM dependencies completely eliminated.
2. [x] **Delete dead code:**
   - Per-NPC `injection_position/depth/role` columns removed from NPC records.
   - `avatar` input and handling removed from `editor-modal.html` and `editor.js`.
   - `settings.defaultTemplate` removed from `index.js`.
   - Unused `extensionBaseUrl` parameter eliminated.
   - `src/contracts.js` removed.
   - Redundant `saveDatabaseNow()` removed from `executeModalDelete`.
3. [x] **One `DEFAULT_BLOCKS` constant.** Unified in `sqlite-store.js` and imported in `editor.js` and `chat-scanner.js`.
4. [x] **Template loading without cache-busting:** Use direct `fetch` without `?t=Date.now()` cache-busting in `index.js` and `editor.js` (`renderExtensionTemplateAsync` was evaluated but triggers Handlebars errors and global toasts on literal tokens like `{{name}}` and `{{npcs}}`).
5. [x] ~~**Exclude dev/docs/test files from release:**~~ *Reverted in R7: `.gitattributes` deleted, it has no effect on `git clone` installs.* Created `.gitattributes` with `export-ignore` for `GEMINI.md`, `.agents/`, `docs/`, `screenshots/`, `test/`, and `AUDIT.md`.

---

## Verification checklist (run after P0/P1)

The repo has no test harness, so verify in a running SillyTavern:

1. **S1:** import the exploit JSON from S1. Expected: the import is rejected with a validation error, and no alert appears after a reload.
2. **S2:** in the editor, create a custom block labelled `x" onfocus="alert(1)`, save, reopen and click the field. Expected: no alert, and the label displays literally.
3. **S3:** set a block value to `<script>hi</script> & <b>x</b>`, save, reopen and save again. Expected: the value is byte-identical.
4. **S4:** in DevTools → Network, reload. Expected: no requests to `cdn.jsdelivr.net`, and the extension works offline.
5. **B1:** with a fresh settings object, the scan request body contains the default extraction prompt.
6. **B3:** link one NPC to both the chat and global. Expected: the prompt preview shows it **once**.
7. **B4:** set depth 0 and position 0 (system prompt). Expected: they persist after a reload.
8. **B6:** trigger the manual scan twice quickly. Expected: no duplicate NPCs.

Add one runnable self-check for the import validator: a `validateImport(payload)` export plus a small `test/import.test.mjs` runnable with `node --test` (run it with no path argument). It should cover a valid payload, a bad `id`, a bad `scope_type`, and malformed `blocks_json`.

---

# Second audit (2026-10-15, uncommitted working tree on `staging`)

Scope: the P0/P1/P2 implementation above. The **original XSS sinks are fixed**. I re-checked every `.html(`, `innerHTML` and template-string sink, and all remaining ones escape correctly or use `.text()`/`.val()`. The CDN is gone, the silent API fallback is gone, and `node --test` passes 5/5. The items below are **new or incomplete**.

Findings marked *(proved)* were reproduced with a Node harness that stubs `SillyTavern` and `localforage`. SillyTavern API claims were checked against `SillyTavern/SillyTavern@release` (`public/scripts/st-context.js`, `public/lib.js`, `public/scripts/personas.js`).

Same rules as before: work in order, keep diffs minimal, tick the boxes, and log the work in `docs/STATE.md`.

### [x] R1 · HIGH (needs a user decision) · Existing users' data is deleted on update
- `src/db/sqlite-store.js:75-78`: `initDatabase` calls `localforage.removeItem('st_npc_tracker_sqlite_db')` on every load, with no migration. `manifest.json` has `auto_update: true`, so any existing user silently loses every NPC.
- `docs/STATE.md` says the user approved skipping migration for a dev environment. **Confirm with the user before relying on that.**
- **Fix (minimum):** delete the `removeItem` block, so the old data stays recoverable (a user can reinstall v0.1.0 and export). A real migration is optional. It would need sql.js loaded once, so only do it if the user asks.

### [x] R2 · MEDIUM · A failed read wipes the stored database
- `sqlite-store.js:89-92`: if `getItem` throws, `npcs = []` and init continues. The next create/edit/scan calls `scheduleSave()` and overwrites the stored data with the near-empty array.
- **Fix:** on a load error, set `let loadFailed = true`. Make `saveDatabaseNow` a no-op while it is set, and show a `toastr.error` saying data could not be loaded and changes won't be saved.

### [x] R3 · MEDIUM · Persona scope never matches (pre-existing; not fixed by B2)
- `resolveScopeTarget` (`sqlite-store.js:59-61`) reads `context.persona_selected || context.user_avatar`. **Neither exists on `getContext()`**, and `power_user.persona_selected` (used before the fix) doesn't exist in current ST either. The current persona is `export let user_avatar` in `public/scripts/personas.js`.
- Result: "Link persona" always warns "No active persona", and the persona default scope falls back to the chat.
- **Fix:**
  1. Move `resolveScopeTarget` to a new `src/scope.js` that does `import { user_avatar } from '../../../../personas.js'`. That path is relative to `/scripts/extensions/third-party/<ext>/src/`, so verify the URL resolves in the browser.
  2. Move `validateImport` (plus `UUID_REGEX` and `VALID_SCOPES`) to a dependency-free `src/db/validate.js`, so `node --test` keeps working without SillyTavern files.
  3. Update the imports in `sqlite-store.js`, `editor.js`, `chat-scanner.js`, `index.js` and `test/import.test.mjs`.

### [x] R4 · MEDIUM · Import validation is incomplete (S1 spec not fully met) *(proved)*
- `importDatabaseFromJson` falls back to `n.links` and `n.blocks` (`sqlite-store.js:552-553`), and **neither is validated**. A file using those keys bypasses the `scope_type`/`target_id` checks entirely; the harness stored a link with `scope_type: "evil"`.
- `validateImport` skips the string checks the spec required for `aliases`, `group_name`, `location_keywords` and `raw_content`. Importing `aliases: ["x"]` makes `syncPromptInjection()` throw `npc.aliases.toLowerCase is not a function` (proved). That breaks injection and the scanner (`findExistingNpc`) until the NPC is edited. If the setting-aware filter is on, it also aborts init before the event handlers are wired.
- No XSS results, because the sinks are fixed. This is a persistent DoS plus a validation bypass.
- **Fix:**
  - Delete the `n.links` and `n.blocks` fallbacks; accept only the `npc_links` / `blocks_json` format the exporter writes.
  - Add string checks (optional fields: `undefined`, `null` or string) for the four fields above.
  - Add tests for: a non-string `aliases`, and a payload with `npcs[].links` but no `npc_links` (the links must not be imported).

### [x] R5 · LOW · `$` patterns in NPC text corrupt the prompt *(proved)*
- `injection.js` `formatActiveNpcsPrompt` and the `{{name}}`… replacements in `renderNpcSheet` pass the NPC text as the **replacement string** to `String.replace`. So `$'`, `` $` ``, `$&` and `$1` inside LLM-written or imported text get expanded.
- Proved: name `Bob $' tail` with template `HEAD {{npcs}} TAIL` renders `HEAD ### NPC: Bob  TAIL tail TAIL`.
- **Fix:** use a function replacer everywhere: `.replace(re, () => value)`.

### [x] R6 · LOW · `DEFAULT_BLOCKS` and stored blocks are shared mutable references
- Import with no `blocks_json` stores `DEFAULT_BLOCKS` itself (`sqlite-store.js:552`). `getActiveContextNpcs` returns the live `npc.blocks` array (`:381`), and the scanner merge writes `mergedBlocks[i].value = …` into those objects (`chat-scanner.js:198`).
- Result: the scanner can write one NPC's appearance into `DEFAULT_BLOCKS`, so every NPC created afterwards starts pre-filled with it.
- **Fix:**
  - `export const DEFAULT_BLOCKS = Object.freeze([...].map(Object.freeze))`.
  - In the import, use `DEFAULT_BLOCKS.map((b) => ({ ...b }))`.
  - In `getActiveContextNpcs`, return `blocks.map((b) => ({ ...b }))`.

### [x] R7 · LOW · `.gitattributes` export-ignore has no effect
- SillyTavern installs extensions with `git clone`, which ignores `export-ignore`. This came from the first audit's P2-5 suggestion, which was mistaken.
- **Fix:** delete `.gitattributes`. The dev files are harmless to ship.

### [x] R8 · LOW · Use the documented localforage handle
- `sqlite-store.js` uses `window.localforage`, which is a backwards-compatibility shim (`initLibraryShims` in ST `public/lib.js`). If it's missing, saves silently do nothing.
- **Fix:** use `SillyTavern.libs.localforage`, as the original code did. Keep the Node test working by guarding with `typeof SillyTavern !== 'undefined'`.

### [x] R9 · DOCS · Inaccurate records
- `docs/STATE.md` (S4) and the S4 entry above claim `lib/sql-wasm.js` / `lib/sql-wasm.wasm` were added and checksummed. No `lib/` exists; sql.js was removed instead (P2-1). Correct both entries.
- `node --test test/` fails on Node 25 because a directory argument is treated as a file. Document the command as `node --test` (no argument), which auto-discovers `test/*.test.mjs`.

### Resolution notes (2026-10-15)
- **R1:** the user confirmed they approved skipping the migration. The `removeItem` call was still removed, so old SQLite data is left untouched and recoverable.
- **R3:** implemented differently from the plan above. `personas.js` is loaded with a dynamic `import()` inside `initDatabase`, not a new `src/scope.js`, so the Node tests still run without SillyTavern and no file split was needed. Path checked: resolves to `/scripts/personas.js`.
- **R2/R8:** verified with a harness. After a failed load, no writes happen and a toast is shown.
- **Tests:** `node --test` passes 8/8, including the new R4, R5 and R6 cases.

### Verification for this round
1. **R1:** set `st_npc_tracker_sqlite_db` in IndexedDB, reload. The key still exists.
2. **R2:** stub `getItem` to throw, create an NPC, reload with a working `getItem`. The original data is intact.
3. **R3:** select a persona and click "Link persona". The link is created, and the NPC injects only while that persona is active.
4. **R4, R5:** the new `node --test` cases pass.
5. **R6:** import an NPC without `blocks_json`, scan a chat that fills its appearance, then create a new NPC. Its blocks are empty.
