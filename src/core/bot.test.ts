import { describe, expect, it } from 'vitest';
import { BOT, simulateGreedyBot } from './bot';

describe('greedy bot balance guard', () => {
  it('has the fixed bot constants', () => {
    expect(BOT).toEqual({ lateralSpeedMps: 2.5, hitToleranceM: 0.9, dtS: 1 / 60 });
  });
  it.each([1, 2, 3, 4, 5])('seed %i: perfect play wrecks naturally between 190 and 240 s', (seed) => {
    const r = simulateGreedyBot(seed);
    expect(r.wreckTimeS).not.toBeNull();
    expect(r.wreckTimeS!).toBeGreaterThanOrEqual(190);
    expect(r.wreckTimeS!).toBeLessThanOrEqual(240);
    expect(r.clampAbsorbed).toBe(false);
    expect(r.hits).toBeGreaterThan(0);
    expect(r.potholes).toBeGreaterThan(0);
    expect(r.potholes).toBeLessThanOrEqual(r.hits);
  });
  it('never wrecks before MIN_WRECK_TIME_S for 20 seeds', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const w = simulateGreedyBot(seed).wreckTimeS;
      if (w !== null) expect(w).toBeGreaterThanOrEqual(180);
    }
  });
  it('opts override the bot constants (defaults unchanged)', () => {
    expect(simulateGreedyBot(1, 600, {})).toEqual(simulateGreedyBot(1));
    expect(simulateGreedyBot(1, 600, { lateralSpeedMps: 4, hitToleranceM: 1.1 })).not.toEqual(simulateGreedyBot(1));
    expect(simulateGreedyBot(1, 60, { hitToleranceM: 0.1 }).hits).toBeLessThan(simulateGreedyBot(1, 60).hits);
    expect(simulateGreedyBot(1, 60, { lateralSpeedMps: 0.1 }).hits).not.toBe(simulateGreedyBot(1, 60).hits);
  });
  it('is deterministic', () => {
    expect(simulateGreedyBot(7)).toEqual(simulateGreedyBot(7));
  });
  it('returns null wreck time when maxTimeS is reached first', () => {
    const r = simulateGreedyBot(1, 5);
    expect(r.wreckTimeS).toBeNull();
    expect(r.clampAbsorbed).toBe(false);
  });
  // Characterisation of the tuned config (Task 11): hit counts pin the hit/target logic. Re-pin if the ramp is retuned.
  it.each([
    [1, 200.28, 34, 71],
    [2, 226.32, 37, 83],
    [3, 214.18, 42, 78],
    [4, 202.23, 42, 73],
    [5, 194.57, 44, 75],
  ])('seed %i: pinned outcome', (seed, t, potholes, hits) => {
    const r = simulateGreedyBot(seed);
    expect(r.wreckTimeS!).toBeCloseTo(t, 1);
    expect(r.potholes).toBe(potholes);
    expect(r.hits).toBe(hits);
  });
  it('counts hits before the time limit', () => {
    expect(simulateGreedyBot(3, 60)).toEqual({ wreckTimeS: null, clampAbsorbed: false, potholes: 7, hits: 17 });
    expect(simulateGreedyBot(9, 100)).toEqual({ wreckTimeS: null, clampAbsorbed: false, potholes: 21, hits: 34 });
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
