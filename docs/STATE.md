# Project State: SillyTavern-NPC-tracker

## Current Focus
- **Active Milestone:** Milestone 4 — LLM Chat Scanner & Connection Routing
- **Required Working Branch:** `v4` (branched from `staging`)
- **Base Integration Branch:** `staging`

## Milestone & Branch Matrix
| Milestone | Branch | Status | Scope Summary |
| :--- | :--- | :--- | :--- |
| **Milestone 1** | `v1` | `COMPLETED` | `manifest.json`, `global.d.ts`, `index.js`, `style.css`, `src/contracts.js`, `src/db/sqlite-store.js` (`sql.js` + `localforage`), Extensions drawer UI with Test NPC & JSON export |
| **Milestone 2** | `v2` | `COMPLETED` | Multi-Scope Link Manager (Chat/Character/Persona/Global), `setExtensionPrompt` prompt injector (`src/injection.js`), `CHAT_CHANGED` auto-query, prompt preview panel |
| **Milestone 3** | `v3` | `COMPLETED` | Dynamic Block Editor UI (`src/ui/editor.js`, `src/ui/editor-modal.html`), Custom Handlebars/Markdown Templates, `DOMPurify` sanitization, NPC Grouping & Location trigger fields |
| **Milestone 4** | `v4` | `COMPLETED` | LLM Chat Scanner (`src/scanner/chat-scanner.js`), `ConnectionManagerRequestService` routing, structured JSON extraction, trigger modes, and setting-aware evaluation |

## Milestone 4 Task Checklist (`v4`)
- [x] Merge completed `v3` into `staging` and branch `v4` off `staging`
- [x] Implement `src/scanner/chat-scanner.js` with API routing (`generateQuietPrompt` vs `ConnectionManagerRequestService`), JSON parser, and SQLite merge
- [x] Add Setting-Aware Keyword Triggering (`evaluateSettingAwareTriggers`)
- [x] Enhance `src/ui/settings.html` and `style.css` with Scanner configuration panel and "Scan Recent Chat Now" button
- [x] Wire lifecycle events in `index.js` for `every_n_messages` and `on_keyword` triggers
- [x] Verify live scanning with low-budget / careful token execution against SillyTavern Docker container (`http://127.0.0.1:8000`)
- [x] Commit cleanly to branch `v4`

## Active Decisions & Constraints
- Module Name: `npc_tracker`
- Default Scan Depth: `10`
- API Fallback: Active ST API if connection profile is unspecified
- Token Budget Safety: Strict limits on maxTokens (default: 500) and concise system prompt