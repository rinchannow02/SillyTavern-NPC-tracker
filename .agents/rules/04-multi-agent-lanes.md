---
trigger: always_on
description: "Prevents file overwrite conflicts and establishes clear boundaries when running parallel agents in Antigravity IDE"
---
# Multi-Agent Parallel Execution Rules

## 1. Strict Lane Isolation
- When spawned with a `[LANE: <directory>]` tag in the prompt (e.g., `[LANE: src/db]`, `[LANE: src/ui]`, `[LANE: src/scanner]`), the agent operates as a **Worker Agent**.
- A Worker Agent has WRITE permission **ONLY** within its designated lane directory (and subdirectories).
- Any attempt to modify files outside the assigned lane is a violation of parallel safety.

## 2. Root Files are Coordinator-Only
- Worker agents MUST NEVER edit root files, including:
  - `index.js`
  - `manifest.json`
  - `docs/STATE.md`
  - `src/contracts.js`
  - Root configuration files or global rules
- If a Worker Agent creates new functions, classes, or event handlers that need to be wired into `index.js`, it MUST document the exact import path and call signature in its final response.
- The **Coordinator Agent** alone is responsible for wiring worker exports into `index.js` and updating `docs/STATE.md`.

## 3. Subfolder Directive Compliance
- Every worker agent MUST read and adhere to the `GEMINI.md` located inside its designated lane directory before writing code.
- `src/db/GEMINI.md`: Governs database schemas, queries, and `localforage` persistence.
- `src/ui/GEMINI.md`: Governs DOM rendering, block editors, modals, templates, and styles.
- `src/scanner/GEMINI.md`: Governs LLM prompts, connection manager routing, and entity extraction.

## 4. No Git Operations in Parallel Mode
- Parallel worker agents must **NEVER** run `git checkout`, `git commit`, `git merge`, or `git push`.
- Running concurrent Git commands corrupts index locks and leads to merge conflicts.
- Git operations are strictly reserved for the Coordinator Agent after all parallel worker lanes have finished and their changes are verified.

## 5. Contract Agreement
- Prior to dispatching parallel agents, data interfaces must be agreed upon in `src/contracts.js` or JSDoc types.
- Workers must import and respect contract types rather than inventing ad-hoc object structures.
