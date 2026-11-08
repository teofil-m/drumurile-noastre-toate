# Game Client Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, fun browser game online: drive the wobbly rabla down the endless road, hit hazards, wreck it, submit to the live leaderboard — deployed on Cloudflare Pages.

**Architecture:** Plan 1's pure core (`src/core`, `src/shared`) owns all rules. New layers: `src/game` (pure glue: session, fixed-step loop, formatting — TDD), `src/adapters` (localStorage, API client — TDD), `src/sim` (road geometry pure + Rapier car — tested headless in Node), `src/render` (three.js scene, procedural car — smoke-tested), `src/ui` (DOM screens + keyboard input), `src/main.ts` (wiring). Hazard and traffic hits are detected **geometrically** from the car's road coordinates `(s, lateral)` — not via physics sensors — then the sim applies a physical jolt so the car visibly bounces. Curbs are real colliders so loose steering climbs them.

**Tech Stack:** TypeScript ~5.9, Vite 8, Vitest 5 (+ happy-dom for UI helpers), three 0.187, @dimforge/rapier3d-compat 0.21, Cloudflare Pages (wrangler).

**Spec:** `docs/superpowers/specs/2026-11-07-drumurile-mvp-design.md` §3, §6, §7. Requirements: `plan/requirements.md` (AC 1–12).

**Human guidance:** a game for colleagues and friends — fun, playable, online beats perfect; keep token cost low. Prefer the simplest thing that plays well. No floating origin (float precision is fine for a 10–20 min run); no downloaded asset packs (procedural meshes, so no CREDITS needed unless assets are added).

## Global Constraints

- `src/core/**`, `src/shared/**` unchanged except bug fixes the human approves. New pure modules (`src/game/**`, `src/adapters/**`, `src/sim/roadPath.ts`, `src/sim/contacts.ts`) are TDD and added to Stryker `mutate`; three.js/Rapier/DOM-heavy files (`src/sim/vehicle.ts`, `src/render/**`, `src/ui/**`, `src/main.ts`) are not mutated.
- Run the game loop at a fixed 60 Hz sim step; physics car speed hard-capped at `TOP_SPEED_KMH` (110) — the balance depends on it.
- Coordinates (Plan 1 conventions): `lateral` + = right of centreline in the driving direction; traffic `lane: 1` = right lane same direction, `-1` = left lane oncoming; `curvature` 1/m, + = road bends right. World: Y up, road starts at origin heading −Z (three.js default camera forward).
- API base URL from `import.meta.env.VITE_API_URL`, default `https://drumurile-api-superpowers.mititelu-teofil.workers.dev`. Client version string = `package.json` version.
- localStorage adapter never throws. Keys: `dn.lang`, `dn.achievements`, `dn.nickname`.
- Text via `t()` / `hazardLabel()` / `achievementLabel()`; add any missing i18n keys to both `RO` and `EN` in `src/core/i18n.ts` (that file may gain keys).
- Controls: WASD / arrows drive, Space handbrake, R restart, Esc pause. Desktop only.
- Commits: conventional-commit messages ending with the Co-Authored-By trailer.

## Review Focus

1. Tab switch / long frame must not explode physics or the timer: fixed-step accumulator caps steps per frame (≤ 5) → Task 1 test.
2. The same pothole must count once even if the car sits on it for many frames (instanceId dedupe in core) and a hazard on the far side of the road must not register → Task 2 contact tests.
3. API offline / 4xx on submit shows a message with Retry, never crashes the result screen → Task 1 client tests + Task 4 manual check.
4. Restart (R) mid-run fully resets sim, traffic, detached parts and HUD → Task 4 manual playtest checklist.
5. DNF never offers score submission; wrecks below 180 s are impossible (core guarantees) → Task 4 checklist.

---

### Task 1: Game glue + adapters (pure, TDD)

**Files:** Create `src/game/session.ts`, `src/game/loop.ts`, `src/game/format.ts`, `src/adapters/localStore.ts`, `src/adapters/apiClient.ts`, `src/ui/keys.ts`, colocated `*.test.ts`; Modify `stryker.config.json` (mutate `src/game/**/*.ts`, `src/adapters/**/*.ts`, `src/ui/keys.ts`).

