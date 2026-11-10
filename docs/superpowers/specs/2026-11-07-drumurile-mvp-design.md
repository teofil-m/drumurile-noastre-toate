# Drumurile noastre – MVP design (Superpowers branch)

Date: 2026-11-07 · Branch: `superpowers` · Input: `plan/requirements.md` (frozen)

This spec turns the shared requirements into concrete design decisions for this branch.
It does not change requirements; where it picks a value the requirements left open, that is noted.

## 1. Goal and success criteria

- Build the MVP from `plan/requirements.md` so it can be compared with the other three framework runs.
- Done = all 12 acceptance criteria (AC) pass, CI is green (typecheck, tests, mutation gate, build),
  frontend and API are deployed and talk to each other.

## 2. Decisions taken during brainstorming

| Topic | Decision |
|---|---|
| Testing discipline | Strict red/green/refactor TDD. StrykerJS mutation testing on pure logic (`src/core`, `src/shared`, `api/src/logic`), CI break threshold 80%. Rendering/physics glue excluded from mutation. |
| Backend | Cloudflare Worker + D1 built, tested and **deployed in this run** (own Worker + own D1 per branch). |
| Minimum wreck time | `MIN_WRECK_TIME_S = 180`, one constant in `src/shared`, used by game and API. Guaranteed by ramp tuning **plus** a damage clamp (health ≥ 1 before 180 s). |
| Frontend hosting | **Cloudflare Workers static assets** (changed 2026-11-08: new Pages projects now route to Workers; URL `https://drumurile-superpowers.mititelu-teofil.workers.dev`). Originally planned: **Cloudflare Pages**, project `drumurile-superpowers` (→ `drumurile-superpowers.pages.dev`). Deviation from "GitHub Pages first" because Pages is one site per repo and four branches compete; build stays static so GitHub Pages remains possible. Log this deviation in `plan/comparison.md` on `main`. |
| Architecture | Pure deterministic core + thin adapters (Rapier, three.js, DOM). |
| Car model | Procedural low-poly Dacia 1310 lookalike built from three.js primitives, no logos, detachable part meshes. CC0 Kenney/Quaternius assets only for props and traffic, credited in `CREDITS.md`. |

## 3. Architecture and layout

```
src/
  core/              pure TS, no DOM/three/Rapier imports; TDD + Stryker
    config.ts        all tunables (HP, tiers, parts thresholds, ramp params, top speed)
    rng.ts           seeded PRNG (mulberry32)
    hazards.ts       data-driven hazard catalog
    damage.ts        damage formula, health, pre-T_min clamp, part detachment
    difficulty.ts    hazard + traffic density over time
    roadgen.ts       seeded 50 m chunk generator (curve, hazards, traffic spawns)
    steering.ts      worn-steering model (input lag + seeded wobble)
    run.ts           run state machine, timer, stats, event application
    achievements.ts  rules over run events, unlock detection
    i18n.ts          ro/en dictionaries + lookup
    ports.ts         Storage port interface
    bot.ts           kinematic greedy-bot simulation (balance test harness)
  shared/            used by game and api; TDD + Stryker
    constants.ts     MIN_WRECK_TIME_S, limits
    score.ts         submission schema + hand-written validation
  sim/               Rapier world, raycast vehicle, hazard sensors → core events
  render/            three.js scene, car mesh, chunks, chase cam, floating origin
  ui/                DOM HUD, menus, toasts, screens; input.ts (key → controls)
  adapters/          localStorage Storage adapter (with in-memory fallback), API client
  main.ts            wiring + fixed-step game loop
api/
  src/logic/         pure request logic (validate, rate-limit decision, CORS, ranking queries); Stryker
  src/index.ts       Worker entry, D1 access
  migrations/0001_init.sql
  wrangler.toml
CREDITS.md
```

Data flow per frame: `ui/input` → controls → `core/steering` → `sim` steps Rapier at fixed 1/60 s →
`sim` emits `HazardHit{hazardId, instanceId, speedKmh}` / `TrafficCollision` / `ManholeFall` / `CurbClimb{height}` →
`core/run.apply(event)` → new `RunState` → `render` and `ui` read it. Core never imports adapters.

## 4. Core rules

### 4.1 Constants (`config.ts`, tune after first playtest)
- `MAX_HP = 1000`
- Tier damage: small 10, medium 25, large 50, epic 120
- Top speed ≈ 110 km/h

