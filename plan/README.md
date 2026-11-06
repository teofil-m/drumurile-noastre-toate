# Plan

Single source of truth shared by all four AI-DLC implementations.
Every branch implements **the same thing** from these documents, so results are comparable.

| Branch        | Framework                  | Worktree folder                      |
|---------------|----------------------------|--------------------------------------|
| `main`        | plan + comparison only     | `drumurile-noastre`                  |
| `specmd`      | spec.md driven             | `../drumurile-noastre-specmd`        |
| `superpowers` | Superpowers skills         | `../drumurile-noastre-superpowers`   |
| `bmad`        | BMAD method                | `../drumurile-noastre-bmad`          |
| `speckit`     | GitHub Spec Kit            | `../drumurile-noastre-speckit`       |

## Files
- `requirements.md` – what to build (the shared input prompt, frozen once experiments start)
- `rules.md` – ground rules so the comparison is fair
- `comparison.md` – scorecard filled in per framework

## Workflow
1. Edit the plan **only on `main`**, commit.
2. In each worktree: `git merge main` to pick up plan changes.
3. Each framework keeps its own artifacts (specs, stories, constitution...) in its own branch.
4. Fill in `comparison.md` on `main` when a framework run finishes.
