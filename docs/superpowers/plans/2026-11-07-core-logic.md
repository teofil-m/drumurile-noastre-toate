# Core Logic + Mutation Gate Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tooling (Vite + TS + Vitest + StrykerJS + CI) and the complete pure game-logic core (`src/shared`, `src/core`) built test-first and gated at ≥80% mutation score.

**Architecture:** Deterministic, side-effect-free TypeScript modules with no DOM/three.js/Rapier imports. Randomness only through a seeded `Rng`; persistence only through a `KeyValueStore` port. Later plans (2: API, 3: game client) consume these interfaces.

**Tech Stack:** TypeScript (strict), Vite, Vitest, StrykerJS (`@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@stryker-mutator/typescript-checker`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-07-drumurile-mvp-design.md`

## Global Constraints

- Strict TDD: every behavior starts as a failing test that is run and seen to fail.
- `src/core/**` and `src/shared/**` must not import DOM, three.js, Rapier or any adapter.
- No `Math.random()` in core; all randomness via `createRng(seed)`.
- Tests are colocated: `src/<dir>/<module>.test.ts`.
- Stryker mutates `src/core/**/*.ts` and `src/shared/**/*.ts` (excluding `*.test.ts`); thresholds high 90 / low 80 / **break 80**.
- After each module's tests pass, run Stryker on that module: `npx stryker run --mutate src/<dir>/<module>.ts`. Score must be ≥80%; add tests that kill surviving mutants (equivalent mutants may be left with a one-line comment in the test file).
- `MAX_HP = 1000`; tier damage small 10 / medium 25 / large 50 / epic 120; `MIN_WRECK_TIME_S = 180`. These are requirements (AC 12/AC 4) and are **never** changed during tuning.
- Hazard and achievement names are Romanian in both languages; subtitles are per language.
- Commit after every task; messages in conventional-commit style, ending with the Co-Authored-By trailer.

## Review Focus

1. Non-finite numbers (NaN/Infinity speed or dt from the physics adapter) must never produce NaN health or time → Task 4 and Task 8 tests.
2. A huge `tick` dt (tab was backgrounded) must not teleport the timer → `tick` dt clamped to `MAX_TICK_S = 0.25` → Task 8 test.
3. Corrupted localStorage (invalid JSON, unknown ids, unsupported lang) must fall back to defaults, never throw → Task 9 and Task 10 tests.
4. Type-coerced or extreme JSON values (`"180000"` as string, `1e400` → Infinity, nickname with tabs/only spaces/emoji) must be rejected, not coerced → Task 2 tests.
5. Events after the run ended (hits after wreck, second traffic collision) must not emit duplicate `wrecked`/`dnf` outputs → Task 8 test.

Spec deviation noted: the spec's `ManholeFall` / `CurbClimb` events are folded into `hazardHit` — hitting `gura-iadului` is the fall, hitting `bordura-everest` is the climb. The sim adapter (Plan 3) only emits `hazardHit`.

---

### Task 1: Tooling scaffold + seeded RNG

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `stryker.config.json`, `index.html`, `src/main.ts`, `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Create: `src/core/rng.ts`
- Test: `src/core/rng.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Rng {
    next(): number;                          // [0, 1)
    range(min: number, max: number): number; // [min, max)
    int(minIncl: number, maxExcl: number): number;
    pick<T>(items: readonly { weight: number; value: T }[]): T;
  }
  export function createRng(seed: number): Rng;
  export function hashSeed(...parts: number[]): number; // uint32
  ```
- npm scripts: `dev`, `build` (`tsc --noEmit && vite build`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `mutate` (`stryker run`).

- [ ] **Step 1: Scaffold the project**

`npm init -y`, then `npm i -D typescript vite vitest @stryker-mutator/core @stryker-mutator/vitest-runner @stryker-mutator/typescript-checker`. `package.json`: `"type": "module"`, `"private": true`, scripts as above. `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `target`/`lib` ES2022 + DOM, `moduleResolution: "bundler"`, `include: ["src"]`. `vitest.config.ts`: `environment: 'node'`, `include: ['src/**/*.test.ts']`. `index.html` loads `/src/main.ts`; `src/main.ts` is an empty placeholder (`export {};`).

`stryker.config.json`:
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "testRunner": "vitest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": ["src/core/**/*.ts", "src/shared/**/*.ts", "!src/**/*.test.ts"],
  "thresholds": { "high": 90, "low": 80, "break": 80 },
  "incremental": true,
  "incrementalFile": "reports/stryker-incremental.json",
  "reporters": ["clear-text", "progress", "html"]
}
```
`.gitignore` adds: `node_modules/`, `dist/`, `reports/`, `.stryker-tmp/`.

`.github/workflows/ci.yml`: on push + pull_request; ubuntu-latest; `actions/setup-node` node 24 with npm cache; `npm ci` → `npm run typecheck` → `npm test` → `npm run mutate` → `npm run build`.

- [ ] **Step 2: Write the failing tests** in `src/core/rng.test.ts`

```ts
it('is deterministic per seed', () => {
  const a = createRng(42), b = createRng(42);
  expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
});
it('differs between seeds', () => { expect(createRng(1).next()).not.toBe(createRng(2).next()); });
it('next stays in [0,1)', () => { const r = createRng(7); for (let i = 0; i < 10_000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); } });
it('range and int respect bounds', () => { const r = createRng(3); for (let i = 0; i < 5_000; i++) { const x = r.range(-2, 5); expect(x).toBeGreaterThanOrEqual(-2); expect(x).toBeLessThan(5); const n = r.int(1, 4); expect([1, 2, 3]).toContain(n); } });
it('int reaches both ends', () => { const r = createRng(9); const seen = new Set<number>(); for (let i = 0; i < 1_000; i++) seen.add(r.int(0, 3)); expect([...seen].sort()).toEqual([0, 1, 2]); });
it('pick follows weights', () => {
  const r = createRng(5); const c = { a: 0, b: 0, z: 0 };
  for (let i = 0; i < 20_000; i++) c[r.pick([{ weight: 3, value: 'a' as const }, { weight: 1, value: 'b' as const }, { weight: 0, value: 'z' as const }])]++;
  expect(c.a / 20_000).toBeCloseTo(0.75, 1); expect(c.z).toBe(0);
});
it('hashSeed is deterministic, order-sensitive, uint32', () => {
  expect(hashSeed(1, 2)).toBe(hashSeed(1, 2)); expect(hashSeed(1, 2)).not.toBe(hashSeed(2, 1));
  const h = hashSeed(123, 456); expect(Number.isInteger(h)).toBe(true); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(2 ** 32);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/rng.test.ts` — Expected: FAIL, cannot resolve `./rng`.

- [ ] **Step 4: Implement `src/core/rng.ts`**

`next` is mulberry32; `hashSeed` folds parts with an imul mix:
```ts
function mulberry32(a: number) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function hashSeed(...parts: number[]): number { let h = 0x811c9dc5; for (const p of parts) { h = Math.imul(h ^ (p | 0), 0x01000193); h ^= h >>> 13; } return h >>> 0; }
```
`pick` walks cumulative weights against `next() * total`.

- [ ] **Step 5: Run tests, typecheck, build**

Run: `npm test && npm run typecheck && npm run build` — Expected: all PASS, `dist/` produced.

- [ ] **Step 6: Run Stryker on the module**

Run: `npx stryker run --mutate src/core/rng.ts` — Expected: score ≥80%, exit 0.

- [ ] **Step 7: Commit** — `chore: scaffold Vite/Vitest/Stryker/CI and add seeded rng`

---

### Task 2: Shared constants + score submission validation

**Files:**
- Create: `src/shared/constants.ts`, `src/shared/score.ts`
- Test: `src/shared/score.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // constants.ts
  export const MIN_WRECK_TIME_S = 180;
  export const MIN_WRECK_TIME_MS = MIN_WRECK_TIME_S * 1000;
  export const MAX_TIME_MS = 3_600_000;
  export const MAX_POTHOLES = 5000;
  export const MAX_POTHOLES_PER_SECOND = 4;
  export const MAX_BODY_BYTES = 1024;
  export const MAX_CLIENT_VERSION_LENGTH = 20;
  // score.ts
  export interface ScoreSubmission { nickname: string; timeMs: number; potholes: number; clientVersion: string }
  export type ValidationError = 'not_object' | 'unknown_field' | 'nickname_invalid' | 'time_invalid'
    | 'time_too_fast' | 'potholes_invalid' | 'potholes_implausible' | 'version_invalid';
  export type ValidationResult = { ok: true; value: ScoreSubmission } | { ok: false; error: ValidationError };
  export function validateSubmission(input: unknown): ValidationResult;
  ```

- [ ] **Step 1: Write the failing tests** — use a helper `const valid = { nickname: 'Ion', timeMs: 200_000, potholes: 10, clientVersion: '0.1.0' }` and `err(x) => (validateSubmission(x) as { error: string }).error`.

```ts
it('accepts a valid submission and trims nickname', () => {
  expect(validateSubmission({ ...valid, nickname: '  Ștefan_1-a  ' })).toEqual({ ok: true, value: { ...valid, nickname: 'Ștefan_1-a' } });
});
it.each([null, 42, 'x', [], undefined])('rejects non-object %p', (x) => { expect(err(x)).toBe('not_object'); });
it('rejects unknown fields', () => { expect(err({ ...valid, extra: 1 })).toBe('unknown_field'); });
it.each(['a', 'x'.repeat(17), '   ', 'a\tb', '<script>', 'ion😀', 42, undefined])('rejects nickname %p', (n) => { expect(err({ ...valid, nickname: n })).toBe('nickname_invalid'); });
it.each(['ab', 'x'.repeat(16), 'Ion Popescu'])('accepts nickname %p', (n) => { expect(validateSubmission({ ...valid, nickname: n }).ok).toBe(true); });
it('enforces the minimum wreck time boundary', () => {
  expect(err({ ...valid, timeMs: 179_999 })).toBe('time_too_fast');
  expect(validateSubmission({ ...valid, timeMs: 180_000, potholes: 0 }).ok).toBe(true);
});
it.each([3_600_001, 180_000.5, '200000', Infinity, NaN, -1])('rejects timeMs %p', (t) => {
  expect(err({ ...valid, timeMs: t })).toBe(t === -1 ? 'time_too_fast' : 'time_invalid');
});
it('accepts MAX_TIME_MS', () => { expect(validateSubmission({ ...valid, timeMs: 3_600_000 }).ok).toBe(true); });
it.each([-1, 5001, 1.5, '3', null])('rejects potholes %p', (p) => { expect(err({ ...valid, potholes: p })).toBe('potholes_invalid'); });
it('rejects implausible pothole rate (> 4 per second)', () => {
  expect(validateSubmission({ ...valid, timeMs: 180_000, potholes: 720 }).ok).toBe(true);
  expect(err({ ...valid, timeMs: 180_000, potholes: 721 })).toBe('potholes_implausible');
});
it.each(['', 'x'.repeat(21), 1])('rejects clientVersion %p', (v) => { expect(err({ ...valid, clientVersion: v })).toBe('version_invalid'); });
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/shared` → FAIL, module not found.

- [ ] **Step 3: Implement** `constants.ts` with the exact values above and `validateSubmission` in `score.ts`. Check order: not_object → unknown_field → nickname → time → potholes → version. Nickname regex after trim: `/^[\p{L}\p{N} _-]{2,16}$/u`. Integers via `Number.isInteger` (no coercion). Negative/below-minimum integers → `time_too_fast`; non-integers or above max → `time_invalid`. Missing fields fail their own check.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/shared` → PASS.

- [ ] **Step 5: Stryker** — `npx stryker run --mutate "src/shared/**/*.ts"` → ≥80%.

- [ ] **Step 6: Commit** — `feat(shared): add score submission validation`

---

### Task 3: Config + hazard catalog

**Files:**
- Create: `src/core/config.ts`, `src/core/hazards.ts`
- Test: `src/core/hazards.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // hazards.ts
  export type Tier = 'small' | 'medium' | 'large' | 'epic';
  export type HazardKind = 'pothole' | 'curb' | 'manhole';
  export type HazardId = 'gropita' | 'gropality' | 'groapa-de-gunoi' | 'craterul-national'
    | 'bordura-protocol' | 'bordura-everest' | 'capac-dansator' | 'gura-iadului';
  export interface Localized { ro: string; en: string }
  export interface HazardType { id: HazardId; kind: HazardKind; tier: Tier; nameRo: string; subtitle: Localized }
  export const HAZARDS: readonly HazardType[];
  export const HAZARD_IDS: readonly HazardId[];
  export function getHazard(id: HazardId): HazardType; // throws Error('unknown hazard: <id>') for bad input
  // config.ts
  export const MAX_HP = 1000;
  export const TIER_DAMAGE: Record<Tier, number> = { small: 10, medium: 25, large: 50, epic: 120 };
  export const SPEED_FACTOR = { divisorKmh: 50, min: 0.3, max: 2.0 };
  export const TOP_SPEED_KMH = 110;
  export const MAX_TICK_S = 0.25;
  // PART_THRESHOLDS is added in Task 4, not here.
  export const RAMP = { fullAtS: 300, hazardBase: 0.6, hazardExtra: 6.4, hazardExponent: 1.5, trafficBase: 0.1, trafficExtra: 1.2 };
  export const ROAD = { chunkLengthM: 50, halfWidthM: 3.5, minHazardSpacingM: 6, chunkMarginM: 3, maxCurvature: 0.02, bendThreshold: 0.01, bendCurbMultiplier: 3 };
  export const HAZARD_WEIGHTS: Record<HazardId, number> = { gropita: 30, gropality: 25, 'groapa-de-gunoi': 15, 'craterul-national': 4, 'bordura-protocol': 10, 'bordura-everest': 4, 'capac-dansator': 8, 'gura-iadului': 4 };
  export const TRAFFIC = { sameDirKmh: [40, 70], oncomingKmh: [40, 80] } as const;
  export const STEERING = { lagPerS: 6, wobbleAmplitude: 0.06, wobbleHz: 1.3, wobbleFullAtKmh: 60 };
  export const FARA_MAINI = { streak: 5, steerDeadzone: 0.1 };
  ```
  (`Part` type lives in `damage.ts`; `config.ts` may import types only.)

Exact catalog copy:

| id | kind | tier | nameRo | subtitle.ro | subtitle.en |
|---|---|---|---|---|---|
| gropita | pothole | small | Gropița | Mică, dar a noastră | Tiny pothole |
| gropality | pothole | medium | Gropality | Groapă cu personalitate | Pothole with personality |
| groapa-de-gunoi | pothole | large | Groapa de gunoi | Aici a fost un asfalt | The garbage pit |
| craterul-national | pothole | epic | Craterul Național | Se vede din spațiu | National crater |
| bordura-protocol | curb | small | Bordura de protocol | Joasă și politicoasă | Polite curb |
| bordura-everest | curb | large | Bordura Everest | Nu e bordură, e alpinism | Everest curb |
| capac-dansator | manhole | small | Capacul dansator | Zdrăngăne la fiecare trecere | Dancing lid |
| gura-iadului | manhole | epic | Gura iadului | Capac furat, drum direct jos | Mouth of hell |

- [ ] **Step 1: Failing tests** — catalog has exactly these 8 rows (assert the table with `toEqual` on `{id, kind, tier, nameRo, subtitle}`); ids unique; `HAZARD_IDS` matches catalog order; ≥3 potholes, ≥2 curbs, ≥2 manholes (AC 3); `getHazard('gropality').tier === 'medium'`; `getHazard('nope' as HazardId)` throws `/unknown hazard: nope/`; every id has a `HAZARD_WEIGHTS` entry > 0; `TIER_DAMAGE` equals `{small:10, medium:25, large:50, epic:120}` and `MAX_HP === 1000`.
- [ ] **Step 2: Run to verify fail** — `npx vitest run src/core/hazards.test.ts` → FAIL.
- [ ] **Step 3: Implement** `config.ts` (values above) and `hazards.ts` (table above).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** — `npx stryker run --mutate src/core/hazards.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add config and hazard catalog`

---

### Task 4: Damage model + part detachment

**Files:**
- Create: `src/core/damage.ts`
- Modify: `src/core/config.ts` (add `PART_THRESHOLDS`)
- Test: `src/core/damage.test.ts`

**Interfaces:**
- Consumes: `TIER_DAMAGE`, `SPEED_FACTOR`, `MAX_HP` (Task 3), `MIN_WRECK_TIME_S` (Task 2).
- Produces:
  ```ts
  export type Part = 'bumper' | 'hood' | 'doorLeft' | 'doorRight' | 'exhaust' | 'transmission';
  export function speedFactor(speedKmh: number): number;
  export function hitDamage(tier: Tier, speedKmh: number): number;          // integer
  export interface DamageResult { health: number; clampAbsorbed: boolean }
  export function applyDamage(health: number, dmg: number, runTimeS: number): DamageResult;
  export function newlyDetached(prevTaken: number, nextTaken: number): Part[]; // threshold t detaches when prev < t <= next
  ```
  `PART_THRESHOLDS = [bumper 200, hood 400, doorLeft 550, doorRight 700, exhaust 850, transmission 950]` in that order.

- [ ] **Step 1: Failing tests**

```ts
it.each([[50, 1], [0, 0.3], [15, 0.3], [75, 1.5], [100, 2], [200, 2], [NaN, 0.3], [-30, 0.3], [Infinity, 2]])('speedFactor(%p) = %p', (s, f) => { expect(speedFactor(s)).toBeCloseTo(f, 10); });
it.each([['large', 50, 50], ['small', 0, 3], ['epic', 110, 240], ['medium', 75, 38], ['small', NaN, 3]] as const)('hitDamage(%s,%p) = %p', (t, s, d) => { expect(hitDamage(t, s)).toBe(d); });
it('subtracts damage normally', () => { expect(applyDamage(1000, 50, 0)).toEqual({ health: 950, clampAbsorbed: false }); });
it('clamps to 1 HP before the minimum wreck time', () => {
  expect(applyDamage(10, 50, 179.99)).toEqual({ health: 1, clampAbsorbed: true });
  expect(applyDamage(51, 50, 10)).toEqual({ health: 1, clampAbsorbed: false });
  expect(applyDamage(1, 50, 100)).toEqual({ health: 1, clampAbsorbed: true });
});
it('allows wreck at and after the minimum wreck time', () => { expect(applyDamage(10, 50, 180)).toEqual({ health: 0, clampAbsorbed: false }); });
it('never returns NaN health', () => { expect(applyDamage(500, NaN, 200).health).toBe(500); });
it('detaches parts crossing thresholds, once, in order', () => {
  expect(newlyDetached(150, 250)).toEqual(['bumper']);
  expect(newlyDetached(200, 399)).toEqual([]);
  expect(newlyDetached(199, 200)).toEqual(['bumper']);
  expect(newlyDetached(0, 1000)).toEqual(['bumper', 'hood', 'doorLeft', 'doorRight', 'exhaust', 'transmission']);
});
```

- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement.** Non-finite speed → 0 before clamping; `Infinity` → max. Non-finite or negative `dmg` → no change. `clampAbsorbed` is true only when the unclamped result would be `< 1` and the clamp applied.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** on `src/core/damage.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add damage model with pre-minimum clamp and part detachment`

---

### Task 5: Difficulty ramp

**Files:** Create `src/core/difficulty.ts`; Test `src/core/difficulty.test.ts`

**Interfaces:**
- Consumes: `RAMP` (Task 3).
- Produces: `rampProgress(tS: number): number` (0..1), `hazardDensityPer100m(tS: number): number`, `trafficDensityPer100m(tS: number): number`.

- [ ] **Step 1: Failing tests**

```ts
it.each([[0, 0.6], [300, 7.0], [600, 7.0], [150, 0.6 + 6.4 * 0.5 ** 1.5], [-10, 0.6], [NaN, 0.6]])('hazard density at %p s', (t, d) => { expect(hazardDensityPer100m(t)).toBeCloseTo(d, 6); });
it.each([[0, 0.1], [150, 0.7], [300, 1.3], [900, 1.3]])('traffic density at %p s', (t, d) => { expect(trafficDensityPer100m(t)).toBeCloseTo(d, 6); });
it('is non-decreasing over time', () => { let prev = -1; for (let t = 0; t <= 400; t += 5) { const d = hazardDensityPer100m(t); expect(d).toBeGreaterThanOrEqual(prev); prev = d; } });
```
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** per spec §4.5 using `RAMP` (non-finite/negative t → 0).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** on `src/core/difficulty.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add difficulty ramp`

---

### Task 6: Procedural road chunk generator

**Files:** Create `src/core/roadgen.ts`; Test `src/core/roadgen.test.ts`

**Interfaces:**
- Consumes: `createRng`, `hashSeed` (Task 1); `HAZARD_IDS`, `getHazard` (Task 3); `ROAD`, `HAZARD_WEIGHTS`, `TRAFFIC` (Task 3); densities (Task 5).
- Produces:
  ```ts
  export interface HazardSpawn { instanceId: string; hazardId: HazardId; s: number; lateral: number }  // s: metres along road; lateral: metres from centre, + = right
  export interface TrafficSpawn { instanceId: string; s: number; lane: 1 | -1; speedKmh: number }    // 1 = same direction (right lane), -1 = oncoming
  export interface Chunk { index: number; startS: number; curvature: number; hazards: HazardSpawn[]; traffic: TrafficSpawn[] }
  export function generateChunk(seed: number, index: number, tS: number): Chunk;
  ```

Rules: rng = `createRng(hashSeed(seed, index))`. `startS = index * 50`. Chunk 0: curvature 0, no hazards, no traffic (safe start). Curvature uniform in `±maxCurvature`. Expected hazard count `e = density(tS) * 50 / 100`; count `floor(e) + (rng.next() < frac(e) ? 1 : 0)`. Positions `s` in `[startS + 3, startS + 47]`, re-rolled (max 20 tries, then dropped) so any two hazards in the chunk are ≥6 m apart. Type via `rng.pick` with `HAZARD_WEIGHTS`; when `|curvature| > bendThreshold`, curb weights ×3. Curbs: `lateral = ±halfWidthM` (side random). Others: `lateral` in `[-3, 3]`. Traffic count from traffic density, same rounding; lane random; speed from `TRAFFIC` range for the lane. Ids: `` `${index}-h${i}` `` and `` `${index}-t${i}` ``.

- [ ] **Step 1: Failing tests** — deterministic for equal `(seed, index, tS)` (`toEqual`); different seed → different chunk 5; chunk 0 empty with curvature 0; `startS === index * 50`; for chunks 1..300 at tS 300: every hazard `s` within `[startS+3, startS+47]`, pairwise spacing ≥ 6, curbs have `|lateral| === 3.5`, others `|lateral| <= 3`, `|curvature| <= 0.02`, ids unique across all chunks; mean hazards per chunk over chunks 1..1000 at tS 300 within 10% of 3.5 and at tS 0 within 15% of 0.3; mean traffic at tS 300 within 10% of 0.65; curb share is higher on bend chunks than on straight chunks (aggregate over 2000 chunks); traffic speeds within lane ranges.
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement `generateChunk`.**
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** on `src/core/roadgen.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add seeded road chunk generator`

---

### Task 7: Worn steering model

**Files:** Create `src/core/steering.ts`, `src/core/types.ts`; Test `src/core/steering.test.ts`

**Interfaces:**
- Consumes: `Rng` (Task 1), `STEERING` (Task 3).
- Produces:
  ```ts
  // types.ts
  export interface Controls { throttle: number; brake: number; steer: number; handbrake: boolean } // throttle/brake 0..1, steer -1..1
  // steering.ts
  export interface SteeringState { current: number; wobblePhase: number }
  export function createSteering(rng: Rng): SteeringState;  // current 0, random phase
  export function stepSteering(state: SteeringState, inputSteer: number, dtS: number, speedKmh: number): SteeringState;
  export function effectiveSteer(state: SteeringState, speedKmh: number): number; // current + wobble, clamped to [-1, 1]
  ```
  Lag: `current += (input - current) * min(1, lagPerS * dt)`. Wobble: `wobbleAmplitude * min(1, speed / wobbleFullAtKmh) * sin(wobblePhase)`; phase advances `2π * wobbleHz * dt`.

- [ ] **Step 1: Failing tests** — after one 1/60 s step with input 1 from 0, `0 < current < 0.5`; after 120 steps `current` within 0.01 of 1; at speed 0 `effectiveSteer === current`; at 60+ km/h over 300 steps `|effectiveSteer - current| <= 0.06` and max deviation > 0.03; output clamped (input 1, settled, never > 1); input clamped to [-1, 1] (input 5 behaves like 1); NaN dt or input leaves state unchanged.
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement.** — **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** on `src/core/steering.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add worn steering model`

---

### Task 8: Run state machine

**Files:** Create `src/core/run.ts`; Modify `src/core/types.ts`; Test `src/core/run.test.ts`

**Interfaces:**
- Consumes: `hitDamage`, `applyDamage`, `newlyDetached`, `Part` (Task 4); `getHazard`, `HazardId` (Task 3); `MAX_HP`, `MAX_TICK_S`, `FARA_MAINI` (Task 3).
- Produces (in `types.ts` / `run.ts`):
  ```ts
  export type RunPhase = 'menu' | 'driving' | 'paused' | 'wrecked' | 'dnf';
  export interface RunStats { potholes: number; hits: number; hazardTypesHit: readonly HazardId[]; potholeStreakNoSteer: number }
  export interface RunState {
    phase: RunPhase; timeS: number; health: number; damageTaken: number;
    detached: readonly Part[]; stats: RunStats; hitInstanceIds: ReadonlySet<string>;
    lastHazard: HazardId | null; clampAbsorbed: boolean;   // true once the pre-180 s clamp ever saved the car
  }
  export type RunEvent =
    | { type: 'start' } | { type: 'pause' } | { type: 'resume' } | { type: 'restart' } | { type: 'trafficCollision' }
    | { type: 'tick'; dtS: number; steerInput: number }
    | { type: 'hazardHit'; hazardId: HazardId; instanceId: string; speedKmh: number };
  export type RunOutput =
    | { type: 'hazardHit'; hazardId: HazardId; damage: number }
    | { type: 'partDetached'; part: Part }
    | { type: 'wrecked'; timeMs: number }
    | { type: 'dnf' };
  export function createRun(): RunState; // phase 'menu', health MAX_HP
  export function applyEvent(state: RunState, event: RunEvent): { state: RunState; outputs: RunOutput[] };
  export function scoreTimeMs(state: RunState): number; // Math.round(timeS * 1000)
  ```
  Transitions: `start` menu→driving; `pause` driving→paused; `resume` paused→driving; `restart` from driving/paused/wrecked/dnf → fresh driving run; `trafficCollision` driving→dnf. Any other event/phase combination returns the same state and no outputs. `tick` only advances in driving; dt clamped to `[0, MAX_TICK_S]`, non-finite → 0; `|steerInput| >= 0.1` resets `potholeStreakNoSteer`. `hazardHit` only in driving; duplicate `instanceId` ignored; pothole kind increments `potholes` and the streak; reaching health 0 → `wrecked` + `{type:'wrecked', timeMs}`. Input state is never mutated.

- [ ] **Step 1: Failing tests** (helper `drive = () => applyEvent(createRun(), {type:'start'}).state`, `tick(s, dt, steer=0)`, `hit(s, id, inst, kmh=50)`):
  - createRun: phase menu, health 1000, timeS 0.
  - start → driving; tick 1/60 ×60 → timeS ≈ 1 (toBeCloseTo 6); ticks in menu/paused don't advance; tick dt 10 advances 0.25; dt NaN/−1 advances 0.
  - hit gropality at 50 → health 975, outputs `[{type:'hazardHit', hazardId:'gropality', damage:25}]`, lastHazard 'gropality', potholes 1, hits 1, hazardTypesHit ['gropality'].
  - same instanceId twice → second hit no change, no outputs.
  - curb hit doesn't increment potholes.
  - 50 epic hits at 110 km/h before 180 s → health 1, phase driving, clampAbsorbed true.
  - after reaching 180 s with health 1, any hit → phase wrecked, outputs include `{type:'wrecked', timeMs:180000}` (use ticks totalling exactly 180 s via 720 × 0.25).
  - crossing 200 damage emits `{type:'partDetached', part:'bumper'}` once; `detached` accumulates.
  - trafficCollision while driving → dnf + `[{type:'dnf'}]`; in menu → ignored.
  - after wrecked/dnf: hazardHit/trafficCollision/tick → same state, `[]` outputs (Review Focus 5).
  - restart from wrecked → driving, health 1000, timeS 0, empty stats; pause/resume round-trip.
  - streak: 3 pothole hits with steer 0 → 3; tick with steer 0.2 → 0; steer 0.09 keeps the streak.
  - hazardHit with speedKmh NaN → damage = tier × 0.3 rounded, health stays finite (Review Focus 1).
  - input state object is unchanged after applyEvent (deep-freeze it in the test).
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement.** — **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** on `src/core/run.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add run state machine`

---

### Task 9: Achievements + persistence port

**Files:** Create `src/core/ports.ts`, `src/core/achievements.ts`; Test `src/core/achievements.test.ts`

**Interfaces:**
- Consumes: `RunState` (Task 8), `HAZARD_IDS`, `getHazard`, `Localized` (Task 3), `FARA_MAINI` (Task 3).
- Produces:
  ```ts
  // ports.ts
  export interface KeyValueStore { get(key: string): string | null; set(key: string, value: string): void }
  export function memoryStore(initial?: Record<string, string>): KeyValueStore;
  // achievements.ts
  export type AchievementId = 'prima-gropita' | 'bordurist' | 'canalistul' | 'moartea-planetarelor' | 'fara-maini'
    | 'everest' | 'gura-iadului' | 'fulgerul-de-berceni' | 'colectionarul' | 'sapator-de-elita' | 'ghinion';
  export interface Achievement { id: AchievementId; nameRo: string; subtitle: Localized }
  export const ACHIEVEMENTS: readonly Achievement[];
  export const ACHIEVEMENTS_KEY = 'dn.achievements';
  export function evaluateAchievements(state: RunState, unlocked: ReadonlySet<AchievementId>): AchievementId[]; // newly unlocked, in ACHIEVEMENTS order
  export function loadUnlocked(store: KeyValueStore): Set<AchievementId>;
  export function saveUnlocked(store: KeyValueStore, ids: ReadonlySet<AchievementId>): void; // JSON array
  ```

Rules and copy (in this order):

| id | nameRo | unlocked when | subtitle.ro | subtitle.en |
|---|---|---|---|---|
| prima-gropita | Prima Gropiță | potholes ≥ 1 | Prima groapă nu se uită | Your first pothole |
| bordurist | Bordurist | any curb in hazardTypesHit | Ai urcat pe bordură | You climbed a curb |
| canalistul | Canalistul | any manhole in hazardTypesHit | Ai cunoscut canalizarea | You met the sewer |
| moartea-planetarelor | Moartea planetarelor | detached includes transmission | Cutia de viteze a cedat | The transmission died |
| fara-maini | Fără mâini | potholeStreakNoSteer ≥ 5 | 5 gropi fără să tragi de volan | 5 potholes in a row without steering |
| everest | Everest | hazardTypesHit includes bordura-everest | Ai cucerit cea mai înaltă bordură | You conquered the tallest curb |
| gura-iadului | Gura iadului | hazardTypesHit includes gura-iadului | Ai căzut într-o gură de canal | You fell into an open manhole |
| fulgerul-de-berceni | Fulgerul de Berceni | phase wrecked and timeS < 240 | Rablă distrusă în sub 4 minute | Wrecked in under 4 minutes |
| colectionarul | Colecționarul | all HAZARD_IDS in hazardTypesHit | Toate tipurile de pericole într-o tură | Every hazard type in one run |
| sapator-de-elita | Săpător de elită | potholes ≥ 50 | 50 de gropi într-o tură | 50 potholes in one run |
| ghinion | Ghinion | phase dnf | Te-ai lovit de o mașină | You crashed into traffic |

- [ ] **Step 1: Failing tests** — `ACHIEVEMENTS` has 11 entries with exact ids and copy above (≥8, AC 7); for each rule, a minimal `RunState` (build from `createRun()` with overrides) that unlocks exactly that achievement, and one just below its boundary that doesn't (potholes 49 vs 50, streak 4 vs 5, timeS 240 vs 239.99, wrecked vs driving); already-unlocked ids are not returned again; `saveUnlocked` then `loadUnlocked` round-trips via `memoryStore`; `loadUnlocked` returns empty set for missing key, invalid JSON (`'{oops'`), non-array JSON, and filters unknown ids (`'["everest","nope"]'` → {everest}) (Review Focus 3).
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement.** — **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** on `src/core/achievements.ts src/core/ports.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add achievements and persistence port`

---

### Task 10: i18n

**Files:** Create `src/core/i18n.ts`; Test `src/core/i18n.test.ts`

**Interfaces:**
- Consumes: `KeyValueStore` (Task 9), `getHazard`, `HazardId` (Task 3), `ACHIEVEMENTS`, `AchievementId` (Task 9).
- Produces:
  ```ts
  export type Lang = 'ro' | 'en';
  export const LANG_KEY = 'dn.lang';
  export type MessageKey = keyof typeof RO;   // RO dictionary is the source of key names
  export const DICT: Record<Lang, Record<MessageKey, string>>;
  export function t(lang: Lang, key: MessageKey, params?: Record<string, string | number>): string; // replaces {name}
  export function loadLang(store: KeyValueStore): Lang;  // default/invalid → 'ro'
  export function saveLang(store: KeyValueStore, lang: Lang): void;
  export function hazardLabel(id: HazardId, lang: Lang): { name: string; subtitle: string };
  export function achievementLabel(id: AchievementId, lang: Lang): { name: string; subtitle: string };
  ```

Keys (ro / en):
`menu.play` Joacă / Play · `menu.leaderboard` Clasament / Leaderboard · `menu.achievements` Realizări / Achievements · `menu.language` English / Română (label of the *other* language) · `hud.health` Rablă / Car · `hud.speed` km/h / km/h · `hud.time` Timp / Time · `pause.title` Pauză / Paused · `pause.resume` Continuă / Resume · `result.wrecked` Rabla s-a dus! / Car wrecked! · `result.dnf` DNF – ai lovit o mașină / DNF – you hit a car · `result.time` Timp: {time} / Time: {time} · `result.potholes` Gropi: {count} / Potholes: {count} · `result.newAchievements` Realizări noi / New achievements · `result.nickname` Poreclă / Nickname · `result.submit` Trimite / Submit · `result.submitted` Trimis! / Submitted! · `result.offline` Clasament indisponibil / Leaderboard offline · `result.retry` Reîncearcă / Retry · `result.restart` Încă o tură (R) / Another run (R) · `leaderboard.fastest` Cea mai rapidă distrugere / Fastest wreck · `leaderboard.potholes` Cele mai multe gropi / Most potholes · `leaderboard.empty` Niciun scor încă / No scores yet · `achievements.locked` Blocat / Locked · `error.physics` Motorul fizic nu a pornit / Physics engine failed to start

- [ ] **Step 1: Failing tests** — every key in `DICT.ro` exists non-empty in `DICT.en` and vice versa; `t('en','result.time',{time:'3:12.40'})` → `'Time: 3:12.40'`; missing param leaves `{time}` intact; `loadLang` → 'ro' for empty store, `'fr'`, `''`; returns 'en' after `saveLang(store,'en')` (key `dn.lang`); `hazardLabel('gropality','en')` → `{name:'Gropality', subtitle:'Pothole with personality'}` and `'ro'` → `{name:'Gropality', subtitle:'Groapă cu personalitate'}`; `achievementLabel('ghinion','en').name === 'Ghinion'`.
- [ ] **Step 2: Run to verify fail.** — **Step 3: Implement.** — **Step 4: Run to verify pass.**
- [ ] **Step 5: Stryker** on `src/core/i18n.ts` → ≥80%.
- [ ] **Step 6: Commit** — `feat(core): add ro/en i18n`

---

### Task 11: Greedy-bot balance guard + tuning

**Files:** Create `src/core/bot.ts`; Modify `src/core/config.ts` (tuning only); Test `src/core/bot.test.ts`

**Interfaces:**
- Consumes: `generateChunk` (Task 6), `createRun`, `applyEvent` (Task 8), `TOP_SPEED_KMH`, `ROAD` (Task 3).
- Produces:
  ```ts
  export interface BotResult { wreckTimeS: number | null; clampAbsorbed: boolean; potholes: number; hits: number }
  export const BOT = { lateralSpeedMps: 2.5, hitToleranceM: 0.9, dtS: 1 / 60 };
  export function simulateGreedyBot(seed: number, maxTimeS?: number): BotResult; // default maxTimeS 600
  ```
  Kinematic model: constant `TOP_SPEED_KMH`; each 1/60 s step advance `s`, generate chunks on demand with the current `timeS`, steer lateral position toward the nearest upcoming unhit hazard at ≤ `lateralSpeedMps`; when `s` passes a hazard and `|lateral − hazard.lateral| ≤ hitToleranceM` (curbs: bot at `±(halfWidthM − 0.5)` counts) emit `hazardHit` with `speedKmh = TOP_SPEED_KMH`; ignores traffic; emits `tick` with steer 0. Stops on wreck or `maxTimeS`.

- [ ] **Step 1: Failing tests**

```ts
it.each([1, 2, 3, 4, 5])('seed %i: perfect play wrecks naturally between 190 and 240 s', (seed) => {
  const r = simulateGreedyBot(seed);
  expect(r.wreckTimeS).not.toBeNull();
  expect(r.wreckTimeS!).toBeGreaterThanOrEqual(190);
  expect(r.wreckTimeS!).toBeLessThanOrEqual(240);
  expect(r.clampAbsorbed).toBe(false);
});
it('never wrecks before MIN_WRECK_TIME_S for 20 seeds', () => {
  for (let seed = 1; seed <= 20; seed++) { const w = simulateGreedyBot(seed).wreckTimeS; if (w !== null) expect(w).toBeGreaterThanOrEqual(180); }
});
it('is deterministic', () => { expect(simulateGreedyBot(7)).toEqual(simulateGreedyBot(7)); });
```
- [ ] **Step 2: Run to verify fail** (module missing).
- [ ] **Step 3: Implement `simulateGreedyBot`.**
- [ ] **Step 4: Run and tune.** Back-of-envelope with spec defaults says the bot wrecks far too early (~120+ reachable hazards by 200 s × ~60 dmg), so tuning is expected. Allowed knobs, **only in `config.ts`**: `RAMP.*`, `SPEED_FACTOR.*`, `TOP_SPEED_KMH`, `HAZARD_WEIGHTS`, `ROAD.minHazardSpacingM`. **Forbidden:** `MAX_HP`, `TIER_DAMAGE`, `MIN_WRECK_TIME_S`, `BOT.*`. Re-run `npx vitest run src/core` after each change (earlier tasks' tests that pin spec defaults — difficulty and roadgen means — must be updated to the tuned values in the same commit, citing "tuned in Task 11"). If no combination passes while the road still has ≥1 hazard per 100 m after 60 s, STOP and report to the human with the best values found.
- [ ] **Step 5: Run all tests** — `npm test` → PASS.
- [ ] **Step 6: Update the spec** §4.5/§4.2 with the tuned values (one-line "tuned 2026-11-07, greedy bot 190–240 s").
- [ ] **Step 7: Stryker** on `src/core/bot.ts` → ≥80%.
- [ ] **Step 8: Commit** — `feat(core): add greedy-bot balance guard and tune ramp`

---

### Task 12: Full mutation gate + CI verification

**Files:** none new (fixes only).

- [ ] **Step 1: Full run** — `npm run typecheck && npm test && npm run mutate && npm run build`. Expected: all exit 0; Stryker overall ≥80%.
- [ ] **Step 2: Kill survivors** — for each surviving mutant in `reports/mutation/mutation.html`, add a test in the owning module's test file or mark equivalent with a comment; re-run until the gate passes.
- [ ] **Step 3: Push and confirm CI** — `git push -u origin superpowers`, then `gh run watch` → the CI workflow green.
- [ ] **Step 4: Commit** (if fixes) — `test(core): kill surviving mutants`

---

## Next plans
- **Plan 2 – API**: `api/` Worker + D1, `api/src/logic` under Stryker, `@cloudflare/vitest-pool-workers` integration tests, deploy to Cloudflare.
- **Plan 3 – Game client**: `sim`, `render`, `ui`, `adapters`, `main.ts`, Cloudflare Pages deploy, playtest against AC 1–12.
