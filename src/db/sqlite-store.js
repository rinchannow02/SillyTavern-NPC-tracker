/**
 * @file src/db/sqlite-store.js
 * @description In-browser lightweight JSON persistence layer backed by SillyTavern's localforage.
 * Replaces the previous sql.js SQLite runtime with zero external dependencies and fast plain-JSON storage.
 */

const STORAGE_KEY = 'st_npc_tracker_data';
const MODULE_NAME = 'npc_tracker';

export const DEFAULT_BLOCKS = Object.freeze([
    { id: 'appearance', label: 'Appearance', type: 'text', value: '' },
    { id: 'personality', label: 'Personality', type: 'text', value: '' },
    { id: 'relationship', label: 'Relationship', type: 'text', value: '' },
].map(Object.freeze));

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SCOPES = new Set(['chat', 'character', 'persona', 'global']);
const TOMBSTONES_KEY = 'st_npc_tracker_tombstones';

let npcs = [];
let tombstones = {};
let saveTimer = null;
let loadFailed = false;
// ST's personas.js module, loaded in initDatabase. getContext() does not expose the active persona.
let personasModule = null;

function getLocalforage() {
    return typeof SillyTavern !== 'undefined' ? SillyTavern.libs?.localforage : null;
}

const copyBlocks = (blocks) => blocks.map((b) => ({ ...b }));

/**
 * Prunes tombstone entries older than 30 days and bounds dictionary size.
 * @param {Object} tb
 * @returns {Object}
 */
export function pruneTombstones(tb) {
    if (!tb || typeof tb !== 'object') return {};
    const maxAgeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
    const cutoff = Date.now() - maxAgeMs;
    const entries = Object.entries(tb)
        .filter(([_, ts]) => typeof ts === 'number' && ts > cutoff)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 500);
    return Object.fromEntries(entries);
}

export function getTombstones() {
    return { ...tombstones };
}

export function setTombstones(newTombstones = {}) {
    tombstones = pruneTombstones(newTombstones);
}

export function clearTombstones() {
    tombstones = {};
}

/**
 * Robustly parses a blocks_json string, returning an empty array on invalid or corrupt input.
 * @param {string|Array<Object>} s
 * @returns {Array<Object>}
 */
export function parseBlocks(s) {
    if (!s) return [];
    if (Array.isArray(s)) return s;
    try {
        const res = JSON.parse(s);
        return Array.isArray(res) ? res : [];
    } catch (_) {
        return [];
    }
}

/**
 * Resolves the scope target identifier for the given scope type and ST context.
 * Single source of truth across the extension.
 * @param {string} scopeType - 'chat', 'character', 'persona', or 'global'
 * @param {Object} context - SillyTavern context object
 * @returns {string} The target identifier string, or empty string if unavailable.
 */
export function resolveScopeTarget(scopeType, context) {
    if (!context && typeof SillyTavern !== 'undefined') {
        context = SillyTavern.getContext?.() || null;
    }
    if (!context) return scopeType === 'global' ? 'global' : '';

    if (scopeType === 'chat') {
        return String(context.chatId || '');
    }
    if (scopeType === 'character') {
        const char = context.characters?.[context.characterId];
        return char ? String(char.avatar || char.name || '') : '';
    }
    if (scopeType === 'persona') {
        return String(personasModule?.user_avatar || '');
    }
    if (scopeType === 'global') {
        return 'global';
    }
    return '';
}

/**
 * Merges local and server NPC collections cleanly without losing records created on either device.
 * Respects deletion tombstones so deleted NPCs do not resurrect across devices (H1).
 * For conflicting IDs, strictly newer updated_at timestamp wins; ties preserve local mutations (H2).
 * @param {Array<Object>} localList
 * @param {Array<Object>} serverList
 * @param {Object} [localTombstones={}]
 * @param {Object} [serverTombstones={}]
 * @returns {Array<Object>}
 */
