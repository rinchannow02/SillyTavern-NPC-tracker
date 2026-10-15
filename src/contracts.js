/**
 * @file src/contracts.js
 * @description Shared type definitions and contracts for multi-agent lanes (db, ui, scanner).
 * This file is Coordinator-Only and serves as the single source of truth for Milestones 2–4.
 */

/**
 * @typedef {'chat' | 'character' | 'persona' | 'global'} NpcScopeType
 */

/**
 * @typedef {'basic' | 'template'} NpcTemplateMode
 */

/**
 * @typedef {Object} NpcBlock
 * @property {string} id Unique identifier for block (e.g. 'appearance', 'personality', 'relationship', or custom block ID)
 * @property {string} label Display label for the block
 * @property {'text' | 'textarea' | 'markdown'} type Input type
 * @property {string} value Block content
 */

/**
 * @typedef {Object} NpcScopeLink
 * @property {number} [id] Auto-increment ID in sqlite
 * @property {string} npc_id Associated NPC UUID
 * @property {NpcScopeType} scope_type Scoping level ('chat', 'character', 'persona', 'global')
 * @property {string} target_id Chat ID, character avatar, persona avatar, or 'global'
 * @property {string} [relationship_summary] Summary or notes regarding relationship/affinity
 * @property {number} [is_active] 1 if active, 0 if muted/inactive
 * @property {number} [created_at] Timestamp ms
 */

/**
 * @typedef {Object} NpcRecord
 * @property {string} id UUID primary key
 * @property {string} name NPC name
 * @property {string} [aliases] Comma-separated trigger aliases
 * @property {string} [avatar] URL or path to avatar image
 * @property {string} [group_name] Optional sub-group or faction (e.g. 'Silvermoon Tavern', 'Royal Guard')
 * @property {string} [location_keywords] Comma-separated setting/location trigger keywords
 * @property {NpcTemplateMode} [template_mode] 'basic' or 'template'
 * @property {string} [blocks_json] Serialized JSON string of NpcBlock[]
 * @property {NpcBlock[]} [blocks] Parsed blocks array
 * @property {string} [raw_content] Raw template markdown content if in template mode
 * @property {number} [injection_position] Injection position (0 = top, 1 = bottom, etc.)
 * @property {number} [injection_depth] Injection depth in chat context
 * @property {number} [injection_role] Role (0 = system, 1 = user, 2 = assistant)
 * @property {number} created_at Timestamp ms
 * @property {number} updated_at Timestamp ms
 * @property {NpcScopeLink[]} [links] Optional array of associated links
 */

/**
 * @typedef {Object} ScannerConfig
 * @property {boolean} enabled Whether automated/manual scanning is enabled
 * @property {string} connectionProfileId Specific SillyTavern Connection Profile ID (empty = active ST API)
 * @property {number} scanDepth Number of recent chat messages to analyze (default: 10)
 * @property {'manual' | 'every_n_messages' | 'on_keyword'} triggerMode Trigger mechanism
 * @property {number} everyNMessages Trigger interval if triggerMode is 'every_n_messages'
 * @property {string[]} [keywords] Keywords to watch if triggerMode is 'on_keyword'
 * @property {'create_new_only' | 'merge_existing' | 'ask_before_apply'} updateMode Handling strategy for extracted NPCs
 * @property {string} customPrompt User-defined entity extraction prompt
 * @property {string} [outputTemplate] Optional custom JSON schema / markdown output template
 */

/**
 * @typedef {Object} NpcExtractionPayload
 * @property {string} name Extracted name
 * @property {string} [aliases]
 * @property {string} [appearance]
 * @property {string} [personality]
 * @property {string} [relationship]
 * @property {NpcScopeType} [scope_type] Target scope
 * @property {string} [target_id] Target ID
 */

/**
 * Expected Interface Contract for Database Operations (`src/db/sqlite-store.js`)
 * @typedef {Object} IDatabaseStore
 * @property {(extensionBaseUrl?: string) => Promise<any>} initDatabase
 * @property {() => Promise<void>} saveDatabaseNow
 * @property {() => void} scheduleDatabaseSave
 * @property {(npcData: Partial<NpcRecord>, links?: Partial<NpcScopeLink>[]) => string} createNpc
 * @property {(id: string, updates: Partial<NpcRecord>) => void} updateNpc
 * @property {(id: string) => void} deleteNpc
 * @property {(id: string) => NpcRecord | null} getNpcById
 * @property {(npcId: string, scopeType: NpcScopeType, targetId: string, relationshipSummary?: string) => void} linkNpcScope
 * @property {(npcId: string, scopeType: NpcScopeType, targetId: string) => void} unlinkNpcScope
 * @property {() => NpcRecord[]} getActiveContextNpcs
 * @property {() => string} exportDatabaseToJson
 * @property {(jsonString: string) => Promise<{npcsImported: number, linksImported: number}>} importDatabaseFromJson
 */

/**
 * Expected Interface Contract for UI Operations (`src/ui/`)
 * @typedef {Object} IUIRenderer
 * @property {(settings: any) => Promise<void>} renderSettingsDrawer
 * @property {(npcId?: string) => void} openNpcModal
 * @property {() => void} refreshNpcList
 */

/**
 * Expected Interface Contract for Scanner Operations (`src/scanner/`)
 * @typedef {Object} IScannerService
 * @property {(depth?: number, profileId?: string) => Promise<NpcExtractionPayload[]>} scanRecentChat
 * @property {(rawResponse: string) => NpcExtractionPayload[]} parseExtractionResponse
 */

export const CONTRACT_VERSION = '1.0.0';
