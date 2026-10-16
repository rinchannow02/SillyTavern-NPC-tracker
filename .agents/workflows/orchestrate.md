# /orchestrate Workflow (Multi-Agent Coordinator)

When asked to orchestrate multiple agents working on features:

## Mode 1: Multiple Concurrent Features (Inter-Feature)
1. **Branch & Worktree Setup:**
   - For each feature, create a dedicated branch off `staging`:
     ```bash
     git checkout staging
     git checkout -b feat/<feature-name>
     ```
   - For concurrent execution, set up an isolated worktree for each feature:
     ```bash
     git worktree add ../SillyTavern-NPC-tracker-<feature-name> feat/<feature-name>
     ```
2. **Dispatch Feature Prompts:**
   - Provide self-contained task prompts for each feature agent, referencing their respective workspace worktree directory.
3. **Merge & Integration:**
   - Once a feature agent finishes and unit tests pass (`node --test`), merge into `staging`:
     ```bash
     git checkout staging
     git merge --no-ff feat/<feature-name>
     git worktree remove ../SillyTavern-NPC-tracker-<feature-name>
     ```

## Mode 2: Multi-Lane Coordination (Intra-Feature)
1. **Feature Branch Alignment:**
   - Ensure the workspace is on the active `feat/<feature-name>` branch (branched off `staging`).
   - Define data contracts and interfaces before dispatch.
2. **Generate Parallel Dispatch Prompts:**
   - Output self-contained prompts for parallel Antigravity Agent tabs, each prefixed with `[LANE: src/...]`.
   - PAUSE and wait for the parallel agents to complete their files.
3. **Integration & Verification:**
   - Wire worker exports into `index.js`.
   - Run unit tests (`node --test`) and verify in SillyTavern (`http://127.0.0.1:8000`).
   - Commit cleanly on `feat/<feature-name>`.