**Interfaces (produced):**
```ts
// game/loop.ts
export function fixedSteps(accS: number, frameDtS: number, stepS?: number, maxSteps?: number): { steps: number; accS: number };
// defaults stepS 1/60, maxSteps 5; non-finite/negative frame dt → 0; excess beyond maxSteps is dropped (accS < stepS after)
// game/format.ts
export function formatTime(ms: number): string;               // 'm:ss.cc', e.g. 192400 → '3:12.40', 0 → '0:00.00'
// game/session.ts
export interface Session { run: RunState; unlocked: ReadonlySet<AchievementId>; seed: number }
export function createSession(seed: number, store: KeyValueStore): Session;           // run = createRun(), unlocked = loadUnlocked(store)
export function sessionEvent(s: Session, ev: RunEvent, store: KeyValueStore): { session: Session; outputs: RunOutput[]; unlockedNow: AchievementId[] };
// applies applyEvent, then evaluateAchievements; saves to store only when unlockedNow is non-empty
// adapters/localStore.ts
export function createLocalStore(storage?: Storage | null): KeyValueStore; // wraps window.localStorage; any throw → falls back to an in-memory store for that key op; never throws
// adapters/apiClient.ts
export type ApiFailure = { ok: false; error: string };                        // server error code, or 'offline'
export interface ApiClient {
  submitScore(sub: ScoreSubmission): Promise<{ ok: true; id: number } | ApiFailure>;
  leaderboard(board: 'fastest' | 'potholes', limit?: number): Promise<{ ok: true; entries: { nickname: string; timeMs: number; potholes: number; createdAt: string }[] } | ApiFailure>;
}
export function createApiClient(baseUrl: string, fetchImpl?: typeof fetch): ApiClient; // network error/non-JSON → 'offline'; non-2xx JSON → its error code
// ui/keys.ts
export function controlsFromKeys(keys: ReadonlySet<string>): Controls;  // KeyboardEvent.code values: KeyW/ArrowUp throttle 1, KeyS/ArrowDown brake 1, KeyA/ArrowLeft steer −1, KeyD/ArrowRight steer +1 (both → 0), Space handbrake
```

- [ ] **Step 1: Failing tests** — `fixedSteps(0, 1/60)` → 1 step; `(0, 0.5)` → 5 steps, `accS < 1/60` (Review Focus 1); `(0, NaN)` → 0 steps; `formatTime` for 0, 59990, 192400, 3_600_000 (`'60:00.00'`); session: new achievement on first pothole hit is returned once and persisted (`dn.achievements` in a `memoryStore`), second identical hit returns none; `createLocalStore` with a Storage stub whose methods throw → get returns null after set without throwing… then returns the set value from memory; `apiClient` with a fetch stub: 201 → `{ok:true,id}`, 400 `{error:'time_too_fast'}` → that code, fetch rejects → `'offline'`, 500 HTML → `'offline'`; leaderboard parses entries and builds `?board=…&limit=…`; `controlsFromKeys` for each key, both left+right → steer 0, none → all zero.
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement.** — **Step 4: Verify** — `npm test && npm run typecheck`.
- [ ] **Step 5: Stryker** on the new files (explicit list) → ≥80%.
- [ ] **Step 6: Commit** — `feat(game): add session glue, fixed-step loop, storage and API adapters`

---

### Task 2: Road geometry, contacts and the Rapier car (headless-tested)

**Files:** Create `src/sim/roadPath.ts`, `src/sim/contacts.ts`, `src/sim/vehicle.ts`, `src/sim/sim.ts`, tests `src/sim/roadPath.test.ts`, `src/sim/contacts.test.ts`, `src/sim/sim.test.ts`; `npm i three @dimforge/rapier3d-compat` and `npm i -D @types/three`.

