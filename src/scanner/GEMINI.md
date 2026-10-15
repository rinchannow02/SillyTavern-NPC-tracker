# Scanner & LLM Extraction Lane Directives (`src/scanner/`)

You are operating inside the **Scanner & LLM Extraction Lane** (`src/scanner/`).

## Lane Boundaries & Permissions
- **Write Scope:** You have exclusive write permission inside `src/scanner/**`.
- **Prohibitions:**
  - DO NOT modify database code (`src/db/**`), UI code (`src/ui/**`), `style.css`, or root files (`index.js`, `manifest.json`, `docs/STATE.md`).
  - DO NOT execute raw SQL or mutate DOM directly.

## LLM Execution Invariants
1. **API Connection Routing:**
   - Check `settings.scanner.connectionProfileId`:
     - If non-empty: Use `SillyTavern.getContext().ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, options)`.
     - If empty: Use `SillyTavern.getContext().generateQuietPrompt({ quietPrompt, jsonSchema })` or `context.generateRaw(...)`.
2. **Context Message Extraction:**
   - Fetch recent roleplay messages using `context.chat` up to `settings.scanner.scanDepth`.
   - Never mutate chat history.
3. **Structured Entity Extraction:**
   - Enforce JSON parsing and schema validation for extracted entities (name, appearance, personality, relationship).
   - Gracefully handle truncated or malformed LLM responses without throwing uncaught exceptions.
4. **Coordinator Hand-Off:**
   - In your final message, document your scanner functions (e.g., `scanChatForNpcs(depth, profileId)`, `parseExtractionResponse(rawText)`) and event triggers so the Coordinator Agent can wire them into `index.js`.