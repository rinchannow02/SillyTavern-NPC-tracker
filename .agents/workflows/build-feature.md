# /build-feature Workflow

Execute feature development using strict quality gates and feature branches:

1. **Branch Setup:**
   - Verify `git status` is clean.
   - Branch off `staging`:
     ```bash
     git checkout staging
     git checkout -b feat/<feature-name>
     ```
2. **Plan Artifact:**
   - Generate an Antigravity Implementation Plan listing the scope, files to edit, and API/DB interactions.
   - **PAUSE and wait for user approval.**
3. **Implement & Test:**
   - Write clean, modular ES module code adhering to `.agents/rules/`.
   - Run tests: `node --test` must pass completely.
   - Create atomic commits on `feat/<feature-name>` using Conventional Commits (`feat(...)`, `fix(...)`).
4. **Verify & Stage Merge:**
   - Verify functionality in SillyTavern UI (`http://127.0.0.1:8000`).
   - Merge into `staging`:
     ```bash
     git checkout staging
     git merge --no-ff feat/<feature-name>
     git branch -d feat/<feature-name>
     ```
   - Update `docs/STATE.md`.
