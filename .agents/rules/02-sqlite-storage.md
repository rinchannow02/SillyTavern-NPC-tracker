---
trigger: glob
globs: "src/db/**/*.js"
description: "Rules for in-browser SQLite (sql.js) persistence via SillyTavern localforage"
---
# SQLite & Persistence Rules

1. **Pure Client-Side Storage:** Use `sql.js` (WASM) in the browser. Persist the exported `Uint8Array` (`db.export()`) into IndexedDB using `SillyTavern.libs.localforage.setItem('st_npc_tracker_sqlite_db', data)`.
2. **Debounced Saves:** Wrap `db.export()` + `localforage.setItem()` in a `SillyTavern.libs.lodash.debounce(saveFn, 500)` helper so rapid block edits do not block the UI thread.
3. **Default Chat Linking:** Whenever `createNpc()` is called without explicit scope targets, automatically insert a row into `npc_links` with `scope_type = 'chat'` and `target_id = SillyTavern.getContext().chatId`.
4. **JSON Backup:** Always provide `exportDatabaseToJson()` and `importDatabaseFromJson()` methods so users can back up or migrate their NPC database outside of browser IndexedDB.
