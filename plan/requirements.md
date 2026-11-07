# Requirements: Drumurile noastre

> Framework-neutral input for all four AI-DLC runs. Freeze this file once runs start;
> log any later change in `comparison.md`.

## Problem / pitch
A comedy 3D browser driving game about Romanian roads. You drive your old wreck of a car (your *rabla*)
down an endless road full of potholes, curbs and manholes. The goal is to **destroy your car as fast as possible**
by hitting road hazards, while avoiding other cars.

## Users
- Casual players on desktop browsers, mostly friends/colleagues sharing a link and competing on the leaderboard.
- Romanian-speaking humor first; UI in **Romanian and English with a language toggle** (Romanian default,
  choice persisted). Hazard and achievement names stay Romanian puns, with an English subtitle/explanation.

## Car
- One car in MVP: a low-poly **Dacia 1310 lookalike** (the *rabla*), generic enough to avoid trademarked logos/branding.

## Core gameplay
- **Endless drive**: a procedurally generated road that keeps going; chase camera behind the car.
- **Wobbly physics**: raycast vehicle with soft, bouncy suspension and loose, worn steering;
  the car visibly reacts to every hazard (bounce, tilt, swerve).
- **Hazards are the goal**: hitting a hazard damages the car. Damage depends on hazard type, depth/height and speed.
- **Damage model (starting values, tune after first playtest)**: car health **1000 HP**; hazard tiers deal
  **10 / 25 / 50 HP** (small / medium / large), with **epic** hazards dealing more (e.g. 100+). Speed scales the hit.
- **Difficulty ramp**: hazard density increases over time. Early on hazards are sparse and the car is durable,
  so a wreck within the first minutes is **not possible** even with perfect play (target minimum around 3 min; tunable).
- **Wreck = success**: when the car's health reaches 0 the run ends and the **time-to-wreck** is the score
  (lower is better). Parts visibly come loose or fall off as damage grows.
- **Traffic = failure**: other cars drive on the road. Colliding with one ends the run immediately as
  "DNF" with **no score**. There is no reward for ending a run early any other way.

## Hazards (MVP)
- **Potholes** – several types with different size/depth and damage, each with a funny Romanian name
  (e.g. *Gropality*, *Craterul Național*, *Groapa de gunoi*, …).
- **Curbs** – different heights, placed where loose steering makes you climb them by accident.
- **Manholes** – open (big hit) or loose/raised lids (small hit, rattle).

## Achievements (MVP)
- Unlocked on hazard events, shown as an in-game toast, listed on an achievements screen.
- Persisted in localStorage across runs.
- Examples: first hit of each hazard type, *Moartea planetarelor* (destroy the transmission),
  N potholes in a row without steering, wreck under X minutes, climb the tallest curb, fall into an open manhole.

## Leaderboard (MVP, global)
- Two global rankings, visible in-game and after each run:
  - **Fastest wreck** – time-to-wreck ascending.
  - **Most potholes hit** – pothole hits in a single completed run, descending.
- Player enters a nickname (no accounts) when submitting a score.
- Only completed wrecks are submitted; DNF runs never are.
- Basic server-side validation: reject impossible times (below the minimum wreck time), malformed or
  oversized payloads; simple rate limiting per IP.

## Controls
- Keyboard: WASD / arrow keys to drive, Space handbrake, R restart, Esc pause.
- Touch controls: out of MVP.

## Screens
Main menu → game (HUD: timer, car health, speed, last hazard name) → result (wreck time or DNF,
new achievements, nickname + submit) → leaderboard / achievements screens.

## Out of scope (later)
- Mobile / touch controls
- Accounts, anti-cheat beyond basic validation
- Multiple cars or car upgrades, multiplayer
- Free-roam city, levels/missions
- Sound beyond simple effects (nice to have)

## Tech constraints
- **Language / build**: TypeScript + Vite, static frontend build.
- **3D / physics**: three.js for rendering, Rapier (`@dimforge/rapier3d-compat`) for physics and the vehicle controller.
- **Assets**: free CC0 low-poly packs (e.g. Kenney Car Kit / City Kit, Quaternius); credits in `CREDITS.md`.
- **Frontend hosting**: GitHub Pages first (later Cloudflare Pages).
- **Leaderboard backend**: Cloudflare Worker + D1 (free plan), with CORS allowing the game's origin.
- **Layout**: app code in `src/`, backend in `api/`, the same in all four branches.
- **Tests**: unit tests (Vitest) for game logic (damage, scoring, difficulty ramp, achievements, API validation).
- Performance target: 60 fps on a mid-range laptop in Chrome/Firefox/Edge.

## Acceptance criteria
1. The game loads from a static URL and is playable with the keyboard; the road never ends.
2. The car has visibly bouncy suspension and loose steering; hazards visibly throw it around.
3. There are at least 3 pothole types, 2 curb heights and 2 manhole variants, each with a distinct name and damage.
4. Hazard frequency increases over time; a wreck before the minimum wreck time is not achievable.
5. Health 0 ends the run with time-to-wreck as the score; parts visibly detach as damage grows.
6. Colliding with a traffic car ends the run as DNF and offers no score submission.
7. At least 8 achievements exist; they toast on unlock and persist after a page reload.
8. A completed run can be submitted with a nickname and shows up on both global leaderboards
   (fastest wreck ascending, most potholes descending).
9. The API rejects times below the minimum, malformed payloads and request floods.
10. Unit tests cover damage, scoring, the difficulty ramp, achievements and API validation, and pass in CI.
11. The UI switches between Romanian and English and remembers the choice; the car reads as a Dacia 1310 lookalike.
12. Car health starts at 1000 HP and hazard tiers deal 10 / 25 / 50 HP (more for epic), scaled by speed.

## Open questions
- Exact minimum wreck time and final damage numbers – decide after the first playtest.
