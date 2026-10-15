# DB Lane Directives (`src/db/`)

You are operating inside the **Database & Persistence Lane** (`src/db/`).

## Lane Boundaries & Permissions
- **Write Scope:** You have exclusive write permission inside `src/db/**`.
- **Prohibitions:**
  - DO NOT modify UI components (`src/ui/**`), scanner modules (`src/scanner/**`), or root files (`index.js`, `manifest.json`, `docs/STATE.md`).
  - DO NOT manipulate the DOM or import UI libraries.

## Storage & API Invariants
1. **Engine:** Pure client-side `sql.js` (WASM).
2. **IndexedDB Key:** Persist database binary exports via `SillyTavern.libs.localforage.setItem('st_npc_tracker_sqlite_db', data)`.
3. **Debounced Persistence:** All mutations MUST trigger `scheduleDatabaseSave()` (debounced at 500ms via `SillyTavern.libs.lodash`).
4. **Relational Schema:**
   - `npcs`: `id, name, aliases, avatar, template_mode, blocks_json, raw_content, injection_position, injection_depth, injection_role, created_at, updated_at`
   - `npc_links`: `id, npc_id, scope_type, target_id, relationship_summary, is_active, created_at`
5. **Export Interface:**
   - Provide clean, exported functions:
     - `initDatabase(extensionBaseUrl)`
     - `createNpc(npcData, links)`
     - `updateNpc(id, updates)`
     - `deleteNpc(id)`
     - `linkNpcScope(npcId, scopeType, targetId, relationshipSummary)`
     - `getActiveContextNpcs()`
     - `exportDatabaseToJson()`
     - `importDatabaseFromJson(jsonString)`
6. **Coordinator Hand-Off:**
   - In your final message, document all newly added or modified function signatures so the Coordinator Agent can wire them into `index.js`.