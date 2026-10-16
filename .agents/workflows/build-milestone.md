# /build-milestone Workflow

> **Note:** The project has graduated from initial sequential version branches (`v1`–`v4`, tagged `v1.0.0`) to a **Feature Branch** system. Refer to `.agents/workflows/build-feature.md`.

For any new milestone or feature:
1. Ensure `staging` is up to date.
2. Branch off `staging` into `feat/<feature-name>`.
3. Follow the implementation plan, testing (`node --test`), and merge protocol in `.agents/workflows/build-feature.md`.
