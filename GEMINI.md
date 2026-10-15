# SillyTavern-NPC-tracker — Agent Directives

## Core Objective
@[Project Specification](docs/SPEC.md)

## Active Session State
Before generating an Implementation Plan or editing any file, ALWAYS read @docs/STATE.md to verify the current milestone, completed tasks, and architectural decisions. Update @docs/STATE.md at the end of every task.

## Environment & Runtime Context (WSL)
- **Host Environment:** Ubuntu WSL2. Always use POSIX paths (`/home/...`), never Windows paths (`C:\...`).
- **Runtime Target:** Browser ES Modules loaded directly by SillyTavern without a bundler (unless explicitly configured for `sql.js` WASM assets).
- **Zero Server Plugin Rule:** This is a pure client-side SillyTavern UI Extension. NEVER write Node.js `fs`, `path`, or backend Express routes.

## Operational Invariants
- **Context API Only:** Access all SillyTavern internals via `SillyTavern.getContext()` and `SillyTavern.libs`.
- **Default Scope:** Newly created or extracted NPCs MUST link to the current Chat (`chatMetadata`) by default unless the user explicitly links them to a Character or Persona.
- **No Unrequested Refactoring:** Stay strictly within the files listed in the active milestone in @docs/STATE.md.