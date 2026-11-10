import { describe, expect, it } from 'vitest';
import { BOT, simulateGreedyBot } from './bot';
import { TOP_SPEED_KMH } from './config';
import { HAZARD_IDS } from './hazards';
import { generateChunk } from './roadgen';

const SEEDS_50 = Array.from({ length: 50 }, (_, i) => i + 1);
const clampDecided = (r: { wreckTimeS: number | null; clampAbsorbed: boolean }) => r.clampAbsorbed || (r.wreckTimeS ?? Infinity) < 185;

describe('greedy bot balance guard', () => {
  it('has the fixed bot constants', () => {
    expect(BOT).toEqual({ lateralSpeedMps: 2.5, hitToleranceM: 0.9, dtS: 1 / 60 });
  });
  // THE balance guard (distribution over 50 seeds); the pinned outcomes below are characterisation only.
  it('default bot: wreck-time distribution over seeds 1..50 is not clamp-decided', () => {
    const rs = SEEDS_50.map((seed) => simulateGreedyBot(seed));
    expect(rs.every((r) => r.wreckTimeS !== null)).toBe(true);
    expect(rs.filter(clampDecided).length).toBeLessThanOrEqual(16);
    const ws = rs.map((r) => r.wreckTimeS!).sort((a, b) => a - b);
    expect(ws[Math.floor(0.1 * (ws.length - 1))]!).toBeGreaterThanOrEqual(180.7);
    const median = ws[Math.floor(0.5 * (ws.length - 1))]!;
    expect(median).toBeGreaterThanOrEqual(180);
    expect(median).toBeLessThanOrEqual(200);
  });
  it('strong bot (lateral 4 m/s, tolerance 1.1 m): at most 20/50 clamp-decided over seeds 1..50', () => {
    const n = SEEDS_50.filter((seed) => clampDecided(simulateGreedyBot(seed, 600, { lateralSpeedMps: 4, hitToleranceM: 1.1 }))).length;
    expect(n).toBeLessThanOrEqual(20);
  });
  it('hazard exposure in the first 200 s at top speed: every type in >= 60% of 100 runs, all 8 in >= 15%', () => {
    const perType = new Map<string, number>();
    let all8 = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const seen = new Set<string>();
      for (let i = 0; (i * 50) / (TOP_SPEED_KMH / 3.6) < 200; i++) {
        for (const h of generateChunk(seed, i, (i * 50) / (TOP_SPEED_KMH / 3.6)).hazards) seen.add(h.hazardId);
      }
      for (const id of seen) perType.set(id, (perType.get(id) ?? 0) + 1);
      if (seen.size === HAZARD_IDS.length) all8++;
    }
    for (const id of HAZARD_IDS) expect(perType.get(id) ?? 0, id).toBeGreaterThanOrEqual(60);
    expect(all8).toBeGreaterThanOrEqual(15);
  });
  it('is deterministic', () => {
    expect(simulateGreedyBot(7)).toEqual(simulateGreedyBot(7));
  });
  it('returns null wreck time when maxTimeS is reached first', () => {
    const r = simulateGreedyBot(1, 5);
    expect(r.wreckTimeS).toBeNull();
    expect(r.clampAbsorbed).toBe(false);
  });
  // Characterisation only (re-pinned after the momentum-damage retune, DAMAGE_COEF 1.25); the distribution test above is the balance guard.
  it.each([
    [1, 190.53, 25, 45],
    [2, 180.33, 31, 47],
    [3, 180.92, 27, 43],
    [4, 180.45, 33, 47],
    [5, 214.68, 39, 59],
  ])('seed %i: pinned outcome', (seed, t, potholes, hits) => {
    const r = simulateGreedyBot(seed);
    expect(r.wreckTimeS!).toBeCloseTo(t, 1);
    expect(r.potholes).toBe(potholes);
    expect(r.hits).toBe(hits);
  });
  it('counts hits before the time limit', () => {
    expect(simulateGreedyBot(3, 60)).toEqual({ wreckTimeS: null, clampAbsorbed: false, potholes: 10, hits: 17 });
    expect(simulateGreedyBot(9, 100)).toEqual({ wreckTimeS: null, clampAbsorbed: false, potholes: 22, hits: 33 });
  });
  it('stops at the first tick whose time reaches maxTimeS (bot.ts:29 `<` not `<=`)', () => {
    const T = simulateGreedyBot(1).wreckTimeS!;
    let t = 0;
    let prev = 0;
    while (t !== T) {
      prev = t;
      t += BOT.dtS;
      expect(t).toBeLessThanOrEqual(T + BOT.dtS);
    }
    expect(simulateGreedyBot(1, prev).wreckTimeS).toBeNull();
    expect(simulateGreedyBot(1, T).wreckTimeS).toBe(T);
  });
});

describe('short mode bot', () => {
  it('never wrecks before 60 s across seeds 1..20 and wrecks within 600 s', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulateGreedyBot(seed, 600, { mode: 'short' });
      expect(r.wreckTimeS).not.toBeNull();
      expect(r.wreckTimeS!).toBeGreaterThanOrEqual(60);
    }
  });
});