export function mergeNpcCollections(localList = [], serverList = [], localTombstones = {}, serverTombstones = {}) {
    if (!Array.isArray(localList)) localList = [];
    if (!Array.isArray(serverList)) serverList = [];

    const mergedTombstones = {
        ...tombstones,
        ...(typeof localTombstones === 'object' && localTombstones !== null ? localTombstones : {}),
        ...(typeof serverTombstones === 'object' && serverTombstones !== null ? serverTombstones : {}),
    };

    // Collect any inline tombstones or deletion markers if present in collections
    for (const item of [...localList, ...serverList]) {
        if (!item || !item.id) continue;
        if (item.deleted_at || item.is_deleted) {
            const delTs = item.deleted_at || item.updated_at || Date.now();
            mergedTombstones[item.id] = Math.max(mergedTombstones[item.id] || 0, delTs);
        }
    }

    const map = new Map();

    const isRecordDeleted = (npc) => {
        const deletedAt = mergedTombstones[npc.id];
        if (!deletedAt) return false;
        const recordTs = npc.updated_at || npc.created_at || 0;
        return deletedAt >= recordTs;
    };

    for (const npc of localList) {
        if (!npc || !npc.id) continue;
        if (isRecordDeleted(npc)) continue;
        map.set(npc.id, npc);
    }

    for (const serverNpc of serverList) {
        if (!serverNpc || !serverNpc.id) continue;
        if (isRecordDeleted(serverNpc)) continue;

        if (!map.has(serverNpc.id)) {
            map.set(serverNpc.id, serverNpc);
        } else {
            const existing = map.get(serverNpc.id);
            const serverTs = serverNpc.updated_at || serverNpc.created_at || 0;
            const localTs = existing.updated_at || existing.created_at || 0;

            // Server wins only if strictly newer; local wins on ties
            if (serverTs > localTs) {
                map.set(serverNpc.id, serverNpc);
            }
        }
    }

    return Array.from(map.values()).sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}

/**
 * Initializes the database from localforage and/or SillyTavern server settings.
 * The legacy SQLite key (st_npc_tracker_sqlite_db) is left untouched so pre-JSON data stays recoverable.
 * @returns {Promise<boolean>}
 */
export async function initDatabase() {
    try {
        // Relative to /scripts/extensions/third-party/<ext>/src/db/ -> /scripts/personas.js
        personasModule = await import('../../../../../personas.js');
    } catch (err) {
        console.warn('[NPC Tracker] Could not load personas.js; persona scope disabled.', err);
    }

    const lf = getLocalforage();
    let localNpcs = [];
    let localTombstones = {};

    try {
        const raw = lf ? await lf.getItem(STORAGE_KEY) : null;
        localNpcs = Array.isArray(raw) ? raw : [];

        const rawTb = lf ? await lf.getItem(TOMBSTONES_KEY) : null;
        if (rawTb && typeof rawTb === 'object') {
            localTombstones = rawTb;
        }
    } catch (err) {
        // Never save over data we could not read.
        loadFailed = true;
        npcs = [];
        console.error('[NPC Tracker] Failed to load JSON database from localforage:', err);
        window.toastr?.error('NPC Tracker could not load its data. Changes will not be saved until reload.');
        return false;
    }

    // Server-sync check via SillyTavern context
    const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext?.() : null;
    const settings = context?.extensionSettings?.[MODULE_NAME];
    const isServerSync = settings ? settings.serverSync !== false : true;

    if (isServerSync && settings) {
        const serverNpcs = Array.isArray(settings.server_db) ? settings.server_db : [];
        const serverTombstones = (settings.server_tombstones && typeof settings.server_tombstones === 'object')
            ? settings.server_tombstones
            : {};

        tombstones = pruneTombstones({ ...localTombstones, ...serverTombstones });

        if (serverNpcs.length > 0 || localNpcs.length > 0) {
            npcs = mergeNpcCollections(localNpcs, serverNpcs, tombstones);

            // If local storage was empty or changed, update local cache
            if (lf) {
                try {
                    if (Object.keys(tombstones).length > 0) {
                        await lf.setItem(TOMBSTONES_KEY, tombstones);
                    }
                    await lf.setItem(STORAGE_KEY, npcs);
                } catch (err) {
                    console.warn('[NPC Tracker] Failed to update local cache during init:', err);
                }
            }

            // If server settings had no NPCs or was out of sync, update server settings
            settings.server_db = npcs;
            settings.server_tombstones = tombstones;
            settings.server_db_updated_at = Date.now();
            context.saveSettingsDebounced?.();
        } else {
            npcs = [];
        }
    } else {
        tombstones = pruneTombstones(localTombstones);
        npcs = localNpcs;
    }

    console.log(`[NPC Tracker] Database initialized with ${npcs.length} NPC(s) (Plain JSON engine, serverSync=${isServerSync}).`);
    return true;
}