**Interfaces (produced):**
```ts
// sim/roadPath.ts — pure
export interface RoadPose { x: number; z: number; heading: number }      // heading radians, 0 = −Z, + = turning right
export class RoadPath {
  addChunk(chunk: Chunk): void;                    // chunks added in index order; curvature constant within a chunk
  pose(s: number): RoadPose;                       // centreline pose at distance s (throws if s beyond added chunks)
  toWorld(s: number, lateral: number): { x: number; z: number };
  project(x: number, z: number, hintS: number): { s: number; lateral: number }; // nearest point near hintS (search ±60 m)
}
// sim/contacts.ts — pure
export const CAR_HALF_WIDTH_M = 0.8, CAR_HALF_LENGTH_M = 2.0, HAZARD_RADIUS_M = 0.6;
export function hazardContacts(prevS: number, s: number, lateral: number, hazards: readonly HazardSpawn[]): HazardSpawn[];
// hazards whose s lies in (prevS - CAR_HALF_LENGTH_M, s + CAR_HALF_LENGTH_M] and |h.lateral − lateral| ≤ CAR_HALF_WIDTH_M + HAZARD_RADIUS_M
export function trafficCollision(s: number, lateral: number, cars: readonly { s: number; lane: 1 | -1 }[], laneOffsetM?: number): boolean;
// traffic car centre lateral = lane * laneOffsetM (default 1.75); overlap of two 1.6×4.0 m boxes in (s, lateral)
// sim/sim.ts — Rapier world (await RAPIER.init() inside createSim)
export interface SimSnapshot {
  s: number; lateral: number; speedKmh: number;
  car: { position: [number, number, number]; quaternion: [number, number, number, number] };
  wheels: { position: [number, number, number]; quaternion: [number, number, number, number] }[]; // 4
  traffic: { instanceId: string; position: [number, number, number]; heading: number }[];
  looseParts: { part: Part; position: [number, number, number]; quaternion: [number, number, number, number] }[];
}
export interface Sim {
  step(controls: Controls, steer: number, dtS: number): { snapshot: SimSnapshot; events: RunEvent[] }; // events: hazardHit / trafficCollision
  detach(part: Part): void;                         // spawns a loose dynamic body near the car
  ensureRoadAhead(tS: number): Chunk[];             // generates chunks up to s + 300 m via generateChunk(seed, i, tS), returns newly added ones; drops colliders > 100 m behind
  readonly path: RoadPath;
  dispose(): void;
}
export function createSim(seed: number, opts?: { chunkSource?: (index: number, tS: number) => Chunk }): Promise<Sim>; // default chunkSource = (i, t) => generateChunk(seed, i, t)
```
Physics guidance (feel matters more than realism): Rapier `DynamicRayCastVehicleController`, 4 wheels; soft, bouncy suspension (low stiffness, low damping, generous travel); modest grip so the car slides a little; engine force from `controls.throttle`, brake from `controls.brake`, handbrake locks rear wheels; steering angle = `steer × 0.5 rad`; clamp linear speed to `TOP_SPEED_KMH / 3.6` every step. Road: one thin fixed cuboid per ~5 m segment along `RoadPath` (width 2 × `ROAD.halfWidthM` + 1 m verge each side). Curbs: fixed cuboids at the road edge (height 0.12 m for `bordura-protocol`, 0.3 m for `bordura-everest`, 2 m long). On a hazard contact, apply an impulse on the chassis at the hit wheel side: upward + small pitch/roll, scaled by tier (small < medium < large < epic) — the car must visibly bounce/tilt/swerve (AC 2). `gura-iadului` gives the largest downward-then-up jolt. Traffic cars are kinematic boxes moving along their lane at `speedKmh` (oncoming move toward the player). Events: emit `{type:'hazardHit', hazardId, instanceId, speedKmh}` for each geometric contact (core dedupes), and `{type:'trafficCollision'}` when `trafficCollision` is true.

