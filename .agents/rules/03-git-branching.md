---
trigger: always_on
description: "Enforces Feature Branch workflow (feat/*, fix/*) off staging with worktree isolation for concurrent agents"
---
# Git Branching & Version Control Discipline

## 1. Branch Hierarchy
- **`main`**: Production release branch. **STRICTLY PROTECTED FOR AGENTS.** Never checkout, commit directly to, or push to `main` unless explicitly executing a user-approved release promotion from `staging`. Production releases are tagged using semantic versioning (e.g. `v1.0.0`).
- **`staging`**: Primary integration branch. All feature branches, bugfixes, and enhancements must branch off from `staging` and merge back into `staging` upon verification.
- **`feat/<feature-name>` (Feature Branches)**: Dedicated branches for new features and enhancements (e.g. `feat/custom-export`, `feat/smart-triggering`).
- **`fix/<bug-name>` (Bugfix Branches)**: Dedicated branches for defect resolution and security fixes.
- **`refactor/<name>` (Refactor Branches)**: Dedicated branches for structural or architectural code reorganization without feature changes.

## 2. Pre-Flight Branch Check (Mandatory)
Before modifying any source code or creating an Implementation Plan:
1. Run `git branch --show-current` and `git status --short`.
2. Verify you are NOT on `main`.
3. If creating a new feature or fix, branch off from an up-to-date `staging`:
   ```bash
   git checkout staging
   git pull origin staging --rebase  # if remote configured
   git checkout -b feat/<feature-name>
   ```

## 3. Multi-Agent Concurrent Execution (Git Worktrees)
When orchestrating multiple agents working in parallel on distinct features:
1. **Never switch branches on another active agent's working directory.** Running concurrent `git checkout` commands on the same workspace causes filesystem conflicts and index lock errors (`.git/index.lock`).
2. **Use Git Worktrees for Parallel Feature Agents:**
   To spin up an independent workspace for a parallel agent:
   ```bash
   # Add an isolated worktree for the feature
   git worktree add ../SillyTavern-NPC-tracker-feat-<name> feat/<name>
   ```
3. Once the feature work is complete, verified, and merged into `staging`, clean up the worktree:
   ```bash
   git worktree remove ../SillyTavern-NPC-tracker-feat-<name>
   ```

## 4. Integration & Merge Protocol
1. Run tests before merging: `node --test` must pass 100%.
2. Merge back to `staging`:
   ```bash
   git checkout staging
   git merge --no-ff feat/<feature-name> -m "feat(<scope>): implement <feature-name>"
   ```
3. Delete the local feature branch once merged:
   ```bash
   git branch -d feat/<feature-name>
   ```