/**
 * Schedules a debounced persistence write to localforage and server settings.
 */
function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveDatabaseNow();
    }, 300);
}

/**
 * Persists current NPC collection directly to localforage and optionally syncs to ST server settings.
 * @returns {Promise<void>}
 */
export async function saveDatabaseNow() {
    if (loadFailed) return;
    const lf = getLocalforage();

    // 1. Client cache (localforage)
    if (lf) {
        try {
            if (Object.keys(tombstones).length > 0) {
                await lf.setItem(TOMBSTONES_KEY, tombstones);
            }
            await lf.setItem(STORAGE_KEY, npcs);
        } catch (err) {
            console.error('[NPC Tracker] Failed to persist data to localforage:', err);
        }
    }

    // 2. Server settings sync (multi-device)
    try {
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext?.() : null;
        if (context?.extensionSettings?.[MODULE_NAME] && typeof context.saveSettingsDebounced === 'function') {
            const settings = context.extensionSettings[MODULE_NAME];
            const isServerSync = settings.serverSync !== false;
            if (isServerSync) {
                const serverNpcs = Array.isArray(settings.server_db) ? settings.server_db : [];
                const serverTombstones = (settings.server_tombstones && typeof settings.server_tombstones === 'object')
                    ? settings.server_tombstones
                    : {};
                // H3: Merge with server before setting to avoid clobbering newer server records
                tombstones = pruneTombstones({ ...tombstones, ...serverTombstones });
                npcs = mergeNpcCollections(npcs, serverNpcs, tombstones);

                settings.server_db = npcs;
                settings.server_tombstones = tombstones;
                settings.server_db_updated_at = Date.now();
                context.saveSettingsDebounced();
            }
        }
    } catch (err) {
        console.debug('[NPC Tracker] Server settings sync error:', err);
    }
}

/**
 * Normalizes a scope link object for consistent storage.
 * @param {Object} l
 * @param {number} [fallbackTimestamp]
 * @returns {Object}
 */
function normalizeLink(l, fallbackTimestamp = Date.now()) {
    return {
        scope_type: l.scope_type,
        target_id: String(l.target_id || ''),
        relationship_summary: String(l.relationship_summary ?? ''),
        is_active: l.is_active ?? 1,
        created_at: l.created_at || fallbackTimestamp,
    };
}

/**
 * Creates a new NPC record with embedded scope links.
 * @param {Object} [npcData]
 * @param {Array<Object>} [links]
 * @returns {string} The newly created NPC UUID.
 */
export function createNpc(npcData = {}, links = []) {
    const now = Date.now();
    const id = crypto.randomUUID();

    const blocks = npcData.blocks
        ? (Array.isArray(npcData.blocks) ? npcData.blocks : parseBlocks(npcData.blocks))
        : DEFAULT_BLOCKS.map((b) => ({ ...b }));

    const normalizedLinks = (links || []).map((l) => normalizeLink(l, now));

    const newNpc = {
        id,
        name: String(npcData.name || '').trim(),
        aliases: String(npcData.aliases || '').trim(),
        group_name: String(npcData.group_name || '').trim(),
        location_keywords: String(npcData.location_keywords || '').trim(),
        template_mode: npcData.template_mode === 'template' ? 'template' : 'basic',
        blocks,
        raw_content: String(npcData.raw_content || ''),
        links: normalizedLinks,
        created_at: now,
        updated_at: now,
    };

    npcs.push(newNpc);
    scheduleSave();
    return id;
}

/**
 * Updates an existing NPC record by UUID.
 * @param {string} id - NPC UUID.
 * @param {Object} [npcData] - Partial or complete NPC fields.
 * @param {Array<Object>|null} [links] - Optional links replacement array.
 * @returns {Object|null} The updated NPC record.
 */
