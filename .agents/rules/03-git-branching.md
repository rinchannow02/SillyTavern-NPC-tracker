---
trigger: always_on
description: "Enforces strict Git branching workflow across main, staging, and milestone version branches (v1, v2, etc.)"
---
# Git Branching & Version Control Discipline

## 1. Branch Hierarchy
- **`main`**: Production release branch. **STRICTLY READ-ONLY FOR AGENTS.** Never checkout, commit directly to, or push to `main` unless explicitly executing a user-approved release promotion from `staging`.
- **`staging`**: Primary integration branch. All milestone branches must branch off from `staging` and merge back into `staging` upon completion.
- **`v1`, `v2`, `v3`, `v4` (Milestone Branches)**: Active development branches mapped 1:1 with the milestones in `docs/STATE.md`:
  - Milestone 1 -> `v1`
  - Milestone 2 -> `v2`
  - Milestone 3 -> `v3`
  - Milestone 4 -> `v4`

## 2. Pre-Flight Branch Check (Mandatory)
Before modifying any source code or creating an Implementation Plan:
1. Run `git branch --show-current` and `git status --short`.
2. Verify the active branch matches the current Milestone's target branch listed in `docs/STATE.md` (e.g., `v1` for Milestone 1).
3. If currently on `main`, immediately switch to `staging` (`git checkout staging`).
4. If starting a new milestone and the `vX` branch does not exist yet, create it from an up-to-date `staging` branch:
   ```bash
   git checkout staging
   git checkout -b v1
