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
| Frontend hosting | **Cloudflare Pages**, project `drumurile-superpowers` (→ `drumurile-superpowers.pages.dev`). Deviation from "GitHub Pages first" because Pages is one site per repo and four branches compete; build stays static so GitHub Pages remains possible. Log this deviation in `plan/comparison.md` on `main`. |
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
- `dmg = round(tierDamage × clamp(speedKmh / 300, 0.3, 2.0))`
- Tuned 2026-11-08, greedy bot 190–240 s (was `/ 50`; at 110 km/h the factor is ≈ 0.37).
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
- `u = min(t / 300, 1)`
- Hazards per 100 m: `1 + 3 × u^1.5`
- Traffic cars per 100 m: `0.1 + 1.2 × u`
- Tuned 2026-11-08, greedy bot 190–240 s (was `0.6 + 6.4 × u^1.5`).
- `roadgen`: seeded 50 m chunks; hazards ≥ 6 m apart; curbs mostly on bends.

### 4.6 Balance guard
Greedy-bot simulation (`core/bot.ts`, kinematic, no Rapier) drives at top speed and hits every reachable hazard.
Test asserts it reaches 0 HP **naturally** (clamp not the deciding factor) between 190 and 240 s across
several seeds, so scores do not pile up at exactly 180.0 s. Tune ramp/speed factor until it passes.

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
  fastest = `time_ms ASC`, potholes = `potholes DESC, time_ms ASC`. Edge-cached 30 s.
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
| Worker integration (local D1, CORS, rate limit) | `@cloudflare/vitest-pool-workers` | no |
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