export function updateNpc(id, npcData = {}, links = null) {
    const npc = npcs.find((n) => n.id === id);
    if (!npc) return null;

    if (npcData.name !== undefined) npc.name = String(npcData.name).trim();
    if (npcData.aliases !== undefined) npc.aliases = String(npcData.aliases).trim();
    if (npcData.group_name !== undefined) npc.group_name = String(npcData.group_name).trim();
    if (npcData.location_keywords !== undefined) npc.location_keywords = String(npcData.location_keywords).trim();
    if (npcData.template_mode !== undefined) npc.template_mode = npcData.template_mode === 'template' ? 'template' : 'basic';
    if (npcData.raw_content !== undefined) npc.raw_content = String(npcData.raw_content);

    if (npcData.blocks !== undefined) {
        npc.blocks = Array.isArray(npcData.blocks) ? npcData.blocks : parseBlocks(npcData.blocks);
    } else if (npcData.blocks_json !== undefined) {
        npc.blocks = parseBlocks(npcData.blocks_json);
    }

    if (Array.isArray(links)) {
        npc.links = links.map((l) => normalizeLink(l));
    }

    npc.updated_at = Date.now();
    scheduleSave();
    return getNpcById(id);
}

/**
 * Deletes an NPC record by UUID.
 * @param {string} id - NPC UUID.
 * @returns {boolean}
 */
export function deleteNpc(id) {
    const idx = npcs.findIndex((n) => n.id === id);
    if (idx !== -1) {
        npcs.splice(idx, 1);
        tombstones[id] = Date.now();
        scheduleSave();
        return true;
    }
    return false;
}

/**
 * Retrieves a single NPC by UUID including parsed blocks and attached scopes.
 * @param {string} id - NPC UUID.
 * @returns {Object|null}
 */
export function getNpcById(id) {
    const npc = npcs.find((n) => n.id === id);
    if (!npc) return null;

    const blocks = Array.isArray(npc.blocks) ? npc.blocks.map((b) => ({ ...b })) : parseBlocks(npc.blocks_json);
    return {
        ...npc,
        blocks,
        links: (npc.links || []).map((l) => ({ ...l })),
    };
}

/**
 * Links an NPC to a target scope or updates existing link relationship / active state.
 * @param {string} npcId
 * @param {'chat'|'character'|'persona'|'global'} scopeType
 * @param {string} targetId
 * @param {string} [relationshipSummary='']
 * @param {number|boolean} [isActive=1]
 */
export function linkNpcScope(npcId, scopeType, targetId, relationshipSummary = '', isActive = 1) {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc) return;

    if (!Array.isArray(npc.links)) npc.links = [];
    const targetStr = String(targetId);
    const existing = npc.links.find((l) => l.scope_type === scopeType && String(l.target_id) === targetStr);

    if (existing) {
        existing.relationship_summary = String(relationshipSummary || '');
        existing.is_active = isActive ? 1 : 0;
    } else {
        npc.links.push(normalizeLink({
            scope_type: scopeType,
            target_id: targetStr,
            relationship_summary: relationshipSummary,
            is_active: isActive ? 1 : 0,
        }));
    }

    npc.updated_at = Date.now();
    scheduleSave();
}

/**
 * Removes a scope linkage from an NPC.
 * @param {string} npcId
 * @param {'chat'|'character'|'persona'|'global'} scopeType
 * @param {string} targetId
 */
export function unlinkNpcScope(npcId, scopeType, targetId) {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc || !Array.isArray(npc.links)) return;

    const targetStr = String(targetId);
    npc.links = npc.links.filter((l) => !(l.scope_type === scopeType && String(l.target_id) === targetStr));
    npc.updated_at = Date.now();
    scheduleSave();
}

/**
 * Retrieves all scope links for a specific NPC.
 * @param {string} npcId
 * @returns {Array<Object>}
 */
export function getNpcScopes(npcId) {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc || !Array.isArray(npc.links)) return [];
    return npc.links.map((l) => ({ ...l }));
}

/**
 * Sets the active/inactive status of a scope link.
 * @param {string} npcId
 * @param {'chat'|'character'|'persona'|'global'} scopeType
 * @param {string} targetId
 * @param {boolean|number} isActive
 */
