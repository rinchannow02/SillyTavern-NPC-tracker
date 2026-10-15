---
trigger: glob
globs: "**/*.js"
description: "Enforces official SillyTavern UI Extension APIs and prevents legacy import hallucinations"
---
# SillyTavern UI Extension API Rules

1. **No Fragile Relative Imports:** Do NOT use `import { ... } from '../../../script.js'`. Always access ST APIs via `const context = SillyTavern.getContext();` and `const { lodash, localforage, DOMPurify, Handlebars, Fuse } = SillyTavern.libs;`.
2. **Settings Initialization:** Store extension configuration (scanner depth, selected connection profile ID, custom prompts, templates) in `context.extensionSettings['npc_tracker']`. Always initialize defaults using `lodash.merge` and save via `context.saveSettingsDebounced()`.
3. **LLM Extraction Calls:**
   - When using the active API: call `context.generateQuietPrompt({ quietPrompt, jsonSchema })` or `context.generateRaw({ prompt, systemPrompt, jsonSchema })`.
   - When using a Connection Profile: call `context.ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, options)`.
4. **Prompt Injection:** Use `context.setExtensionPrompt('npc_tracker', renderedSheets, position, depth, scan, role)` to inject active NPC sheets into the roleplay prompt without mutating World Info files.
5. **Security & Sanitization:** Every NPC block or LLM-generated string rendered into HTML MUST be sanitized with `SillyTavern.libs.DOMPurify.sanitize()`.
6. **Event Hygiene:** Register listeners via `context.eventSource.on(context.event_types.CHAT_CHANGED, ...)` and ensure no duplicate listeners are attached on UI re-renders.
