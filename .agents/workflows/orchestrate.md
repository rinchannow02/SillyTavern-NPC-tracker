# /orchestrate Workflow (Multi-Agent Coordinator)

When asked to orchestrate a feature or milestone across multiple agents:

1. **Pre-Flight & Contract Lock:**
   - Verify the active Git branch matches `docs/STATE.md` (`v1`, `v2`, etc.).
   - Create or update `src/contracts.js` (JSDoc typedefs and function signatures) so all parallel agents agree on exact data shapes before coding.
2. **Generate Parallel Dispatch Prompts:**
   - Output 2 to 3 self-contained prompts for the user to paste into parallel Antigravity Agent tabs, each prefixed with `[LANE: src/...]`.
   - **PAUSE and wait for the parallel agents to finish their files.**
3. **Integration & Verification:**
   - Once the worker agents finish, wire their exported modules into `index.js`.
   - Verify in the SillyTavern browser instance (`http://127.0.0.1:8000`), update `docs/STATE.md`, and create the atomic Git commit on the active `vX` branch.