export function setNpcScopeStatus(npcId, scopeType, targetId, isActive) {
    const npc = npcs.find((n) => n.id === npcId);
    if (!npc || !Array.isArray(npc.links)) return;

    const targetStr = String(targetId);
    const link = npc.links.find((l) => l.scope_type === scopeType && String(l.target_id) === targetStr);
    if (link) {
        link.is_active = isActive ? 1 : 0;
        npc.updated_at = Date.now();
        scheduleSave();
    }
}

/**
 * Retrieves a distinct list of group names currently in the database.
 * @returns {string[]}
 */
export function getNpcGroups() {
    const groups = new Set();
    for (const npc of npcs) {
        if (npc.group_name && String(npc.group_name).trim()) {
            groups.add(String(npc.group_name).trim());
        }
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
}

/**
 * Retrieves hierarchical group and sub-group structure derived from slash-delimited group_name values.
 * @returns {Array<{ name: string, subGroups: string[] }>}
 */
export function getNpcGroupHierarchy() {
    const flatGroups = getNpcGroups();
    const tree = new Map();

    for (const raw of flatGroups) {
        const parts = raw.split('/').map((s) => s.trim()).filter(Boolean);
        if (parts.length === 0) continue;

        const parent = parts[0];
        if (!tree.has(parent)) {
            tree.set(parent, new Set());
        }

        if (parts.length > 1) {
            const sub = parts.slice(1).join(' / ');
            tree.get(parent).add(sub);
        }
    }

    const result = [];
    for (const [parent, subSet] of tree.entries()) {
        result.push({
            name: parent,
            subGroups: Array.from(subSet).sort((a, b) => a.localeCompare(b)),
        });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Counts how many NPCs belong to a group or sub-group.
 * @param {string} targetPath
 * @param {boolean} [isSubGroup=false]
 * @returns {number}
 */
export function countNpcsInGroup(targetPath, isSubGroup = false) {
    if (!targetPath || typeof targetPath !== 'string') return 0;
    const cleanPath = targetPath.trim();
    if (!cleanPath) return 0;

    let count = 0;
    for (const npc of npcs) {
        if (!npc.group_name || typeof npc.group_name !== 'string') continue;
        const current = npc.group_name.trim();
        if (current === cleanPath || current.startsWith(`${cleanPath} /`)) {
            count++;
        }
    }
    return count;
}

/**
 * Deletes a group or sub-group from all NPCs in the database.
 * @param {string} targetPath - e.g. "Accounting Department" or "Mirai Industries IT / Cybersecurity Division"
 * @param {boolean} [isSubGroup=false]
 * @returns {number} Number of NPCs modified
 */
export function deleteGroup(targetPath, isSubGroup = false) {
    if (!targetPath || typeof targetPath !== 'string') return 0;
    const cleanPath = targetPath.trim();
    if (!cleanPath) return 0;

    let affectedCount = 0;

    for (const npc of npcs) {
        if (!npc.group_name || typeof npc.group_name !== 'string') continue;
        const current = npc.group_name.trim();

        if (isSubGroup) {
            if (current === cleanPath) {
                const parts = cleanPath.split('/').map((s) => s.trim()).filter(Boolean);
                npc.group_name = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '';
                npc.updated_at = Date.now();
                affectedCount++;
            } else if (current.startsWith(`${cleanPath} /`)) {
                const parts = cleanPath.split('/').map((s) => s.trim()).filter(Boolean);
                const parent = parts.slice(0, -1).join(' / ');
                const rest = current.slice(cleanPath.length + 3).trim();
                npc.group_name = parent ? `${parent} / ${rest}` : rest;
                npc.updated_at = Date.now();
                affectedCount++;
            }
        } else {
            if (current === cleanPath || current.startsWith(`${cleanPath} /`)) {
                npc.group_name = '';
                npc.updated_at = Date.now();
                affectedCount++;
            }
        }
    }

    if (affectedCount > 0) {
        scheduleSave();
    }

    return affectedCount;
}

/**
 * Retrieves all NPCs linked to the active context (chatId, character, persona, or global).
 * Deduplicates multiple links using priority: chat > character > persona > global.
 * @param {Object} [customContext]
 * @returns {Array<Object>}
 */
export function getActiveContextNpcs(customContext) {
    const context = customContext || (typeof SillyTavern !== 'undefined' ? SillyTavern.getContext?.() : null);
    if (!context) return [];

    const activeTargets = {
        chat: resolveScopeTarget('chat', context),
        character: resolveScopeTarget('character', context),
        persona: resolveScopeTarget('persona', context),
        global: 'global',
    };

    const scopePriority = {
        chat: 4,
        character: 3,
        persona: 2,
        global: 1,
    };

    const matchedNpcs = [];

    for (const npc of npcs) {
        if (!Array.isArray(npc.links) || npc.links.length === 0) continue;

        let bestLink = null;
        let bestPriority = 0;

        for (const link of npc.links) {
            if (!link.is_active) continue;

            const expectedTarget = activeTargets[link.scope_type];
            if (!expectedTarget) continue;

            if (String(link.target_id) === String(expectedTarget)) {
                const priority = scopePriority[link.scope_type] || 0;
                if (priority > bestPriority) {
                    bestPriority = priority;
                    bestLink = link;
                }
            }
        }

        if (bestLink) {
            const blocks = copyBlocks(Array.isArray(npc.blocks) ? npc.blocks : parseBlocks(npc.blocks_json));
            matchedNpcs.push({
                ...npc,
                relationship_summary: bestLink.relationship_summary || '',
                scope_type: bestLink.scope_type,
                blocks,
            });
        }
    }

    return matchedNpcs;
}

/**
 * Exports the entire database to a JSON string.
 * Flattens embedded links into an npc_links array for backward-compatible backup format.
 * @returns {string}
 */
export function exportDatabaseToJson() {
    const exportedNpcs = npcs.map((n) => ({
        id: n.id,
        name: n.name || '',
        aliases: n.aliases || '',
        group_name: n.group_name || '',
        location_keywords: n.location_keywords || '',
        template_mode: n.template_mode || 'basic',
        blocks_json: JSON.stringify(n.blocks || []),
        raw_content: n.raw_content || '',
        created_at: n.created_at || Date.now(),
        updated_at: n.updated_at || Date.now(),
    }));

    let linkIdCounter = 1;
    const exportedLinks = [];
    for (const n of npcs) {
        if (Array.isArray(n.links)) {
            for (const l of n.links) {
                exportedLinks.push({
                    id: linkIdCounter++,
                    npc_id: n.id,
                    scope_type: l.scope_type,
                    target_id: String(l.target_id),
                    relationship_summary: l.relationship_summary || '',
                    is_active: l.is_active ?? 1,
                    created_at: l.created_at || Date.now(),
                });
            }
        }
    }

    const payload = {
        version: 1,
        exported_at: new Date().toISOString(),
        npcs: exportedNpcs,
        npc_links: exportedLinks,
    };

    return JSON.stringify(payload, null, 2);
}

/**
 * Validates an import payload before applying it.
 * Throws a descriptive Error if the payload is malformed or invalid.
 * @param {any} payload
 */
export function validateImport(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid import payload: expected an object.');
    }

    if (!Array.isArray(payload.npcs)) {
        throw new Error('Invalid import payload: "npcs" must be an array.');
    }

    for (const [i, n] of payload.npcs.entries()) {
        if (!n || typeof n !== 'object') {
            throw new Error(`Invalid NPC at index ${i}: must be an object.`);
        }
        if (typeof n.id !== 'string' || !UUID_REGEX.test(n.id)) {
            throw new Error(`Invalid NPC id "${n.id}" at index ${i}: must match UUID format.`);
        }
        if (typeof n.name !== 'string' || !n.name.trim()) {
            throw new Error(`Invalid NPC name at index ${i}: must be a non-empty string.`);
        }
        for (const key of ['aliases', 'group_name', 'location_keywords', 'raw_content']) {
            if (n[key] !== undefined && n[key] !== null && typeof n[key] !== 'string') {
                throw new Error(`Invalid NPC ${key} at index ${i}: must be a string.`);
            }
        }
        if (n.template_mode !== undefined && n.template_mode !== null && !['basic', 'template'].includes(n.template_mode)) {
            throw new Error(`Invalid NPC template_mode "${n.template_mode}" at index ${i}: must be 'basic' or 'template'.`);
        }
        if (n.blocks_json !== undefined && n.blocks_json !== null) {
            let parsed;
            try {
                parsed = JSON.parse(n.blocks_json);
            } catch (err) {
                throw new Error(`Malformed NPC blocks_json at index ${i}: ${err.message}`);
            }
            if (!Array.isArray(parsed)) {
                throw new Error(`Invalid NPC blocks_json at index ${i}: must parse to an array.`);
            }
            for (const [bi, b] of parsed.entries()) {
                if (
                    !b ||
                    typeof b !== 'object' ||
                    typeof b.id !== 'string' ||
                    typeof b.label !== 'string' ||
                    typeof b.value !== 'string'
                ) {
                    throw new Error(`Invalid block at index ${bi} in NPC ${n.id}: expected {id:string, label:string, value:string}.`);
                }
            }
        }
    }

    if (payload.npc_links !== undefined && payload.npc_links !== null) {
        if (!Array.isArray(payload.npc_links)) {
            throw new Error('Invalid import payload: "npc_links" must be an array.');
        }
        for (const [i, l] of payload.npc_links.entries()) {
            if (!l || typeof l !== 'object') {
                throw new Error(`Invalid link at index ${i}: must be an object.`);
            }
            if (typeof l.npc_id !== 'string' || !UUID_REGEX.test(l.npc_id)) {
                throw new Error(`Invalid link npc_id at index ${i}: must match UUID format.`);
            }
            if (typeof l.scope_type !== 'string' || !VALID_SCOPES.has(l.scope_type)) {
                throw new Error(`Invalid link scope_type "${l.scope_type}" at index ${i}: must be one of chat, character, persona, global.`);
            }
            if (typeof l.target_id !== 'string') {
                throw new Error(`Invalid link target_id at index ${i}: must be a string.`);
            }
            if (l.relationship_summary !== undefined && l.relationship_summary !== null && typeof l.relationship_summary !== 'string') {
                throw new Error(`Invalid link relationship_summary at index ${i}: must be a string.`);
            }
        }
    }
}

/**
 * Imports NPCs and links from a JSON backup string.
 * @param {string} jsonString
 * @returns {Promise<{npcsImported: number, linksImported: number}>}
 */
export async function importDatabaseFromJson(jsonString) {
    let payload;
    try {
        payload = JSON.parse(jsonString);
    } catch (err) {
        throw new Error(`JSON parse error: ${err.message}`);
    }

    validateImport(payload);

    // Group links by npc_id
    const linksByNpcId = new Map();
    if (Array.isArray(payload.npc_links)) {
        for (const l of payload.npc_links) {
            if (!linksByNpcId.has(l.npc_id)) {
                linksByNpcId.set(l.npc_id, []);
            }
            linksByNpcId.get(l.npc_id).push(normalizeLink(l));
        }
    }

    let npcsImported = 0;
    for (const n of payload.npcs) {
        // Only the exporter's format (blocks_json + npc_links) is accepted; both are validated above.
        const parsedBlocks = n.blocks_json ? parseBlocks(n.blocks_json) : copyBlocks(DEFAULT_BLOCKS);
        const importedLinks = linksByNpcId.get(n.id) || [];

        const existingIdx = npcs.findIndex((item) => item.id === n.id);
        const npcObj = {
            id: n.id,
            name: n.name.trim(),
            aliases: n.aliases || '',
            group_name: n.group_name || '',
            location_keywords: n.location_keywords || '',
            template_mode: n.template_mode || 'basic',
            blocks: parsedBlocks,
            raw_content: n.raw_content || '',
            links: importedLinks,
            created_at: n.created_at || Date.now(),
            updated_at: n.updated_at || Date.now(),
        };

        if (existingIdx !== -1) {
            npcs[existingIdx] = npcObj;
        } else {
            npcs.push(npcObj);
        }
        npcsImported++;
    }

    await saveDatabaseNow();

    return {
        npcsImported,
        linksImported: (payload.npc_links || []).length,
    };
}
