/**
 * @file src/contracts.js
 * @description Shared type definitions and contracts for multi-agent lanes (db, ui, scanner).
 */

/**
 * @typedef {'chat' | 'character' | 'persona' | 'global'} NpcScopeType
 */

/**
 * @typedef {'basic' | 'template'} NpcTemplateMode
 */

/**
 * @typedef {Object} NpcBlock
 * @property {string} id Unique identifier for block (e.g. 'appearance', 'personality', 'custom_1')
 * @property {string} label Display label for the block
 * @property {'text' | 'textarea' | 'markdown'} type Input type
 * @property {string} value Block content
 */

/**
 * @typedef {Object} NpcLink
 * @property {number} [id] Auto-increment ID in sqlite
 * @property {string} npc_id Associated NPC UUID
 * @property {NpcScopeType} scope_type Scoping level
 * @property {string} target_id Chat ID, character avatar, or persona avatar
 * @property {string} [relationship_summary] Summary or notes regarding relationship
 * @property {number} [is_active] 1 if active, 0 if muted/inactive
 * @property {number} [created_at] Timestamp ms
 */

/**
 * @typedef {Object} NpcRecord
 * @property {string} id UUID
 * @property {string} name NPC name
 * @property {string} [aliases] Comma-separated trigger aliases
 * @property {string} [avatar] URL or path to avatar image
 * @property {NpcTemplateMode} [template_mode] 'basic' or 'template'
 * @property {string} [blocks_json] Serialized JSON string of NpcBlock[]
 * @property {NpcBlock[]} [blocks] Parsed blocks array
 * @property {string} [raw_content] Raw template markdown content if in template mode
 * @property {number} [injection_position] Injection position (0 = top, 1 = bottom, etc.)
 * @property {number} [injection_depth] Injection depth
 * @property {number} [injection_role] Role (0 = system, 1 = user, 2 = assistant)
 * @property {number} created_at Timestamp ms
 * @property {number} updated_at Timestamp ms
 * @property {NpcLink[]} [links] Optional array of associated links
 */

/**
 * @typedef {Object} NpcExtractionPayload
 * @property {string} name Extracted name
 * @property {string} [aliases]
 * @property {string} [appearance]
 * @property {string} [personality]
 * @property {string} [relationship]
 * @property {string} [scope_type] Target scope
 * @property {string} [target_id] Target ID
 */

export const CONTRACT_VERSION = '1.0.0';
