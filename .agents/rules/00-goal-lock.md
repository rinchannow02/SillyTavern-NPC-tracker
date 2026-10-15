---
trigger: always_on
description: "Prevents over-eager multi-file mutations and enforces milestone boundaries on Gemini 3.8"
---
# Gemini 3.8 Execution Discipline

1. **Plan First:** Never write implementation code on the first turn of a feature request. Produce an Implementation Plan referencing the active milestone in `docs/STATE.md` and wait for approval.
2. **Milestone Isolation:** Do not implement Milestone 3 or 4 features while working on Milestone 1 or 2. Keep diffs under 4 files per turn.
3. **Three-Strike Rule:** If a browser test, WASM load, or unit check fails 3 times in a row, STOP editing code, log the exact error in `docs/STATE.md`, and ask the user for review.