- [ ] **Step 1: Failing pure tests** — `RoadPath`: straight chunk → `toWorld(10, 0)` = `(0, −10)`, `toWorld(10, 2)` = `(2, −10)`; a right-bending chunk ends with heading > 0 and x > 0; `project(toWorld(s, lat))` returns `(s, lat)` within 1 cm for straight and curved chunks. `hazardContacts`: hazard ahead within width → hit; on the far side of the road (lateral −3 vs car +2.5) → no hit (Review Focus 2); already passed (s < prevS − half length) → no hit. `trafficCollision`: same lane overlapping → true; other lane → false; 5 m ahead → false.
- [ ] **Step 2: Failing headless sim tests** (`src/sim/sim.test.ts`, Rapier in Node): `createSim(1)` resolves; 600 steps with throttle 1 → `speedKmh` > 30 and never > 110.5; driving straight (steer 0) for 300 steps over a chunk containing a pothole placed at lateral 0 (inject via a test seam: `createSim(seed, { chunkSource })` where `chunkSource(index, tS)` defaults to `generateChunk`) → at least one `hazardHit` event for that instanceId; a traffic car placed in the player's lane ahead → `trafficCollision` event; `detach('bumper')` adds a loose part.
- [ ] **Step 3: Implement** roadPath, contacts, vehicle (Rapier car construction + tuning constants in one place), sim.
- [ ] **Step 4: Verify** — `npm test && npm run typecheck`; sim tests must finish in < 10 s total.
- [ ] **Step 5: Stryker** on `src/sim/roadPath.ts,src/sim/contacts.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(sim): add road geometry, contacts and Rapier car`

---

### Task 3: Rendering — scene, road, hazards, Dacia, traffic, camera

**Files:** Create `src/render/scene.ts`, `src/render/car.ts`, `src/render/road.ts`, `src/render/hazards.ts`, `src/render/traffic.ts`, `src/render/camera.ts`, test `src/render/car.test.ts`.

**Interfaces (produced):**
```ts
// render/car.ts
export function createDacia(): { root: THREE.Group; parts: Record<Part, THREE.Object3D>; wheels: THREE.Object3D[] }; // 4 wheels
// render/scene.ts
export interface Renderer {
  addChunks(chunks: readonly Chunk[], path: RoadPath): void;  // road surface + markings + hazard meshes + roadside props
  removeChunksBefore(s: number): void;                           // dispose geometry/materials
  update(snapshot: SimSnapshot, dtS: number): void;              // car, wheels, traffic, loose parts, chase camera
  detach(part: Part): void;                                      // hide part on the car (the loose copy follows snapshot.looseParts)
  hideHazard(instanceId: string): void;                          // optional: e.g. lid flies off — may be a no-op
  resize(w: number, h: number): void;
  render(): void;
  dispose(): void;
}
export function createRenderer(canvas: HTMLCanvasElement): Renderer;
```
Look: low-poly, bright, a bit cartoonish. Dacia 1310 lookalike built from boxes/cylinders: long boxy sedan body, separate trunk/hood volumes, four round-ish headlights, chrome-ish bumpers, beige or "galben Dacia" body; parts `bumper`, `hood`, `doorLeft`, `doorRight`, `exhaust`, `transmission` are separate meshes named after the part; no logos. Potholes: dark irregular discs slightly below the road (bigger/darker per tier, Craterul Național huge); curbs: grey edge blocks with the two heights; manholes: round metal lid (loose) or a black hole with the lid lying next to it (open). Traffic: simple colorful boxy cars. Road: grey asphalt with a dashed centreline and some patches; grass verges; a few lamp posts/blocks of flats as cheap scenery. Chase camera: behind and above, smoothed, slight FOV kick with speed. Use `MeshStandardMaterial` + one hemisphere + one directional light; no shadows (60 fps on a mid-range laptop).

- [ ] **Step 1: Failing test** (`car.test.ts`, node env — three objects need no WebGL): `createDacia()` returns a group with exactly the six named parts present in `parts` and as descendants of `root`, and 4 wheels; total triangle count < 5,000.
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement** all render modules.
- [ ] **Step 4: Verify** — `npm test && npm run typecheck && npm run build`.
- [ ] **Step 5: Commit** — `feat(render): add scene, procedural Dacia, road, hazards, traffic and chase camera`

