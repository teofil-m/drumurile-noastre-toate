import { describe, expect, it } from 'vitest';
// Known equivalent mutant: `tS < 0` -> `tS <= 0` (t=0 yields 0 either way).
import { hazardDensityPer100m, rampProgress, trafficDensityPer100m } from './difficulty';

// RAMP.hazardBase/hazardExtra tuned in Task 11 (0.6/6.4 -> 1/1.4, with HAZARD_WEIGHTS shifted to small tiers) so the greedy bot wrecks naturally at 190-240 s.
// Floor: the road stays interesting (>= 1 hazard per 100 m) once the early game is over.
// Equivalent survivor: difficulty.ts:4 `tS < 0` -> `<= 0`; at tS = 0 the fallthrough yields min(0 / fullAtS, 1) = 0, same as the early return.
describe('difficulty ramp', () => {
  it.each([[0, 0], [150, 0.5], [300, 1], [600, 1], [-10, 0], [NaN, 0], [Infinity, 0], [-Infinity, 0], [75, 0.25]])('rampProgress at %p s', (t, p) => {
    expect(rampProgress(t)).toBeCloseTo(p, 9);
  });
  it.each([[0, 1], [300, 2.4], [600, 2.4], [150, 1 + 1.4 * 0.5 ** 1.5], [-10, 1], [NaN, 1]])('hazard density at %p s', (t, d) => {
    expect(hazardDensityPer100m(t)).toBeCloseTo(d, 6);
  });
  it.each([[0, 0.1], [150, 0.7], [300, 1.3], [900, 1.3], [-5, 0.1], [NaN, 0.1]])('traffic density at %p s', (t, d) => {
    expect(trafficDensityPer100m(t)).toBeCloseTo(d, 6);
  });
  it('keeps at least 1 hazard per 100 m after 60 s', () => {
    for (let t = 60; t <= 600; t += 10) expect(hazardDensityPer100m(t)).toBeGreaterThanOrEqual(1);
  });
  it('is non-decreasing over time', () => {
    let prev = -1;
    for (let t = 0; t <= 400; t += 5) {
      const d = hazardDensityPer100m(t);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});
