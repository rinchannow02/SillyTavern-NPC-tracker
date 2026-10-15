# /build-milestone Workflow

Execute the active milestone in `docs/STATE.md` following these strict gates:

1. **State & Git Branch Alignment:**
   - Read `docs/SPEC.md` and `docs/STATE.md` to identify the active Milestone and its target `vX` branch.
   - Run `git status` and `git branch --show-current`.
   - Ensure you are on the correct `vX` branch (branched off `staging`). Never work directly on `main` or `staging`.
2. **Plan Artifact:**
   - Generate an Antigravity Implementation Plan listing the exact files, SQL queries, and SillyTavern events in scope for the `vX` branch.
   - **PAUSE and wait for user approval.**
3. **Implement & Commit:**
   - Write modular ES module code adhering to `.agents/rules/01-sillytavern-api.md` and `.agents/rules/02-sqlite-storage.md`.
   - Create atomic commits on the `vX` branch (`feat(vX): ...`).
4. **Verify & Stage Merge:**
   - Verify the extension loads cleanly in SillyTavern (`http://localhost:8000`) with zero console errors.
   - Update `docs/STATE.md` to mark completed tasks.
   - Ask the user for confirmation to merge the completed `vX` branch into `staging` (`git checkout staging && git merge --no-ff vX`).
