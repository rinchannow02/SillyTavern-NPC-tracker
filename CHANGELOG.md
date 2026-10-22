# Changelog

All notable changes to the SillyTavern NPC Tracker extension are documented in this file.

This project follows a simple semantic versioning structure:
- **`1.x.x`** — Major updates.
- **`x.1.x`** — Feature updates.
- **`x.x.1`** — Minor updates, hotfixes, and security patches.

---

## [1.2.0] - 2026-10-22

### Added
- **Multi-Device Server Sync (PC & Mobile):**
  - Implemented dual-layer persistence combining ultra-fast local client caching (`localforage` / IndexedDB) with SillyTavern's native server settings synchronization (`extensionSettings.npc_tracker.server_db` and `context.saveSettingsDebounced()`).
  - Added smart hydration and conflict resolution in `mergeNpcCollections()`: mobile devices connecting for the first time automatically pull the complete NPC database from the server without requiring manual export/import steps.
  - Conflicts between devices are resolved by timestamp comparison (`updated_at`), preserving any new NPCs or edits made on either device without data loss.
  - Added user toggle `Sync Database to Server (Multi-Device)` under Database Management in the NPC Tracker settings drawer (enabled by default).

### Fixed
- **Tombstone Deletion Propagation (H1):** Fixed an issue where deleting an NPC on one device resurrected the NPC upon syncing with another device or local cache. Deletions now record lightweight tombstones pruned at 30 days so deletions propagate cleanly across all devices.
- **Scope Link Timestamp Bumping (H2):** Fixed an issue where toggling scope links (`linkNpcScope`, `unlinkNpcScope`, `setNpcScopeStatus`) failed to bump `updated_at`, causing newer local link states to be silently reverted by server copies.
- **Multi-Device Concurrent Write Safety (H3 & H4):** Saving to server settings now merges local records against current server data to prevent last-writer-wins clobbering across concurrent tabs/devices. Re-enabling server sync in settings safely hydrates and merges with existing server data instead of overwriting.
- **Mobile Browser Compatibility (M1):** Converted preset schemas to standard ES module exports (`.js`), completely eliminating syntax errors caused by JSON import attributes (`with { type: 'json' }`) in mobile Safari < 17.2, Chrome < 123, and Firefox < 138.
- **Setting-Aware Filter Migration & Dual State Elimination (M3):** Cleaned up duplicated `settingAwareFilter` and `matchDepth` states between top-level and scanner settings, ensuring upgraded users preserve their custom settings seamlessly.
- **Server Sync Opt-out Data Cleanup (M4):** Disabling the server sync toggle now cleans up `server_db` and `server_tombstones` from server settings.
- **Fuzzy Metadata Matching & Bounded Salvage Engine (L1, L2):** Enhanced key extraction to capture casing variations (e.g. `groupName`, `Location`) without dropping fields, and capped salvaged custom blocks to 5 blocks (max 500 characters each).
- **Group Hierarchy Branch Recognition (L3):** Prevented location branches in parentheses (e.g. `(Tokyo Branch)`) from being misattributed to character occupation blocks.

---

## [1.1.4] - 2026-10-22

### Added
- **Hierarchical Group Formatting & Title Leakage Prevention:**
  - Updated all extraction prompts (`classic.json`, `slice_of_life.json`, `adventure_fantasy.json`, `rpg_scifi.json`, and `DEFAULT_EXTRACTION_PROMPT`) with explicit instructions to format organizational sub-units as `"Parent / Subgroup"` (e.g. `"Hikari Co. / Accounting"`, `"Hikari Co. / IT"`), keeping parent group names consistent so related NPCs cleanly collapse into a singular group folder.
  - Added strict negative constraints preventing LLMs from putting job titles, ranks, or positions into group names, reinforcing that titles belong exclusively in the character sheet blocks (`occupation`, `role_class`, `faction_role`).
- **Defensive Group Normalization & Title Salvage Engine:**
  - Implemented `cleanAndNormalizeGroupName()` in `src/scanner/chat-scanner.js` to automatically convert em-dashes (`—`), en-dashes (`–`), spaced hyphens (` - `), and colons (`:`) into the standard `/` hierarchy separator.
  - Automatically strips trailing parenthesized roles/titles (e.g. `(Section Chief)`) from group names and backfills them into the character's empty `occupation` or role block so no context is lost.
  - Added seamless merging for separate `subgroup`, `sub_group`, `department`, or `division` keys emitted by LLM models.

---

## [1.1.3] - 2026-10-22