### 4.2 Damage
- `speedTerm = clamp(speedKmh / 110, 0.1, 1.0) ^ 1.5`; `dmg = round(tierDamage × DAMAGE_COEF × speedTerm)` (momentum-style retune 2026-11-10; slower hits fall off faster than linear).
- `DAMAGE_COEF = 1.25`, tuned so the default greedy bot (always at top speed, speedTerm = 1) has median wreck time 193.6 s over seeds 1..50. At top speed a hit deals 13 / 31 / 63 / 150 (small / medium / large / epic).
- Roll: `dmg = round(ROLL_DAMAGE × DAMAGE_COEF × speedTerm(speedKmh))`, `ROLL_DAMAGE = 80` (100 at top speed); goes through the same clamp / part-detachment / wreck path as a hazard hit.
- Tuned 2026-11-08 (was `/ 50, 0.3, 2.0`); damage constants unchanged by the final retune (retuned 2026-11-08 after final review).
- A hazard instance damages at most once per contact (dedupe by `instanceId`).
- If `runTime < MIN_WRECK_TIME_S`: `health = max(health − dmg, 1)`; else `health = max(health − dmg, 0)`.
- Health 0 → run state `wrecked`, score = run time in ms.
- Hits during the clamp still count for stats and achievements.

### 4.3 Hazard catalog (AC 3)

| id | kind | RO name | EN subtitle | tier |
|---|---|---|---|---|
| `gropita` | pothole | Gropița | Tiny pothole | small |
| `gropality` | pothole | Gropality | Pothole with personality | medium |
| `groapa-de-gunoi` | pothole | Groapa de gunoi | The garbage pit | large |
| `craterul-national` | pothole | Craterul Național | National crater | epic |
| `bordura-protocol` | curb (low) | Bordura de protocol | Polite curb | small |
| `bordura-everest` | curb (tall) | Bordura Everest | Everest curb | large |
| `capac-dansator` | manhole (loose lid) | Capacul dansator | Dancing lid | small |
| `gura-iadului` | manhole (open) | Gura iadului | Mouth of hell | epic |

Adding a hazard type = one catalog entry (+ its mesh params) + tests.

### 4.4 Part detachment (AC 5), by cumulative damage taken
bumper 200 · hood 400 · left door 550 · right door 700 · exhaust 850 · transmission 950.
Each threshold emits a `PartDetached{part}` once; render turns the part into a loose physics body.

### 4.5 Difficulty ramp (AC 4)
- `u = min(t / 274.6, 1)`
- Hazards per 100 m: `0.85 + 2.79 × u^6.46` (floor test: ≥ 0.8 per 100 m from 60 s on)
- Traffic cars per 100 m: `0.1 + 1.2 × u`
- Retuned 2026-11-08 after final review (was `1 + 1.4 × u^1.5`, `u = t / 300`): early on hazards are sparse, a steep late ramp keeps the wreck time tight.
- Hazard weights (retuned 2026-11-08 after final review, every type ≥ 2% of total): gropița 60.6, gropality 2.2, groapa de gunoi 2.4, craterul național 2.5, bordura protocol 16.8, bordura Everest 2.1, capac dansator 11.3, gura iadului 2.2 (was 45/10/3/0.5/20/1/20/0.5).
- Exposure is lower than ideal: in the first 200 s at top speed every type appears in ≥ 60% of runs, but all 8 types in only about 1 in 5 perfect runs (test floor 15%). Revisit after the playtest.
- `roadgen`: seeded 50 m chunks; hazards ≥ 6 m apart; curbs mostly on bends.

### 4.6 Balance guard
Greedy-bot simulation (`core/bot.ts`, kinematic, no Rapier) drives at top speed and hits every reachable hazard.
Guard (retuned 2026-11-08 after final review) is a **distribution** over seeds 1..50, not a handful of seeds:
- default bot (re-banded 2026-11-10 with DAMAGE_COEF 1.25): clamp-decided (clamp absorbed a lethal hit, or wreck < 185 s) ≤ 16 of 50 seeds (measured 16); 10th-percentile wreck time ≥ 180.7 s (measured 180.73); median in [180, 200] s (measured 193.6); every seed wrecks by 600 s.
- strong bot (`{ lateralSpeedMps: 4, hitToleranceM: 1.1 }`): clamp-decided ≤ 20 of 50 (measured 20).
- exposure (seeds 1..100, first 200 s at top speed): every hazard type in ≥ 60% of runs, all 8 types in ≥ 15%.
Pinned per-seed outcomes in `bot.test.ts` are characterisation only.

### 4.7 Run state machine (`run.ts`)
`menu → driving ⇄ paused → wrecked | dnf`; R restarts from any in-run state.
Timer = accumulated fixed sim steps (paused/background time excluded). `potholes` counts pothole instances only.
`TrafficCollision` while driving → `dnf` immediately, no score (AC 6).

### 4.8 Achievements (AC 7) – 11, RO name + EN subtitle
1. Prima Gropiță – first pothole
2. Bordurist – first curb
3. Canalistul – first manhole
4. Moartea planetarelor – transmission detached
5. Fără mâini – 5 potholes in a row with |steer| < 0.1 between hits
6. Everest – climb Bordura Everest
7. Gura iadului – fall into an open manhole
8. Fulgerul de Berceni – wreck in under 4:00
9. Colecționarul – every hazard type in one run
10. Săpător de elită – 50 potholes in one run
11. Ghinion – DNF by traffic

Persisted via `Storage` port (localStorage key `dn.achievements`); newly unlocked ones emit toasts.