---

### Task 4: UI screens + main wiring + local playtest

**Files:** Create `src/ui/screens.ts`, `src/ui/hud.ts`, `src/ui/toast.ts`, `src/ui/style.css`, `src/ui/input.ts`; Modify `src/main.ts`, `index.html`, `src/core/i18n.ts` (new keys only, both languages), `package.json` (version `0.1.0`, `happy-dom` devDep if used); test `src/ui/hud.test.ts` (happy-dom) for the HUD text.

Behavior (spec §6):
- Main menu: Play, Leaderboard, Achievements, RO/EN toggle (persisted). Title "Drumurile noastre".
- HUD: timer `formatTime`, health bar (red when < 25%), km/h, last hazard name (Romanian) + subtitle in the active language, short shake/flash on big hits.
- Toasts for newly unlocked achievements (name + subtitle), 3 s.
- Esc → pause overlay (Resume, Restart, Menu); R restarts anytime in a run.
- Result: wreck → time, potholes, new achievements this run, nickname input (2–16 chars, prefilled from `dn.nickname`) + Submit → "Submitted!" or error message + Retry (Review Focus 3). DNF → "DNF" message, no submit (Review Focus 5). Buttons: Another run (R), Leaderboard, Menu.
- Leaderboard screen: two tabs (fastest / potholes), top 20 from the API, "offline" message on failure.
- Achievements screen: grid of all 11, locked ones greyed with "Locked".
- `main.ts`: init Rapier (via `createSim`), renderer, UI; `requestAnimationFrame` loop: `fixedSteps` → per step: `controlsFromKeys` → `stepSteering`/`effectiveSteer` (core) → `sim.step` → `sessionEvent` for `tick` and each sim event → on `partDetached` call `sim.detach` + `renderer.detach`; on `wrecked`/`dnf` show result; `ensureRoadAhead` + `renderer.addChunks`/`removeChunksBefore`; then `renderer.update` + `render`. New seed per run (`Date.now()`). WebGL/Rapier init failure → error screen with `t(lang, 'error.physics')`.

- [ ] **Step 1: Failing test** — HUD renders `'3:12.40'`, `'87 km/h'`, the hazard name and EN subtitle for `gropality` when lang is `en`.
- [ ] **Step 2: Implement** screens, HUD, toasts, input, main loop, i18n keys.
- [ ] **Step 3: Verify** — `npm run typecheck && npm test && npm run build`.
- [ ] **Step 4: Local smoke** — `npm run dev` in the background, confirm the page serves (curl `http://localhost:5173` returns the HTML) and stop it. The human playtests (controller hands over): checklist — game loads, car bounces on potholes and climbs curbs, health drops, parts fall off, HUD updates, R restart resets everything (Review Focus 4), Esc pause, wreck after ≥ 180 s shows result + submit to the live API, DNF on traffic shows no submit, language toggle persists after reload, achievements persist after reload, ~60 fps.
- [ ] **Step 5: Commit** — `feat(ui): add screens, HUD, toasts and main game loop`

---

### Task 5: Deploy to Cloudflare Pages + tune (controller-run with the human)

- [ ] **Step 1:** `npx wrangler pages project create drumurile-superpowers --production-branch superpowers` (ask first).
- [ ] **Step 2:** `npm run build && npx wrangler pages deploy dist --project-name drumurile-superpowers --branch superpowers` → `https://drumurile-superpowers.pages.dev`.
- [ ] **Step 3:** Verify the live page loads and the leaderboard call succeeds from that origin (CORS already allows it).
- [ ] **Step 4:** Human playtest online; apply playtest tuning (physics feel constants in `src/sim/vehicle.ts`; balance values only in `src/core/config.ts`, re-running the bot balance guard) as small follow-up commits, each redeployed.
- [ ] **Step 5:** README: play URL + how to deploy; commit `chore: deploy game to Cloudflare Pages` and push.