### Added
- **Match Scan Depth Adjustment:** Added user-configurable `matchDepth` input for Setting-Aware Selective Prompt Injection in the general injection settings, allowing users to tune how many recent chat messages (1–100) are inspected for NPC name, alias, and location matches without requiring the LLM Chat Scanner to be active.
- **Modular Preset Separation:** Deconstructed monolithic template definitions in `preset-manager.js` into standalone, easily editable JSON preset files under `src/templates/presets/` (`classic.json`, `slice_of_life.json`, `adventure_fantasy.json`, `rpg_scifi.json`).
- **Appearance & Inter-NPC Relationship Mapping:** Added dedicated `appearance` blocks across all presets (fixing blindspots in Slice of Life and Cyberpunk) and upgraded `relationship` blocks into pairwise connection maps covering inter-NPC social dynamics in addition to user ties.
- **Chat Scanner Failsafe & Salvage Engine:** Implemented normalized alphanumeric key matching to support casing/separator variations (e.g. `speechStyle` -> `speech_style`) and dynamic custom block salvage, automatically preserving any novel attributes returned by the LLM as custom blocks with zero data loss.

### Fixed
- **Visual Extension Drawer Gap:** Removed excessive bottom margin on `.st-npc-settings` in `style.css` (reset to `margin-bottom: 0`), perfectly eliminating the unwanted vertical gap between the NPC Tracker drawer header and adjacent extension drawers. Added `id="st_npc_settings_drawer"` and `id="st_npc_settings_content"` in `src/ui/settings.html` to align with editor modal reopening logic.

---

## [1.1.2] - 2026-10-21

### Added
- **Group & Sub-Group Deletion:** Added delete actions (trash icon) to every row in the "Existing Groups & Sub-Groups" tree picker with confirmation dialogs. Deleting a parent group cleans it across all assigned NPCs, and deleting a sub-group cleanly reverts assigned NPCs back to the parent group.

---

## [1.1.1] - 2026-10-21

### Fixed
- **Settings Drawer Initialization:** Fixed a Temporal Dead Zone `ReferenceError: Cannot access 'scannerSettings' before initialization` where `refreshPresetsUI()` accessed `scannerSettings` before its declaration during drawer setup.

---

## [1.1.0] - 2026-10-20

### Added
- **Two-Way Block & Template Editing:**
  - You can now freely switch back and forth between the visual **Block Editor** and **Freeform Template** markdown at any time.
  - Switching from Blocks to Template automatically translates your cards into clean Markdown.
  - Switching from Template to Blocks intelligently parses Markdown titles, bullet points (`- **Appearance:** ...`), and headers into structured attribute cards.
  - Safe confirmation prompts ensure existing notes are never accidentally overwritten when switching views.
  - Added dedicated **"Parse from Template"** and **"Populate from Blocks"** action buttons for convenient one-click syncing.
- **Hierarchical Group & Sub-Group Checkbox Selector:**
  - NPCs can now be organized into nested groups and sub-groups (for example: `Crimson Fleet / Officers` or `Mirai Industries IT / Cybersecurity Division`).
  - Added a visual **"Browse Tree"** drawer with nested checkboxes: checking a sub-group automatically activates its parent group.
  - Added an inline **"Add Group / Sub-Group"** tool to create and select new groups on the fly without leaving the editor.
  - Added a quick clear (`✕`) button to reset group assignments.
- **Dynamic Block Tokens in Templates:**
  - In Freeform Template mode, tokens like `{{appearance}}`, `{{personality}}`, `{{relationship}}`, and any custom block names now automatically resolve to your block values when injected into prompts.
- **Genre Template Presets & Easy Sharing:**
  - Added 4 built-in character schemas tailored for different story genres: **Classic (Standard)**, **Slice of Life**, **Adventure & Fantasy RPG**, and **RPG & Cyberpunk**.
  - Built-in presets automatically pair the NPC sheet structure with an optimized LLM chat extraction prompt.
  - Customize, create, duplicate, and delete custom templates directly from the settings drawer.
  - **Export and Import Presets:** Save and share your favorite character schemas and paired LLM extraction prompts with a single portable `.json` file.
  - **Template Selector:** Pick which preset is used as the default for new NPCs and automated scans, or switch templates on the fly inside the character editor.

---

## [1.0.1] - 2026-10-16

### Added
- **Background Chat Scanning:** Automatic message scanning now runs smoothly in the background right after character replies without stalling generation.
- **Status Notifications:** Added helpful toast notifications that let you know when an automatic scan starts, finds new characters, or finishes.
- **Per-Chat Ignore Toggle:** Added an "Ignore this chat" checkbox in the settings drawer, allowing you to turn off NPC tracking for specific chats while leaving it enabled everywhere else.

### Changed
- Improved scanner safety to prevent automatic scans from overwriting manually edited character notes.

---

## [1.0.0] - 2026-10-15

### Added
- **Initial Release of NPC Tracker:**
  - **Lightweight Local Storage:** Fast, client-side data storage directly in your browser with zero server setup or external dependencies.
  - **Modular Block Editor:** Easily track names, aliases, appearance, personality traits, and custom attributes with draggable and reorderable cards.
  - **Multi-Scope Scoping:** Link NPCs specifically to an active Chat, Character, User Persona, or Global scope.
  - **LLM Chat Scanner:** Automatically detect and track newly introduced characters from recent conversation history.
  - **Smart Prompt Injection:** Injects active NPC sheets directly into the context prompt, with optional scene and location keyword filtering.
  - **Data Backup & Restore:** Complete JSON export and import to backup or move your NPC roster between devices.
