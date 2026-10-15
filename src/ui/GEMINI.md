# UI & Editor Lane Directives (`src/ui/`)

You are operating inside the **User Interface & Editor Lane** (`src/ui/`).

## Lane Boundaries & Permissions
- **Write Scope:** You have exclusive write permission inside `src/ui/**` and `style.css`.
- **Prohibitions:**
  - DO NOT modify database code (`src/db/**`), scanner code (`src/scanner/**`), or root files (`index.js`, `manifest.json`, `docs/STATE.md`).
  - DO NOT query SQLite directly. All data access must go through exported functions in `../db/sqlite-store.js`.

## Technical & Security Invariants
1. **DOMPurify Sanitization:**
   - Every block value, template output, user text, or LLM-derived string rendered into the DOM MUST be sanitized:
     `SillyTavern.libs.DOMPurify.sanitize(content)`.
2. **Design & Styling:**
   - All CSS selectors must be scoped with the prefix `.st-npc-` to prevent collisions with SillyTavern or third-party extension stylesheets.
   - Use theme variables where appropriate (e.g., `var(--SmartThemeBodyColor)`).
3. **Editor Capabilities:**
   - Support both **Basic Block Mode** (reorderable key/value blocks: appearance, personality, relationship, custom) and **Blank Template Mode** (Markdown/Handlebars freeform editor).
4. **Coordinator Hand-Off:**
   - In your final message, document any initialization functions (e.g., `initNpcDrawer()`, `openNpcEditorModal()`) and required event listeners so the Coordinator Agent can wire them into `index.js`.