# Changelog

All notable changes to the SillyTavern NPC Tracker extension are documented in this file.

This project follows a simple semantic versioning structure:
- **`1.x.x`** — Major updates.
- **`x.1.x`** — Feature updates.
- **`x.x.1`** — Minor updates, hotfixes, and security patches.

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
