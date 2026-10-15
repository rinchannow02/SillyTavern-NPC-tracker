/**
 * @file src/db/sqlite-store.js
 * @description In-browser SQLite (sql.js) persistence layer backed by SillyTavern's localforage.
 */

const STORAGE_KEY = 'st_npc_tracker_sqlite_db';
const SQLJS_CDN_BASE = 'https://cdn.jsdelivr.net/npm/sql.js@1.11.0/dist';

let SQL = null;
let db = null;
let debouncedSave = null;

/**
 * Dynamically loads sql.js WASM runtime if not already present on window.
 * @param {string} [extensionBaseUrl] - Base URL of this extension folder.
 * @returns {Promise<any>} The initialized SQL namespace.
 */
async function loadSqlJsRuntime(extensionBaseUrl) {
    if (window.initSqlJs) {
        return window.initSqlJs({
            locateFile: (file) => `${SQLJS_CDN_BASE}/${file}`,
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${SQLJS_CDN_BASE}/sql-wasm.js`;
        script.async = true;
        script.onload = async () => {
            try {
                if (!window.initSqlJs) {
                    throw new Error('window.initSqlJs not found after script load.');
                }
                const sqlInstance = await window.initSqlJs({
                    locateFile: (file) => `${SQLJS_CDN_BASE}/${file}`,
                });
                resolve(sqlInstance);
            } catch (err) {
                reject(err);
            }
        };
        script.onerror = () => reject(new Error(`Failed to load sql-wasm.js from ${script.src}`));
        document.head.appendChild(script);
    });
}

/**
 * Creates the core relational schema if tables do not exist yet.
 */
function initializeSchema() {
    db.run(`
        CREATE TABLE IF NOT EXISTS npcs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            aliases TEXT DEFAULT '',
            avatar TEXT DEFAULT '',
            template_mode TEXT DEFAULT 'basic',
            blocks_json TEXT DEFAULT '[]',
            raw_content TEXT DEFAULT '',
            injection_position INTEGER DEFAULT 1,
            injection_depth INTEGER DEFAULT 4,
            injection_role INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS npc_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            npc_id TEXT NOT NULL,
            scope_type TEXT NOT NULL CHECK(scope_type IN ('chat', 'character', 'persona', 'global')),
            target_id TEXT NOT NULL,
            relationship_summary TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (npc_id) REFERENCES npcs(id) ON DELETE CASCADE,
            UNIQUE(npc_id, scope_type, target_id)
        );

        CREATE INDEX IF NOT EXISTS idx_npc_links_lookup
        ON npc_links(scope_type, target_id, is_active);
    `);
}

/**
 * Immediately serializes the SQLite database to a Uint8Array and saves to IndexedDB.
 * @returns {Promise<void>}
 */
export async function saveDatabaseNow() {
    if (!db) return;
    const { localforage } = SillyTavern.libs;
    const binaryArray = db.export();
    await localforage.setItem(STORAGE_KEY, binaryArray);
}

/**
 * Schedules a debounced save (500ms) using SillyTavern's bundled lodash.
 */
export function scheduleDatabaseSave() {
    if (!debouncedSave) {
        const { lodash } = SillyTavern.libs;
        debouncedSave = lodash.debounce(async () => {
            try {
                await saveDatabaseNow();
            } catch (err) {
                console.error('[NPC Tracker] Failed to persist SQLite DB to localforage:', err);
            }
        }, 500);
    }
    debouncedSave();
}

/**
 * Initializes the SQLite database from IndexedDB or creates a fresh instance.
 * @param {string} [extensionBaseUrl]
 * @returns {Promise<any>} The sql.js Database instance.
 */
export async function initDatabase(extensionBaseUrl) {
    if (db) return db;

    const { localforage } = SillyTavern.libs;
    SQL = await loadSqlJsRuntime(extensionBaseUrl);

    const savedBinary = await localforage.getItem(STORAGE_KEY);
    if (savedBinary && savedBinary instanceof Uint8Array) {
        db = new SQL.Database(savedBinary);
        console.log('[NPC Tracker] Restored SQLite database from localforage.');
    } else if (savedBinary && savedBinary.buffer) {
        db = new SQL.Database(new Uint8Array(savedBinary.buffer));
        console.log('[NPC Tracker] Restored SQLite database from ArrayBuffer.');
    } else {
        db = new SQL.Database();
        console.log('[NPC Tracker] Created new in-memory SQLite database.');
    }

    db.run('PRAGMA foreign_keys = ON;');
    initializeSchema();
    await saveDatabaseNow();

    return db;
}

/**
 * Helper to execute a SELECT query and return an array of row objects.
 * @param {string} sql
 * @param {Array<any>} params
 * @returns {Array<Record<string, any>>}
 */
export function queryAll(sql, params = []) {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/**
 * Retrieves a single NPC by ID, including its associated links and parsed blocks.
 * @param {string} id - The NPC UUID.
 * @returns {Object|null}
 */
export function getNpcById(id) {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');
    const rows = queryAll('SELECT * FROM npcs WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) return null;

    const npc = rows[0];
    const links = queryAll('SELECT * FROM npc_links WHERE npc_id = ? ORDER BY id ASC', [id]);
    return {
        ...npc,
        blocks: JSON.parse(npc.blocks_json || '[]'),
        links,
    };
}

/**
 * Creates a new NPC and links it to the current Chat by default (unless explicit links are passed).
 * @param {Object} npcData
 * @param {string} [npcData.name]
 * @param {string} [npcData.aliases]
 * @param {string} [npcData.avatar]
 * @param {'basic'|'template'} [npcData.template_mode]
 * @param {Array<Object>} [npcData.blocks]
 * @param {string} [npcData.raw_content]
 * @param {number} [npcData.injection_position]
 * @param {number} [npcData.injection_depth]
 * @param {number} [npcData.injection_role]
 * @param {Array<{scope_type: string, target_id: string, relationship_summary?: string}>} [links]
 * @returns {string} The newly created NPC UUID.
 */
export function createNpc(npcData = {}, links = []) {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');

    const context = SillyTavern.getContext();
    const now = Date.now();
    const id = crypto.randomUUID();

    const defaultBlocks = npcData.blocks ?? [
        { id: 'appearance', label: 'Appearance', type: 'text', value: '' },
        { id: 'personality', label: 'Personality', type: 'text', value: '' },
        { id: 'relationship', label: 'Relationship', type: 'text', value: '' },
    ];

    db.run(
        `INSERT INTO npcs (
            id, name, aliases, avatar, template_mode, blocks_json, raw_content,
            injection_position, injection_depth, injection_role, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            npcData.name || 'Unnamed NPC',
            npcData.aliases || '',
            npcData.avatar || '',
            npcData.template_mode || 'basic',
            JSON.stringify(defaultBlocks),
            npcData.raw_content || '',
            npcData.injection_position ?? 1,
            npcData.injection_depth ?? 4,
            npcData.injection_role ?? 0,
            now,
            now,
        ]
    );

    // Default Scope Invariant: Attach to current chat if no explicit links provided
    const effectiveLinks = links.length > 0
        ? links
        : (context.chatId ? [{ scope_type: 'chat', target_id: String(context.chatId), relationship_summary: '' }] : []);

    for (const link of effectiveLinks) {
        db.run(
            `INSERT OR IGNORE INTO npc_links (
                npc_id, scope_type, target_id, relationship_summary, is_active, created_at
            ) VALUES (?, ?, ?, ?, 1, ?)`,
            [id, link.scope_type, String(link.target_id), link.relationship_summary || '', now]
        );
    }

    scheduleDatabaseSave();
    return id;
}

/**
 * Updates an existing NPC's fields.
 * @param {string} id - The NPC UUID.
 * @param {Object} updates - Key/value pairs to update.
 */
export function updateNpc(id, updates = {}) {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');

    const fields = [];
    const values = [];

    const allowedKeys = [
        'name',
        'aliases',
        'avatar',
        'template_mode',
        'raw_content',
        'injection_position',
        'injection_depth',
        'injection_role',
    ];

    for (const key of allowedKeys) {
        if (updates[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(updates[key]);
        }
    }

    if (updates.blocks !== undefined) {
        fields.push('blocks_json = ?');
        values.push(JSON.stringify(updates.blocks));
    } else if (updates.blocks_json !== undefined) {
        fields.push('blocks_json = ?');
        values.push(updates.blocks_json);
    }

    if (fields.length === 0) return;

    const now = Date.now();
    fields.push('updated_at = ?');
    values.push(now);

    values.push(id);
    db.run(`UPDATE npcs SET ${fields.join(', ')} WHERE id = ?`, values);
    scheduleDatabaseSave();
}

/**
 * Deletes an NPC and all its associated links.
 * @param {string} id - The NPC UUID.
 */
export function deleteNpc(id) {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');
    db.run('DELETE FROM npc_links WHERE npc_id = ?', [id]);
    db.run('DELETE FROM npcs WHERE id = ?', [id]);
    scheduleDatabaseSave();
}

/**
 * Links an NPC to a specific scope (chat, character, persona, global).
 * @param {string} npcId
 * @param {string} scopeType
 * @param {string} targetId
 * @param {string} [relationshipSummary]
 */
export function linkNpcScope(npcId, scopeType, targetId, relationshipSummary = '') {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');
    const now = Date.now();
    db.run(
        `INSERT OR REPLACE INTO npc_links (
            npc_id, scope_type, target_id, relationship_summary, is_active, created_at
        ) VALUES (?, ?, ?, ?, 1, ?)`,
        [npcId, scopeType, String(targetId), relationshipSummary, now]
    );
    scheduleDatabaseSave();
}

/**
 * Unlinks an NPC from a specific scope.
 * @param {string} npcId
 * @param {string} scopeType
 * @param {string} targetId
 */
export function unlinkNpcScope(npcId, scopeType, targetId) {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');
    db.run(
        `DELETE FROM npc_links WHERE npc_id = ? AND scope_type = ? AND target_id = ?`,
        [npcId, scopeType, String(targetId)]
    );
    scheduleDatabaseSave();
}

/**
 * Retrieves all NPCs linked to the currently active Chat, Character, Persona, or Global scope.
 * @returns {Array<Object>}
 */
export function getActiveContextNpcs() {
    const context = SillyTavern.getContext();
    const chatId = context.chatId ? String(context.chatId) : '';
    const characterAvatar = context.characterId !== undefined && context.characters?.[context.characterId]
        ? String(context.characters[context.characterId].avatar)
        : '';
    const personaAvatar = context.powerUserSettings?.persona_selected || '';

    const rows = queryAll(
        `SELECT DISTINCT n.*, l.scope_type, l.target_id, l.relationship_summary
         FROM npcs n
         JOIN npc_links l ON n.id = l.npc_id
         WHERE l.is_active = 1
           AND (
               (l.scope_type = 'chat' AND l.target_id = ?)
               OR (l.scope_type = 'character' AND l.target_id = ?)
               OR (l.scope_type = 'persona' AND l.target_id = ?)
               OR (l.scope_type = 'global')
           )
         ORDER BY n.updated_at DESC`,
        [chatId, characterAvatar, personaAvatar]
    );

    return rows.map((row) => ({
        ...row,
        blocks: JSON.parse(row.blocks_json || '[]'),
    }));
}

/**
 * Exports the entire SQLite database (npcs + npc_links) as a portable JSON string.
 * @returns {string}
 */
export function exportDatabaseToJson() {
    const npcs = queryAll('SELECT * FROM npcs ORDER BY created_at ASC');
    const links = queryAll('SELECT * FROM npc_links ORDER BY id ASC');
    return JSON.stringify(
        {
            version: 1,
            exported_at: new Date().toISOString(),
            npcs,
            npc_links: links,
        },
        null,
        2
    );
}

/**
 * Imports NPCs and links from a JSON backup string (merges via INSERT OR REPLACE).
 * @param {string} jsonString
 * @returns {Promise<{npcsImported: number, linksImported: number}>}
 */
export async function importDatabaseFromJson(jsonString) {
    if (!db) throw new Error('[NPC Tracker] Database not initialized.');
    const payload = JSON.parse(jsonString);
    if (!payload || !Array.isArray(payload.npcs)) {
        throw new Error('Invalid NPC Tracker backup JSON format.');
    }

    db.run('BEGIN TRANSACTION;');
    try {
        for (const n of payload.npcs) {
            db.run(
                `INSERT OR REPLACE INTO npcs (
                    id, name, aliases, avatar, template_mode, blocks_json, raw_content,
                    injection_position, injection_depth, injection_role, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    n.id,
                    n.name,
                    n.aliases ?? '',
                    n.avatar ?? '',
                    n.template_mode ?? 'basic',
                    n.blocks_json ?? '[]',
                    n.raw_content ?? '',
                    n.injection_position ?? 1,
                    n.injection_depth ?? 4,
                    n.injection_role ?? 0,
                    n.created_at ?? Date.now(),
                    n.updated_at ?? Date.now(),
                ]
            );
        }

        if (Array.isArray(payload.npc_links)) {
            for (const l of payload.npc_links) {
                db.run(
                    `INSERT OR REPLACE INTO npc_links (
                        npc_id, scope_type, target_id, relationship_summary, is_active, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        l.npc_id,
                        l.scope_type,
                        String(l.target_id),
                        l.relationship_summary ?? '',
                        l.is_active ?? 1,
                        l.created_at ?? Date.now(),
                    ]
                );
            }
        }
        db.run('COMMIT;');
    } catch (err) {
        db.run('ROLLBACK;');
        throw err;
    }

    await saveDatabaseNow();
    return {
        npcsImported: payload.npcs.length,
        linksImported: Array.isArray(payload.npc_links) ? payload.npc_links.length : 0,
    };
}
