---
trigger: always_on
description: "Prevents file overwrite conflicts and establishes clear boundaries when running parallel agents across lanes and feature branches"
---
# Multi-Agent Parallel Execution Rules

## 1. Two Modes of Multi-Agent Orchestration

### Mode A: Inter-Feature Parallelism (Multiple Features Concurrently)
- When multiple agents work on independent features simultaneously (e.g. Agent A on `feat/export-csv`, Agent B on `feat/location-triggers`):
  1. Each agent operates on its own dedicated feature branch (`feat/<name>`).
  2. Each concurrent agent MUST be given its own isolated `git worktree` workspace (e.g., `../SillyTavern-NPC-tracker-feat-foo`) if executing at the same time, preventing index locking and unstaged file overwrites.
  3. The Coordinator merges completed feature branches into `staging` sequentially after testing.

### Mode B: Intra-Feature Lane Isolation (Single Feature, Multiple Lanes)
- When multiple worker agents work concurrently on different layers of the *same* feature within a single workspace:
  1. Agents are assigned explicit lanes with a `[LANE: <directory>]` tag (e.g., `[LANE: src/db]`, `[LANE: src/ui]`, `[LANE: src/scanner]`).
  2. A Worker Agent has WRITE permission **ONLY** within its designated lane directory.
  3. Any attempt to modify files outside the assigned lane is a violation of parallel safety.

## 2. Root Files are Coordinator-Only
- Worker agents in Lane mode MUST NEVER edit root files, including:
  - `index.js`
  - `manifest.json`
  - `docs/STATE.md`
  - Root configuration files or global rules
- If a Worker Agent creates new functions, classes, or event handlers that need to be wired into `index.js`, it MUST document the exact import path and call signature in its final response.
- The **Coordinator Agent** alone is responsible for wiring worker exports into `index.js` and updating `docs/STATE.md`.

## 3. Subfolder Directive Compliance
- Every worker agent MUST read and adhere to the `GEMINI.md` located inside its designated lane directory before writing code.
- `src/db/GEMINI.md`: Governs database schemas, queries, and `localforage` persistence.
- `src/ui/GEMINI.md`: Governs DOM rendering, block editors, modals, templates, and styles.
- `src/scanner/GEMINI.md`: Governs LLM prompts, connection manager routing, and entity extraction.

## 4. Git Safety in Parallel Mode
- In Lane mode, worker agents must **NEVER** run `git checkout`, `git commit`, `git merge`, or `git push`. Git operations are strictly reserved for the Coordinator Agent.
- In Feature Worktree mode, each feature agent commits exclusively to its own dedicated branch inside its own worktree directory.

## 5. Contract Agreement
- Prior to dispatching parallel agents, data interfaces and contracts must be agreed upon in JSDoc typedefs or shared schemas so workers respect common types.