### 4.9 i18n (AC 11)
Key-based `ro`/`en` dictionaries; default `ro`; persisted in `dn.lang`.
Hazard and achievement names always Romanian; subtitle in the active language (EN subtitle shown in both).

## 5. API (`api/`)

- `POST /scores` body `{nickname, timeMs, potholes, clientVersion}` → 201 `{id}`.
- `GET /leaderboard?board=fastest|potholes&limit=20` (limit 1–50, default 20) → `{entries:[{nickname,timeMs,potholes,createdAt}]}`;
  fastest = `time_ms ASC`, potholes = `potholes DESC, time_ms ASC`. (No edge cache — simplified 2026-11-08.)
- Validation (`src/shared/score.ts`, shared by client and Worker):
  - nickname trimmed, 2–16 chars, `[\p{L}\p{N} _-]`
  - `timeMs` integer, `MIN_WRECK_TIME_S×1000 ≤ timeMs ≤ 3_600_000`
  - `potholes` integer 0–5000 and `potholes ≤ 4 × timeMs/1000`
  - `clientVersion` string ≤ 20 chars; unknown fields rejected
  - body ≤ 1 KB (413), content-type `application/json` (415)
- Rate limit: D1 table `rate_limits(ip_hash, window_start, count)`, 5 POST/min per IP (429).
  IP from `CF-Connecting-IP`, stored only as salted SHA-256 (`IP_SALT` secret).
- Schema: `scores(id INTEGER PK, nickname TEXT, time_ms INTEGER, potholes INTEGER, created_at TEXT, ip_hash TEXT)`,
  indexes on `time_ms` and `potholes DESC`.
- Errors: JSON `{error: "<code>"}` with 400/404/405/413/415/429.
- CORS: `ALLOWED_ORIGINS` var (`https://drumurile-superpowers.pages.dev`, `http://localhost:5173`); preflight `OPTIONS` handled.
- Deployed as Worker `drumurile-api-superpowers` with D1 `drumurile-superpowers`.

## 6. UI (`src/ui/`, plain TS + DOM over the canvas)

- Menu: Play, Leaderboard, Achievements, RO/EN toggle.
- HUD: timer `m:ss.cc`, health bar, km/h, last hazard name + subtitle.
- Achievement toasts; pause overlay (Esc).
- Result: wreck → time, potholes, new achievements, nickname (remembered `dn.nickname`) + Submit;
  DNF → "DNF", no submit control.
- Leaderboard: two tabs. Achievements: locked/unlocked grid.
- Controls (`input.ts`, pure mapping): WASD/arrows, Space handbrake, R restart, Esc pause.

Error handling: API unreachable → "offline" + Retry; localStorage failure → in-memory fallback;
Rapier WASM init failure → error screen.

## 7. Rendering, physics, performance

- Rapier `DynamicRayCastVehicleController`: soft high-travel suspension, low damping (bouncy, AC 2).
- Hazards: potholes as depressions with sensors, curbs as raised colliders at road edge, manholes as sensor (open → drop) or loose lid.
- Endless road: chunks recycled and disposed behind the car; floating-origin shift every 1 km.
- Instanced meshes for repeated hazards; fixed 60 Hz physics; target 60 fps (Chrome/Firefox/Edge).

## 8. Testing and CI

| Layer | Tool | Mutation |
|---|---|---|
| `src/core`, `src/shared`, `api/src/logic` | Vitest, TDD | Stryker, break 80% |
| Balance guard (greedy bot) | Vitest | included in core |
| API handler (CORS, rate limit, routing) | Vitest with an in-memory `ScoreStore` fake (root project) | yes |
| D1 store | `wrangler dev` local check + live smoke test after deploy (simplified 2026-11-08: no Workers test pool) | no |
| `ui` helpers, input mapping | Vitest + happy-dom | no |
| `sim`/`render` | smoke test + manual playtest | no |

GitHub Actions:
- `ci.yml` (push/PR): `tsc --noEmit` → Vitest → Stryker → `vite build`.
- `deploy.yml` (push to `superpowers`): D1 migrations + `wrangler deploy` (API) and `wrangler pages deploy dist` (frontend).
  Needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## 9. Build order (milestones)

1. Tooling: Vite + TS + Vitest + Stryker + CI skeleton.
2. `src/shared` + `src/core` logic, test-first (damage, hazards, ramp, roadgen, run, achievements, i18n, bot balance).
3. `api/` logic + Worker + D1 + integration tests; deploy API.
4. `sim` + `render`: road, car, hazards, traffic, detachment.
5. `ui`: screens, HUD, toasts, i18n, leaderboard client.
6. Deploy frontend to Cloudflare Pages; manual playtest against AC 1–12; tune `config.ts`.

## 10. Out of scope
As in `plan/requirements.md`: touch controls, accounts, stronger anti-cheat, multiple cars, multiplayer,
free roam, levels, sound beyond simple effects.
