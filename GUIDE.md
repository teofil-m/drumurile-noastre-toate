# Guide: comparing 4 AI-DLC frameworks

We build the **same game** (see `README.md`) four times, once per AI-DLC framework, to compare
how they plan, build and maintain it. Each framework lives in its own git branch and its own folder (worktree).

## Layout

| Branch        | Framework        | Folder (next to the main repo)     |
|---------------|------------------|------------------------------------|
| `main`        | plan + comparison only, no app code | `drumurile-noastre` |
| `specmd`      | spec.md driven   | `../drumurile-noastre-specmd`      |
| `superpowers` | Superpowers      | `../drumurile-noastre-superpowers` |
| `bmad`        | BMAD method      | `../drumurile-noastre-bmad`        |
| `speckit`     | GitHub Spec Kit  | `../drumurile-noastre-speckit`     |

All four branches start from the same `main` commit, so they share the same `plan/`.

## What `plan/` contains

- `plan/README.md` – overview of the plan folder and branch table.
- `plan/requirements.md` – **what to build**: problem, users, MVP features, out of scope, tech constraints,
  acceptance criteria. Framework-neutral. This is the identical input given to every framework; freeze it once runs start.
- `plan/rules.md` – ground rules for a fair comparison: same requirements, stack, model and start commit;
  app code in the same `src/` layout in every branch; no copying code between branches mid-run.
- `plan/comparison.md` – scorecard, one column per framework: time, tokens/cost, human interventions,
  planning artifacts, lines of code, tests, acceptance criteria met, maintainability, traceability, notes.

## Workflow

1. **Define the plan on `main`.** Fill in `plan/requirements.md` (derive it from `README.md`), commit.
2. **Sync each worktree** so it has the plan: `cd ../drumurile-noastre-<name> && git merge main`.
3. **Run one framework per worktree.** Open the folder in its own Claude Code session, feed it
   `plan/requirements.md` and follow `plan/rules.md`.
   - Framework artifacts (specs, BMAD stories, Spec Kit constitution, Superpowers plans) stay in that branch.
   - Game code goes in `src/` in every branch.
   - Commit often on the branch; no cross-pollination.
4. **Record results** in `plan/comparison.md` on `main` as each run finishes (time, cost, interventions...).
5. **Compare**:
   - code: `git diff specmd..bmad --stat -- src`
   - process: compare the framework artifact folders side by side
   - fill the maintainability / traceability scores after trying the same change request in all four
     (e.g. "add a new pothole type"), which tests how maintainable each result is.

## Changing the plan later

- Plan changes happen **only on `main`**, then `git merge main` in each worktree.
- If requirements change after runs started, note it in `comparison.md` so results stay comparable.

## Handy commands

```
git worktree list                                   # see all folders/branches
git worktree remove ../drumurile-noastre-bmad       # remove a worktree (branch is kept)
git worktree add ../drumurile-noastre-bmad bmad     # re-create it
```

## Deploy

Initially GitHub Pages (static browser game); later Cloudflare (free plan). Keep the build static so it works on both.
