# SillyTavern-NPC-tracker Specification

## Overview
A client-side SillyTavern UI Extension that tracks NPCs separately from World Info using an in-browser SQLite database (`sql.js` WASM persisted to IndexedDB via `SillyTavern.libs.localforage` under key `st_npc_tracker_sqlite_db`).

## Core Pillars

### Pillar 1: Dynamic Block-Based NPC Sheet Editor
- **Basic Mode (Block Editor):** Modular, reorderable blocks for tracking:
  - `name` (String, aliases/trigger keywords)
  - `appearance` (Block/Text)
  - `personality` (Block/Text)
  - `relationships` (Dynamic array of links to Characters, Personas, or other NPCs with status/affinity notes)
  - Custom user-defined blocks (key/value or markdown blocks).
- **Template / Blank Mode:** Freeform Markdown/Handlebars template box where users can define custom schemas and default block layouts for new NPCs.

### Pillar 2: Optional LLM Scanner & Sheet Generator
- **Connection Routing:** Users can choose between:
  1. **Active ST API:** Uses `generateQuietPrompt` / `generateRaw` (with JSON schema structured output support where available).
  2. **Connection Profile Override:** Uses `ConnectionManagerRequestService.sendRequest(profileId, ...)` to run extraction on a specific ST Connection Profile.
- **Customizable Extraction:**
  - User-editable Extraction Prompt & Output Template.
  - Configurable Scanner Behavior: `scanDepth` (number of recent messages to analyze), trigger mode (`manual`, `every_n_messages`, `on_keyword`), and update mode (`create_new_only`, `merge_existing`, `ask_before_apply`).

### Pillar 3: Multi-Scope Linking & Prompt Injection
- **Database Schema (`sql.js`):**
  - `npcs (id TEXT PRIMARY KEY, name TEXT, aliases TEXT, avatar TEXT, group_name TEXT, location_keywords TEXT, template_mode TEXT, blocks_json TEXT, raw_content TEXT, injection_position INT, injection_depth INT, injection_role INT, created_at INT, updated_at INT)`
  - `npc_links (id INTEGER PRIMARY KEY AUTOINCREMENT, npc_id TEXT, scope_type TEXT CHECK(scope_type IN ('chat','character','persona','global')), target_id TEXT, relationship_summary TEXT, is_active INT DEFAULT 1, created_at INT, UNIQUE(npc_id, scope_type, target_id))`
- **Scoping Rules:**
  - **Chat Scope (Default):** `scope_type = 'chat'`, `target_id = SillyTavern.getContext().chatId`.
  - **Character Scope:** `scope_type = 'character'`, `target_id = character.avatar`.
  - **Persona Scope:** `scope_type = 'persona'`, `target_id = persona_selected`.
  - **Global Scope:** `scope_type = 'global'`, `target_id = 'global'`.
  - **Many-to-Many Linking:** A single NPC record can be linked simultaneously across multiple Characters, Personas, or specific Chats.
- **Prompt Injection:** Active NPCs for current context (matching active `chatId`, `character.avatar`, `persona_selected`, or `global`) are formatted and injected via `setExtensionPrompt('npc_tracker', ...)` when active or pinned.